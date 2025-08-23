// schemas/adultPersona.js
// Schema module for Privateness Data Poisoner
// Exports: SCHEMAS (array of schema objects), helpers: normalizeRegionParams, applyPersonaToInitHeaders, seededRand

// Lightweight deterministic PRF (per-origin) using FNV-1a seed -> xorshift32 PRNG
function seedFromHost(host) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < host.length; i++) {
    h ^= host.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function xorshift32(seed) {
  let x = seed >>> 0;
  return function() {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 0xFFFFFFFF;
  };
}

function seededRandForOrigin(origin) {
  try {
    const u = new URL(origin, location.href);
    const base = u.hostname || origin || 'default';
    const seed = seedFromHost(base + '::privateness');
    return xorshift32(seed);
  } catch (e) {
    return xorshift32(seedFromHost(String(origin || 'default')));
  }
}

// Persona constants (adult, stable)
function buildPersona(rand) {
  return Object.freeze({
    locale: 'en-US',
    tz: 'UTC',
    platform: rand() > 0.5 ? 'Win32' : 'X11',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    screen: { width: 1920, height: 1080 },
    // media/network
    bwKbps: Math.floor(3500 + rand() * 5500),
    bufHealth: Math.floor(45 + rand() * 75),
    playhead: Math.floor(20 + rand() * 600),
  });
}

// Helpers
function cloneInit(init) {
  const copy = Object.assign({}, (init || {}));
  if (init && init.headers) copy.headers = new Headers(init.headers instanceof Headers ? init.headers : init.headers);
  else copy.headers = new Headers();
  return copy;
}

function normalizeRegionParams(u) {
  try {
    const params = u.searchParams;
    ['gl','gr','geo','market','country','region'].forEach(k => params.has(k) && params.delete(k));
    if (params.has('hl')) params.set('hl','en');
    if (params.has('language')) params.set('language','en-US');
    if (params.has('timezone')) params.set('timezone','UTC');
  } catch (e) {}
  return u;
}

function applyPersonaToInitHeaders(init, persona) {
  const newInit = cloneInit(init);
  newInit.headers.set('Accept-Language', persona.locale + ',en;q=0.8');
  ['Sec-CH-UA-Platform','Sec-CH-UA-Platform-Version','Sec-CH-UA-Arch','Sec-CH-UA-Model','Sec-CH-UA-Full-Version','Sec-CH-UA-Full-Version-List','Sec-CH-UA-WoW64'].forEach(h => newInit.headers.delete(h));
  return newInit;
}

function mutateUrlEncodedString(str, mutateKV) {
  try {
    const p = new URLSearchParams(str);
    for (const [k,v] of [...p.entries()]) p.set(k, mutateKV(k,v));
    return p.toString();
  } catch (e) { return str; }
}

function tryMutateBody(init, mutateKV) {
  if (!init) return init;
  if (typeof init.body === 'string' && /(^|[;&])\w+=/.test(init.body)) {
    const s = mutateUrlEncodedString(init.body, mutateKV);
    const copy = cloneInit(init);
    copy.body = s;
    copy.headers.set('content-type','application/x-www-form-urlencoded');
    return copy;
  }
  if (typeof init.body === 'string' && (String(copyHeader(init,'content-type') || '').includes('json'))) {
    try {
      const o = JSON.parse(init.body);
      const v = mutateObject(o, mutateKV);
      const copy = cloneInit(init);
      copy.body = JSON.stringify(v);
      copy.headers.set('content-type','application/json');
      return copy;
    } catch (e) { }
  }
  return init;
}

function copyHeader(init, name) {
  try { if (!init || !init.headers) return null; const h = init.headers instanceof Headers ? init.headers.get(name) : (init.headers[name] || init.headers.get && init.headers.get(name)); return h; } catch(e){return null}
}

function mutateObject(obj, mutateKV) {
  if (Array.isArray(obj)) return obj.map(v => typeof v === 'string' ? mutateKV('', v) : (typeof v === 'object' ? mutateObject(v, mutateKV) : v));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string') out[k] = mutateKV(k, v);
      else if (typeof v === 'object') out[k] = mutateObject(v, mutateKV);
      else out[k] = v;
    }
    return out;
  }
  return obj;
}

// Schema mutators
function isYouTubeHost(host) { return /(^|\.)youtube\.com$|(^|\.)googlevideo\.com$/.test(host); }
function isYouTubeQoEPath(path) { return /\/api\/stats\/qoe/.test(path); }
function mutateYouTubeQoE(u, init, rand, persona) {
  try {
    const url = new URL(u, location.href);
    normalizeRegionParams(url);
    const params = url.searchParams;
    params.set('cbr','Chrome');
    params.set('cbrver', ['117.0.0.0','120.0.0.0','124.0.0.0','139.0.0.0'][Math.floor(rand()*4)]);
    params.set('cplatform','DESKTOP');
    params.set('cos', persona.platform === 'Win32' ? 'Win32' : 'X11');
    params.set('ab', ['A','B','C'][Math.floor(rand()*3)]);
    params.set('bwe', `10.000:${persona.bwKbps*1000}`);
    params.set('bh',  `10.000:${persona.bufHealth.toFixed(3)}`);
    params.set('cmt', `10.000:${persona.playhead.toFixed(3)}`);
    params.set('bat', `10.000:1:1`);
    params.set('vis', `10.000:3`);
    params.set('xpn', Math.floor(rand()*1e9).toString(36));
    params.set('prv', String(Math.floor(500 + rand()*9500)));
    return [url.toString(), applyPersonaToInitHeaders(init, persona)];
  } catch (e) { return [u, init]; }
}

