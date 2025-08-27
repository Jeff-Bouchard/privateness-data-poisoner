// injector.js with data bridge-based config

import { SCHEMAS } from './schemas/adultPersona.js';

let cfg = {};
let perOriginKey = '0'.repeat(64);
let tabId = null; // for tab-specific whitelist checks in page world

// Load config from data bridge set by content script
try {
  const bridge = document.getElementById('__MAX_POISE_DATA');
  if (bridge) {
    try {
      cfg = JSON.parse(bridge.getAttribute('data-cfg') || '{}');
      perOriginKey = bridge.getAttribute('data-key') || '0'.repeat(64);
      tabId = bridge.getAttribute('data-tab-id'); // read tabId
    } catch {}
  }
} catch {}

// Listen for config updates from content script
window.addEventListener('__MAX_POISE_CFG_UPDATE', (ev) => {
  try {
    if (ev && ev.detail && ev.detail.cfg) {
      cfg = ev.detail.cfg;
    }
  } catch {}
});

// Spoof time-related functions to prevent server time fetching
if (cfg.enabled !== false) {
  // Generate consistent fake time offset per origin
  const timeOffset = (() => {
    let hash = 0;
    const origin = location.origin;
    for (let i = 0; i < origin.length; i++) {
      hash = ((hash << 5) - hash + origin.charCodeAt(i)) & 0xffffffff;
    }
    // Offset between -24 to +24 hours
    return (hash % (48 * 60 * 60 * 1000)) - (24 * 60 * 60 * 1000);
  })();
  
  const originalDate = Date;
  const originalNow = Date.now;
  const originalGetTime = Date.prototype.getTime;
  
  // Override Date.now()
  Date.now = function() {
    return originalNow() + timeOffset;
  };
  
  // Override Date constructor
  window.Date = function(...args) {
    if (args.length === 0) {
      return new originalDate(originalNow() + timeOffset);
    }
    return new originalDate(...args);
  };
  
  // Copy static methods
  Object.setPrototypeOf(window.Date, originalDate);
  Object.getOwnPropertyNames(originalDate).forEach(name => {
    if (name !== 'now' && name !== 'length' && name !== 'name' && name !== 'prototype') {
      window.Date[name] = originalDate[name];
    }
  });
  
  // Override getTime() for existing Date instances
  Date.prototype.getTime = function() {
    const originalTime = originalGetTime.call(this);
    // Only offset if this is a "now" timestamp
    const now = originalNow();
    if (Math.abs(originalTime - now) < 1000) {
      return originalTime + timeOffset;
    }
    return originalTime;
  };
}

function isWhitelisted(url) {
  try {
    const u = new URL(url, location.href);
    const origin = u.origin;
    const pathKey = origin + u.pathname + (u.pathname.endsWith('/') ? '' : '/');
    
    // Check global origin whitelist
    if (cfg.whitelist && cfg.whitelist.includes(origin)) return true;
    
    // Check global path whitelist
    if (cfg.whitelistPaths && cfg.whitelistPaths.some(p => pathKey.startsWith(p))) return true;
    
    // Check tab-specific bearer's authority whitelist for origins
    if (tabId && cfg.tabWhitelist && cfg.tabWhitelist[tabId]) {
      if (cfg.tabWhitelist[tabId].includes(origin)) return true;
    }
    
    // Check tab-specific bearer's authority whitelist for paths
    if (tabId && cfg.tabWhitelistPaths && cfg.tabWhitelistPaths[tabId]) {
      for (const pathEntry of cfg.tabWhitelistPaths[tabId]) {
        try {
          const k = new URL(pathEntry);
          if (k.hostname !== u.hostname) continue; // exact host only
          const reqPath = u.pathname || '/';
          const keyPath = k.pathname || '/';
          const reqDir = reqPath.endsWith('/') ? reqPath : (reqPath + '/');
          const keyDir = keyPath.endsWith('/') ? keyPath : (keyPath + '/');
          if (reqPath === keyPath || (reqPath + '/') === keyDir || (keyPath + '/') === reqDir) return true;
          if (reqDir.startsWith(keyDir)) return true;
        } catch {}
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Wrap fetch
const origFetch = window.fetch;
window.fetch = async function(input, init) {
  const req = input instanceof Request ? input : new Request(input, init||{});
  const url = req.url;
  if (isWhitelisted(url)) {
    return origFetch(input, init);
  }
  for (const schema of SCHEMAS) {
    if (schema.test(url)) {
      [input, init] = schema.mutate(url, init, location.origin, perOriginKey);
      // Send poisoning event to content script for logging
      try {
        window.dispatchEvent(new CustomEvent('__POISE_POISONED', {
          detail: { action: 'poison', url, ruleId: schema.name || 'schema' }
        }));
      } catch {}
      break;
    }
  }
  return origFetch(input, init);
};

// Wrap sendBeacon
const origSendBeacon = navigator.sendBeacon?.bind(navigator);
if (origSendBeacon) {
  navigator.sendBeacon = function(url, data) {
    if (isWhitelisted(url)) return origSendBeacon(url, data);
    for (const schema of SCHEMAS) {
      if (schema.test(url)) {
        [url, data] = schema.mutate(url, {body:data}, location.origin, perOriginKey);
        // Send poisoning event to content script for logging
        try {
          window.dispatchEvent(new CustomEvent('__POISE_POISONED', {
            detail: { action: 'poison', url, ruleId: schema.name || 'schema' }
          }));
        } catch {}
        break;
      }
    }
    return origSendBeacon(url, data);
  };
}

// Wrap XHR
const OrigXHR = window.XMLHttpRequest;
function WrappedXHR() {
  const xhr = new OrigXHR();
  let _url = '';
  const origOpen = xhr.open;
  xhr.open = function(method, url) {
    _url = url;
    if (isWhitelisted(url)) {
      return origOpen.apply(xhr, arguments);
    }
    for (const schema of SCHEMAS) {
      if (schema.test(url)) {
        [_url] = schema.mutate(url, null, location.origin, perOriginKey);
        // Send poisoning event to content script for logging
        try {
          window.dispatchEvent(new CustomEvent('__POISE_POISONED', {
            detail: { action: 'poison', url: _url, ruleId: schema.name || 'schema' }
          }));
        } catch {}
        break;
      }
    }
    return origOpen.call(xhr, method, _url);
  };
  return xhr;
}
window.XMLHttpRequest = WrappedXHR;
