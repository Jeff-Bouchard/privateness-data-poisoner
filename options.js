function normalizeMode(m) {
    const s = String(m || '').toLowerCase();
    if (['baseline', 'conservative', 'light'].includes(s)) return 'baseline';
    if (['moderate', 'standard', 'balanced', 'aggressive'].includes(s)) return 'moderate';
    if (['strict', 'maximum', 'max', 'active_warfare', 'warfare'].includes(s)) return 'strict';
    return 'moderate';
}

// Robust time formatters
function timeMs(ts) {
    let ms = Number(ts);
    if (!isFinite(ms)) {
        const p = (typeof ts === 'string') ? Date.parse(ts) : NaN;
        ms = isFinite(p) ? p : Date.now();
    }
    return ms;
}

function timeStr(ts) {
    const d = new Date(timeMs(ts));
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function timeFull(ts) {
    const d = new Date(timeMs(ts));
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mon}-${day} ${hh}:${mm}:${ss}`;
}

// Open the Live log page as a browser tab
function openLiveLogTab() {
    try {
        const url = chrome.runtime.getURL('live.html');
        window.open(url, '_blank', 'noopener');
    } catch {}
}

// Preview modal wiring
function openPreview(text, meta) {
    try {
        const modal = document.getElementById('previewModal');
        const body = document.getElementById('previewBody');
        const m = document.getElementById('previewMeta');
        if (!modal || !body) return;
        body.textContent = text || '(empty)';
        if (m) m.textContent = `${meta?.method||''} ${meta?.url||''}`.trim();
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    } catch {}
}

function closePreview() {
    try {
        const modal = document.getElementById('previewModal');
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
    } catch {}
}
document.getElementById('previewClose')?.addEventListener('click', closePreview);
document.getElementById('previewModal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'previewModal') closePreview();
});
// Copy preview
async function copyPreview() {
    try {
        const body = document.getElementById('previewBody');
        const text = body ? body.textContent || '' : '';
        if (!text) return;
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        const btn = document.getElementById('previewCopy');
        if (btn) {
            const old = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(() => btn.textContent = old, 1200);
        }
    } catch {}
}
document.getElementById('previewCopy')?.addEventListener('click', copyPreview);

// Whitelist choice modal wiring
let WL_TARGET_URL = '';
let WL_ON_DONE = null;

function openWhitelistChooser(url, onDone) {
    try {
        WL_TARGET_URL = String(url || '');
        WL_ON_DONE = typeof onDone === 'function' ? onDone : null;
        const modal = document.getElementById('wlModal');
        const meta = document.getElementById('wlMeta');
        if (meta) {
            try {
                const u = new URL(WL_TARGET_URL);
                meta.textContent = `${u.origin}${u.pathname}`;
            } catch {
                meta.textContent = WL_TARGET_URL;
            }
        }
        if (modal) {
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        }
    } catch {}
}

function closeWhitelistChooser() {
    try {
        const modal = document.getElementById('wlModal');
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
        WL_TARGET_URL = '';
        WL_ON_DONE = null;
    } catch {}
}
document.getElementById('wlClose')?.addEventListener('click', closeWhitelistChooser);
document.getElementById('wlModal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'wlModal') closeWhitelistChooser();
});
document.getElementById('wlDomain')?.addEventListener('click', async () => {
    const full = WL_TARGET_URL;
    if (!full) return;
    try {
        const u = new URL(full);
        const res = await chrome.runtime.sendMessage({
            type: 'ADD_TO_WHITELIST',
            origin: u.origin
        });
        if (res && res.ok) {
            updateWhitelist();
            if (WL_ON_DONE) try {
                WL_ON_DONE();
            } catch {}
        }
    } catch {}
    closeWhitelistChooser();
});
document.getElementById('wlPath')?.addEventListener('click', async () => {
    const full = WL_TARGET_URL;
    if (!full) return;
    try {
        const u = new URL(full);
        let pathKey = u.origin + u.pathname;
        if (!pathKey.endsWith('/')) pathKey += '/';
        const res = await chrome.runtime.sendMessage({
            type: 'ADD_TO_WHITELIST_PATHS',
            path: pathKey
        });
        if (res && res.ok) {
            updateWhitelistPaths();
            if (WL_ON_DONE) try {
                WL_ON_DONE();
            } catch {}
        }
    } catch {}
    closeWhitelistChooser();
});

// Blacklist choice modal wiring
let BL_TARGET_URL = '';
let BL_ON_DONE = null;

function openBlacklistChooser(url, onDone) {
    try {
        BL_TARGET_URL = String(url || '');
        BL_ON_DONE = typeof onDone === 'function' ? onDone : null;
        const modal = document.getElementById('blModal');
        const meta = document.getElementById('blMeta');
        if (meta) {
            try {
                const u = new URL(BL_TARGET_URL);
                meta.textContent = `${u.origin}${u.pathname}`;
            } catch {
                meta.textContent = BL_TARGET_URL;
            }
        }
        if (modal) {
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        }
    } catch {}
}

function closeBlacklistChooser() {
    try {
        const modal = document.getElementById('blModal');
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
        BL_TARGET_URL = '';
        BL_ON_DONE = null;
    } catch {}
}
document.getElementById('blClose')?.addEventListener('click', closeBlacklistChooser);
document.getElementById('blModal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'blModal') closeBlacklistChooser();
});
document.getElementById('blDomain')?.addEventListener('click', async () => {
    const full = BL_TARGET_URL;
    if (!full) return;
    try {
        const u = new URL(full);
        const res = await chrome.runtime.sendMessage({
            type: 'ADD_TO_BLACKLIST',
            origin: u.origin
        });
        if (res && res.ok) {
            updateBlacklist();
            if (BL_ON_DONE) try {
                BL_ON_DONE();
            } catch {}
        }
    } catch {}
    closeBlacklistChooser();
});
document.getElementById('blPath')?.addEventListener('click', async () => {
    const full = BL_TARGET_URL;
    if (!full) return;
    try {
        const u = new URL(full);
        let pathKey = u.origin + u.pathname;
        if (!pathKey.endsWith('/')) pathKey += '/';
        const res = await chrome.runtime.sendMessage({
            type: 'ADD_TO_BLACKLIST_PATHS',
            path: pathKey
        });
        if (res && res.ok) {
            updateBlacklistPaths();
            if (BL_ON_DONE) try {
                BL_ON_DONE();
            } catch {}
        }
    } catch {}
    closeBlacklistChooser();
});

// Defunct names list UI
function renderDefunctList(items) {
    try {
        const list = document.getElementById('defunctList');
        const empty = document.getElementById('defunctEmpty');
        if (!list || !empty) return;
        list.innerHTML = '';
        const vals = (items || []).map(x => String(x).trim()).filter(Boolean);
        if (!vals.length) {
            empty.style.display = '';
            list.style.display = 'none';
            return;
        }
        empty.style.display = 'none';
        list.style.display = '';
        for (const val of vals) {
            const li = document.createElement('li');
            li.style.margin = '2px 0';
            const txt = document.createElement('span');
            txt.textContent = val;
            li.appendChild(txt);
            const rm = document.createElement('button');
            rm.textContent = 'Remove';
            rm.className = 'secondary';
            rm.style.marginLeft = '8px';
            rm.addEventListener('click', () => {
                li.remove();
                if (!document.querySelector('#defunctList li')) {
                    empty.style.display = '';
                    list.style.display = 'none';
                }
            });
            li.appendChild(rm);
            list.appendChild(li);
        }
    } catch {}
}

function getDefunctList() {
    const out = [];
    try {
        const list = document.getElementById('defunctList');
        if (!list) return out;
        list.querySelectorAll('li span').forEach(s => {
            const v = String(s.textContent || '').trim();
            if (v) out.push(v);
        });
    } catch {}
    return out;
}

function addDefunct() {
    const input = document.getElementById('defunctInput');
    if (!input) return;
    const val = String(input.value || '').trim();
    if (!val) return;
    const current = new Set(getDefunctList().map(v => v.toLowerCase()));
    if (current.has(val.toLowerCase())) {
        input.value = '';
        return;
    }
    const list = document.getElementById('defunctList');
    const empty = document.getElementById('defunctEmpty');
    if (empty) empty.style.display = 'none';
    if (list) list.style.display = '';
    const li = document.createElement('li');
    li.style.margin = '2px 0';
    const txt = document.createElement('span');
    txt.textContent = val;
    li.appendChild(txt);
    const rm = document.createElement('button');
    rm.textContent = 'Remove';
    rm.className = 'secondary';
    rm.style.marginLeft = '8px';
    rm.addEventListener('click', () => {
        li.remove();
        const any = document.querySelector('#defunctList li');
        if (!any && empty && list) {
            empty.style.display = '';
            list.style.display = 'none';
        }
    });
    li.appendChild(rm);
    list.appendChild(li);
    input.value = '';
}
document.getElementById('defunctAdd')?.addEventListener('click', (e) => {
    e.preventDefault?.();
    addDefunct();
});

async function loadConfig() {
    const res = await chrome.runtime.sendMessage({
        type: 'GET_CONFIG'
    });
    const cfg = (res && res.ok) ? res.config : null;
    if (!cfg) return;
    const mode = document.getElementById('mode');
    if (mode) mode.value = cfg.mode || 'moderate';
    const ids = ['canvasNoise', 'audioNoise', 'webglNoise', 'perfQuantize', 'navigatorClamp', 'storageHygiene', 'blockBeacons'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.checked = !!(cfg.modules || {})[id];
    }
    // Apply Benji (global enable) and Audit state to UI
    const benji = document.getElementById('benji');
    const auditBtn = document.getElementById('auditToggle');
    if (benji) {
        const on = cfg.enabled !== false;
        benji.classList.toggle('on', on);
        benji.classList.toggle('off', !on);
        benji.setAttribute('aria-pressed', on ? 'true' : 'false');
        benji.title = 'Global protection';
        benji.textContent = `Protection: ${on ? 'On' : 'Off'}`;
    }
    if (auditBtn) {
        const on = !!cfg.auditMode;
        auditBtn.classList.toggle('on', on);
        auditBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        auditBtn.textContent = `Audit/Diagnostics: ${on ? 'On' : 'Off'}`;
    }
    // Threat scope button initial label
    const scopeBtn = document.getElementById('threatScope');
    if (scopeBtn) scopeBtn.textContent = `Scope: ${cfg.statsPerTab ? 'This tab' : 'Global'}`;
    // Poisoning config (beta)
    const mods = cfg.modules || {};
    const pc = mods.poisonConfig || {};
    const pcIds = ['poisonIncludeRid', 'poisonIncludeJitter', 'poisonIncludeFakePII'];
    pcIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = (pc[id] !== false);
    });
    // Custom defunct names list
    renderDefunctList(Array.isArray(pc.defunctNames) ? pc.defunctNames : []);
}

async function saveConfig() {
    const mode = document.getElementById('mode')?.value || 'moderate';
    const ids = ['canvasNoise', 'audioNoise', 'webglNoise', 'perfQuantize', 'navigatorClamp', 'storageHygiene', 'blockBeacons'];
    const modules = {};
    for (const id of ids) {
        const el = document.getElementById(id);
        modules[id] = !!el.checked;
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
    await chrome.runtime.sendMessage({
        type: 'SET_CONFIG',
        config
    });
    const status = document.getElementById('status');
    status.textContent = 'Saved';
    status.className = 'small ok';
    setTimeout(() => {
        status.textContent = '';
        status.className = 'small';
    }, 1500);
}

// Recent threats rendering (unified with live.html)
function renderLogs(logs) {
    const empty = document.getElementById('logsEmpty');
    const table = document.getElementById('logsTable');
    const body = document.getElementById('logsBody');
    if (!empty || !table || !body) return;
    body.innerHTML = '';
    // Show latest first (newest at bottom like live). We'll render in incoming order.
    const items = Array.isArray(logs) ? logs : [];
    if (!items.length) {
        empty.style.display = '';
        table.style.display = 'none';
        return;
    }
    empty.style.display = 'none';
    table.style.display = '';
    for (const l of items) {
        const tr = document.createElement('tr');

        function td(text) {
            const el = document.createElement('td');
            el.style.padding = '6px 8px';
            el.textContent = text;
            return el;
        }
        const t = timeStr(l.ts || l.time);
        const typeRaw = (typeof l.type === 'string') ? l.type : '';
        const type = typeRaw || (l && l.ruleId ? 'dnr' : 'event');
        const actionRaw = (typeof l.action === 'string') ? l.action : '';
        const action = actionRaw || (type === 'dnr' ? 'block' : '');
        const r = String(l.ruleId || (action ? `${type}/${action}` : type || 'event'));
        const isAudit = (String(l.action || '').toLowerCase() === 'audit') || r.includes('(audit)');
        tr.appendChild(td(t));
        // Column 2: URL (origin+pathname; full on hover)
        {
            const urlTd = document.createElement('td');
            urlTd.style.padding = '6px 8px';
            urlTd.style.whiteSpace = 'nowrap';
            urlTd.style.overflow = 'hidden';
            urlTd.style.textOverflow = 'ellipsis';
            const fullUrl = l.request?.url || l.url || '';
            const shown = (()=>{ try { const u=new URL(fullUrl, l.initiator||location.href); return u.origin+u.pathname; } catch { return String(fullUrl).split('?')[0].split('#')[0]; } })();
            urlTd.textContent = shown;
            if (fullUrl) urlTd.title = fullUrl;
            tr.appendChild(urlTd);
        }
        // Make 'poison' clickable to preview payload (not in audit)
        if ((l.ruleId === 'poison' || r === 'poison') && !isAudit) {
            const el = document.createElement('td');
            el.style.padding = '6px 8px';
            const link = document.createElement('span');
            link.className = 'link';
            link.textContent = 'poison';
            link.addEventListener('click', () => {
                openPreview(l.preview || '', {
                    url: l.request?.url || '',
                    method: l.request?.method || ''
                });
            });
            el.appendChild(link);
            tr.appendChild(el);
        } else {
            const ruleTd = td(isAudit ? 'audit' : (action ? `${type} / ${action}` : (r || 'event')));
            ruleTd.style.whiteSpace = 'nowrap';
            tr.appendChild(ruleTd);
        }
        // Action buttons: Whitelist and Blacklist choices
        const actionTd = document.createElement('td');
        actionTd.style.padding = '6px 8px';
        const wbtn = document.createElement('button');
        wbtn.textContent = 'Allow pattern';
        wbtn.style.padding = '4px 8px';
        wbtn.title = 'Add a whitelist pattern (substring of URL)';
        const bbtn = document.createElement('button');
        bbtn.textContent = 'Block pattern';
        bbtn.className = 'secondary';
        bbtn.style.padding = '4px 8px';
        bbtn.style.marginLeft = '8px';
        bbtn.title = 'Add a blacklist pattern (substring of URL)';
        actionTd.appendChild(wbtn);
        actionTd.appendChild(bbtn);
        wbtn.addEventListener('click', async () => {
            const full = l.request?.url || '';
            if (!full) return;
            try {
                const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST_PATTERNS', pattern: full });
                if (res && res.ok) {
                    wbtn.textContent = 'Allowed';
                    wbtn.disabled = true;
                    updateWhitelistPatterns();
                }
            } catch {}
        });
        bbtn.addEventListener('click', async () => {
            const full = l.request?.url || '';
            if (!full) return;
            try {
                const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST_PATTERNS', pattern: full });
                if (res && res.ok) {
                    bbtn.textContent = 'Blocked';
                    bbtn.disabled = true;
                    updateBlacklistPatterns();
                }
            } catch {}
        });
        tr.appendChild(actionTd);
        body.appendChild(tr);
    }
}

// Live subscription for logs (same backend as live.html)
let logsPort = null;
let logsScope = 'global';
let logsTabId = null;
let logsBuf = 25;

async function detectActiveTabId(){
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (Array.isArray(tabs) && tabs[0] && typeof tabs[0].id === 'number') return tabs[0].id;
  } catch {}
  return null;
}

function subscribeLogs(){
  if (!logsPort) return;
  try { logsPort.postMessage({ type: 'subscribe', scope: logsScope, tabId: logsTabId, size: logsBuf }); } catch {}
}

function connectLogs(){
  try {
    logsPort = chrome.runtime.connect({ name: 'live-log' });
    logsPort.onMessage.addListener((msg)=>{
      if (!msg) return;
      if (msg.type === 'snapshot') { renderLogs(msg.logs||[]); return; }
      if (msg.type === 'event') {
        // Append single event by merging with existing DOM rows
        try {
          const cur = [];
          // reconstruct list from DOM to keep it simple
          // Instead of complex diffing, request a fresh snapshot
          subscribeLogs();
        } catch {}
        return;
      }
    });
    logsPort.onDisconnect.addListener(()=>{ setTimeout(connectLogs, 800); });
    subscribeLogs();
  } catch (e) { setTimeout(connectLogs, 1200); }
}

document.getElementById('save')?.addEventListener('click', saveConfig);

// Threats counter
async function updateThreats() {
    try {
        // Determine scope
        const cfgRes = await chrome.runtime.sendMessage({
            type: 'GET_CONFIG'
        });
        const cfg = (cfgRes && cfgRes.ok) ? (cfgRes.config || {}) : {};
        let tabId = undefined;
        if (cfg.statsPerTab && chrome.tabs?.query) {
            try {
                const tabs = await chrome.tabs.query({
                    active: true,
                    currentWindow: true
                });
                if (Array.isArray(tabs) && tabs[0] && typeof tabs[0].id === 'number') tabId = tabs[0].id;
            } catch {}
        }
        const res = await chrome.runtime.sendMessage({
            type: 'GET_STATS',
            tabId
        });
        if (res && res.ok) {
            const el = document.getElementById('threats');
            if (el) el.textContent = String((cfg.statsPerTab && typeof res.perTab === 'number') ? res.perTab : (res.threats || 0));
            // Update scope label
            const scopeLabel = document.getElementById('threatsScopeLabel');
            if (scopeLabel) scopeLabel.textContent = cfg.statsPerTab ? '(scope: this tab)' : '(scope: global)';
            // Keep audit button label in sync with count
            const auditBtn = document.getElementById('auditToggle');
            if (auditBtn) {
                const on = auditBtn.classList.contains('on');
                const total = res.threats || 0;
                auditBtn.textContent = `Audit/Diagnostics: ${on ? 'On' : 'Off'}${on ? ` — ${total} events` : ''}`;
            }
        }
    } catch {}
}
async function resetThreats() {
    const res = await chrome.runtime.sendMessage({
        type: 'RESET_STATS'
    });
    try {
        const logs = res?.logs || [];
        if (logs.length) {
            const brief = logs.slice(-10).map(l => {
                const u = (() => {
                    try {
                        const a = new URL(l.request?.url || '');
                        return a.origin + a.pathname;
                    } catch {
                        return l.request?.url || '';
                    }
                })();
                return {
                    t: timeStr(l.time),
                    m: l.request?.method || '',
                    u,
                    r: l.ruleId || '',
                    a: l.action || ''
                };
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
setInterval(updateThreats, 3000);
(async ()=>{ logsTabId = await detectActiveTabId(); connectLogs(); })();

// Pattern-based allow/block model
// --------------------------------
// We use simple text patterns that are matched as substrings against the FULL URL.
// - Whitelist patterns: higher-priority allow. Take precedence over blacklist patterns.
// - Blacklist patterns: block/poison unless overridden by whitelist.
// The Options UI exposes a single input + list for each. No domain/path split remains.
// This aligns with service worker DNR generation, where patterns are converted to
// regexFilter entries like `.*<escaped-pattern>.*`.

// Whitelist/Blacklist Patterns management
async function updateWhitelistPatterns() {
    try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST_PATTERNS' });
        if (res && res.ok) renderWhitelistPatterns(res.whitelistPatterns || []);
    } catch {}
}
function renderWhitelistPatterns(list) {
    const ul = document.getElementById('wlPatList');
    const empty = document.getElementById('wlPatEmpty');
    if (!ul || !empty) return;
    ul.innerHTML = '';
    const items = (list || []).map(x => String(x)).filter(Boolean);
    empty.style.display = items.length ? 'none' : '';
    for (const pat of items) {
        const li = document.createElement('li');
        li.style.margin = '4px 0';
        const code = document.createElement('code');
        code.textContent = pat;
        const rm = document.createElement('button');
        rm.textContent = 'Remove';
        rm.style.marginLeft = '10px';
        rm.addEventListener('click', async () => {
            try {
                const res = await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_WHITELIST_PATTERNS', pattern: pat });
                if (res && res.ok) renderWhitelistPatterns(res.whitelistPatterns || []);
            } catch {}
        });
        li.appendChild(code);
        li.appendChild(rm);
        ul.appendChild(li);
    }
}
document.getElementById('wlPatAdd')?.addEventListener('click', async (e) => {
    e.preventDefault?.();
    const input = document.getElementById('wlPatInput');
    const pat = String(input?.value || '').trim();
    if (!pat) return;
    const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST_PATTERNS', pattern: pat });
    if (res && res.ok) {
        input.value = '';
        renderWhitelistPatterns(res.whitelistPatterns || []);
    }
});
updateWhitelistPatterns();
setInterval(updateWhitelistPatterns, 5000);

async function updateBlacklistPatterns() {
    try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_BLACKLIST_PATTERNS' });
        if (res && res.ok) renderBlacklistPatterns(res.blacklistPatterns || []);
    } catch {}
}
function renderBlacklistPatterns(list) {
    const ul = document.getElementById('blPatList');
    const empty = document.getElementById('blPatEmpty');
    if (!ul || !empty) return;
    ul.innerHTML = '';
    const items = (list || []).map(x => String(x)).filter(Boolean);
    empty.style.display = items.length ? 'none' : '';
    for (const pat of items) {
        const li = document.createElement('li');
        li.style.margin = '4px 0';
        const code = document.createElement('code');
        code.textContent = pat;
        const rm = document.createElement('button');
        rm.textContent = 'Remove';
        rm.style.marginLeft = '10px';
        rm.addEventListener('click', async () => {
            try {
                const res = await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_BLACKLIST_PATTERNS', pattern: pat });
                if (res && res.ok) renderBlacklistPatterns(res.blacklistPatterns || []);
            } catch {}
        });
        li.appendChild(code);
        li.appendChild(rm);
        ul.appendChild(li);
    }
}
document.getElementById('blPatAdd')?.addEventListener('click', async (e) => {
    e.preventDefault?.();
    const input = document.getElementById('blPatInput');
    const pat = String(input?.value || '').trim();
    if (!pat) return;
    const res = await chrome.runtime.sendMessage({ type: 'ADD_TO_BLACKLIST_PATTERNS', pattern: pat });
    if (res && res.ok) {
        input.value = '';
        renderBlacklistPatterns(res.blacklistPatterns || []);
    }
});
updateBlacklistPatterns();
setInterval(updateBlacklistPatterns, 5000);

// Quick Actions helpers (sticky toolbar)
async function qaGetUrl() {
    try {
        const input = document.getElementById('qaUrl');
        const val = String(input?.value || '').trim();
        if (val) return val;
        // fallback to current tab URL when input is empty
        if (chrome.tabs?.query) {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });
            if (Array.isArray(tabs) && tabs[0]?.url) return String(tabs[0].url);
        }
    } catch {}
    return '';
}

function qaPathKey(u) {
    try {
        const a = new URL(u);
        let key = a.origin + a.pathname;
        if (!key.endsWith('/')) key += '/';
        return key;
    } catch {
        return '';
    }
}
async function qaAdd(type) {
    const full = await qaGetUrl();
    if (!full) return;
    try {
        if (type === 'wl-pattern') {
            const pattern = String(document.getElementById('qaUrl')?.value || '') || full;
            const res = await chrome.runtime.sendMessage({
                type: 'ADD_TO_WHITELIST_PATTERNS',
                pattern
            });
            if (res && res.ok) updateWhitelistPatterns();
        } else if (type === 'bl-pattern') {
            const pattern = String(document.getElementById('qaUrl')?.value || '') || full;
            const res = await chrome.runtime.sendMessage({
                type: 'ADD_TO_BLACKLIST_PATTERNS',
                pattern
            });
            if (res && res.ok) updateBlacklistPatterns();
        }
    } catch {}
}
// Attach handlers if toolbar exists
(function() {
    const map = {
        qaWLPattern: 'wl-pattern',
        qaBLPattern: 'bl-pattern',
    };
    Object.entries(map).forEach(([id, type]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => qaAdd(type));
    });
})();

// Toggle handlers
document.getElementById('threatScope')?.addEventListener('click', async () => {
    try {
        const res = await chrome.runtime.sendMessage({
            type: 'GET_CONFIG'
        });
        const cfg = (res && res.ok) ? (res.config || {}) : {};
        const next = {
            ...cfg,
            statsPerTab: !cfg.statsPerTab
        };
        const btn = document.getElementById('threatScope');
        if (btn) btn.textContent = `Scope: ${next.statsPerTab ? 'This tab' : 'Global'}`;
        await chrome.runtime.sendMessage({
            type: 'SET_CONFIG',
            config: {
                statsPerTab: next.statsPerTab
            }
        });
        // Refresh counts and label immediately
        updateThreats();
    } catch {}
});
document.getElementById('benji')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('on');
    btn.classList.toggle('off');
    const enabled = btn.classList.contains('on');
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.title = 'Global protection';
    btn.textContent = `Protection: ${enabled ? 'On' : 'Off'}`;
    const res = await chrome.runtime.sendMessage({
        type: 'GET_CONFIG'
    });
    const cfg = (res && res.ok) ? res.config : {};
    await chrome.runtime.sendMessage({
        type: 'SET_CONFIG',
        config: {
            ...cfg,
            enabled
        }
    });
});

document.getElementById('auditToggle')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('on');
    const on = btn.classList.contains('on');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    try {
        const stats = await chrome.runtime.sendMessage({
            type: 'GET_STATS'
        });
        const count = (stats && stats.ok) ? (stats.threats || 0) : 0;
        btn.textContent = `Audit/Diagnostics: ${on ? 'On' : 'Off'} — ${count} events`;
    } catch {
        btn.textContent = `Audit/Diagnostics: ${on ? 'On' : 'Off'}`;
    }
    const res = await chrome.runtime.sendMessage({
        type: 'GET_CONFIG'
    });
    const cfg = (res && res.ok) ? res.config : {};
    await chrome.runtime.sendMessage({
        type: 'SET_CONFIG',
        config: {
            ...cfg,
            auditMode: on
        }
    });
});

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
    } [c]));
}

document.getElementById('seeAsTab')?.addEventListener('click', openLiveLogTab);

// Privacy Policy hover preview (CSP-safe; no inline script)
document.addEventListener('DOMContentLoaded', () => {
    try {
        const link = document.getElementById('ppLink');
        const tip = document.getElementById('ppPreview');
        if (!link || !tip) return;
        let cached = null;
        let fetching = false;
        async function ensure() {
            if (cached || fetching) return;
            try {
                fetching = true;
                const res = await fetch('PRIVACY.md', {
                    cache: 'no-store'
                });
                const text = await res.text();
                const plain = text.replace(/^[#>*`\-\s]+/gm, '').replace(/\[(.*?)\]\([^)]*\)/g, '$1');
                const words = plain.split(/\s+/).filter(Boolean).slice(0, 120).join(' ');
                cached = words + (plain.split(/\s+/).length > 120 ? '…' : '');
            } catch {
                cached = 'Privacy Policy preview unavailable.';
            } finally {
                fetching = false;
            }
        }

        function move(e) {
            const x = Math.min(window.innerWidth - tip.offsetWidth - 12, e.clientX + 16);
            const y = Math.min(window.innerHeight - tip.offsetHeight - 12, e.clientY + 16);
            tip.style.left = x + 'px';
            tip.style.top = y + 'px';
        }
        link.addEventListener('mouseenter', async (e) => {
            await ensure();
            tip.textContent = cached || '';
            tip.style.display = 'block';
            move(e);
        });
        link.addEventListener('mousemove', move);
        link.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
        });
    } catch {}
});