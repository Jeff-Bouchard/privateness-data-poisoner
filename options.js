function normalizeMode(m){
  const s = String(m||'').toLowerCase();
  if (['baseline','conservative','light'].includes(s)) return 'baseline';
  if (['moderate','standard','balanced','aggressive'].includes(s)) return 'moderate';
  if (['strict','maximum','max','active_warfare','warfare'].includes(s)) return 'strict';
  return 'moderate';
}

// Robust time formatters
function timeMs(ts){
  let ms = Number(ts);
  if (!isFinite(ms)){
    const p = (typeof ts === 'string') ? Date.parse(ts) : NaN;
    ms = isFinite(p) ? p : Date.now();
  }
  return ms;
}
function timeStr(ts){
  const d = new Date(timeMs(ts));
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
}
function timeFull(ts){
  const d = new Date(timeMs(ts));
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mon = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  return `${yyyy}-${mon}-${day} ${hh}:${mm}:${ss}`;
}

// Open the Live log page as a browser tab
function openLiveLogTab(){
  try {
    const url = chrome.runtime.getURL('live.html');
    window.open(url, '_blank', 'noopener');
  } catch {}
}

// Master password management
async function saveMasterPassword() {
  const input = document.getElementById('masterPasswordInput');
  const password = input.value.trim();
  
  try {
    await chrome.storage.local.set({ masterPassword: password });
    showStatus('Master password saved', 'success');
    input.value = '';
  } catch (e) {
    showStatus('Failed to save master password', 'error');
  }
}

async function clearMasterPassword() {
  try {
    await chrome.storage.local.remove('masterPassword');
    showStatus('Master password cleared', 'success');
    document.getElementById('masterPasswordInput').value = '';
  } catch (e) {
    showStatus('Failed to clear master password', 'error');
  }
}

