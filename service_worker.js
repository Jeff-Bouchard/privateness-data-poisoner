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
  // Show per-tab threats counter in UI (optional)
  statsPerTab: false,
  // User-managed origins where poisoning/suppression should be disabled
  whitelist: [],
  // Exact-origin captures for DNR initiator-based allow overrides
  whitelistExactHosts: [],
  // User-managed exact path whitelist (origin + pathname, no query/fragment)
  whitelistPaths: [],
  // User-managed blacklist: always block/override allow rules
  blacklist: [],
  // User-managed exact path blacklist (origin + pathname)
  blacklistPaths: [],
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

// Ephemeral in-memory recent events (kept for quick access), with persisted backup
let RECENT_EVENTS = [];
const RECENT_KEY = 'recent_events'; // persisted circular buffer
const RECENT_MAX = 100;

// Per-tab threats counter storage key
const TAB_THREATS_KEY = 'tab_threats'; // { [tabId:number]: count }

async function getTabThreats(){
  try { const { tab_threats = {} } = await chrome.storage.local.get(TAB_THREATS_KEY); return (typeof tab_threats === 'object' && tab_threats) ? tab_threats : {}; } catch { return {}; }
}
async function setTabThreats(map){ try { await chrome.storage.local.set({ [TAB_THREATS_KEY]: map||{} }); } catch {} }
async function incTabThreat(tabId){ try { if (typeof tabId !== 'number' || tabId < 0) return; const cfg = await getConfig(); if (!cfg.statsPerTab) return; const m = await getTabThreats(); m[tabId] = (m[tabId]||0) + 1; await setTabThreats(m); } catch {} }
async function clearTabThreat(tabId){ try { const m = await getTabThreats(); if (tabId in m){ delete m[tabId]; await setTabThreats(m); } } catch {} }
async function pushRecent(entry){
  try {
    RECENT_EVENTS = RECENT_EVENTS.concat(entry).slice(-RECENT_MAX);
    const { recent_events = [] } = await chrome.storage.local.get(RECENT_KEY);
    const next = recent_events.concat(entry).slice(-RECENT_MAX);
    await chrome.storage.local.set({ [RECENT_KEY]: next });
  } catch {}
}
async function clearRecent(){
  try { RECENT_EVENTS = []; await chrome.storage.local.set({ [RECENT_KEY]: [] }); } catch {}
}

// Live log: manage subscribers and broadcast
const LIVE_SUBS = new Set(); // each: { port, scope: 'global'|'tab', tabId: number|null, size: 25|50|100 }
function snapshotRecent(size, scope, tabId){
  try {
    const arr = Array.isArray(RECENT_EVENTS) ? RECENT_EVENTS : [];
    const filtered = scope === 'tab' && typeof tabId === 'number'
      ? arr.filter(e => e && typeof e.tabId === 'number' && e.tabId === tabId)
      : arr;
    const n = [25,50,100].includes(size) ? size : 25;
    return filtered.slice(-n);
  } catch { return []; }
}
function broadcastLiveEvent(entry){
  try {
    for (const sub of Array.from(LIVE_SUBS)){
      try {
        if (sub.scope === 'tab') {
          if (!(typeof sub.tabId === 'number' && typeof entry.tabId === 'number' && entry.tabId === sub.tabId)) continue;
        }
        sub.port.postMessage({ type: 'event', entry });
      } catch {}
    }
  } catch {}
}
chrome.runtime.onConnect.addListener((port)=>{
  if (port.name !== 'live-log') return;
  const sub = { port, scope: 'global', tabId: null, size: 25 };
  LIVE_SUBS.add(sub);
  try { port.postMessage({ type: 'snapshot', logs: snapshotRecent(sub.size, sub.scope, sub.tabId) }); } catch {}
  port.onMessage.addListener((msg)=>{
    try {
      if (msg && msg.type === 'subscribe') {
        sub.scope = (msg.scope === 'tab') ? 'tab' : 'global';
        sub.tabId = (typeof msg.tabId === 'number') ? msg.tabId : null;
        sub.size = [25,50,100].includes(msg.size) ? msg.size : 25;
        port.postMessage({ type: 'snapshot', logs: snapshotRecent(sub.size, sub.scope, sub.tabId) });
      }
    } catch {}
  });
  port.onDisconnect.addListener(()=>{ try { LIVE_SUBS.delete(sub); } catch {} });
});

