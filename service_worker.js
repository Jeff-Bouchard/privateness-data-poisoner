// Privateness.network Data Protection MV3 - service_worker.js
// Manages configuration, per-origin keys, and messaging.

const DEFAULT_CONFIG = {
  // Professional 3-mode model: 'baseline' | 'moderate' | 'strict'
  mode: 'strict',
  // Global protection switch and diagnostics mode
  enabled: true,
  auditMode: false,
  modules: {
    canvasNoise: true,
    audioNoise: true,
    webglNoise: true,
    perfQuantize: true,
    navigatorClamp: true,
    storageHygiene: true,
    blockBeacons: true,
    stripHeadersLimited: true
  },
  // User-managed origins where poisoning/suppression should be disabled
  whitelist: [],
  // User-managed exact path whitelist (origin + pathname, no query/fragment)
  whitelistPaths: [],
  // Basic denylist used in page-world sendBeacon overrides and content-side logic
  denyHosts: [
    'www.google-analytics.com', 'analytics.google.com', 'stats.g.doubleclick.net',
    'ssl.google-analytics.com', 'region1.google-analytics.com',
    'api.segment.io', 'cdn.segment.com', 'segment.io',
    'api.amplitude.com', 'amplitude.com', 'api2.amplitude.com',
    'api.mixpanel.com', 'decide.mixpanel.com',
    'facebook.com', 'www.facebook.com', 'connect.facebook.net', 'graph.facebook.com',
    'snapads.com', 'sc-analytics.appspot.com',
    'log.byteoversea.com', 'business-api.tiktok.com', 'analytics.tiktok.com',
    'px.ads.linkedin.com', 'api.linkedin.com',
    'bat.bing.com', 'app.link', 'cdn.branch.io',
    'action.metaffiliation.com', 'click.linksynergy.com', 'track.adform.net',
    'ib.adnxs.com', 'idsync.rlcdn.com', 'collector.github.com'
  ]
};

// Ephemeral in-memory recent events (MV3 service worker may be suspended; this is best-effort)
let RECENT_EVENTS = [];

function normalizeMode(m){
  const s = String(m||'').toLowerCase();
  if (['baseline','conservative','light'].includes(s)) return 'baseline';
  if (['moderate','standard','balanced','aggressive'].includes(s)) return 'moderate';
  if (['strict','maximum','max','active_warfare','warfare'].includes(s)) return 'strict';
  return 'moderate';
}

async function getOrCreateSecret() {
  const { __max_poise_secret } = await chrome.storage.local.get('__max_poise_secret');
  if (__max_poise_secret) return __max_poise_secret;
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const secret = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  await chrome.storage.local.set({ __max_poise_secret: secret });
  return secret;
}

async function getConfig() {
  const stored = await chrome.storage.local.get(['config']);
  if (!stored.config) return DEFAULT_CONFIG;
  const cfg = { ...stored.config };
  let changed = false;
  // Normalize mode
  const normMode = normalizeMode(cfg.mode);
  if (cfg.mode !== normMode) { cfg.mode = normMode; changed = true; }
  // Ensure booleans exist
  if (typeof cfg.enabled !== 'boolean') { cfg.enabled = true; changed = true; }
  if (typeof cfg.auditMode !== 'boolean') { cfg.auditMode = false; changed = true; }
  // Remove legacy fields
  if ('ytMode' in cfg) { delete cfg.ytMode; changed = true; }
  // Ensure modules object exists with defaults where missing
  const mods = { ...DEFAULT_CONFIG.modules, ...(cfg.modules||{}) };
  if (JSON.stringify(mods) !== JSON.stringify(cfg.modules||{})) { cfg.modules = mods; changed = true; }
  // Ensure whitelist array exists
  if (!Array.isArray(cfg.whitelist)) { cfg.whitelist = []; changed = true; }
  if (!Array.isArray(cfg.whitelistPaths)) { cfg.whitelistPaths = []; changed = true; }
  if (changed) {
    await chrome.storage.local.set({ config: cfg });
  }
  return cfg;
}

function hmacHex(key, msg) {
  // simple browser-native HMAC via subtle crypto; return hex string
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(k => crypto.subtle.sign('HMAC', k, enc.encode(msg)))
    .then(sig => Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join(''));
}

