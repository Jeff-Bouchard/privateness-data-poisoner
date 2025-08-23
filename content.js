// Privateness.network Data Protection MV3 - content.js (isolated world)
// - Retrieves configuration and per-origin key from the service worker
// - Injects the page-world patcher with a CSP-safe data bridge
// - Strips tracking parameters from current URL and links

(async () => {
  function sendToSW(msg) {
    return new Promise(res => chrome.runtime.sendMessage(msg, res));
  }

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

  // Helpers to mirror whitelist semantics from injector: 
  // - Domain entries apply to base domain + subdomains
  // - Path entries require exact host and prefix match on pathname
  function getBaseDomain(host){
    try {
      const parts = String(host||'').toLowerCase().split('.').filter(Boolean);
      if (parts.length <= 2) return parts.join('.');
      const sld = new Set(['co','com','org','net','gov','edu','ac']);
      if (parts.length >= 3 && sld.has(parts[parts.length-2])) return parts.slice(-3).join('.');
      return parts.slice(-2).join('.');
    } catch { return String(host||''); }
  }
  function isWhitelistedOrigin(urlStr){
    try {
      const u = new URL(urlStr);
      const base = getBaseDomain(u.hostname);
      const list = Array.isArray(cfg.whitelist) ? cfg.whitelist : [];
      for (const origin of list){
        try {
          const o = new URL(origin);
          if (getBaseDomain(o.hostname) === base) return true;
        } catch {}
      }
    } catch {}
    return false;
  }
  function isWhitelistedPath(urlStr){
    try {
      const u = new URL(urlStr);
      const list = Array.isArray(cfg.whitelistPaths) ? cfg.whitelistPaths : [];
      for (const key of list){
        try {
          const k = new URL(key);
          if (k.hostname !== u.hostname) continue; // exact host only
          // Normalize trailing slash semantics for exact path and subpaths
          const reqPath = u.pathname || '/';
          const keyPath = k.pathname || '/';
          const reqDir = reqPath.endsWith('/') ? reqPath : (reqPath + '/');
          const keyDir = keyPath.endsWith('/') ? keyPath : (keyPath + '/');
          // Exact path match should succeed regardless of trailing slash
          if (reqPath === keyPath || (reqPath + '/') === keyDir || (keyPath + '/') === reqDir) return true;
          // Subpath match
          if (reqDir.startsWith(keyDir)) return true;
        } catch {}
      }
    } catch {}
    return false;
  }
  function pageIsWhitelisted(){
    const href = location.href;
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

  // Utility: remove known tracking params from a URL
  const PARAMS = new Set([
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_name','utm_id','utm_reader','utm_brand',
    'fbclid','gclid','dclid','msclkid','wbraid','gbraid','yclid','ttclid','twclid',
    'vero_conv','vero_id','mc_eid','mc_cid','icid','scid','s_cid','_hsenc','_hsmi',
    'spm','aff_id','affid','affiliate','ref','referrer','sb_referer',
    'pk_campaign','pk_kwd','oly_anon_id','oly_enc_id','li_fat_id'
  ]);

  function sanitizeUrl(u) {
    try {
      const url = new URL(u, location.href);
      let changed = false;
      for (const k of Array.from(url.searchParams.keys())) {
        if (PARAMS.has(k) || k.startsWith('utm_')) {
          url.searchParams.delete(k);
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