// Logging functions
function exportLogs() {
  try {
    const exported = poisoningLogger.exportLogs();
    const blob = new Blob([exported], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `privateness-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Logs exported successfully', 'success');
  } catch (e) {
    showStatus('Failed to export logs', 'error');
  }
}

function importLogs() {
  document.getElementById('importFile').click();
}

function handleLogImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const result = poisoningLogger.importLogs(e.target.result);
      if (result.success) {
        showStatus(`Imported ${result.count} log entries`, 'success');
        updateLogStats();
      } else {
        showStatus(`Import failed: ${result.error}`, 'error');
      }
    } catch (err) {
      showStatus('Import failed: Invalid file', 'error');
    }
  };
  reader.readAsText(file);
}

function clearLogs() {
  if (confirm('Clear all poisoning logs? This cannot be undone.')) {
    poisoningLogger.clearLogs();
    showStatus('All logs cleared', 'success');
    updateLogStats();
  }
}

function updateLogStats() {
  const stats = poisoningLogger.getStats();
  const statsDiv = document.getElementById('logStats');
  
  if (stats.totalEntries === 0) {
    statsDiv.textContent = 'No logs recorded yet';
    return;
  }
  
  const schemas = Object.entries(stats.schemaBreakdown)
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ');
    
  statsDiv.textContent = '';
  const entriesSpan = document.createElement('strong');
  entriesSpan.textContent = stats.totalEntries;
  const originsSpan = document.createElement('strong');
  originsSpan.textContent = stats.uniqueOrigins;
  
  statsDiv.appendChild(entriesSpan);
  statsDiv.appendChild(document.createTextNode(' entries, '));
  statsDiv.appendChild(originsSpan);
  statsDiv.appendChild(document.createTextNode(' origins'));
  statsDiv.appendChild(document.createElement('br'));
  statsDiv.appendChild(document.createTextNode(`Schemas: ${schemas}`));
  
  if (stats.timeRange) {
    statsDiv.appendChild(document.createElement('br'));
    statsDiv.appendChild(document.createTextNode(`Range: ${stats.timeRange.spanHours}h`));
  }
}

function showStatus(message, type = 'info') {
  // Simple status display - could be enhanced with a toast system
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Preview modal wiring
function openPreview(text, meta){
  try {
    const modal = document.getElementById('previewModal');
    const body = document.getElementById('previewBody');
    const m = document.getElementById('previewMeta');
    if (!modal || !body) return;
    body.textContent = text || '(empty)';
    if (m) m.textContent = `${meta?.method||''} ${meta?.url||''}`.trim();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  } catch {}
}
function closePreview(){
  try { const modal = document.getElementById('previewModal'); if (modal){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } } catch {}
}
document.getElementById('previewClose')?.addEventListener('click', closePreview);
document.getElementById('previewModal')?.addEventListener('click', (e)=>{ if (e.target && e.target.id === 'previewModal') closePreview(); });
// Copy preview
async function copyPreview(){
  try {
    const body = document.getElementById('previewBody');
    const text = body ? body.textContent || '' : '';
    if (!text) return;
    if (navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    const btn = document.getElementById('previewCopy'); if (btn){ const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(()=>btn.textContent=old, 1200); }
  } catch {}
}
document.getElementById('previewCopy')?.addEventListener('click', copyPreview);

// Whitelist choice modal wiring
let WL_TARGET_URL = '';
let WL_ON_DONE = null;
let WL_TAB_ID = null;
function openWhitelistChooser(url, onDone, tabId){
  try {
    WL_TARGET_URL = String(url||'');
    WL_ON_DONE = typeof onDone === 'function' ? onDone : null;
    WL_TAB_ID = tabId || null;
    const modal = document.getElementById('wlModal');
    const meta = document.getElementById('wlMeta');
    if (meta){
      try { const u = new URL(WL_TARGET_URL); meta.textContent = `${u.origin}${u.pathname}`; } catch { meta.textContent = WL_TARGET_URL; }
    }
    if (modal){ modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); }
  } catch {}
}
function closeWhitelistChooser(){
  try { const modal = document.getElementById('wlModal'); if (modal){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } WL_TARGET_URL=''; WL_ON_DONE=null; WL_TAB_ID=null; } catch {}
}
document.getElementById('wlClose')?.addEventListener('click', closeWhitelistChooser);
document.getElementById('wlModal')?.addEventListener('click', (e)=>{ if (e.target && e.target.id === 'wlModal') closeWhitelistChooser(); });
document.getElementById('wlDomain')?.addEventListener('click', async ()=>{
  const full = WL_TARGET_URL;
  if (!full) return;
  try {
    const u = new URL(full);
    const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST', origin: u.origin, tabId: WL_TAB_ID });
    if (res && res.ok){
      updateWhitelist();
      if (WL_ON_DONE) try { WL_ON_DONE(); } catch {}
    }
  } catch {}
  closeWhitelistChooser();
});
document.getElementById('wlPath')?.addEventListener('click', async ()=>{
  const full = WL_TARGET_URL;
  if (!full) return;
  try {
    const u = new URL(full);
    let pathKey = u.origin + u.pathname;
    if (!pathKey.endsWith('/')) pathKey += '/';
    const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST_PATHS', path: pathKey, tabId: WL_TAB_ID });
    if (res && res.ok){
      updateWhitelistPaths();
      if (WL_ON_DONE) try { WL_ON_DONE(); } catch {}
    }
  } catch {}
  closeWhitelistChooser();
});

// Blacklist choice modal wiring
let BL_TARGET_URL = '';
let BL_ON_DONE = null;
function openBlacklistChooser(url, onDone){
  try {
    BL_TARGET_URL = String(url||'');
    BL_ON_DONE = typeof onDone === 'function' ? onDone : null;
    const modal = document.getElementById('blModal');
    const meta = document.getElementById('blMeta');
    if (meta){
      try { const u = new URL(BL_TARGET_URL); meta.textContent = `${u.origin}${u.pathname}`; } catch { meta.textContent = BL_TARGET_URL; }
    }
    if (modal){ modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); }
  } catch {}
}
function closeBlacklistChooser(){
  try { const modal = document.getElementById('blModal'); if (modal){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } BL_TARGET_URL=''; BL_ON_DONE=null; } catch {}
}
document.getElementById('blClose')?.addEventListener('click', closeBlacklistChooser);
document.getElementById('blModal')?.addEventListener('click', (e)=>{ if (e.target && e.target.id === 'blModal') closeBlacklistChooser(); });
document.getElementById('blDomain')?.addEventListener('click', async ()=>{
  const full = BL_TARGET_URL;
  if (!full) return;
  try {
    const u = new URL(full);
    const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST', origin: u.origin });
    if (res && res.ok){
      updateBlacklist();
      if (BL_ON_DONE) try { BL_ON_DONE(); } catch {}
    }
  } catch {}
  closeBlacklistChooser();
});
document.getElementById('blPath')?.addEventListener('click', async ()=>{
  const full = BL_TARGET_URL;
  if (!full) return;
  try {
    const u = new URL(full);
    let pathKey = u.origin + u.pathname;
    if (!pathKey.endsWith('/')) pathKey += '/';
    const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST_PATHS', path: pathKey });
    if (res && res.ok){
      updateBlacklistPaths();
      if (BL_ON_DONE) try { BL_ON_DONE(); } catch {}
    }
  } catch {}
  closeBlacklistChooser();
});

// Defunct names list UI
function renderDefunctList(items){
  try {
    const list = document.getElementById('defunctList');
    const empty = document.getElementById('defunctEmpty');
    if (!list || !empty) return;
    list.innerHTML = '';
    const vals = (items||[]).map(x=>String(x).trim()).filter(Boolean);
    if (!vals.length){ empty.style.display=''; list.style.display='none'; return; }
    empty.style.display='none'; list.style.display='';
    for (const val of vals){
      const li = document.createElement('li'); li.style.margin='2px 0';
      const txt = document.createElement('span'); txt.textContent = val; li.appendChild(txt);
      const rm = document.createElement('button'); rm.textContent='Remove'; rm.className='secondary'; rm.style.marginLeft='8px';
      rm.addEventListener('click', ()=>{ li.remove(); if (!document.querySelector('#defunctList li')){ empty.style.display=''; list.style.display='none'; } });
      li.appendChild(rm);
      list.appendChild(li);
    }
  } catch {}
}
function getDefunctList(){
  const out = [];
  try {
    const list = document.getElementById('defunctList');
    if (!list) return out;
    list.querySelectorAll('li span').forEach(s=>{ const v = String(s.textContent||'').trim(); if (v) out.push(v); });
  } catch {}
  return out;
}
function addDefunct(){
  const input = document.getElementById('defunctInput');
  if (!input) return;
  const val = String(input.value||'').trim();
  if (!val) return;
  const current = new Set(getDefunctList().map(v=>v.toLowerCase()));
  if (current.has(val.toLowerCase())){ input.value=''; return; }
  const list = document.getElementById('defunctList'); const empty = document.getElementById('defunctEmpty');
  if (empty) empty.style.display='none'; if (list) list.style.display='';
  const li = document.createElement('li'); li.style.margin='2px 0';
  const txt = document.createElement('span'); txt.textContent = val; li.appendChild(txt);
  const rm = document.createElement('button'); rm.textContent='Remove'; rm.className='secondary'; rm.style.marginLeft='8px';
  rm.addEventListener('click', ()=>{ li.remove(); const any = document.querySelector('#defunctList li'); if (!any && empty && list){ empty.style.display=''; list.style.display='none'; } });
  li.appendChild(rm);
  list.appendChild(li);
  input.value='';
}
document.getElementById('defunctAdd')?.addEventListener('click', (e)=>{ e.preventDefault?.(); addDefunct(); });

async function loadConfig(){
  const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  const cfg = (res && res.ok) ? res.config : null;
  if (!cfg) return;
  const mode = document.getElementById('mode');
  if (mode) mode.value = cfg.mode || 'moderate';
  const ids = ['canvasNoise','audioNoise','webglNoise','perfQuantize','navigatorClamp','storageHygiene','blockBeacons'];
  for (const id of ids){
    const el = document.getElementById(id);
    if (el) el.checked = !!(cfg.modules||{})[id];
  }
  // Apply Benji (global enable) and Audit state to UI
  const benji = document.getElementById('benji');
  const auditBtn = document.getElementById('auditToggle');
  if (benji){
    const on = cfg.enabled !== false;
    benji.classList.toggle('on', on);
    benji.classList.toggle('off', !on);
    benji.setAttribute('aria-pressed', on ? 'true' : 'false');
    benji.title = 'Global protection';
    benji.textContent = `Protection: ${on ? 'On' : 'Off'}`;
  }
  if (auditBtn){
    const on = !!cfg.auditMode;
    auditBtn.classList.toggle('on', on);
    auditBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    auditBtn.textContent = `Audit/Debug read-only mode: ${on ? 'On' : 'Off'}`;
  }
  // Threat scope button initial label
  const scopeBtn = document.getElementById('threatScope');
  if (scopeBtn) scopeBtn.textContent = `Scope: ${cfg.statsPerTab ? 'This tab' : 'Global'}`;
  // Poisoning config (beta)
  const pc = mods.poisonConfig || {};
  const pcIds = ['poisonIncludeRid','poisonIncludeJitter','poisonIncludeFakePII'];
  pcIds.forEach((id)=>{ const el = document.getElementById(id); if (el) el.checked = (pc[id] !== false); });
  // Custom defunct names list
  renderDefunctList(Array.isArray(pc.defunctNames) ? pc.defunctNames : []);
}

async function saveConfig(){
  const mode = document.getElementById('mode')?.value || 'moderate';
  const ids = ['canvasNoise','audioNoise','webglNoise','perfQuantize','navigatorClamp','storageHygiene','blockBeacons'];
  const modules = {};
  for (const id of ids){
    const el = document.getElementById(id); modules[id] = !!el.checked;
  }
  const enabled = document.getElementById('benji')?.classList.contains('on');
  const auditMode = document.getElementById('auditToggle')?.classList.contains('on');
  // Collect poisoning config
  const poisonConfig = {
    poisonIncludeRid: !!document.getElementById('poisonIncludeRid')?.checked,
    poisonIncludeJitter: !!document.getElementById('poisonIncludeJitter')?.checked,
    poisonIncludeFakePII: !!document.getElementById('poisonIncludeFakePII')?.checked,
    defunctNames: getDefunctList()
  };
  modules.poisonConfig = poisonConfig;
  const config = {
    mode,
    modules,
    enabled,
    auditMode,
    // preserve denyHosts managed by SW default; user options only manage mode/modules
  };
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config });
  const status = document.getElementById('status');
  status.textContent = 'Saved';
  status.className = 'small ok';
  setTimeout(()=>{ status.textContent=''; status.className='small'; }, 1500);
}

// Recent threats rendering
function renderLogs(logs){
  const empty = document.getElementById('logsEmpty');
  const table = document.getElementById('logsTable');
  const body = document.getElementById('logsBody');
  if (!empty || !table || !body) return;
  body.innerHTML = '';
  // Show all items (newest first); scroll container in options.html limits visible rows
  const items = (logs || []).slice().reverse();
  if (!items.length){
    empty.style.display = '';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = '';
  for (const l of items){
    const tr = document.createElement('tr');
    function td(text){ const el = document.createElement('td'); el.style.padding = '6px 8px'; el.textContent = text; return el; }
    const t = timeStr(l.time);
    const r = String(l.ruleId || '');
    const isAudit = (String(l.action||'').toLowerCase()==='audit') || r.includes('(audit)');
    tr.appendChild(td(t));
    // Column 2: URL (show domain + path, full URL on hover)
    {
      const urlTd = document.createElement('td');
      urlTd.style.padding = '6px 8px';
      const fullUrl = l.request?.url || '';
      let displayText = fullUrl;
      
      try {
        const u = new URL(fullUrl);
        const domain = u.hostname.replace(/^www\./, '');
        const path = u.pathname === '/' ? '' : u.pathname;
        displayText = domain + path;
      } catch (e) {
        displayText = fullUrl.replace(/^https?:\/\//, '').split('?')[0];
      }
      
      urlTd.textContent = displayText;
      if (fullUrl) urlTd.title = fullUrl;
      tr.appendChild(urlTd);
    }
    // Make 'poison' clickable to preview payload (not in audit)
    if (r === 'poison' && !isAudit){
      const el = document.createElement('td'); el.style.padding = '6px 8px';
      const link = document.createElement('span'); link.className = 'link'; link.textContent = 'poison';
      link.addEventListener('click', ()=>{
        openPreview(l.preview || '', { url: l.request?.url||'', method: l.request?.method||'' });
      });
      el.appendChild(link); tr.appendChild(el);
    } else {
      const ruleTd = td(isAudit ? 'audit' : r);
      ruleTd.style.whiteSpace = 'nowrap';
      tr.appendChild(ruleTd);
    }
    // Column 4: Action buttons
    const actionTd = document.createElement('td'); actionTd.style.padding = '6px 8px';
    const wbtn = document.createElement('button');
    wbtn.textContent = 'Allow…';
    wbtn.style.padding = '4px 8px';
    wbtn.style.fontSize = '11px';
    wbtn.title = 'Add to allow list: choose origin or path';
    const bbtn = document.createElement('button');
    bbtn.textContent = 'Block…';
    bbtn.className = 'secondary';
    bbtn.style.padding = '4px 8px';
    bbtn.style.fontSize = '11px';
    bbtn.style.marginLeft = '6px';
    bbtn.title = 'Add to block list: choose origin or path';
    actionTd.appendChild(wbtn);
    actionTd.appendChild(bbtn);
    wbtn.addEventListener('click', async ()=>{
      const full = l.request?.url || '';
      if (!full) return;
      
      // Get current active tab ID for bearer's authority
      let tabId = null;
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs[0]) tabId = tabs[0].id;
      } catch (e) {}
      
      openWhitelistChooser(full, ()=>{ wbtn.textContent = 'Allowed'; wbtn.disabled = true; }, tabId);
    });
    bbtn.addEventListener('click', ()=>{
      const full = l.request?.url || '';
      if (!full) return;
      openBlacklistChooser(full, ()=>{ bbtn.textContent = 'Blocked'; bbtn.disabled = true; });
    });
    tr.appendChild(actionTd);
    body.appendChild(tr);
  }
}

async function updateLogs(){
  try {
    // Decide source based on audit mode
    const cfgRes = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    const audit = (cfgRes && cfgRes.ok && cfgRes.config) ? !!cfgRes.config.auditMode : false;
    if (audit){
      const res = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
      if (res && res.ok) renderLogs(res.logs || []);
    } else {
      const res = await chrome.runtime.sendMessage({ type: 'GET_RECENT' });
      if (res && res.ok) renderLogs((res.logs || []).slice(-5));
    }
  } catch {}
}

document.getElementById('save')?.addEventListener('click', saveConfig);

// Threats counter
async function updateThreats(){
  try {
    // Determine scope
    const cfgRes = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    const cfg = (cfgRes && cfgRes.ok) ? (cfgRes.config||{}) : {};
    let tabId = undefined;
    if (cfg.statsPerTab && chrome.tabs?.query) {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (Array.isArray(tabs) && tabs[0] && typeof tabs[0].id === 'number') tabId = tabs[0].id;
      } catch {}
    }
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATS', tabId });
    if (res && res.ok) {
      const el = document.getElementById('threats');
      if (el) el.textContent = String((cfg.statsPerTab && typeof res.perTab === 'number') ? res.perTab : (res.threats || 0));
      // Update scope label
      const scopeLabel = document.getElementById('threatsScopeLabel');
      if (scopeLabel) scopeLabel.textContent = cfg.statsPerTab ? '(scope: this tab)' : '(scope: global)';
      // Keep audit button label in sync with count
      const auditBtn = document.getElementById('auditToggle');
      if (auditBtn){
        const on = auditBtn.classList.contains('on');
        const total = res.threats || 0;
        auditBtn.textContent = `Audit/Debug read-only mode: ${on ? 'On' : 'Off'}${on ? ` — ${total} events` : ''}`;
      }
    }
  } catch {}
}
async function resetThreats(){
  const res = await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
  try {
    const logs = res?.logs || [];
    if (logs.length) {
      const brief = logs.slice(-10).map(l=>{
        const u = (()=>{ try { const a=new URL(l.request?.url||''); return a.origin + a.pathname; } catch { return l.request?.url||''; } })();
        return { t: timeStr(l.time), m: l.request?.method||'', u, r: l.ruleId||'', a: l.action||'' };
      });
      console.info(`Privateness — ${logs.length} threat(s) since last reset. Showing last ${brief.length}:`);
      console.table(brief);
    } else {
      console.info('Privateness — No threats since last reset.');
    }
  } catch {}
  updateThreats();
  // Ensure logs list clears immediately
  updateLogs();
}

document.getElementById('resetThreats')?.addEventListener('click', resetThreats);

// Initialize UI
loadConfig();
updateThreats();
updateLogs();
setInterval(updateThreats, 3000);
setInterval(updateLogs, 3000);

// Whitelist management
async function updateWhitelist(){
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST' });
    if (res && res.ok) renderWhitelist(res.whitelist||[]);
  } catch {}
}

function renderWhitelist(list){
  const wlList = document.getElementById('wlList');
  const wlEmpty = document.getElementById('wlEmpty');
  if (!wlList || !wlEmpty) return;
  wlList.innerHTML = '';
  const items = Array.isArray(list) ? list : [];
  if (!items.length){
    wlEmpty.style.display = '';
    return;
  }
  wlEmpty.style.display = 'none';
  for (const origin of items){
    const li = document.createElement('li');
    li.style.margin = '4px 0';
    const code = document.createElement('code');
    // Visualize domain allow as wildcard base (store remains 'https://base')
    try {
      const u = new URL(origin);
      code.textContent = `${u.protocol}//*.${u.hostname}`;
    } catch { code.textContent = origin.replace('://','://*.'); }
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.style.marginLeft = '10px';
    btn.addEventListener('click', async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_WHITELIST', origin });
        if (res && res.ok) renderWhitelist(res.whitelist||[]);
      } catch {}
    });
    li.appendChild(code);
    li.appendChild(btn);
    wlList.appendChild(li);
  }
}

