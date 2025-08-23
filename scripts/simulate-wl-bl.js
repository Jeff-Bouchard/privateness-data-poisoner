#!/usr/bin/env node
// Simulation harness for whitelist/blacklist decisions.
// Usage examples:
//   node scripts/simulate-wl-bl.js \
//     --url https://api.example.com/v1/collect \
//     --whitelist https://example.com --whitelist https://foo.bar.co.uk \
//     --wpath https://api.example.com/v1 \
//     --blacklist https://tracker.example.com \
//     --bpath https://bad.example.com/pixel
//
// Pass the REAL entries you use. No placeholders.

function parseArgs(argv){
  const out = { url: '', whitelist: [], whitelistPaths: [], blacklist: [], blacklistPaths: [] };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    const v = argv[i+1];
    if (a === '--url'){ out.url = v; i++; continue; }
    if (a === '--whitelist'){ out.whitelist.push(v); i++; continue; }
    if (a === '--wpath'){ out.whitelistPaths.push(v); i++; continue; }
    if (a === '--blacklist'){ out.blacklist.push(v); i++; continue; }
    if (a === '--bpath'){ out.blacklistPaths.push(v); i++; continue; }
  }
  return out;
}

function getBaseDomain(host){
  try {
    const parts = String(host||'').toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const sld = new Set(['co','com','org','net','gov','edu','ac']);
    if (parts.length >= 3 && sld.has(parts[parts.length-2])) return parts.slice(-3).join('.');
    return parts.slice(-2).join('.');
  } catch { return String(host||''); }
}

function sameBase(a,b){ return getBaseDomain(a) === getBaseDomain(b); }

function isWhitelisted(url, cfg){
  try {
    const u = new URL(url);
    // Domain entries: base + subdomains
    for (const origin of (cfg.whitelist||[])){
      try { const o = new URL(origin); if (sameBase(u.hostname, o.hostname)) return true; } catch {}
    }
    // Path entries: exact host, path equal or prefix
    for (const key of (cfg.whitelistPaths||[])){
      try {
        const k = new URL(key);
        if (k.hostname !== u.hostname) continue;
        const kp = k.pathname.endsWith('/') ? k.pathname : (k.pathname + '/');
        if (u.pathname === k.pathname || u.pathname.startsWith(kp)) return true;
      } catch {}
    }
  } catch {}
  return false;
}

function isBlacklisted(url, cfg){
  try {
    const u = new URL(url);
    // Domain entries: base + subdomains
    for (const origin of (cfg.blacklist||[])){
      try { const o = new URL(origin); if (sameBase(u.hostname, o.hostname)) return true; } catch {}
    }
    // Path entries: exact host, path equal or prefix
    for (const key of (cfg.blacklistPaths||[])){
      try {
        const k = new URL(key);
        if (k.hostname !== u.hostname) continue;
        const kp = k.pathname.endsWith('/') ? k.pathname : (k.pathname + '/');
        if (u.pathname === k.pathname || u.pathname.startsWith(kp)) return true;
      } catch {}
    }
  } catch {}
  return false;
}

function decide(url, cfg){
  const blk = isBlacklisted(url, cfg);
  const wht = isWhitelisted(url, cfg);
  let action = 'none';
  // Order: blacklist first, then whitelist hard-stop
  if (blk) action = 'BLACKLISTED';
  else if (wht) action = 'WHITELISTED';
  else action = 'NEUTRAL';
  return { url, action, blk, wht };
}

(function main(){
  const args = parseArgs(process.argv);
  if (!args.url){
    console.error('Missing --url');
    process.exit(2);
  }
  const cfg = {
    whitelist: args.whitelist,
    whitelistPaths: args.whitelistPaths,
    blacklist: args.blacklist,
    blacklistPaths: args.blacklistPaths,
  };
  const res = decide(args.url, cfg);
  console.log(JSON.stringify({ input: args, decision: res }, null, 2));
})();
