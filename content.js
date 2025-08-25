// Privateness.network Data Protection MV3 - content.js (isolated world)
// - Retrieves configuration and per-origin key from the service worker
// - Injects the page-world patcher with a CSP-safe data bridge
// - Strips tracking parameters from current URL and links

(async () => {
  function sendToSW(msg) {
    return new Promise(res => chrome.runtime.sendMessage(msg, res));
  }

  // Notify SW ASAP that a main-frame navigation has started for this tab
  try { chrome.runtime.sendMessage({ type: 'PAGE_NAV_START', url: location.href }); } catch {}

  const [{ ok: okCfg, config }, { ok: okKey, key }] = await Promise.all([
    sendToSW({ type: 'GET_CONFIG' }),
    sendToSW({ type: 'GET_PER_ORIGIN_KEY', origin: location.origin })
  ]);

  // Default to professional 3-mode model: 'baseline' | 'moderate' | 'strict'
  const cfg = okCfg ? config : { mode: 'strict' };
  if (cfg && cfg.enabled === false) {
    // Protection OFF: do not inject, sanitize, or relay anything.
    return;
  }

  // Per-tab DNR bypass short-circuit: if the SW marked this tab as bypassed,
  // act as fully disabled (no injector, no sanitization, no listeners).
  try {
    const { ok: okByp, bypassed } = await sendToSW({ type: 'IS_TAB_BYPASSED' });
    if (okByp && bypassed === true) {
      return;
    }
  } catch {}

  // Helpers to mirror whitelist semantics (service_worker.js):
  // - Whitelist origins are stored as base domains (no protocol) and apply to subdomains
  // - Whitelist paths are stored as host + pathname (no protocol); base-domain equality + path prefix
  function getBaseDomain(host){
    // Align with service_worker.js/injector.js: handle common ccTLD SLDs
    try {
      const parts = String(host||'').toLowerCase().split('.').filter(Boolean);
      if (parts.length <= 2) return parts.join('.');
      const tld = parts[parts.length-1];
      const sld = parts[parts.length-2];
      const commonCcSlds = new Set(['co','com','net','org','gov','ac','edu']);
      if (tld.length === 2 && commonCcSlds.has(sld) && parts.length >= 3) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    } catch { return String(host||''); }
  }
  function hostFromOriginLike(s){
    try {
      const v = String(s||'').trim();
      if (!v) return '';
      if (/^https?:\/\//i.test(v)) return new URL(v).hostname;
      return v.replace(/^\/*/, '').split('/')[0];
    } catch { return ''; }
  }
  function normalizePathKey(input){
    try {
      const s = String(input||'').trim();
      if (!s) return '';
      if (/^https?:\/\//i.test(s)) {
        const u = new URL(s);
        return (u.hostname || '') + (u.pathname || '/');
      }
      const t = s.replace(/^\/*/, '');
      const slash = t.indexOf('/');
      const host = slash === -1 ? t : t.slice(0, slash);
      const path = slash === -1 ? '/' : t.slice(slash);
      return host + path;
    } catch { return String(input||''); }
  }
  function isWhitelistedOrigin(urlStr){
    try {
      const u = new URL(urlStr);
      const base = getBaseDomain(u.hostname);
      const list = Array.isArray(cfg.whitelist) ? cfg.whitelist : [];
      for (const entry of list){
        const host = hostFromOriginLike(entry);
        if (!host) continue;
        if (getBaseDomain(host) === base) return true;
      }
    } catch {}
    return false;
  }
  function isWhitelistedPath(urlStr){
    try {
      const u = new URL(urlStr);
      const reqHost = u.hostname;
      const reqPath = u.pathname || '/';
      const reqDir = reqPath.endsWith('/') ? reqPath : (reqPath + '/');
      const list = Array.isArray(cfg.whitelistPaths) ? cfg.whitelistPaths : [];
      for (const key of list){
        const norm = normalizePathKey(key);
        if (!norm) continue;
        const slash = norm.indexOf('/');
        const keyHost = slash === -1 ? norm : norm.slice(0, slash);
        let keyPath = slash === -1 ? '/' : norm.slice(slash);
        keyPath = keyPath.endsWith('/') ? keyPath : (keyPath + '/');
        if (getBaseDomain(reqHost) !== getBaseDomain(keyHost)) continue;
        if (reqDir === keyPath || reqDir.startsWith(keyPath)) return true;
      }
    } catch {}
    return false;
  }
  // Pattern-based whitelist short-circuit
  // Patterns are raw substrings matched against the FULL URL. If any pattern
  // matches, protections are bypassed for this page. This takes precedence
  // over legacy origin/path checks kept for compatibility with existing config.
  function isWhitelistedPattern(urlStr){
    try {
      const list = Array.isArray(cfg.whitelistPatterns) ? cfg.whitelistPatterns : [];
      const s = String(urlStr || '');
      for (const pat of list) {
        try { if (s.includes(String(pat))) return true; } catch {}
      }
    } catch {}
    return false;
  }
  function pageIsWhitelisted(){
    const href = location.href;
    // New: pattern-based substring match over full URL takes precedence
    if (isWhitelistedPattern(href)) return true;
    return isWhitelistedOrigin(href) || isWhitelistedPath(href);
  }

  // If current page is whitelisted, act as fully disabled
  if (pageIsWhitelisted()) {
    return;
  }
  const perOriginKey = okKey ? key : '0'.repeat(64);

  // Inject CSP-safe DOM data bridge with config + key, then injector.js
  try {
    const bridge = document.createElement('meta');
    bridge.id = '__MAX_POISE_DATA';
    try {
      bridge.setAttribute('data-cfg', JSON.stringify(cfg));
      bridge.setAttribute('data-key', perOriginKey);
    } catch {}
    (document.documentElement || document.head || document.body).appendChild(bridge);

    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injector.js');
    s.async = false;
    (document.documentElement || document.head || document.body).appendChild(s);
    s.onload = () => s.remove();
  } catch (e) {
    // ignore
  }

  // Utility: poison known tracking params with plausible-but-bogus values (do NOT remove)
  const PARAMS = new Set([
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_name','utm_id','utm_reader','utm_brand',
    'fbclid','gclid','dclid','msclkid','wbraid','gbraid','yclid','ttclid','twclid',
    'vero_conv','vero_id','mc_eid','mc_cid','icid','scid','s_cid','_hsenc','_hsmi',
    'spm','aff_id','affid','affiliate','ref','referrer','sb_referer',
    'pk_campaign','pk_kwd','oly_anon_id','oly_enc_id','li_fat_id'
  ]);

  // Random token generators (shape-preserving where useful)
  function randHex(n){
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,n);
  }
  function randBase36(n){
    let s = '';
    while (s.length < n) s += Math.random().toString(36).slice(2);
    return s.slice(0, n);
  }
  function randBase62(n){
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let out = '';
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    for (let i=0;i<n;i++) out += alphabet[a[i] % alphabet.length];
    return out;
  }
  function randGuid(){
    // 8-4-4-4-12 hex
    const h = randHex(32);
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
  }
  function randSlug(){
    // Neutral, adult-industry-adjacent but safe words, short and useless
    const words = ['premium','studio','creator','fans','club','private','model','scene','lens','media','vault','night','velvet','neon','silk'];
    const a = words[Math.floor(Math.random()*words.length)];
    const b = words[Math.floor(Math.random()*words.length)];
    return `${a}-${b}`;
  }
  function randDigits(n){
    let s = '';
    for (let i=0;i<n;i++) s += String(Math.floor(Math.random()*10));
    return s;
  }
  function randBraid(n){
    // base62 with '-' '_' sprinkled for braid-like look
    const core = randBase62(n);
    return core.replace(/.{8}/g, m => m + (Math.random() < 0.5 ? '-' : '_')).replace(/[-_]$/, '');
  }

  function poisonParam(k, v){
    const key = String(k||'');
    // UTM family
    if (key.startsWith('utm_')) return randSlug();
    switch (key) {
      case 'fbclid': return randBase62(32);
      case 'gclid': return randBase62(24);
      case 'dclid': return randBase62(24);
      case 'msclkid': return randGuid();
      case 'wbraid': return randBraid(24);
      case 'gbraid': return randBraid(24);
      case 'yclid': return randBase36(20);
      case 'ttclid': return randBase62(28);
      case 'twclid': return randBase62(28);
      case 'vero_conv':
      case 'vero_id': return randBase36(16);
      case 'mc_eid':
      case 'mc_cid': return randBase36(16);
      case 'icid':
      case 'scid':
      case 's_cid': return randBase36(14);
      case '_hsenc':
      case '_hsmi': return randBase62(32);
      case 'spm': {
        const parts = String(v||'a.b.c').split('.');
        return parts.map(()=>randBase36(6)).join('.');
      }
      case 'aff_id':
      case 'affid':
      case 'affiliate': return randDigits(6);
      case 'ref':
      case 'referrer':
      case 'sb_referer': return ['newsletter','partner','social','direct'][Math.floor(Math.random()*4)];
      case 'pk_campaign':
      case 'pk_kwd': return randSlug();
      case 'oly_anon_id':
      case 'oly_enc_id':
      case 'li_fat_id': return randBase62(24);
      default: return randBase36(12);
    }
  }

  function sanitizeUrl(u) {
    try {
      const url = new URL(u, location.href);
      let changed = false;
      for (const k of Array.from(url.searchParams.keys())) {
        if (PARAMS.has(k) || k.startsWith('utm_')) {
          const bogus = poisonParam(k, url.searchParams.get(k));
          url.searchParams.set(k, bogus);
          changed = true;
        }
      }
      return { url: url.toString(), changed };
    } catch {
      return { url: u, changed: false };
    }
  }

  // Sanitize current history state (no reload)
  try {
    const cur = sanitizeUrl(location.href);
    if (cur.changed) history.replaceState(history.state, '', cur.url);
  } catch {}

  // Sanitize links on click
  function onClick(ev) {
    const a = ev.target && (ev.target.closest ? ev.target.closest('a[href]') : null);
    if (!a) return;
    const { url, changed } = sanitizeUrl(a.href);
    if (changed) a.setAttribute('href', url);
  }
  document.addEventListener('mousedown', onClick, true);
  document.addEventListener('click', onClick, true);

  // Observe dynamic links
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes || []) {
        if (n.nodeType === 1) {
          if (n.tagName === 'A' && n.hasAttribute('href')) {
            const { url, changed } = sanitizeUrl(n.getAttribute('href'));
            if (changed) n.setAttribute('href', url);
          }
          const links = n.querySelectorAll ? n.querySelectorAll('a[href]') : [];
          for (const a of links) {
            const { url, changed } = sanitizeUrl(a.getAttribute('href'));
            if (changed) a.setAttribute('href', url);
          }
        }
      }
    }
  });
  mo.observe(document.documentElement, { subtree: true, childList: true });
  
  // Relay poisoning events from page world to SW for stats/logs
  try {
    window.addEventListener('__POISE_POISONED', (ev) => {
      try {
        const detail = ev && ev.detail ? ev.detail : {};
        chrome.runtime.sendMessage({ type: 'POISONED_EVENT', event: detail });
      } catch {}
    });
  } catch {}

  // Live config propagation to page world: when config changes in storage, broadcast into page
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area === 'local' && changes && changes.config && changes.config.newValue) {
          const nextCfg = changes.config.newValue;
          window.dispatchEvent(new CustomEvent('__MAX_POISE_CFG_UPDATE', { detail: { cfg: nextCfg } }));
        }
      } catch {}
    });
  } catch {}
})();