updateWhitelist();
setInterval(updateWhitelist, 5000);

// Whitelist paths management
async function updateWhitelistPaths(){
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST_PATHS' });
    if (res && res.ok) renderWhitelistPaths(res.whitelistPaths||[]);
  } catch {}
}

function renderWhitelistPaths(list){
  const wlList = document.getElementById('wlPathsList');
  const wlEmpty = document.getElementById('wlPathsEmpty');
  if (!wlList || !wlEmpty) return;
  wlList.innerHTML = '';
  const items = Array.isArray(list) ? list : [];
  wlEmpty.style.display = items.length ? 'none' : '';
  for (const item of items){
    const li = document.createElement('li'); li.style.margin = '4px 0';
    const code = document.createElement('code'); code.textContent = item;
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.style.marginLeft = '10px';
    edit.addEventListener('click', async ()=>{
      try {
        const next = prompt('Edit allowlisted path (origin+pathname, e.g., https://example.com/api):', item);
        if (!next || next === item) return;
        await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_WHITELIST_PATHS', path: item });
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST_PATHS', path: next });
        if (res && res.ok) renderWhitelistPaths(res.whitelistPaths||[]);
      } catch {}
    });
    const btn = document.createElement('button'); btn.textContent = 'Remove'; btn.style.marginLeft = '10px';
    btn.addEventListener('click', async ()=>{
      try {
        const res = await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_WHITELIST_PATHS', path: item });
        if (res && res.ok) renderWhitelistPaths(res.whitelistPaths||[]);
      } catch {}
    });
    li.appendChild(code); li.appendChild(edit); li.appendChild(btn); wlList.appendChild(li);
  }
}

