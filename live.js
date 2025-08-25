'use strict';
(function(){
  const $ = (id)=>document.getElementById(id);
  function timeStr(ts){
    try {
      let ms = Number(ts);
      if (!isFinite(ms)) {
        const p = (typeof ts === 'string') ? Date.parse(ts) : NaN;
        ms = isFinite(p) ? p : Date.now();
      }
      const d = new Date(ms);
      if (isNaN(d.getTime())) return '';
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      const ss = String(d.getSeconds()).padStart(2,'0');
      return `${hh}:${mm}:${ss}`;
    } catch { return ''; }
  }
  function originOf(u){ try { return new URL(u).origin; } catch { return ''; } }
  function pathKeyOf(u){ try { const p=new URL(u); let k=p.origin+p.pathname; if(!k.endsWith('/')) k+='/'; return k; } catch { return ''; } }

  let port = null;
  let playing = true;
  let scope = 'global'; // 'global' | 'tab'
  let tabId = null;
  let bufSize = 25;

  const tbody = $('body');
  const statusEl = $('status');
  const wrap = $('wrap');

  function setStatus(txt){ if(statusEl) statusEl.textContent = txt || ''; }
  function scrollToBottom(){ try { wrap.scrollTop = wrap.scrollHeight; } catch {} }

  function rowFor(entry){
    const tr = document.createElement('tr');
    const t = document.createElement('td'); t.textContent = timeStr(entry.ts||Date.now()); tr.appendChild(t);
    const u = document.createElement('td');
    // Always display absolute URL (not just path). If entry.url is relative, resolve against initiator.
    const urlRaw = String(entry.url||'');
    let url = urlRaw;
    try { url = new URL(urlRaw, entry && entry.initiator ? entry.initiator : location.href).toString(); } catch {}
    // Display only up to the first '?', and strip fragment
    const displayUrl = (()=>{ try { const uo = new URL(url); return `${uo.origin}${uo.pathname}`; } catch { return String(url).split('#')[0].split('?')[0]; } })();
    u.textContent = displayUrl;
    u.title = url;
    // Make long URLs usable: wrap/break and constrain width
    u.style.whiteSpace = 'normal';
    u.style.wordBreak = 'break-all';
    u.style.overflow = 'hidden';
    u.style.textOverflow = 'ellipsis';
    u.style.maxWidth = '640px';
    tr.appendChild(u);
    const rule = document.createElement('td');
    const typeRaw = (typeof entry.type === 'string') ? entry.type : '';
    const type = typeRaw || (entry && entry.ruleId ? 'dnr' : 'event');
    const actionRaw = (typeof entry.action === 'string') ? entry.action : '';
    const action = actionRaw || (type === 'dnr' ? 'block' : '');
    rule.textContent = action ? `${type} / ${action}` : String(type||'event');
    if (entry && entry.ruleId) { rule.title = `Rule ${entry.ruleId}`; }
    tr.appendChild(rule);
    const act = document.createElement('td');
    // Pattern-based actions only
    const wPat = document.createElement('button'); wPat.textContent = 'Allow pattern'; wPat.title = 'Add URL substring to whitelist patterns';
    const bPat = document.createElement('button'); bPat.textContent = 'Block pattern'; bPat.className='secondary'; bPat.style.marginLeft='10px'; bPat.title = 'Add URL substring to blacklist patterns';
    // Wire pattern actions (pre-fill with full URL; user can edit substring)
    wPat.addEventListener('click', async ()=>{
      const pat = prompt('Add whitelist pattern (substring of full URL):', url);
      const pattern = (pat||'').trim(); if (!pattern) return;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST_PATTERNS', pattern });
        if (res && res.ok){ wPat.textContent = 'Allowed'; wPat.disabled = true; setStatus('Pattern added to whitelist.'); }
      } catch {}
    });
    bPat.addEventListener('click', async ()=>{
      const pat = prompt('Add blacklist pattern (substring of full URL):', url);
      const pattern = (pat||'').trim(); if (!pattern) return;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST_PATTERNS', pattern });
        if (res && res.ok){ bPat.textContent = 'Blocked'; bPat.disabled = true; setStatus('Pattern added to blacklist.'); }
      } catch {}
    });
    act.appendChild(wPat); act.appendChild(bPat); tr.appendChild(act);
    return tr;
  }

  function clearView(){ if (tbody) tbody.innerHTML = ''; }

  function renderSnapshot(items){
    if (!tbody) return;
    clearView();
    const list = Array.isArray(items) ? items : [];
    for (const e of list){ tbody.appendChild(rowFor(e)); }
    if (playing) scrollToBottom();
  }

  function appendEvent(e){
    if (!tbody || !playing) return;
    tbody.appendChild(rowFor(e));
    scrollToBottom();
  }

  async function detectActiveTab(){
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (Array.isArray(tabs) && tabs[0] && typeof tabs[0].id === 'number') return tabs[0].id;
    } catch {}
    return null;
  }

  function subscribe(){
    if (!port) return;
    try {
      port.postMessage({ type: 'subscribe', scope, tabId, size: bufSize });
      setStatus(`Subscribed — ${scope}${scope==='tab' && typeof tabId==='number' ? ` (tab ${tabId})` : ''}, last ${bufSize}`);
    } catch {}
  }

  function connect(){
    try {
      port = chrome.runtime.connect({ name: 'live-log' });
      port.onMessage.addListener((msg)=>{
        if (!msg) return;
        if (msg.type === 'snapshot'){ renderSnapshot(msg.logs||[]); return; }
        if (msg.type === 'event'){ appendEvent(msg.entry||{}); return; }
      });
      port.onDisconnect.addListener(()=>{ setStatus('Disconnected. Reconnecting…'); setTimeout(connect, 800); });
      subscribe();
    } catch (e) { setStatus('Failed to connect. Retrying…'); setTimeout(connect, 1200); }
  }

  // UI wiring
  $('playPause')?.addEventListener('click', (e)=>{
    playing = !playing;
    e.currentTarget.textContent = playing ? 'Pause' : 'Play';
    if (playing) scrollToBottom();
  });
  $('scope')?.addEventListener('click', async (e)=>{
    if (scope === 'global') {
      tabId = await detectActiveTab();
      scope = 'tab';
    } else {
      scope = 'global';
      tabId = null;
    }
    e.currentTarget.textContent = `Scope: ${scope === 'global' ? 'Global' : 'This tab'}`;
    subscribe();
  });
  $('buf')?.addEventListener('change', (e)=>{
    const v = parseInt(e.currentTarget.value, 10);
    bufSize = ([25,50,100].includes(v) ? v : 25);
    subscribe();
  });
  $('clear')?.addEventListener('click', ()=>{ clearView(); setStatus('View cleared.'); });

  // Initialize
  (async function init(){
    try {
      tabId = await detectActiveTab();
    } catch {}
    connect();
  })();
})();
