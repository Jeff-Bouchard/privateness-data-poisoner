import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import { exiftool } from 'exiftool-vendored';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { spawn } from 'child_process';
import axios from 'axios';
import mime from 'mime-types';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 9095;
const PRIVATENESS_CLI = process.env.PRIVATENESS_CLI || 'privateness-cli';
const RECEIVE_ADDRESS = process.env.NCH_RECEIVE_ADDRESS || 'SQjw64ANbxjPrX3BrZ9w831HsQh99JDT4r';
const IPFS_ADD_URL = process.env.IPFS_ADD_URL || 'https://ipfs.ness.cx/ipfs';
const KEYS_PATH = path.join(__dirname, 'keys.json');
const LOG_DIR = path.join(__dirname, 'logs');

// Simple in-memory usage tracker (replace with persistent store in production)
const usage = new Map(); // key: apiKey or ip, value: counters

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
app.use(pinoHttp({ logger }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Permissive CORS: allow all origins, headers, and methods
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers') || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Expose-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Static UI
app.use('/', express.static(path.join(__dirname, 'public')));

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Multer temp storage
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exfil-'));
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  }),
  limits: {
    // Pro up to 1GB; Free enforced at UI level and server-side gate per plan
    fileSize: 1024 * 1024 * 1024,
  },
});

function sha256File(fp) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(fp);
    rs.on('error', reject);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

// Very light plan gating (expand as needed)
const PLAN = {
  Free: {
    maxFilesPerDay: 10,
    maxFileSize: 15 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    api: false,
    ipfs: false,
  },
  Starter: {
    maxFileSize: 250 * 1024 * 1024,
    api: true,
    ipfs: false,
  },
  Pro: {
    maxFileSize: 1024 * 1024 * 1024,
    api: true,
    ipfs: true,
  },
  Business: {
    maxFileSize: 5 * 1024 * 1024 * 1024,
    api: true,
    ipfs: true,
  },
  Enterprise: {
    maxFileSize: 5 * 1024 * 1024 * 1024,
    api: true,
    ipfs: true,
  },
};

function getIdentity(req) {
  return req.header('x-api-key') || req.ip;
}

function trackUsage(id, key, inc = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const k = `${id}:${key}:${today}`;
  const v = (usage.get(k) || 0) + inc;
  usage.set(k, v);
  return v;
}

function getUsage(id, key) {
  const today = new Date().toISOString().slice(0, 10);
  const k = `${id}:${key}:${today}`;
  return usage.get(k) || 0;
}

async function stripMetadata(inPath) {
  // Create a copy so we can keep original for hashing comparison if needed
  const dir = path.dirname(inPath);
  const base = path.basename(inPath);
  const outPath = path.join(dir, `cleaned-${base}`);
  fs.copyFileSync(inPath, outPath);
  // Use exiftool to strip all tags, overwrite output file
  // exiftool -all= -overwrite_original cleaned-file
  await exiftool.write(outPath, {}, ['-all=', '-overwrite_original']);
  return outPath;
}

function cleanupDirOf(filePath) {
  try {
    const dir = path.dirname(filePath);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    // ignore
  }
}

// Load API keys
let keyIndex = new Map(); // key string -> record {id, plan, key, ...}
function loadKeys() {
  try {
    const raw = fs.readFileSync(KEYS_PATH, 'utf8');
    const j = JSON.parse(raw);
    keyIndex = new Map();
    for (const k of (j.keys || [])) keyIndex.set(k.key, k);
    logger.info({ count: keyIndex.size }, 'loaded api keys');
  } catch (e) {
    logger.warn({ err: e.message }, 'no keys.json loaded');
  }
}
loadKeys();

// Require API key for non-Free plans
function requireKeyIfNeeded(req, res, next) {
  const plan = (req.header('x-plan') || 'Free');
  if (plan === 'Free') return next();
  const key = req.header('x-api-key');
  if (!key) return res.status(401).json({ error: 'API key required for non-Free plans' });
  const rec = keyIndex.get(key);
  if (!rec) return res.status(401).json({ error: 'Invalid API key' });
  if (rec.plan !== plan) return res.status(403).json({ error: `API key not authorized for plan ${plan}` });
  req.apiKey = rec;
  return next();
}

// Audit logging
function ensureLogDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}
}
ensureLogDir();
function auditLog(event) {
  try {
    const day = new Date().toISOString().slice(0,10);
    const fp = path.join(LOG_DIR, `audit-${day}.log`);
    fs.appendFile(fp, JSON.stringify(event) + '\n', () => {});
  } catch (_) {}
}