chrome.runtime.onInstalled.addListener(async () => {
  await getOrCreateSecret();
  const { config } = await chrome.storage.local.get('config');
  if (!config) {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  }
  // Initialize threats counter
  const { threats_countered } = await chrome.storage.local.get('threats_countered');
  if (typeof threats_countered !== 'number') {
    await chrome.storage.local.set({ threats_countered: 0 });
  }
  const { threat_logs } = await chrome.storage.local.get('threat_logs');
  if (!Array.isArray(threat_logs)) {
    await chrome.storage.local.set({ threat_logs: [] });
  }
  // Ensure DNR ruleset state matches enabled/audit (disable if disabled or audit)
  try {
    const cfg = await getConfig();
    if (chrome.declarativeNetRequest?.updateEnabledRulesets) {
      const shouldDisable = (!cfg.enabled) || (!!cfg.auditMode);
      if (shouldDisable) await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['rules_analytics'] });
      else await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['rules_analytics'] });
    }
  } catch {}
});

// Also enforce ruleset state on browser startup
try {
  chrome.runtime.onStartup.addListener(async ()=>{
    try {
      const cfg = await getConfig();
      if (chrome.declarativeNetRequest?.updateEnabledRulesets) {
        const shouldDisable = (!cfg.enabled) || (!!cfg.auditMode);
        if (shouldDisable) await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['rules_analytics'] });
        else await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['rules_analytics'] });
      }
    } catch {}
  });
} catch {}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'GET_CONFIG') {
      sendResponse({ ok: true, config: await getConfig() });
      return;
    }
    if (message?.type === 'GET_PER_ORIGIN_KEY') {
      const secret = await getOrCreateSecret();
      const origin = message.origin || (sender?.url ? new URL(sender.url).origin : 'about:blank');
      const key = await hmacHex(secret, origin);
      sendResponse({ ok: true, key });
      return;
    }
    if (message?.type === 'SET_CONFIG') {
      const current = await getConfig();
      const next = { ...current, ...(message.config||{}) };
      // Deep-merge modules
      next.modules = { ...current.modules, ...((message.config||{}).modules||{}) };
      // Normalize booleans
      if (typeof next.enabled !== 'boolean') next.enabled = current.enabled;
      if (typeof next.auditMode !== 'boolean') next.auditMode = current.auditMode;
      // Preserve denyHosts and whitelist unless explicitly provided
      if (!Array.isArray((message.config||{}).denyHosts)) next.denyHosts = current.denyHosts;
      if (!Array.isArray((message.config||{}).whitelist)) next.whitelist = current.whitelist;
      if (!Array.isArray((message.config||{}).whitelistPaths)) next.whitelistPaths = current.whitelistPaths;
      // Persist new config
      await chrome.storage.local.set({ config: next });
      // Toggle DNR ruleset based on enabled/audit state to ensure proper behavior
      try {
        if (chrome.declarativeNetRequest?.updateEnabledRulesets) {
          const shouldDisable = (!next.enabled) || (!!next.auditMode);
          if (shouldDisable) await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['rules_analytics'] });
          else await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['rules_analytics'] });
        }
      } catch {}
      sendResponse({ ok: true, config: next });
      return;
    }
    if (message?.type === 'GET_WHITELIST') {
      const cfg = await getConfig();
      sendResponse({ ok: true, whitelist: cfg.whitelist || [] });
      return;
    }
    if (message?.type === 'GET_WHITELIST_PATHS') {
      const cfg = await getConfig();
      sendResponse({ ok: true, whitelistPaths: cfg.whitelistPaths || [] });
      return;
    }
    if (message?.type === 'ADD_TO_WHITELIST') {
      const origin = String(message.origin||'').trim();
      try {
        if (!origin) { sendResponse({ ok:false, error:'no_origin' }); return; }
        const cfg = await getConfig();
        const set = new Set(cfg.whitelist||[]);
        set.add(origin);
        cfg.whitelist = Array.from(set).sort();
        await chrome.storage.local.set({ config: cfg });
        sendResponse({ ok: true, whitelist: cfg.whitelist });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'ADD_TO_WHITELIST_PATHS') {
      const path = String(message.path||'').trim(); // expected format: origin + pathname
      try {
        if (!path) { sendResponse({ ok:false, error:'no_path' }); return; }
        const cfg = await getConfig();
        const set = new Set(cfg.whitelistPaths||[]);
        set.add(path);
        cfg.whitelistPaths = Array.from(set).sort();
        await chrome.storage.local.set({ config: cfg });
        sendResponse({ ok: true, whitelistPaths: cfg.whitelistPaths });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'REMOVE_FROM_WHITELIST') {
      const origin = String(message.origin||'').trim();
      try {
        const cfg = await getConfig();
        cfg.whitelist = (cfg.whitelist||[]).filter(o => o !== origin);
        await chrome.storage.local.set({ config: cfg });
        sendResponse({ ok: true, whitelist: cfg.whitelist });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'REMOVE_FROM_WHITELIST_PATHS') {
      const path = String(message.path||'').trim();
      try {
        const cfg = await getConfig();
        cfg.whitelistPaths = (cfg.whitelistPaths||[]).filter(p => p !== path);
        await chrome.storage.local.set({ config: cfg });
        sendResponse({ ok: true, whitelistPaths: cfg.whitelistPaths });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'GET_STATS') {
      const cfg = await getConfig();
      if (!cfg.enabled) { sendResponse({ ok: true, threats: 0 }); return; }
      const { threats_countered = 0 } = await chrome.storage.local.get('threats_countered');
      sendResponse({ ok: true, threats: threats_countered });
      return;
    }
    if (message?.type === 'GET_LOGS') {
      const cfg = await getConfig();
      if (!cfg.enabled) { sendResponse({ ok: true, logs: [] }); return; }
      if (cfg.auditMode) {
        const { threat_logs = [] } = await chrome.storage.local.get('threat_logs');
        sendResponse({ ok: true, logs: threat_logs });
      } else {
        // When not in audit mode, do not expose persisted logs
        sendResponse({ ok: true, logs: [] });
      }
      return;
    }
    if (message?.type === 'GET_RECENT') {
      const cfg = await getConfig();
      if (!cfg.enabled) { sendResponse({ ok: true, logs: [] }); return; }
      // Return in-memory recent events (max 5), newest last
      sendResponse({ ok: true, logs: RECENT_EVENTS.slice(-5) });
      return;
    }
    if (message?.type === 'POISONED_EVENT') {
      // Count and store a concise log of page-world poisoning events (no personal data)
      const cfg = await getConfig();
      if (!cfg.enabled) { sendResponse({ ok: true }); return; }
      const { threats_countered = 0, threat_logs = [] } = await chrome.storage.local.get(['threats_countered','threat_logs']);
      const ev = message.event || {};
      const entry = {
        time: Date.now(),
        request: { url: ev.url || '', method: ev.method || 'beacon', initiator: ev.initiator || (sender?.url || '') },
        // In audit mode, annotate rule to reflect diagnostic nature
        ruleId: 'poison',
        action: ev.action || 'modify',
        preview: (typeof ev.preview === 'string' ? ev.preview : '')
      };
      // Always increment counter
      await chrome.storage.local.set({ threats_countered: threats_countered + 1 });
      // If currently auditing, tag ruleId to signal diagnostic mode in UI
      if (cfg.auditMode) {
        entry.ruleId = (ev.ruleId ? String(ev.ruleId) : 'poison') + ' (audit)';
        entry.action = ev.action ? String(ev.action) : 'audit';
      }
      if (cfg.auditMode) {
        const next = threat_logs.concat(entry).slice(-100);
        await chrome.storage.local.set({ threat_logs: next });
      } else {
        // Keep only in-memory last 5 when not auditing
        RECENT_EVENTS = RECENT_EVENTS.concat(entry).slice(-5);
      }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'RESET_STATS') {
      const { threat_logs = [] } = await chrome.storage.local.get('threat_logs');
      await chrome.storage.local.set({ threats_countered: 0, threat_logs: [] });
      RECENT_EVENTS = [];
      sendResponse({ ok: true, logs: threat_logs });
      return;
    }
    sendResponse({ ok: false });
  })();
  return true; // async
});