// Register once: DNR rule matched events (feedback)
try {
  if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
      try {
        const cfg = await getConfig();
        if (!cfg.enabled) return; // ignore when protection is OFF
        const { threats_countered = 0 } = await chrome.storage.local.get('threats_countered');
        const nextCount = (threats_countered || 0) + 1;
        await chrome.storage.local.set({ threats_countered: nextCount });
        await updateBadge();
        // Build an event entry for logs/recent
        const entry = {
          ts: Date.now(),
          type: 'dnr',
          action: (info && info.rule && info.rule.action && info.rule.action.type) ? String(info.rule.action.type) : 'block',
          ruleId: (info && info.rule && info.rule.id) ? String(info.rule.id) : 'rule',
          request: {
            url: (info && info.request && info.request.url) ? String(info.request.url) : '',
            initiator: (info && info.request && info.request.initiator) ? String(info.request.initiator) : '',
            method: (info && info.request && info.request.method) ? String(info.request.method) : 'GET'
          }
        };
        if (typeof info.tabId === 'number') entry.tabId = info.tabId;
        if (cfg.auditMode) {
          // Tag entry to reflect audit mode; do not block/alter
          entry.ruleId = String(entry.ruleId || 'rule') + ' (audit)';
          entry.action = 'audit';
          const { threat_logs = [] } = await chrome.storage.local.get('threat_logs');
          const next = threat_logs.concat(entry).slice(-100); // keep last 100
          await chrome.storage.local.set({ threat_logs: next });
          // Keep recent buffer for live snapshots
          await pushRecent(entry);
        } else {
          await pushRecent(entry);
        }
        // Per-tab increment (if enabled)
        if (typeof info.tabId === 'number') { await incTabThreat(info.tabId); }
        // Broadcast to live subscribers
        try { broadcastLiveEvent(entry); } catch {}
      } catch (e) {
        // ignore
      }
    });
  }
} catch {}

