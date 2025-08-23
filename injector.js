/* Privateness.network Data Poisoner: Active Warfare MV3 - injector.js (page world)
   Patches high-value fingerprinting/analytics surfaces with deterministic, per-origin noise.
   This file runs in page world via script injection from content.js
*/
(function () {
  // Prefer CSP-safe DOM bridge injected by content.js; fallback to globals
  let CFG = { mode: 'aggressive', modules: {} };
  let KEY = '';
  try {
    const meta = document.getElementById('__MAX_POISE_DATA');
    if (meta) {
      const cfgAttr = meta.getAttribute('data-cfg');
      const keyAttr = meta.getAttribute('data-key');
      if (cfgAttr) { try { CFG = JSON.parse(cfgAttr); } catch {} }
      if (keyAttr) { KEY = keyAttr; }
    } else {
      CFG = (window.__MAX_POISE_CFG || CFG);
      KEY = (window.__MAX_POISE_KEY || KEY);
    }
  } catch {}

  // Global analytics denylist and URL poisoning decision helper
  // Professional 3-mode normalization: 'baseline' | 'moderate' | 'strict'
  function normalizeMode(m){
    const s = String(m||'').toLowerCase();
    if (['baseline','conservative','light'].includes(s)) return 'baseline';
    if (['moderate','standard','balanced','aggressive'].includes(s)) return 'moderate';
    if (['strict','maximum','max','active_warfare','warfare'].includes(s)) return 'strict';
    return 'moderate';
  }
  const MODE = normalizeMode(CFG.mode);
  const WHITELIST = Array.isArray(CFG.whitelist) ? CFG.whitelist : [];
  // Custom defunct names from config (for brand/company/org replacement)
  let DEFUNCT_CUSTOM = [];
  try { const arr = CFG?.modules?.poisonConfig?.defunctNames; if (Array.isArray(arr)) DEFUNCT_CUSTOM = arr.filter(x=>typeof x==='string' && x.trim()).map(x=>x.trim()); } catch {}

  // We no longer rely on static trusted origin lists. Compatibility is preserved by
  // applying mutations only to known analytics/telemetry endpoints and keeping
  // functional APIs untouched.

  const DENY = new Set((CFG.denyHosts || []).concat([
    'www.google-analytics.com','analytics.google.com','stats.g.doubleclick.net',
    'api.segment.io','api.amplitude.com','api.mixpanel.com','bat.bing.com',
    'px.ads.linkedin.com','analytics.tiktok.com','business-api.tiktok.com','connect.facebook.net'
  ]));

  function isWhitelisted(url){
    try {
      const pageOrigin = location.origin;
      if (WHITELIST.includes(pageOrigin)) return true;
      const u = new URL(url, location.href);
      return WHITELIST.includes(u.origin);
    } catch { return false; }
  }

  function shouldPoison(url){
    try {
      if (isWhitelisted(url)) return false;
      const u = new URL(url, location.href);
      if (DENY.has(u.host)) return true;
      const p = u.pathname.toLowerCase();
      if (/collect|analytics|beacon|track|pixel|measure/.test(p)) return true;
      for (const [k] of u.searchParams) { if (/^(utm_|gclid|fbclid|msclkid|mc_eid)/i.test(k)) return true; }
      if (MODE === 'strict' && isYouTubeTelemetry(url)) return true; // mutate YT telemetry only in strict
    } catch {}
    return false;
  }

  // Utility: fast PRF from hex key + string -> [0,1)
  function xmur3(str){let h=1779033703^str.length;for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^h>>>16)>>>0;}};
  function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}}
  const seed = xmur3(KEY + '::' + location.origin)();
  const rand = mulberry32(seed);
  const randSigned = () => (rand() - 0.5);

  // Internal flag for YT noise: strict mode only
  const YT_TELEMETRY_NOISE = (MODE === 'strict');

  function isYouTubeDomain(h){
    if (!h) return false;
    return (
      h === 'www.youtube.com' || h === 'youtube.com' || h === 'm.youtube.com' ||
      h.endsWith('.googlevideo.com') || h === 'youtubei.googleapis.com' ||
      h.endsWith('.ytimg.com') || h === 'ytimg.com'
    );
  }
  function isYouTubeTelemetry(url){
    try {
      const u = new URL(url, location.href);
      if (!isYouTubeDomain(u.hostname)) return false;
      const p = u.pathname;
      // Known telemetry endpoints (non-exhaustive):
      return (
        p.includes('/youtubei/v1/log_event') ||
        p.includes('/api/stats') ||
        p.includes('/ptracking') ||
        p.includes('/generate_204') ||
        p.includes('/csi_204')
      );
    } catch { return false; }
  }

  function amplitudeFor(feature){
    switch (MODE) {
      case 'baseline': return 0.0002;
      case 'moderate': return 0.0008;
      case 'strict': return 0.0025; // heavier noise
      default: return 0.0008;
    }
  }

  // sendBeacon suppression
  try {
    const origBeacon = navigator.sendBeacon?.bind(navigator);
    if (origBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: function(url, data){
        try {
          const u = new URL(url, location.href);
          if (DENY.has(u.host)) return true;
          if (MODE === 'strict' && shouldPoison(u.toString())){
            const ct = '';
            const poisoned = buildPoison(data, ct);
            postPoison({ url: u.toString(), method: 'beacon', preview: typeof poisoned === 'string' ? poisoned : '' });
            return origBeacon(u.toString(), poisoned);
          }
          if (shouldPoison(u.toString())) return true; // silently swallow
        } catch {}
        return origBeacon(url, data);
      }});
    }

    // fetch poisoning (strict) and suppression for analytics endpoints
    try {
      if (window.fetch) {
        const origFetch = window.fetch.bind(window);
        window.fetch = async function(input, init){
          try {
            const req = new Request(input, init);
            const url = req.url;
            if (MODE === 'strict' && shouldPoison(url)){
              const ct = extractContentType(req.headers);
              let body = undefined;
              if (init && 'body' in (init||{})) body = init.body; // best-effort
              const poisoned = buildPoison(body, ct);
              const newInit = { ...(init||{}), body: poisoned, headers: new Headers(req.headers) };
              if (ct && !/json|x-www-form-urlencoded/i.test(ct)) {
                newInit.headers.set('content-type', 'application/json');
              }
              postPoison({ url, method: (req.method||'fetch'), preview: typeof poisoned === 'string' ? poisoned : '' });
              return origFetch(url, newInit);
            }
            if (shouldPoison(url)){
              // Reduce signal by sending no body
              const newInit = { ...(init||{}), body: undefined };
              return origFetch(url, newInit);
            }
          } catch {}
          return origFetch(input, init);
        };
      }
    } catch {}

    // XMLHttpRequest poisoning (strict) and suppression
    try {
      const XHR = window.XMLHttpRequest;
      if (XHR) {
        const open = XHR.prototype.open;
        const send = XHR.prototype.send;
        XHR.prototype.open = function(method, url, async, user, password){ this.__poise_url = String(url||''); return open.apply(this, arguments); };
        XHR.prototype.send = function(body){
          try {
            const url = this.__poise_url || '';
            if (MODE === 'strict' && shouldPoison(url)){
              const poisoned = buildPoison(body, '');
              postPoison({ url, method: 'xhr', preview: typeof poisoned === 'string' ? poisoned : '' });
              return send.call(this, poisoned);
            }
            if (shouldPoison(url)) return send.call(this, undefined);
          } catch {}
          return send.call(this, body);
        };
      }
    } catch {}

    // NetworkInformation clamp
    try {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn){
        const fake = (MODE === 'baseline') ? {
          effectiveType: '4g',
          rtt: 70,
          downlink: 50,
          saveData: false
        } : (MODE === 'moderate') ? {
          effectiveType: '3g',
          rtt: 200,
          downlink: 5,
          saveData: false
        } : {
          effectiveType: '2g',
          rtt: 800,
          downlink: 1,
          saveData: true
        };
        for (const [k,v] of Object.entries(fake)){
          try { Object.defineProperty(conn, k, { configurable: true, get(){ return v; } }); } catch {}
        }
      }
    } catch {}

    // Plugins/mimeTypes neutralization
    try {
      const emptyArrayLike = () => ({ length: 0, item: () => null, namedItem: () => null, refresh: () => {} });
      try { Object.defineProperty(navigator, 'plugins', { configurable: true, get(){ return emptyArrayLike(); } }); } catch {}
      try { Object.defineProperty(navigator, 'mimeTypes', { configurable: true, get(){ return emptyArrayLike(); } }); } catch {}
    } catch {}

  } catch {}

  // Screen/device metrics clamp
  try {
    const clamp = (val, quantum)=> Math.floor(val/quantum)*quantum;
    const q = (MODE === 'strict' ? 32 : 16);
    if ('devicePixelRatio' in window){ try { Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get(){ return 1; } }); } catch {} }
    if ('screen' in window){
      const props = ['width','height','availWidth','availHeight'];
      props.forEach(p => {
        if (p in screen){
          try { const v = clamp(screen[p], q); Object.defineProperty(screen, p, { configurable: true, get(){ return v; } }); } catch {}
        }
      });
      if ('colorDepth' in screen){ try { Object.defineProperty(screen, 'colorDepth', { configurable: true, get(){ return 24; } }); } catch {} }
      if ('pixelDepth' in screen){ try { Object.defineProperty(screen, 'pixelDepth', { configurable: true, get(){ return 24; } }); } catch {} }
    }
  } catch {}

  // Deterministic fake generators
  function fakeEmail(){ return `user${Math.floor(rand()*1e6)}@example.com`; }
  function fakeUUID(){ const s=()=>Math.floor(rand()*0x10000).toString(16).padStart(4,'0'); return `${s()+s()}-${s()}-${s()}-${s()}-${s()+s()+s()}`; }
  function fakePhone(){ return `+1${Math.floor(2000000000+rand()*799999999)}`; }
  function fakeName(){ return `John Doe ${Math.floor(rand()*1000)}`; }
  const DEFUNCT_BASE = ['Nortel','Melvin Capital','Blockbuster','MySpace','Lehman Brothers','AltaVista','Compaq','Palm','Kodak','Napster'];
  function fakeDefunct(){
    const pool = (DEFUNCT_CUSTOM.length ? DEFUNCT_CUSTOM : DEFUNCT_BASE);
    return pool[Math.floor(rand()*pool.length)] || 'Nortel';
  }
  function mutateKeyValue(k,v){
    const K = (k||'').toLowerCase();
    if (/email/.test(K)) return fakeEmail();
    if (/phone|tel/.test(K)) return fakePhone();
    if (/name|fullname|first|last/.test(K)) return fakeName();
    if (/uuid|id|client_id|cid|user_id/.test(K)) return fakeUUID();
    if (/(brand|company|org|organization|vendor|employer|advertiser|client|app|product|agency)/.test(K)) return fakeDefunct();
    return v;
  }
  function mutateObject(obj){
    try {
      const out = Array.isArray(obj) ? [] : {};
      for (const [k,v] of Object.entries(obj)){
        out[k] = (v && typeof v === 'object') ? mutateObject(v) : mutateKeyValue(k,v);
      }
      return out;
    } catch { return obj; }
  }

  // Wrap fetch
  try {
    if (typeof window.fetch === 'function'){
      const origFetch = window.fetch.bind(window);
      window.fetch = async function(input, init){
        try {
          const url = (typeof input === 'string') ? input : input.url;
          if (shouldPoison(url)){
            const i = init ? { ...init } : undefined;
            if (i && i.body && typeof i.body === 'string'){
              const ct = (i.headers && (i.headers['Content-Type'] || i.headers.get?.('Content-Type'))) || '';
              if (String(ct).toLowerCase().includes('json')){
                try { const parsed = JSON.parse(i.body); i.body = JSON.stringify(mutateObject(parsed)); } catch {}
              }
            }
            if (!init && input instanceof Request){
              const ct = input.headers.get('Content-Type')||'';
              if (ct.includes('application/json')){
                try { const txt = await input.clone().text(); const parsed = JSON.parse(txt); const body = JSON.stringify(mutateObject(parsed)); return origFetch(new Request(input, { body })); } catch {}
              }
            }
            if (YT_TELEMETRY_NOISE && isYouTubeTelemetry(url)){
              try {
                const u = new URL(url, location.href);
                u.searchParams.set('xpn', Math.floor(rand()*1e9).toString(36));
                u.searchParams.set('prv', Math.floor(rand()*1e6).toString());
                u.searchParams.set('ab', ['A','B','C','D'][Math.floor(rand()*4)]);
                if (typeof input === 'string') {
                  input = u.toString();
                } else if (input instanceof Request) {
                  input = new Request(u.toString(), input);
                }
              } catch {}
            }
          }
        } catch {}
        return origFetch(input, init);
      };
    }
  } catch {}

  // Wrap XHR
  try {
    const XO = window.XMLHttpRequest;
    if (XO){
      const open = XO.prototype.open;
      const send = XO.prototype.send;
      XO.prototype.open = function(method, url, ...rest){ this.__mpUrl = url; return open.call(this, method, url, ...rest); };
      XO.prototype.send = function(body){
        try {
          if (body && typeof body === 'string' && shouldPoison(this.__mpUrl)){
            if (body.trim().startsWith('{')){ try { const parsed = JSON.parse(body); body = JSON.stringify(mutateObject(parsed)); } catch {} }
          }
          if (YT_TELEMETRY_NOISE && isYouTubeTelemetry(this.__mpUrl)){
            try {
              const u = new URL(this.__mpUrl, location.href);
              u.searchParams.set('xpn', Math.floor(rand()*1e9).toString(36));
              u.searchParams.set('prv', Math.floor(rand()*1e6).toString());
              this.__mpUrl = u.toString();
            } catch {}
          }
        } catch {}
        return send.call(this, body);
      };
    }
  } catch {}

  // Wrap WebSocket
  try {
    const WS = window.WebSocket;
    if (WS){
      const MPWS = function(url, protocols){
        const ws = new WS(url, protocols);
        const urlStr = (typeof url === 'string') ? url : (url && url.url) || '';
        const origSend = ws.send.bind(ws);
        ws.send = function(data){
          try {
            if (shouldPoison(urlStr) && typeof data === 'string' && data.trim().startsWith('{')){
              const parsed = JSON.parse(data);
              const mutated = mutateObject(parsed);
              data = JSON.stringify(mutated);
            }
          } catch {}
          return origSend(data);
        };
        return ws;
      };
      MPWS.prototype = WS.prototype;
      window.WebSocket = MPWS;
    }
  } catch {}

  // performance.now quantization
  try {
    if (CFG.modules?.perfQuantize !== false && 'performance' in window) {
      const step = (MODE === 'strict' ? 12 : (MODE === 'moderate' ? 8 : 4)); // ms
      const offset = Math.floor(rand()*step);
      const origNow = performance.now.bind(performance);
      Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: function(){
        const v = origNow();
        return Math.floor((v + offset) / step) * step;
      }});
    }
  } catch {}

  // Date skew/quantization
  try {
    const stepMs = (MODE === 'strict' ? 25 : (MODE === 'moderate' ? 12 : 6));
    const skew = (MODE === 'baseline' ? (Math.floor(rand()*60) - 30) : (Math.floor(rand()*500) - 250));
    const origDateNow = Date.now.bind(Date);
    const OrigDate = Date;
    // eslint-disable-next-line no-global-assign
    Date = function(...args){
      switch (args.length){
        case 0: return new OrigDate(Date.now());
        default: return new OrigDate(...args);
      }
    };
    Date.prototype = OrigDate.prototype;
    Date.parse = OrigDate.parse;
    Date.UTC = OrigDate.UTC;
    // Reattach quantized Date.now after replacing global Date
    Date.now = function(){ const v = origDateNow(); return Math.floor((v + skew) / stepMs) * stepMs; };
  } catch {}

  // Navigator clamping
  try {
    if (CFG.modules?.navigatorClamp !== false) {
      const fake = {
        hardwareConcurrency: 4,
        deviceMemory: 4,
        platform: 'Win32',
        language: 'en-US',
        languages: ['en-US','en'],
        vendor: 'Google Inc.',
      };
      for (const [k,v] of Object.entries(fake)) {
        if (k in navigator) {
          try { Object.defineProperty(navigator, k, { configurable: true, get(){ return v; } }); } catch {}
        }
      }
      // Clamp userAgentData where present (Chromium). Keep brands generic.
      try {
        if ('userAgentData' in navigator && navigator.userAgentData) {
          const uaData = navigator.userAgentData;
          const brands = [
            { brand: 'Chromium', version: '124' },
            { brand: 'Not.A/Brand', version: '99' }
          ];
          Object.defineProperty(navigator, 'userAgentData', {
            configurable: true,
            get() {
              return {
                mobile: false,
                brands,
                getHighEntropyValues: async (hints) => {
                  const out = { architecture: 'x86', bitness: '64', platform: 'Windows', model: '' };
                  if (Array.isArray(hints)) hints.forEach(h => { if (!(h in out)) out[h] = ''; });
                  return out;
                }
              };
            }
          });
        }
      } catch {}
    }
  } catch {}
  // Client Hints often server-driven; cannot reliably block here in page.
  // Referrer neutralization
  try {
    if (MODE === 'strict') {
      const refGetter = () => '';
      Object.defineProperty(document, 'referrer', { configurable: true, get: refGetter });
    } else {
      const r = document.referrer;
      const originOnly = (() => { try { return r ? new URL(r).origin : ''; } catch { return ''; } })();
      Object.defineProperty(document, 'referrer', { configurable: true, get(){ return originOnly; } });
    }
  } catch {}

  // Helper: build poisoned payload in expected formats
  function buildPoison(data, contentType){
    try {
      const ts = Date.now();
      const pCfg = (CFG.modules && CFG.modules.poisonConfig) || {};
      const incRid = (pCfg.poisonIncludeRid !== false);
      const incJit = (pCfg.poisonIncludeJitter !== false);
      const incPII = !!pCfg.poisonIncludeFakePII;
      const rid = Math.floor(rand()*1e9).toString(36) + Math.floor(rand()*1e9).toString(36);
      const base = { event: 'heartbeat', ts, meta: { locale: 'en-US', tz: 'UTC' } };
      if (incRid) base.rid = rid;
      if (incJit) base.jitter = Math.floor(rand()*1000);
      if (contentType && /application\/x-www-form-urlencoded/i.test(contentType)){
        const params = new URLSearchParams(typeof data === 'string' ? data : '');
        params.set('e', base.event);
        if (incRid) params.set('rid', rid);
        params.set('ts', String(ts));
        if (incJit) params.set('j', String(base.jitter));
        return params.toString();
      }
      // JSON-ish
      let obj = {};
      if (typeof data === 'string') { try { obj = JSON.parse(data); } catch { obj = {}; } }
      else if (data && typeof data === 'object') { try { obj = JSON.parse(JSON.stringify(data)); } catch { obj = {}; } }
      const merged = { ...obj, ...base };
      if (incPII) {
        // add clearly synthetic hints only when enabled
        merged.pii = { email: fakeEmail(), name: fakeName(), phone: fakePhone() };
      }
      return JSON.stringify(merged);
    } catch { return data; }
  }

  function extractContentType(headers){
    try {
      if (!headers) return '';
      if (typeof headers.get === 'function') return headers.get('content-type') || headers.get('Content-Type') || '';
      if (Array.isArray(headers)){
        const h = headers.find(x=>/^content-type$/i.test(x[0]));
        return h ? h[1] : '';
      }
      if (headers && typeof headers === 'object'){
        for (const k of Object.keys(headers)) if (/^content-type$/i.test(k)) return headers[k];
      }
    } catch {}
    return '';
  }

  // Notify isolated world (content.js) about poisoned sends
  function postPoison(ev){
    try {
      const detail = {
        url: ev.url || '',
        method: ev.method || 'beacon',
        initiator: location.href,
        preview: (ev.preview || '').toString().slice(0, 300)
      };
      window.dispatchEvent(new CustomEvent('__POISE_POISONED', { detail }));
    } catch {}
  }

  // Canvas noise
  try {
    if (CFG.modules?.canvasNoise !== false) {
      const amp = amplitudeFor('canvas');
      const ctx2dProto = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
      const canvasProto = HTMLCanvasElement && HTMLCanvasElement.prototype;
      function noisifyImageData(img){
        const d = img.data; for (let i=0;i<d.length;i+=4){
          const n = (randSigned()*amp*255)|0; d[i]=(d[i]+n)&255; d[i+1]=(d[i+1]+n)&255; d[i+2]=(d[i+2]+n)&255;
        } return img;
      }
      if (ctx2dProto && ctx2dProto.getImageData){
        const orig = ctx2dProto.getImageData;
        ctx2dProto.getImageData = function(x,y,w,h){
          const img = orig.call(this, x,y,w,h);
          try { return noisifyImageData(img); } catch { return img; }
        };
      }
      function wrapToDataURL(proto){
        if (!proto || !proto.toDataURL) return;
        const orig = proto.toDataURL;
        proto.toDataURL = function(...args){
          try {
            const ctx = this.getContext && this.getContext('2d');
            if (ctx && ctx.getImageData){ const img = ctx.getImageData(0,0,this.width,this.height); ctx.putImageData(noisifyImageData(img),0,0); }
          } catch {}
          return orig.apply(this, args);
        };
      }
      wrapToDataURL(canvasProto);
      if (window.OffscreenCanvas) wrapToDataURL(OffscreenCanvas.prototype);
    }
  } catch {}

  // WebGL noise / vendor clamp
  try {
    if (CFG.modules?.webglNoise !== false) {
      const amp = amplitudeFor('webgl');
      function patchGL(gl){
        if (!gl) return;
        const getParameter = gl.getParameter.bind(gl);
        gl.getParameter = function(p){
          try {
            if (p === 37446 /* UNMASKED_VENDOR_WEBGL */) return 'Google Inc.';
            if (p === 37447 /* UNMASKED_RENDERER_WEBGL */) return 'ANGLE (Intel, ANGLE)';
          } catch {}
          return getParameter(p);
        };
        const readPixels = gl.readPixels?.bind(gl);
        if (readPixels) {
          gl.readPixels = function(x,y,w,h,format,type,pixels){
            const rv = readPixels(x,y,w,h,format,type,pixels);
            try { if (pixels && pixels.length){ for (let i=0;i<pixels.length;i++){ const n=(randSigned()*amp*255)|0; pixels[i]=(pixels[i]+n)&255; } } } catch {}
            return rv;
          };
        }
      }
      const getCtx = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attrs){
        const ctx = getCtx.call(this, type, attrs);
        if (type && (''+type).toLowerCase().includes('webgl')) patchGL(ctx);
        return ctx;
      };
    }
  } catch {}

  // Audio noise
  try {
    if (CFG.modules?.audioNoise !== false) {
      const amp = amplitudeFor('audio');
      const ab = window.AudioBuffer && AudioBuffer.prototype;
      if (ab && ab.getChannelData){
        const orig = ab.getChannelData;
        ab.getChannelData = function(ch){
          const arr = orig.call(this, ch);
          try { for (let i=0;i<arr.length;i++){ arr[i] += randSigned()*amp; } } catch {}
          return arr;
        };
      }
      const an = window.AnalyserNode && AnalyserNode.prototype;
      function wrapArrayMethod(name){
        if (!an || !an[name]) return;
        const orig = an[name];
        an[name] = function(array){ const rv = orig.call(this, array); try { for (let i=0;i<array.length;i++){ array[i] = Math.max(0, Math.min(255, array[i] + (randSigned()*amp*255))); } } catch {} return rv; };
      }
      wrapArrayMethod('getByteTimeDomainData');
      wrapArrayMethod('getByteFrequencyData');
    }
  } catch {}

  // Storage hygiene for common tracker keys
  try {
    if (CFG.modules?.storageHygiene !== false) {
      const TRACK_KEYS = [/^_ga/, /^_gid/, /^ajs_/, /^amplitude_/, /^optimizely/, /^fbp$/, /^fbc$/];
      function wrapStorage(obj){
        if (!obj) return;
        const origSet = obj.setItem?.bind(obj);
        const origGet = obj.getItem?.bind(obj);
        const origKey = obj.key?.bind(obj);
        const origRemove = obj.removeItem?.bind(obj);
        obj.setItem = function(k,v){ if (TRACK_KEYS.some(re=>re.test(k))) { return; } return origSet(k,v); };
        obj.getItem = function(k){ if (TRACK_KEYS.some(re=>re.test(k))) { return null; } return origGet(k); };
        obj.removeItem = function(k){ if (TRACK_KEYS.some(re=>re.test(k))) { return; } return origRemove(k); };
        obj.key = function(i){ return origKey(i); };
      }
      wrapStorage(window.localStorage);
      wrapStorage(window.sessionStorage);
    }
  } catch {}

})();