function isFacebookHost(host) { return /(^|\.)facebook\.com$|(^|\.)fbcdn\.net$|(^|\.)instagram\.com$/.test(host); }
function isFBPixelPath(path) { return /\/tr\//.test(path) || /\/pixel\//.test(path) || /\/events/.test(path); }
function mutateFB(u, init, rand, persona) {
  try {
    const url = new URL(u, location.href);
    normalizeRegionParams(url);
    const p = url.searchParams;
    const anonID = `fbp.${Math.floor(1000000000000 + rand()*8999999999999)}`;
    p.set('dl', location.origin + '/');
    p.set('dr', '');
    p.set('ua', persona.ua);
    p.set('fbp', anonID);
    p.set('fbc', '');
    p.set('it','0'); p.set('ev','PageView');
    return [url.toString(), applyPersonaToInitHeaders(init, persona)];
  } catch (e) { return [u, init]; }
}

function isTikTokHost(host) { return /(^|\.)tiktok\.com$|(^|\.)ttwstatic\.com$/.test(host); }
function isTikTokPixelPath(path) { return /\/i18n\/pixel\//.test(path) || /\/api\/track\/.test(path); }
function mutateTikTok(u, init, rand, persona) {
  try {
    const url = new URL(u, location.href);
    normalizeRegionParams(url);
    const p = url.searchParams;
    p.set('referer', location.origin + '/');
    p.set('user_agent', persona.ua);
    p.set('timezone', persona.tz);
    p.set('screen_width', String(persona.screen.width));
    p.set('screen_height', String(persona.screen.height));
    p.set('language', persona.locale);
    return [url.toString(), applyPersonaToInitHeaders(init, persona)];
  } catch (e) { return [u, init]; }
}

function isGenericAnalyticsHost(host) {
  return /google-analytics\.com$|mixpanel\.com$|segment\.io$|hotjar\.com$|fullstory\.com$/.test(host);
}
function mutateGenericAnalytics(u, init, rand, persona) {
  try {
    const url = new URL(u, location.href);
    normalizeRegionParams(url);
    const p = url.searchParams;
    if (p.has('dl')) p.set('dl', location.origin + '/');
    if (p.has('dr')) p.set('dr','');
    if (p.has('ul')) p.set('ul', persona.locale);
    if (p.has('sr')) p.set('sr', `${persona.screen.width}x${persona.screen.height}`);
    return [url.toString(), applyPersonaToInitHeaders(init, persona)];
  } catch (e) { return [u, init]; }
}

const SCHEMAS = [
  {
    name: 'youtube_qoe',
    test: (urlStr) => { try { const u = new URL(urlStr, location.href); return isYouTubeHost(u.hostname) && isYouTubeQoEPath(u.pathname); } catch { return false; } },
    mutate: (urlStr, init, origin) => {
      const rand = seededRandForOrigin(origin);
      const persona = buildPersona(rand);
      return mutateYouTubeQoE(urlStr, init, rand, persona);
    }
  },
  {
    name: 'facebook_pixel',
    test: (urlStr) => { try { const u = new URL(urlStr, location.href); return isFacebookHost(u.hostname) && isFBPixelPath(u.pathname); } catch { return false; } },
    mutate: (urlStr, init, origin) => {
      const rand = seededRandForOrigin(origin);
      const persona = buildPersona(rand);
      return mutateFB(urlStr, init, rand, persona);
    }
  },
  {
    name: 'tiktok_pixel',
    test: (urlStr) => { try { const u = new URL(urlStr, location.href); return isTikTokHost(u.hostname) && isTikTokPixelPath(u.pathname); } catch { return false; } },
    mutate: (urlStr, init, origin) => {
      const rand = seededRandForOrigin(origin);
      const persona = buildPersona(rand);
      return mutateTikTok(urlStr, init, rand, persona);
    }
  },
  {
    name: 'generic_analytics',
    test: (urlStr) => { try { const u = new URL(urlStr, location.href); return isGenericAnalyticsHost(u.hostname); } catch { return false; } },
    mutate: (urlStr, init, origin) => {
      const rand = seededRandForOrigin(origin);
      const persona = buildPersona(rand);
      return mutateGenericAnalytics(urlStr, init, rand, persona);
    }
  }
];

export { SCHEMAS, normalizeRegionParams, applyPersonaToInitHeaders, seededRandForOrigin, buildPersona };
