#!/usr/bin/env node
/**
 * Exfil API test script
 * Usage:
 *   node scripts/test_exfil.js --files /abs/path/a.jpg /abs/path/b.mp4 [--txid TXID] [--pro] [--ipfs]
 * Env:
 *   BASE_URL (default http://localhost:9095)
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import mime from 'mime-types';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = { files: [], pro: false, ipfs: false, txid: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--files') { while (argv[i+1] && !argv[i+1].startsWith('--')) { args.files.push(argv[++i]); } }
    else if (a === '--txid') { args.txid = argv[++i]; }
    else if (a === '--pro') { args.pro = true; }
    else if (a === '--ipfs') { args.ipfs = true; }
    else { /* ignore */ }
  }
  return args;
}

async function main() {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:9095';
  const { files, pro, ipfs, txid } = parseArgs(process.argv);
  if (!files.length) {
    console.error('Provide at least one file with --files /abs/path/a ...');
    process.exit(2);
  }

  // Load API keys
  const keysPath = path.join(ROOT, 'keys.json');
  const keysJson = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  const idx = new Map((keysJson.keys || []).map(k => [k.plan, k]));
  const plan = pro ? 'Pro' : 'Starter';
  const key = idx.get(plan)?.key;
  if (plan !== 'Free' && !key) {
    console.error(`No API key found for plan ${plan} in ${keysPath}`);
    process.exit(3);
  }

  console.log(`Base: ${BASE_URL} | Plan: ${plan}`);

  // 1) Address
  const addrResp = await axios.get(`${BASE_URL}/api/payments/address`);
  console.log('Address:', addrResp.data);

  // 2) Optional verify payment
  if (txid) {
    try {
      const v = await axios.post(`${BASE_URL}/api/payments/verify`, { txid });
      console.log('Verify:', v.data);
    } catch (e) {
      console.error('Verify error:', e.response?.data || e.message);
    }
  }

  // 3) Clean
  const form = new FormData();
  for (const f of files) {
    const stat = fs.statSync(f);
    if (!stat.isFile()) { throw new Error(`Not a file: ${f}`); }
    const stream = fs.createReadStream(f);
    form.append('files', stream, { filename: path.basename(f), contentType: mime.lookup(f) || 'application/octet-stream' });
  }
  const headers = { 'x-plan': plan };
  if (key) headers['x-api-key'] = key;
  const cleanResp = await axios.post(`${BASE_URL}/api/clean`, form, { headers: { ...form.getHeaders(), ...headers }, maxBodyLength: Infinity, maxContentLength: Infinity });
  console.log('Clean: ok results =', cleanResp.data.results?.length, 'durationMs=', cleanResp.data.durationMs);
  const outPath = path.join(process.cwd(), 'out.json');
  fs.writeFileSync(outPath, JSON.stringify(cleanResp.data, null, 2));
  console.log('Saved:', outPath);

  // 4) Optional IPFS (Pro only)
  if (pro && ipfs) {
    const first = cleanResp.data.results?.[0];
    if (!first) { console.log('No result to upload'); return; }
    const ipfsResp = await axios.post(`${BASE_URL}/api/ipfs/add`, { filename: first.filename, dataBase64: first.dataBase64 }, { headers: { 'content-type': 'application/json', 'x-plan': 'Pro', 'x-api-key': key } });
    console.log('IPFS:', ipfsResp.data);
  }
}

main().catch(e => { console.error(e.response?.data || e.message); process.exit(1); });
