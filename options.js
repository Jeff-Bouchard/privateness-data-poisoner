function normalizeMode(m){
  const s = String(m||'').toLowerCase();
  if (['baseline','conservative','light'].includes(s)) return 'baseline';
  if (['moderate','standard','balanced','aggressive'].includes(s)) return 'moderate';
  if (['strict','maximum','max','active_warfare','warfare'].includes(s)) return 'strict';
  return 'moderate';
}

async function loadConfig(){
  const stored = await chrome.storage.local.get('config');
  const cfg = stored.config || {};
  const modeEl = document.getElementById('mode');
  modeEl.value = normalizeMode(cfg.mode || 'moderate');
  const mods = cfg.modules || {};
  for (const id of ['canvasNoise','audioNoise','webglNoise','perfQuantize','navigatorClamp','storageHygiene','blockBeacons']){
    const el = document.getElementById(id); if (el) el.checked = (mods[id] !== false);
  }
}

async function saveConfig(){
  const mode = normalizeMode(document.getElementById('mode').value);
  const modules = {};
  for (const id of ['canvasNoise','audioNoise','webglNoise','perfQuantize','navigatorClamp','storageHygiene','blockBeacons']){
    const el = document.getElementById(id); modules[id] = !!el.checked;
  }
  const config = {
    mode,
    modules,
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
  const items = (logs || []).slice(-10).reverse();
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
    const t = new Date(l.time).toLocaleTimeString();
    const m = l.request?.method || '';
    const u = (()=>{ try { const a=new URL(l.request?.url||''); return a.origin + a.pathname; } catch { return l.request?.url||''; } })();
    const origin = (()=>{ try { return new URL(l.request?.url||'').origin; } catch { return ''; } })();
    const r = String(l.ruleId || '');
    const a = String(l.action || '');
    tr.appendChild(td(t));
    tr.appendChild(td(m));
    tr.appendChild(td(u));
    tr.appendChild(td(r));
    tr.appendChild(td(a));
    // Actions cell with Whitelist button
    const actions = document.createElement('td');
    actions.style.padding = '6px 8px';
    const btn = document.createElement('button');
    btn.textContent = 'Whitelist';
    btn.title = origin ? `Allow ${origin}` : 'Allow origin';
    btn.style.padding = '6px 10px';
    btn.addEventListener('click', async () => {
      if (!origin) return;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST', origin });
        if (res && res.ok) {
          renderWhitelist(res.whitelist||[]);
        }
      } catch {}
    });
    actions.appendChild(btn);
    tr.appendChild(actions);
    body.appendChild(tr);
  }
}

async function updateLogs(){
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
    if (res && res.ok) renderLogs(res.logs || []);
  } catch {}
}

document.getElementById('save').addEventListener('click', saveConfig);

// Threats counter
async function updateThreats(){
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    if (res && res.ok) {
      const el = document.getElementById('threats');
      if (el) el.textContent = String(res.threats || 0);
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
        return { t: new Date(l.time).toLocaleTimeString(), m: l.request?.method||'', u, r: l.ruleId||'', a: l.action||'' };
      });
      console.info(`Privateness — ${logs.length} threat(s) since last reset. Showing last ${brief.length}:`);
      console.table(brief);
    } else {
      console.info('Privateness — No threats since last reset.');
    }
  } catch {}
  updateThreats();
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
    code.textContent = origin;
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