// Build and sync DNR dynamic allow rules from whitelist and whitelistPaths
function escapeRegex(str){ return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Heuristic base-domain extractor (PSL-lite). For ccTLDs, treat common SLDs as part of suffix.
function getBaseDomain(hostname){
  try {
    const parts = String(hostname||'').toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const tld = parts[parts.length-1];
    const sld = parts[parts.length-2];
    const commonCcSlds = new Set(['co','com','net','org','gov','ac','edu']);
    if (tld.length === 2 && commonCcSlds.has(sld) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch { return String(hostname||''); }
}
function normalizeOriginToBase(origin){
  try {
    const u = new URL(origin);
    const base = getBaseDomain(u.hostname);
    return `${u.protocol}//${base}`;
  } catch { return String(origin||''); }
}

// Build and sync DNR dynamic block rules from blacklist and blacklistPaths
function buildBlockRulesFromConfig(cfg) {
  const rules = [];
  let idBase = 1300000000; // distinct high range from allow rules and static rules
  
  // Track added rules to prevent duplicates
  const addedRules = new Set();
  
  // Higher priority for more specific rules (paths first, then domains)
  const addRule = (rule, isPathRule = false) => { 
    const ruleKey = JSON.stringify(rule.condition);
    if (addedRules.has(ruleKey)) return; // Skip duplicate rules
    
    rule.id = idBase++;
    // Set priority: path rules (3200) > domain rules (3100)
    rule.priority = isPathRule ? 3200 : 3100;
    rules.push(rule);
    addedRules.add(ruleKey);
  };

  // Path-based block (exact host; no subdomain widening)
  for (const pathKey of (cfg.blacklistPaths || [])) {
    try {
      const key = normalizePathKey(pathKey);
      const u = new URL(key);
      const host = escapeRegex(u.hostname);
      const pathEsc = escapeRegex(u.pathname);
      
      // Match exact path or subpaths, but not parent paths
      const rx = `^https?:\\/\\/${host}${pathEsc}(?:\/[^?#]*)?(?:[?#].*)?$`;
      
      addRule({ 
        action: { type: 'block' }, 
        condition: { 
          regexFilter: rx,
          resourceTypes: ['main_frame', 'sub_frame', 'script', 'stylesheet', 'image', 
                         'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 
                         'media', 'websocket', 'other']
        }
      }, true);
    } catch (e) {
      console.error('Error processing blacklist path:', pathKey, e);
    }
  }

  // Origin-based block (base domain + any subdomain)
  for (const origin of (cfg.blacklist || [])) {
    try {
      const u = new URL(origin);
      const base = getBaseDomain(u.hostname);
      const host = escapeRegex(base);
      
      // Match any subdomain of the base domain
      const rx = `^https?:\\/\\/([^/]+\\.)*${host}(?:[:/].*)?$`;
      
      addRule({ 
        action: { type: 'block' }, 
        condition: { 
          regexFilter: rx,
          resourceTypes: ['main_frame', 'sub_frame', 'script', 'stylesheet', 'image', 
                         'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 
                         'media', 'websocket', 'other']
        }
      }, false);
    } catch (e) {
      console.error('Error processing blacklist origin:', origin, e);
    }
  }
  return rules;
}

async function syncDnrBlacklist(cfg) {
  try {
    if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
    
    // Get current rules to remove (stored + any existing in our reserved block ranges)
    const { dnr_block_rule_ids = [] } = await chrome.storage.local.get('dnr_block_rule_ids');
    const storedIds = Array.isArray(dnr_block_rule_ids) ? dnr_block_rule_ids : [];
    let existingIdsInRange = [];
    try {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      const ids = Array.isArray(existing) ? existing.map(r => r.id) : [];
      // Legacy block range: 910000-919999; Current block range: 1300000000-1399999999
      existingIdsInRange = ids.filter(id => (id >= 910000 && id <= 919999) || (id >= 1300000000 && id <= 1399999999));
    } catch {}
    const removeRuleIds = Array.from(new Set([...storedIds, ...existingIdsInRange]));
    
    // Generate new rules
    const addRules = buildBlockRulesFromConfig(cfg);
    
    // Update rules in a single batch
    if (removeRuleIds.length > 0 || addRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
      
      // Only update storage if the operation was successful
      await chrome.storage.local.set({ 
        dnr_block_rule_ids: addRules.map(r => r.id) 
      });
      
      console.log(`Updated DNR block rules: ${removeRuleIds.length} removed, ${addRules.length} added`);
    }
  } catch (e) {
    console.error('Error syncing DNR block rules:', e);
  }
}
function hostFromOrigin(origin){ try { return new URL(origin).hostname; } catch { return ''; } }
function normalizePathKey(input){
  try {
    const u = new URL(input);
    return u.origin + u.pathname; // strip query/fragment
  } catch {
    return String(input||'').split('?')[0].split('#')[0];
  }
}
function buildAllowRulesFromConfig(cfg) {
  const rules = [];
  let idBase = 1200000000; // high reserved ID range for allow rules
  
  // Higher priority for more specific rules (paths first, then domains, then initiators)
  const addRule = (rule, isPathRule = false, isInitiatorRule = false) => { 
    rule.id = idBase++;
    // Set priority: path rules (2200) > domain rules (2100) > initiator rules (2000) > default (1000)
    if (isPathRule) rule.priority = 2200;
    else if (isInitiatorRule) rule.priority = 2000;
    else rule.priority = 2100; // domain rule
    rules.push(rule);
  };

  // Path-based allow (exact host; no subdomain widening)
  for (const pathKey of (cfg.whitelistPaths || [])) {
    try {
      const key = normalizePathKey(pathKey);
      const u = new URL(key);
      const host = escapeRegex(u.hostname);
      const pathEsc = escapeRegex(u.pathname);
      // Use urlFilter with origin+pathname prefix; this avoids complex regex limits
      const urlFilter = `${u.origin}${u.pathname}`;
      addRule({ 
        action: { type: 'allow' }, 
        condition: { urlFilter } 
      }, true);
    } catch (e) {
      console.error('Error processing whitelist path:', pathKey, e);
    }
  }

  // Origin-based allow: allow base domain + subdomains via urlFilter substring (best-effort)
  for (const origin of (cfg.whitelist || [])) {
    try {
      const u = new URL(origin);
      const base = getBaseDomain(u.hostname);
      // urlFilter is a substring; keep it conservative to reduce false matches
      // Include protocol separator to anchor reasonably
      const urlFilter = `://${base}/`;
      addRule({ 
        action: { type: 'allow' }, 
        condition: { urlFilter } 
      }, false);
    } catch (e) {
      console.error('Error processing whitelist origin:', origin, e);
    }
  }
  // Exact-host initiator allow: full immunity for requests initiated by these hosts
  for (const host of (cfg.whitelistExactHosts || [])) {
    try {
      const h = String(host || '').trim().toLowerCase();
      if (!h) continue;
      // For allowAllRequests, Chromium requires resourceTypes, and only allows main_frame and sub_frame
      addRule({ 
        action: { type: 'allowAllRequests' }, 
        condition: { initiatorDomains: [h], resourceTypes: ['main_frame','sub_frame'] } 
      }, false, true);
    } catch (e) {
      console.error('Error processing whitelist initiator host:', host, e);
    }
  }
  return rules;
}
async function syncDnrAllowlist(cfg) {
  try {
    if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
    
    // Get current rules to remove (stored + any existing in our reserved allow ranges)
    const { dnr_allow_rule_ids = [] } = await chrome.storage.local.get('dnr_allow_rule_ids');
    const storedIds = Array.isArray(dnr_allow_rule_ids) ? dnr_allow_rule_ids : [];
    let existingIdsInRange = [];
    try {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      const ids = Array.isArray(existing) ? existing.map(r => r.id) : [];
      // Legacy allow range: 900000-909999; Current allow range: 1200000000-1299999999
      existingIdsInRange = ids.filter(id => (id >= 900000 && id <= 909999) || (id >= 1200000000 && id <= 1299999999));
    } catch {}
    const removeRuleIds = Array.from(new Set([...storedIds, ...existingIdsInRange]));
    
    // Generate new rules
    const addRules = buildAllowRulesFromConfig(cfg);
    
    // Update rules in a single batch
    if (removeRuleIds.length > 0 || addRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ 
        removeRuleIds, 
        addRules 
      });
      
      // Only update storage if the operation was successful
      await chrome.storage.local.set({ 
        dnr_allow_rule_ids: addRules.map(r => r.id) 
      });
      
      console.log(`Updated DNR allow rules: ${removeRuleIds.length} removed, ${addRules.length} added`);
    }
  } catch (e) {
    console.error('Error syncing DNR allow rules:', e);
  }
}

// Badge helper: show threats counter on the extension icon
async function updateBadge() {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const { threats_countered = 0 } = await chrome.storage.local.get('threats_countered');
    const text = threats_countered > 0 ? (threats_countered > 9999 ? '9K+' : String(threats_countered)) : '';
    await chrome.action.setBadgeBackgroundColor({ color: '#d23f31' });
    await chrome.action.setBadgeText({ text });
  } catch {}
}

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
  if (typeof cfg.statsPerTab !== 'boolean') { cfg.statsPerTab = false; changed = true; }
  // Remove legacy fields
  if ('ytMode' in cfg) { delete cfg.ytMode; changed = true; }
  // Ensure modules object exists with defaults where missing
  const mods = { ...DEFAULT_CONFIG.modules, ...(cfg.modules||{}) };
  if (JSON.stringify(mods) !== JSON.stringify(cfg.modules||{})) { cfg.modules = mods; changed = true; }
  // Ensure whitelist array exists
  if (!Array.isArray(cfg.whitelist)) { cfg.whitelist = []; changed = true; }
  if (!Array.isArray(cfg.whitelistExactHosts)) { cfg.whitelistExactHosts = []; changed = true; }
  if (!Array.isArray(cfg.whitelistPaths)) { cfg.whitelistPaths = []; changed = true; }
  // Ensure blacklist arrays exist
  if (!Array.isArray(cfg.blacklist)) { cfg.blacklist = []; changed = true; }
  if (!Array.isArray(cfg.blacklistPaths)) { cfg.blacklistPaths = []; changed = true; }
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
  // Initialize per-tab threats map
  try { const { tab_threats } = await chrome.storage.local.get('tab_threats'); if (!tab_threats || typeof tab_threats !== 'object') { await chrome.storage.local.set({ tab_threats: {} }); } } catch {}
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
    // Sync allowlist overrides
    await syncDnrAllowlist(cfg);
    // Sync blacklist overrides
    await syncDnrBlacklist(cfg);
  } catch {}
  // Initialize badge state
  try { await updateBadge(); } catch {}
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
    try { await syncDnrAllowlist(await getConfig()); } catch {}
    try { await syncDnrBlacklist(await getConfig()); } catch {}
    // Reset threats counter on every browser startup; preserve configs/whitelists
    try {
      await chrome.storage.local.set({ threats_countered: 0 });
      await clearRecent();
      await setTabThreats({});
    } catch {}
    try { await updateBadge(); } catch {}
  });
} catch {}