// Increment threats counter when DNR rules match (requires declarativeNetRequestFeedback permission)
try {
  if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
      try {
        const cfg = await getConfig();
        if (!cfg.enabled) return; // ignore when protection is OFF
        const { threats_countered = 0 } = await chrome.storage.local.get('threats_countered');
        // compose a compact log entry
        const entry = {
          time: Date.now(),
          request: {
            url: info.request?.url || '',
            method: info.request?.method || '',
            initiator: info.request?.initiator || ''
          },
          ruleId: info.rule?.id || info.ruleId || null,
          action: info.rule?.action?.type || info.action?.type || ''
        };
        await chrome.storage.local.set({ threats_countered: threats_countered + 1 });
        if (cfg.auditMode) {
          // Tag entry to reflect audit mode; do not block/alter
          entry.ruleId = String(entry.ruleId || 'rule') + ' (audit)';
          entry.action = 'audit';
          const { threat_logs = [] } = await chrome.storage.local.get('threat_logs');
          const next = threat_logs.concat(entry).slice(-100); // keep last 100
          await chrome.storage.local.set({ threat_logs: next });
        } else {
          RECENT_EVENTS = RECENT_EVENTS.concat(entry).slice(-5);
        }
      } catch (e) {
        // ignore
      }
    });
  }
} catch (e) {
  // ignore
}