updateWhitelistPaths();
setInterval(updateWhitelistPaths, 5000);

// Blacklist management
async function updateBlacklist(){
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_BLACKLIST' });
    if (res && res.ok) renderBlacklist(res.blacklist||[]);
  } catch {}
}

function renderBlacklist(list){
  const blList = document.getElementById('blList');
  const blEmpty = document.getElementById('blEmpty');
  if (!blList || !blEmpty) return;
  blList.innerHTML = '';
  const items = Array.isArray(list) ? list : [];
  if (!items.length){ blEmpty.style.display = ''; return; }
  blEmpty.style.display = 'none';
  for (const origin of items){
    const li = document.createElement('li');
    li.style.margin = '4px 0';
    const code = document.createElement('code');
    try {
      const u = new URL(origin);
      code.textContent = `${u.protocol}//*.${u.hostname}`;
    } catch { code.textContent = origin.replace('://','://*.'); }
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.style.marginLeft = '10px';
    edit.addEventListener('click', async ()=>{
      try {
        const next = prompt('Edit blacklisted domain origin (e.g., https://example.com):', origin);
        if (!next || next === origin) return;
        await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_BLACKLIST', origin });
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST', origin: next });
        if (res && res.ok) renderBlacklist(res.blacklist||[]);
      } catch {}
    });
    const btn = document.createElement('button'); btn.textContent = 'Remove'; btn.style.marginLeft = '10px';
    btn.addEventListener('click', async ()=>{
      try {
        const res = await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_BLACKLIST', origin });
        if (res && res.ok) renderBlacklist(res.blacklist||[]);
      } catch {}
    });
    li.appendChild(code); li.appendChild(edit); li.appendChild(btn); blList.appendChild(li);
  }
}