// Payments: verify a specific txid pays RECEIVE_ADDRESS and amount >= min
async function verifyPaymentTx(txid, minAmount) {
  return new Promise((resolve, reject) => {
    const args = ['transaction', txid];
    const ps = spawn(PRIVATENESS_CLI, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    ps.stdout.on('data', (d) => (out += d.toString()))
      .on('error', () => {});
    ps.stderr.on('data', (d) => (err += d.toString()))
      .on('error', () => {});
    ps.on('error', (e) => reject(new Error(`privateness-cli error: ${e.message}`)));
    ps.on('close', (code) => {
      if (code !== 0) return reject(new Error(`privateness-cli exit ${code}: ${err || out}`));
      // Try JSON first
      try {
        const j = JSON.parse(out);
        // Attempt common shapes
        let total = 0;
        if (Array.isArray(j.outputs)) {
          total = j.outputs.filter(o => o.address === RECEIVE_ADDRESS)
                           .reduce((s, o) => s + Math.abs(Number(o.amount || 0)), 0);
        } else if (Array.isArray(j.details)) {
          total = j.details.filter(d => d.address === RECEIVE_ADDRESS)
                           .reduce((s, d) => s + Math.abs(Number(d.amount || 0)), 0);
        }
        return resolve({ ok: total >= (minAmount || 0), amount: total, raw: j });
      } catch (_) {
        // Fallback: text parsing — check address presence; amount unknown
        const contains = out.includes(RECEIVE_ADDRESS);
        return resolve({ ok: contains && (minAmount || 0) <= 0, amount: contains ? null : 0, raw: out });
      }
    });
  });
}

// POST /api/clean  (multipart)
app.post('/api/clean', requireKeyIfNeeded, upload.array('files', 50), async (req, res) => {
  const started = Date.now();
  const id = getIdentity(req);
  const plan = (req.header('x-plan') || 'Free');
  const planCfg = PLAN[plan] || PLAN.Free;

  try {
    if (plan === 'Free') {
      const used = getUsage(id, 'files');
      const remaining = planCfg.maxFilesPerDay - used;
      if (remaining <= 0) {
        return res.status(429).json({ error: 'Daily limit reached for Free plan. Upgrade your plan.' });
      }
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];
    for (const f of req.files) {
      if (plan === 'Free') {
        if (!planCfg.allowedTypes.includes(f.mimetype)) {
          cleanupDirOf(f.path);
          return res.status(415).json({ error: `Free plan supports images only. Got ${f.mimetype}` });
        }
        if (f.size > planCfg.maxFileSize) {
          cleanupDirOf(f.path);
          return res.status(413).json({ error: `File too large for Free plan (max ${planCfg.maxFileSize} bytes)` });
        }
      } else {
        if (f.size > planCfg.maxFileSize) {
          cleanupDirOf(f.path);
          return res.status(413).json({ error: `File exceeds plan limit (max ${planCfg.maxFileSize} bytes)` });
        }
      }

      const beforeHash = await sha256File(f.path);
      const cleanedPath = await stripMetadata(f.path);
      const afterHash = await sha256File(cleanedPath);

      const data = fs.readFileSync(cleanedPath);
      const filename = path.basename(cleanedPath);
      const mimeType = mime.lookup(filename) || 'application/octet-stream';

      results.push({ filename, mimeType, beforeHash, afterHash, path: cleanedPath, size: data.length, origSize: f.size });
    }

    // Track usage for Free plan
    if (plan === 'Free') trackUsage(id, 'files', req.files.length);

    // If multiple, package as zip? For simplicity return JSON with base64 payloads per file
    // (Clients can request streaming download later)
    const payload = results.map((r) => ({
      filename: r.filename,
      mimeType: r.mimeType,
      beforeHash: r.beforeHash,
      afterHash: r.afterHash,
      dataBase64: fs.readFileSync(path.join(path.dirname(r.path), r.filename)).toString('base64'),
    }));

    // Cleanup temp folders
    for (const r of results) cleanupDirOf(r.path);

    const durationMs = Date.now() - started;
    auditLog({
      ts: new Date().toISOString(), route: '/api/clean', method: 'POST', ip: req.ip,
      plan, apiKeyId: req.apiKey?.id || null, count: results.length, durationMs,
      files: results.map(r => ({ name: r.filename, size: r.size, origSize: r.origSize, beforeHash: r.beforeHash, afterHash: r.afterHash }))
    });

    return res.json({ ok: true, results: payload, durationMs });
  } catch (e) {
    logger.error({ err: e }, 'clean failed');
    auditLog({ ts: new Date().toISOString(), route: '/api/clean', method: 'POST', ip: req.ip, plan, apiKeyId: req.apiKey?.id || null, error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/payments/address -> NCH receive address (for client display/QR)
app.get('/api/payments/address', (req, res) => {
  return res.json({ address: RECEIVE_ADDRESS });
});

// POST /api/ipfs/add  body: { filename, dataBase64 }
app.post('/api/ipfs/add', requireKeyIfNeeded, async (req, res) => {
  const plan = (req.header('x-plan') || 'Free');
  if (plan !== 'Pro') {
    return res.status(402).json({ error: 'IPFS upload is available on Pro plan' });
  }
  try {
    const { filename, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) return res.status(400).json({ error: 'filename and dataBase64 required' });

    // Post to ness.cx IPFS gateway
    const form = new FormData();
    const buf = Buffer.from(dataBase64, 'base64');
    form.append('file', buf, { filename, contentType: mime.lookup(filename) || 'application/octet-stream' });

    const resp = await axios.post(IPFS_ADD_URL, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // Expect response with CID or similar
    auditLog({ ts: new Date().toISOString(), route: '/api/ipfs/add', method: 'POST', ip: req.ip, plan, apiKeyId: req.apiKey?.id || null, filename, ipfsResp: resp.data });
    return res.json({ ok: true, ipfs: resp.data });
  } catch (e) {
    auditLog({ ts: new Date().toISOString(), route: '/api/ipfs/add', method: 'POST', ip: req.ip, plan, apiKeyId: req.apiKey?.id || null, error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/payments/verify  body: { txid, minAmount }
app.post('/api/payments/verify', async (req, res) => {
  try {
    const { txid, minAmount } = req.body || {};
    if (!txid) return res.status(400).json({ error: 'txid required' });
    const v = await verifyPaymentTx(txid, Number(minAmount || 0));
    auditLog({ ts: new Date().toISOString(), route: '/api/payments/verify', method: 'POST', ip: req.ip, txid, ok: v.ok, amount: v.amount });
    return res.json({ ok: v.ok, amount: v.amount, raw: v.raw });
  } catch (e) {
    auditLog({ ts: new Date().toISOString(), route: '/api/payments/verify', method: 'POST', ip: req.ip, error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'exfil server listening');
});