// Open options page maximized in a tab when the toolbar icon is clicked
try {
  chrome.action.onClicked.addListener(async () => {
    try {
      const url = chrome.runtime.getURL('options.html');
      await chrome.tabs.create({ url });
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
      if (!Array.isArray((message.config||{}).whitelistExactHosts)) next.whitelistExactHosts = current.whitelistExactHosts;
      if (!Array.isArray((message.config||{}).whitelistPaths)) next.whitelistPaths = current.whitelistPaths;
      if (!Array.isArray((message.config||{}).blacklist)) next.blacklist = current.blacklist;
      if (!Array.isArray((message.config||{}).blacklistPaths)) next.blacklistPaths = current.blacklistPaths;
      // Persist new config
      await chrome.storage.local.set({ config: next });
      // If enabled state toggled, reset threats counter and recent events (keep logs)
      try {
        if (current.enabled !== next.enabled) {
          await chrome.storage.local.set({ threats_countered: 0 });
          await clearRecent();
        }
      } catch {}
      // Toggle DNR ruleset based on enabled/audit state to ensure proper behavior
      try {
        if (chrome.declarativeNetRequest?.updateEnabledRulesets) {
          const shouldDisable = (!next.enabled) || (!!next.auditMode);
          if (shouldDisable) await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['rules_analytics'] });
          else await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['rules_analytics'] });
        }
      } catch {}
      // Sync DNR allowlist overrides for updated whitelist
      try { await syncDnrAllowlist(next); } catch {}
      // Sync DNR blacklist overrides
      try { await syncDnrBlacklist(next); } catch {}
      try { await updateBadge(); } catch {}
      sendResponse({ ok: true, config: next });
      return;
    }
    if (message?.type === 'GET_WHITELIST') {
      const cfg = await getConfig();
      sendResponse({ ok: true, whitelist: cfg.whitelist || [] });
      return;
    }
    if (message?.type === 'GET_BLACKLIST') {
      const cfg = await getConfig();
      sendResponse({ ok: true, blacklist: cfg.blacklist || [] });
      return;
    }
    if (message?.type === 'GET_WHITELIST_PATHS') {
      const cfg = await getConfig();
      sendResponse({ ok: true, whitelistPaths: cfg.whitelistPaths || [] });
      return;
    }
    if (message?.type === 'GET_BLACKLIST_PATHS') {
      const cfg = await getConfig();
      sendResponse({ ok: true, blacklistPaths: cfg.blacklistPaths || [] });
      return;
    }
    if (message?.type === 'ADD_TO_WHITELIST') {
      const origin = String(message.origin||'').trim(); // expected "https://host"
      try {
        if (!origin) { sendResponse({ ok:false, error:'no_origin' }); return; }
        const cfg = await getConfig();
        const set = new Set(cfg.whitelist||[]);
        const norm = normalizeOriginToBase(origin);
        set.add(norm);
        cfg.whitelist = Array.from(set).sort();
        // Track exact host for initiator-based allow
        const host = hostFromOrigin(origin);
        const hexact = new Set(cfg.whitelistExactHosts||[]);
        if (host) { hexact.add(host.toLowerCase()); }
        cfg.whitelistExactHosts = Array.from(hexact).sort();
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrAllowlist(cfg); } catch {}
        sendResponse({ ok: true, whitelist: cfg.whitelist });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'ADD_TO_BLACKLIST') {
      const origin = String(message.origin||'').trim();
      try {
        if (!origin) { sendResponse({ ok:false, error:'no_origin' }); return; }
        const cfg = await getConfig();
        const set = new Set(cfg.blacklist||[]);
        const norm = normalizeOriginToBase(origin);
        set.add(norm);
        cfg.blacklist = Array.from(set).sort();
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrBlacklist(cfg); } catch {}
        sendResponse({ ok: true, blacklist: cfg.blacklist });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'ADD_TO_WHITELIST_PATHS') {
      const path = normalizePathKey(String(message.path||'').trim());
      try {
        if (!path) { sendResponse({ ok:false, error:'no_path' }); return; }
        const cfg = await getConfig();
        const set = new Set(cfg.whitelistPaths||[]);
        set.add(path);
        cfg.whitelistPaths = Array.from(set).sort();
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrAllowlist(cfg); } catch {}
        sendResponse({ ok: true, whitelistPaths: cfg.whitelistPaths });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'ADD_TO_BLACKLIST_PATHS') {
      const path = normalizePathKey(String(message.path||'').trim());
      try {
        if (!path) { sendResponse({ ok:false, error:'no_path' }); return; }
        const cfg = await getConfig();
        const set = new Set(cfg.blacklistPaths||[]);
        set.add(path);
        cfg.blacklistPaths = Array.from(set).sort();
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrBlacklist(cfg); } catch {}
        sendResponse({ ok: true, blacklistPaths: cfg.blacklistPaths });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'REMOVE_FROM_WHITELIST') {
      const origin = String(message.origin||'').trim();
      try {
        const cfg = await getConfig();
        cfg.whitelist = (cfg.whitelist||[]).filter(o => o !== origin);
        // Remove exact host as well
        const host = hostFromOrigin(origin);
        if (host) {
          cfg.whitelistExactHosts = (cfg.whitelistExactHosts||[]).filter(h => h !== host.toLowerCase());
        }
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrAllowlist(cfg); } catch {}
        sendResponse({ ok: true, whitelist: cfg.whitelist });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'REMOVE_FROM_BLACKLIST') {
      const origin = String(message.origin||'').trim();
      try {
        const cfg = await getConfig();
        cfg.blacklist = (cfg.blacklist||[]).filter(o => o !== origin);
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrBlacklist(cfg); } catch {}
        sendResponse({ ok: true, blacklist: cfg.blacklist });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'REMOVE_FROM_WHITELIST_PATHS') {
      const path = normalizePathKey(String(message.path||'').trim());
      try {
        const cfg = await getConfig();
        cfg.whitelistPaths = (cfg.whitelistPaths||[]).filter(p => p !== path);
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrAllowlist(cfg); } catch {}
        sendResponse({ ok: true, whitelistPaths: cfg.whitelistPaths });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'REMOVE_FROM_BLACKLIST_PATHS') {
      const path = normalizePathKey(String(message.path||'').trim());
      try {
        const cfg = await getConfig();
        cfg.blacklistPaths = (cfg.blacklistPaths||[]).filter(p => p !== path);
        await chrome.storage.local.set({ config: cfg });
        try { await syncDnrBlacklist(cfg); } catch {}
        sendResponse({ ok: true, blacklistPaths: cfg.blacklistPaths });
      } catch (e) { sendResponse({ ok:false, error: String(e&&e.message||e) }); }
      return;
    }
    if (message?.type === 'GET_STATS') {
      const cfg = await getConfig();
      if (!cfg.enabled) { sendResponse({ ok: true, threats: 0 }); return; }
      const { threats_countered = 0 } = await chrome.storage.local.get('threats_countered');
      let perTab = null;
      try {
        if (cfg.statsPerTab && typeof message.tabId === 'number') {
          const m = await getTabThreats();
          perTab = m[message.tabId] || 0;
        }
      } catch {}
      sendResponse({ ok: true, threats: threats_countered, perTab });
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
    if (message?.type === 'RESET_STATS') {
      const { threat_logs = [] } = await chrome.storage.local.get('threat_logs');
      await chrome.storage.local.set({ threats_countered: 0 });
      await clearRecent();
      await updateBadge();
      sendResponse({ ok: true, threats: 0, perTab: 0 });
      return;
    }
    if (message?.type === 'GET_RECENT') {
      const cfg = await getConfig();
      if (!cfg.enabled) { sendResponse({ ok: true, logs: [] }); return; }
      // Return persisted recent events if available; fallback to in-memory
      try {
        const { recent_events = [] } = await chrome.storage.local.get(RECENT_KEY);
        sendResponse({ ok: true, logs: (Array.isArray(recent_events) ? recent_events : []).slice(-100) });
      } catch {
        sendResponse({ ok: true, logs: RECENT_EVENTS.slice(-100) });
      }
      return;
    }
    if (message?.type === 'POISONED_EVENT') {
      // Count and store a concise log of page-world poisoning events (no personal data)
      const cfg = await getConfig();
      if (!cfg.enabled) { sendResponse({ ok: true }); return; }
      const { threats_countered = 0 } = await chrome.storage.local.get('threats_countered');
      const nextCount = (threats_countered || 0) + 1;
      await chrome.storage.local.set({ threats_countered: nextCount });
      await updateBadge();
      const ev = message.event || {};
      const entry = {
        ts: Date.now(),
        type: 'poison',
        action: ev.action || 'poison',
        ruleId: ev.ruleId ? String(ev.ruleId) : 'poison',
        request: {
          url: ev.url || '',
          initiator: ev.initiator || (sender && sender.url) || '',
          method: ev.method || 'N/A'
        }
      };
      try { const tabId = sender?.tab?.id; if (typeof tabId === 'number') entry.tabId = tabId; } catch {}
      const { threat_logs = [] } = await chrome.storage.local.get('threat_logs');
      if (cfg.auditMode) {
        const next = threat_logs.concat(entry).slice(-100);
        await chrome.storage.local.set({ threat_logs: next });
      }
      await pushRecent(entry);
      // Per-tab increment (if enabled)
      try { const tabId = sender?.tab?.id; if (typeof tabId === 'number') { await incTabThreat(tabId); } } catch {}
      // Broadcast to live subscribers
      try { broadcastLiveEvent(entry); } catch {}
      sendResponse({ ok: true });
      return;
    }
    
    sendResponse({ ok: false });
  })();
  return true; // async
});

// Clean up per-tab counter when a tab is closed
try {
  if (chrome.tabs && chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener(async (tabId) => { try { await clearTabThreat(tabId); } catch {} });
  }
} catch {}