updateBlacklist();
setInterval(updateBlacklist, 5000);

// Blacklist paths management
async function updateBlacklistPaths(){
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_BLACKLIST_PATHS' });
    if (res && res.ok) renderBlacklistPaths(res.blacklistPaths||[]);
  } catch {}
}

function renderBlacklistPaths(list){
  const blList = document.getElementById('blPathsList');
  const blEmpty = document.getElementById('blPathsEmpty');
  if (!blList || !blEmpty) return;
  blList.innerHTML = '';
  const items = Array.isArray(list) ? list : [];
  blEmpty.style.display = items.length ? 'none' : '';
  for (const item of items){
    const li = document.createElement('li'); li.style.margin = '4px 0';
    const code = document.createElement('code'); code.textContent = item;
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.style.marginLeft = '10px';
    edit.addEventListener('click', async ()=>{
      try {
        const next = prompt('Edit blacklisted path (origin+pathname, e.g., https://example.com/api):', item);
        if (!next || next === item) return;
        await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_BLACKLIST_PATHS', path: item });
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST_PATHS', path: next });
        if (res && res.ok) renderBlacklistPaths(res.blacklistPaths||[]);
      } catch {}
    });
    const btn = document.createElement('button'); btn.textContent = 'Remove'; btn.style.marginLeft = '10px';
    btn.addEventListener('click', async ()=>{
      try {
        const res = await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_BLACKLIST_PATHS', path: item });
        if (res && res.ok) renderBlacklistPaths(res.blacklistPaths||[]);
      } catch {}
    });
    li.appendChild(code); li.appendChild(edit); li.appendChild(btn); blList.appendChild(li);
  }
}

