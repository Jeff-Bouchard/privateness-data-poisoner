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
    benji.title = on ? 'Global protection is ON' : 'Global protection is OFF';
  }
  if (auditBtn){
    const on = !!cfg.auditMode;
    auditBtn.classList.toggle('on', on);
    auditBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    auditBtn.textContent = `Audit/Diagnostics: ${on ? 'On' : 'Off'}`;
  }
  // Toggle visibility of Full log button based on audit mode
  const fullLogBtn = document.getElementById('fullLog');
  if (fullLogBtn) fullLogBtn.style.display = cfg.auditMode ? '' : 'none';
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

// Toggle handlers
document.getElementById('benji')?.addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  btn.classList.toggle('on');
  btn.classList.toggle('off');
  const enabled = btn.classList.contains('on');
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.title = enabled ? 'Global protection is ON' : 'Global protection is OFF';
  const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  const cfg = (res && res.ok) ? res.config : {};
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config: { ...cfg, enabled } });
});

document.getElementById('auditToggle')?.addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  btn.classList.toggle('on');
  const on = btn.classList.contains('on');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.textContent = `Audit/Diagnostics: ${on ? 'On' : 'Off'}`;
  const res = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  const cfg = (res && res.ok) ? res.config : {};
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config: { ...cfg, auditMode: on } });
});

// Full log view
async function openFullLog(){
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
    const logs = (res && res.ok) ? (res.logs||[]) : [];
    const rows = logs.map(l=>{
      const time = new Date(l.time).toLocaleString();
      const method = l.request?.method||'';
      const url = l.request?.url||'';
      const rule = String(l.ruleId||'');
      const action = String(l.action||'');
      const initiator = l.request?.initiator||'';
      const referrer = l.referrer||'';
      const win = l.client?.win ? 'yes' : 'no';
      const platform = l.client?.platform||'';
      const tz = l.client?.tz||'';
      const lang = l.client?.lang||'';
      return `<tr>
        <td>${time}</td>
        <td>${method}</td>
        <td>${escapeHtml(url)}</td>
        <td>${rule}</td>
        <td>${action}</td>
        <td>${escapeHtml(initiator)}</td>
        <td>${escapeHtml(referrer)}</td>
        <td>${win}</td>
        <td>${escapeHtml(platform)}</td>
        <td>${escapeHtml(tz)}</td>
        <td>${escapeHtml(lang)}</td>
      </tr>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Privateness — Full Log</title>
      <style>
        :root{color-scheme:dark}
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:0;padding:16px;background:#0b0f12;color:#e6ebf1}
        h1{font-size:18px;margin:0 0 12px}
        .muted{color:#7b8693}
        .wrap{overflow:auto;border:1px solid #1f2630;border-radius:10px}
        table{width:100%;border-collapse:collapse}
        th,td{padding:8px 10px;border-bottom:1px solid #1f2630;text-align:left;font-size:12px;vertical-align:top}
        th{color:#7b8693;position:sticky;top:0;background:#0f1418}
      </style>
    </head><body>
      <h1>Privateness — Full Log</h1>
      <div class="muted" style="margin-bottom:10px">${logs.length} entr${logs.length===1?'y':'ies'} total. This view updates only when reopened.</div>
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th><th>Method</th><th>URL</th><th>Rule</th><th>Action</th><th>Initiator</th><th>Referrer</th><th>Win</th><th>Platform</th><th>TZ</th><th>Lang</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </body></html>`;
    const w = window.open();
    if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); }
  } catch {}
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

document.getElementById('fullLog')?.addEventListener('click', openFullLog);

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