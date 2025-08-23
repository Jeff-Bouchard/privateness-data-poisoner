function normalizeMode(m){
  const s = String(m||'').toLowerCase();
  if (['baseline','conservative','light'].includes(s)) return 'baseline';
  if (['moderate','standard','balanced','aggressive'].includes(s)) return 'moderate';
  if (['strict','maximum','max','active_warfare','warfare'].includes(s)) return 'strict';
  return 'moderate';
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
  const stored = await chrome.storage.local.get('config');
  const cfg = stored.config || {};
  const modeEl = document.getElementById('mode');
  modeEl.value = normalizeMode(cfg.mode || 'moderate');
  const mods = cfg.modules || {};
  for (const id of ['canvasNoise','audioNoise','webglNoise','perfQuantize','navigatorClamp','storageHygiene','blockBeacons']){
    const el = document.getElementById(id); if (el) el.checked = (mods[id] !== false);
  }
  // Poisoning config (beta)
  const pc = mods.poisonConfig || {};
  const pcIds = ['poisonIncludeRid','poisonIncludeJitter','poisonIncludeFakePII'];
  pcIds.forEach((id)=>{ const el = document.getElementById(id); if (el) el.checked = (pc[id] !== false); });
  // Custom defunct names list
  renderDefunctList(Array.isArray(pc.defunctNames) ? pc.defunctNames : []);
}

async function saveConfig(){
  const mode = normalizeMode(document.getElementById('mode').value);
  const modules = {};
  for (const id of ['canvasNoise','audioNoise','webglNoise','perfQuantize','navigatorClamp','storageHygiene','blockBeacons']){
    const el = document.getElementById(id); modules[id] = !!el.checked;
  }
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
  const items10 = (logs || []).slice(-10).reverse();
  if (!items10.length){
    empty.style.display = '';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = '';
  for (const l of items10){
    const tr = document.createElement('tr');
    function td(text){ const el = document.createElement('td'); el.style.padding = '6px 8px'; el.textContent = text; return el; }
    const t = new Date(l.time).toLocaleTimeString();
    const m = l.request?.method || '';
    const u = (()=>{ try { const a=new URL(l.request?.url||''); return a.origin + a.pathname; } catch { return l.request?.url||''; } })();
    const r = String(l.ruleId || '');
    const a = String(l.action || '');
    tr.appendChild(td(t));
    tr.appendChild(td(m));
    tr.appendChild(td(u));
    // Make 'poison' clickable to preview payload
    if (r === 'poison'){
      const el = document.createElement('td'); el.style.padding = '6px 8px';
      const link = document.createElement('span'); link.className = 'link'; link.textContent = 'poison';
      link.addEventListener('click', ()=>{
        openPreview(l.preview || '', { url: l.request?.url||'', method: l.request?.method||'' });
      });
      el.appendChild(link); tr.appendChild(el);
    } else {
      tr.appendChild(td(r));
    }
    tr.appendChild(td(a));
    // Action button: open the actual URL in a new tab
    const actionTd = document.createElement('td'); actionTd.style.padding = '6px 8px';
    const btn = document.createElement('button');
    btn.textContent = 'Open';
    btn.style.padding = '4px 8px';
    btn.title = l.request?.url || '';
    btn.addEventListener('click', ()=>{
      const url = l.request?.url || '';
      if (!url) return;
      try { chrome.tabs.create({ url }); } catch { try { window.open(url, '_blank'); } catch {} }
    });
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);
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