updateBlacklistPaths();
setInterval(updateBlacklistPaths, 5000);

// Toggle handlers
document.getElementById('threatScope')?.addEventListener('click', async ()=>{
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    const cfg = (res && res.ok) ? (res.config||{}) : {};
    const next = { ...cfg, statsPerTab: !cfg.statsPerTab };
    const btn = document.getElementById('threatScope');
    if (btn) btn.textContent = `Scope: ${next.statsPerTab ? 'This tab' : 'Global'}`;
    await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config: { statsPerTab: next.statsPerTab } });
    // Refresh counts and labels immediately
    updateThreats();
  } catch {}
});
document.getElementById('benji')?.addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  btn.classList.toggle('on');
  btn.classList.toggle('off');
  const enabled = btn.classList.contains('on');
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.title = 'Global protection';
  btn.textContent = `Protection: ${enabled ? 'On' : 'Off'}`;
  const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  const cfg = (res && res.ok) ? res.config : {};
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config: { ...cfg, enabled } });
});

document.getElementById('auditToggle')?.addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  btn.classList.toggle('on');
  const on = btn.classList.contains('on');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    const count = (stats && stats.ok) ? (stats.threats||0) : 0;
    btn.textContent = `Audit/Debug read-only mode: ${on ? 'On' : 'Off'} — ${count} events`;
  } catch { btn.textContent = `Audit/Debug read-only mode: ${on ? 'On' : 'Off'}`; }
  const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  const cfg = (res && res.ok) ? res.config : {};
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config: { ...cfg, auditMode: on } });
});


