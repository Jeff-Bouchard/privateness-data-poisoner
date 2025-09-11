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

  async function isWhitelisted(origin, path) {
    try {
      const cfg = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
      if (cfg && cfg.config) {
        // Check exact domain whitelist
        if (origin) {
          const domain = new URL(origin).hostname;
          if (cfg.config.whitelist && cfg.config.whitelist.some(x => 
            new URL(x).hostname === domain)) {
            return 'domain';
          }
        }
        // Check path whitelist
        if (path) {
          const pathKey = pathKeyOf(path);
          if (cfg.config.whitelistPaths && cfg.config.whitelistPaths.includes(pathKey)) {
            return 'path';
          }
        }
      }
    } catch (e) {
      console.error('Error checking whitelist status:', e);
    }
    return false;
  }

  async function isBlacklisted(origin, path) {
    try {
      const cfg = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
      if (cfg && cfg.config) {
        // Check exact domain blacklist
        if (origin) {
          const domain = new URL(origin).hostname;
          if (cfg.config.blacklist && cfg.config.blacklist.some(x => 
            new URL(x).hostname === domain)) {
            return 'domain';
          }
        }
        // Check path blacklist
        if (path) {
          const pathKey = pathKeyOf(path);
          if (cfg.config.blacklistPaths && cfg.config.blacklistPaths.includes(pathKey)) {
            return 'path';
          }
        }
      }
    } catch (e) {
      console.error('Error checking blacklist status:', e);
    }
    return false;
  }

  async function rowFor(entry) {
    const tr = document.createElement('tr');
    
    // Time column
    const t = document.createElement('td'); 
    t.textContent = timeStr(entry.ts || Date.now()); 
    tr.appendChild(t);
    
    // URL column
    const u = document.createElement('td');
    u.className = 'url-cell';
    
    // Always display absolute URL (not just path). If entry.url is relative, resolve against initiator.
    const urlRaw = String(entry.url || '');
    let url = urlRaw;
    try { 
      url = new URL(urlRaw, entry && entry.initiator ? entry.initiator : location.href).toString(); 
    } catch (e) {}
    
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.color = '#4ea1ff';
    link.style.textDecoration = 'none';
    u.appendChild(link);
    u.title = url;
    tr.appendChild(u);
    
    // Type/Rule column
    const rule = document.createElement('td');
    const type = entry.type || 'event';
    const action = entry.action || '';
    rule.textContent = `${type}${action ? (' / ' + action) : ''}`;
    tr.appendChild(rule);
    
    // Actions column
    const act = document.createElement('td');
    act.className = 'action-buttons';
    
    // Only show action buttons for valid, non-extension URLs
    if (url && !url.startsWith('chrome-extension://')) {
      const origin = originOf(url);
      const pathKey = pathKeyOf(url);
      
      // Check whitelist/blacklist status
      const [isW, isB] = await Promise.all([
        isWhitelisted(origin, url),
        isBlacklisted(origin, url)
      ]);
      
      // Whitelist Domain button
      const wlDomBtn = document.createElement('button');
      wlDomBtn.className = 'whitelist-btn' + (isW ? ' active' : '');
      wlDomBtn.textContent = isW ? '✓ Whitelisted' : 'Whitelist Domain';
      wlDomBtn.disabled = !!isW;
      wlDomBtn.title = isW ? 'This domain is whitelisted' : 'Add domain to whitelist';
      
      wlDomBtn.addEventListener('click', async () => {
        if (!origin) return;
        try {
          const res = await chrome.runtime.sendMessage({ 
            type: 'ADD_TO_WHITELIST', 
            origin: origin 
          });
          
          if (res?.ok) {
            wlDomBtn.textContent = '✓ Whitelisted';
            wlDomBtn.disabled = true;
            wlDomBtn.className = 'whitelist-btn active';
            blDomBtn.disabled = false;
            setStatus(`Whitelisted domain: ${new URL(origin).hostname}`);
          } else {
            setStatus(`Failed to whitelist domain: ${res?.error || 'Unknown error'}`);
          }
        } catch (e) {
          setStatus('Error whitelisting domain');
          console.error('Whitelist domain error:', e);
        }
      });
      
      // Blacklist Domain button
      const blDomBtn = document.createElement('button');
      blDomBtn.className = 'blacklist-btn' + (isB ? ' active' : '');
      blDomBtn.textContent = isB ? '✓ Blocked' : 'Block Domain';
      blDomBtn.disabled = !!isB;
      blDomBtn.title = isB ? 'This domain is blocked' : 'Add domain to blacklist';
      
      blDomBtn.addEventListener('click', async () => {
        if (!origin) return;
        try {
          const res = await chrome.runtime.sendMessage({ 
            type: 'ADD_TO_BLACKLIST', 
            origin: origin 
          });
          
          if (res?.ok) {
            blDomBtn.textContent = '✓ Blocked';
            blDomBtn.disabled = true;
            blDomBtn.className = 'blacklist-btn active';
            wlDomBtn.disabled = true; // Can't whitelist if blacklisted
            setStatus(`Blocked domain: ${new URL(origin).hostname}`);
          } else {
            setStatus(`Failed to block domain: ${res?.error || 'Unknown error'}`);
          }
        } catch (e) {
          setStatus('Error blocking domain');
          console.error('Block domain error:', e);
        }
      });
      
      // Add buttons to container
      act.appendChild(wlDomBtn);
      act.appendChild(blDomBtn);
      
      // Add path-based whitelist if there's a meaningful path
      if (pathKey && pathKey !== origin + '/') {
        const wlPathBtn = document.createElement('button');
        wlPathBtn.className = 'whitelist-path-btn' + (isW === 'path' ? ' active' : '');
        wlPathBtn.textContent = isW === 'path' ? '✓ Path Whitelisted' : 'Whitelist Path';
        wlPathBtn.disabled = isW === 'path' || isB === 'path';
        wlPathBtn.title = isW === 'path' ? 'This path is whitelisted' : 
                         isB === 'path' ? 'This path is blacklisted' :
                         'Add exact path to whitelist';
        
        wlPathBtn.addEventListener('click', async () => {
          try {
            const res = await chrome.runtime.sendMessage({ 
              type: 'ADD_TO_WHITELIST_PATHS', 
              path: pathKey 
            });
            
            if (res?.ok) {
              wlPathBtn.textContent = '✓ Path Whitelisted';
              wlPathBtn.disabled = true;
              wlPathBtn.className = 'whitelist-path-btn active';
              setStatus(`Whitelisted path: ${pathKey}`);
            } else {
              setStatus(`Failed to whitelist path: ${res?.error || 'Unknown error'}`);
            }
          } catch (e) {
            setStatus('Error whitelisting path');
            console.error('Whitelist path error:', e);
          }
        });
        
        act.appendChild(wlPathBtn);
      }
    }
    
    tr.appendChild(act);
    return tr;
  }

  function clearView(){ if (tbody) tbody.innerHTML = ''; }

  async function renderSnapshot(items){
    if (!tbody) return;
    clearView();
    const list = Array.isArray(items) ? items : [];
    for (const e of list){ tbody.appendChild(await rowFor(e)); }
    if (playing) scrollToBottom();
  }

  async function appendEvent(e){
    if (!tbody || !playing) return;
    tbody.appendChild(await rowFor(e));
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

  // Add styles for the live log
  const style = document.createElement('style');
  style.textContent = `
    .url-cell {
      max-width: 300px;
      word-wrap: break-word;
      white-space: normal !important;
      overflow-wrap: break-word;
      word-break: break-all;
      line-height: 1.4;
    }
    .action-buttons {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      min-width: 300px;
    }
    .action-buttons button {
      white-space: nowrap;
      margin: 2px 0;
      padding: 4px 8px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .whitelist-btn, .whitelist-path-btn {
      background-color: #2e7d32;
      color: white;
      border-color: #1b5e20;
    }
    .whitelist-btn:hover, .whitelist-path-btn:hover {
      background-color: #1b5e20;
    }
    .blacklist-btn {
      background-color: #c62828;
      color: white;
      border-color: #b71c1c;
    }
    .blacklist-btn:hover {
      background-color: #b71c1c;
    }
    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    button.active {
      font-weight: bold;
      opacity: 0.9;
    }
    .whitelist-path-btn {
      background-color: #1976d2;
      border-color: #1565c0;
    }
    .whitelist-path-btn:hover {
      background-color: #1565c0;
    }
    .whitelist-path-btn.active {
      background-color: #0d47a1;
    }
  `;
  document.head.appendChild(style);

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
    const btn = (e && e.currentTarget) || $('scope');
    if (btn) btn.textContent = `Scope: ${scope === 'global' ? 'Global' : 'This tab'}`;
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
