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
    u.textContent = url;
    u.title = url;
    u.style.whiteSpace = 'nowrap'; u.style.overflow = 'hidden'; u.style.textOverflow = 'ellipsis';
    tr.appendChild(u);
    const rule = document.createElement('td');
    const type = entry.type || 'event';
    const action = entry.action || '';
    rule.textContent = `${type}${action?(' / '+action):''}`;
    tr.appendChild(rule);
    const act = document.createElement('td');
    const bDom = document.createElement('button'); bDom.textContent = 'Blacklist domain'; bDom.className='secondary';
    const bPath = document.createElement('button'); bPath.textContent = 'Blacklist path'; bPath.className='secondary'; bPath.style.marginLeft='6px';
    bDom.addEventListener('click', async ()=>{
      const orig = originOf(url); if (!orig) return;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST', origin: orig });
        if (res && res.ok){ bDom.textContent = 'Blacklisted'; bDom.disabled = true; setStatus('Domain added to blacklist.'); }
      } catch {}
    });
    bPath.addEventListener('click', async ()=>{
      const key = pathKeyOf(url); if (!key) return;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST_PATHS', path: key });
        if (res && res.ok){ bPath.textContent = 'Blacklisted'; bPath.disabled = true; setStatus('Path added to blacklist.'); }
      } catch {}
    });
    act.appendChild(bDom); act.appendChild(bPath); tr.appendChild(act);
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