function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

// Wire up new logging and master password controls
document.getElementById('masterPasswordSave')?.addEventListener('click', saveMasterPassword);
document.getElementById('masterPasswordClear')?.addEventListener('click', clearMasterPassword);
document.getElementById('exportLogs')?.addEventListener('click', exportLogs);
document.getElementById('importLogs')?.addEventListener('click', importLogs);
document.getElementById('clearLogs')?.addEventListener('click', clearLogs);
document.getElementById('viewLogStats')?.addEventListener('click', updateLogStats);
document.getElementById('importFile')?.addEventListener('change', handleLogImport);

// Initialize logging stats on load
document.addEventListener('DOMContentLoaded', () => {
  updateLogStats();
});

document.getElementById('seeAsTab')?.addEventListener('click', openLiveLogTab);

// Export/Import configuration
document.getElementById('exportConfig')?.addEventListener('click', async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    if (res && res.ok) {
      const config = res.config;
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privateness-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('Export failed:', e);
  }
});

document.getElementById('importConfig')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config });
      location.reload(); // Refresh UI to show imported config
    } catch (e) {
      alert('Import failed: Invalid JSON file');
    }
  });
  input.click();
});

// Privacy Policy hover preview (CSP-safe; no inline script)
document.addEventListener('DOMContentLoaded', ()=>{
  try {
    const link = document.getElementById('ppLink');
    const tip = document.getElementById('ppPreview');
    if (!link || !tip) return;
    let cached = null; let fetching = false;
    async function ensure(){
      if (cached || fetching) return;
      try {
        fetching = true;
        const res = await fetch('PRIVACY.md', { cache: 'no-store' });
        const text = await res.text();
        const plain = text.replace(/^[#>*`\-\s]+/gm,'').replace(/\[(.*?)\]\([^)]*\)/g,'$1');
        const words = plain.split(/\s+/).filter(Boolean).slice(0,120).join(' ');
        cached = words + (plain.split(/\s+/).length>120?'…':'');
      } catch { cached = 'Privacy Policy preview unavailable.'; }
      finally { fetching = false; }
    }
    function move(e){
      const x = Math.min(window.innerWidth - tip.offsetWidth - 12, e.clientX + 16);
      const y = Math.min(window.innerHeight - tip.offsetHeight - 12, e.clientY + 16);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    link.addEventListener('mouseenter', async (e)=>{
      await ensure();
      tip.textContent = cached || '';
      tip.style.display = 'block';
      move(e);
    });
    link.addEventListener('mousemove', move);
    link.addEventListener('mouseleave', ()=>{ tip.style.display='none'; });
  } catch {}
});
