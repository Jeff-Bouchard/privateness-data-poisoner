# Privateness.network — Data Protection (Manifest V3)

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-informational)
![Minimum Chrome 100+](https://img.shields.io/badge/Chrome-%E2%89%A5100-green)

Privacy extension for Chromium/Brave that reduces telemetry and fingerprinting. Three modes: Baseline, Moderate, Strict + Data Poisoning.

## Install (Brave/Chromium)

1. Open brave://extensions
2. Enable "Developer mode".
3. Click "Load unpacked" and choose the cloned project folder (this repo's root directory).
4. The options page opens in a tab (MV3 `options_ui`). Select a mode (default: Moderate).
5. To apply edits, click "Update" (and/or the circular Reload icon) on the extension card.

## What it does

- Strips common tracking params from URLs (DNR removeParams + link sanitation in `content.js`).
- Blocks/redirects many analytics beacons/pixels to `204.html` (see `rules_analytics.json`).
- Page‑world protections in `injector.js` add deterministic per‑origin noise and clamps:
  - Canvas/WebGL/Audio noise, `performance.now()` quantization, `Date.now()` skew/quantize, `navigator`/Intl clamps, storage hygiene.
- Strict mode additionally poisons analytics payloads (sendBeacon/fetch/XHR) with plausible synthetic data instead of just suppressing.
- Live threat counter and Recent threats panel show DNR matches and poisoning events.

## Files

- `manifest.json` — MV3 config (uses `options_ui.open_in_tab` and a service worker background)
- `service_worker.js` — config storage, stats/logs, DNR match listener, message handling
- `rules_analytics.json` — DNR removeParams + block/redirect/redirect-to-204 rules
- `content.js` — injects page‑world script; sanitizes links; relays poisoning events to the SW
- `injector.js` — page‑world protections (noise/clamps) and strict‑mode data poisoning hooks
- `options.html`, `options.js` — Options UI with mode/modules, live counter, and Recent threats
- `204.html` — empty page for safe redirects
- `PRIVACY.md` — canonical Privacy Policy (rendered into HTML for download)
- `privacy.html` — built HTML version of the Privacy Policy for download from the Options footer

### Security model and hardening

- MV3 default no-inline-scripts + strict CSP for extension pages:
  - `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'`
- No dynamic code evaluation: no `eval`, no `new Function`, no string-arg timers.
- DOM safety: user-controlled strings are rendered with `textContent` (no `innerHTML` for untrusted data).
- Lint guardrails: ESLint rules enforce no-eval/no-implied-eval/no-new-func.

## Modes

- Baseline: light protections, maximum compatibility
- Moderate: balanced protections
- Strict + Data Poisoning: strongest protections; analytics endpoints receive plausible synthetic payloads

Key differences (selected):

- Noise amplitude (Canvas/Audio/WebGL): Baseline 0.0002, Moderate 0.0008, Strict 0.0025
- Time quantization: `performance.now()` 4/8/12 ms; `Date.now()` ~6/12/25 ms + skew
- NetworkInformation clamp: 4g/~70ms/50Mbps → 3g/~200ms/5Mbps → 2g/~800ms/1Mbps with saveData=true in Strict
- Screen metrics: 16px quantization (Baseline/Moderate) → 32px (Strict); DPR forced to 1
- Referrer: origin-only (Baseline/Moderate) → empty (Strict)
- Telemetry: suppression (Baseline/Moderate) → poisoning (Strict)

## Modules (with quick explanations)

- Canvas noise: adds tiny noise to canvas pixels to prevent canvas fingerprint stability.
- Audio noise: perturbs audio buffers and analyser reads to break audio fingerprinting.
- WebGL noise & vendor clamp: returns generic vendor/renderer and adds slight noise to readPixels.
- Quantize performance.now(): rounds the high‑resolution timer to reduce timing side‑channels.
- Clamp navigator / Intl: normalizes hardwareConcurrency, deviceMemory, platform, languages, and User‑Agent Client Hints.
- Storage hygiene: blocks common tracker keys (e.g., `_ga`, `fbp`) in localStorage/sessionStorage.
- Block analytics beacons: suppresses or poisons sendBeacon/fetch/XHR/WebSocket to analytics endpoints.

## Recent threats panel and logs

- The options page displays a live counter (“Threats countered”) and a Recent threats table (last 25 events).
- The Reset button clears counters and prints a concise table to the console.
- Events come from DNR matches and strict‑mode poisoning hooks.

### Clickable poison rule and payload preview

- In the Recent threats table, the Rule value `poison` is clickable.
- Clicking it opens a modal with a short preview of the poisoned payload that was sent.
- Only a compact preview is stored to keep storage usage low.
- The footer provides a hover preview of the Privacy Policy content (first ~120 words from `PRIVACY.md`) when hovering the policy link.

## Poisoning options

These options affect how synthetic analytics payloads are built in Strict mode:

- Include synthetic request ID (rid): adds a non-identifying request identifier.
- Include timing jitter: adds small random timing to reduce correlatability.
- Include synthetic PII hints: when JSON is used, optionally add clearly fake fields (email/name/phone). Off by default.
- Custom defunct brand/company names: optional list used to replace brand/org/vendor fields in poisoned JSON for added plausibility.

Notes:

- Logs and previews exclude personal data. They only show compact synthetic payload snippets.
- Whitelisted origins bypass poisoning and suppression entirely.

## Pattern-based allow/block

- The Options UI provides two simple lists: whitelist patterns and blacklist patterns.
- Patterns are raw text substrings matched against the full URL (protocol ignored in practice; matching is on the string).
- Whitelist patterns create high‑priority allow rules and take precedence over blacklist patterns.
- Blacklist patterns create block rules (or cause poisoning per mode) unless overridden by whitelist.

Tips:

- To allow an entire site, add a broad substring like `example.com`.
- To narrow to a path or resource, include more of the URL (e.g., `example.com/docs` or `tracker.com/pixel`).
- Quick Actions let you add the current tab URL as a pattern in one click (you can edit the input before adding).

Notes:

- The previous domain/path split UI has been removed to reduce complexity.
- Internally, patterns are converted to `regexFilter` DNR rules like `.*<escaped-pattern>.*` for consistent matching across the extension.

## Privacy Policy

- The canonical policy is maintained in `PRIVACY.md`.
- The Options footer links to a downloadable HTML copy (`privacy.html`). Hovering the link shows a brief preview from `PRIVACY.md`.

## Notes & Limits

- MV3 limits header/body manipulation; this extension uses DNR and page‑world APIs accordingly.
- For compatibility, some high‑traffic properties (e.g., core YouTube domains) are excluded from hard DNR redirects in `rules_analytics.json`. Strict‑mode poisoning still applies and is counted.
- Monkey‑patching can be detectable and may cause site issues.
- Deterministic per‑origin noise reduces churn; you can tune modules in the options page.

## Development

- Edit files and press "Update" or the circular Reload icon in brave://extensions.
- Terminate the service worker (Inspect → Terminate) after large changes.
- Open the options page from the extension card; it uses `options_ui` (opens in a tab).
- Toolbar icon uses PNG; if it doesn’t display crisply, provide 16/32/48/128 PNGs and map them in `manifest.json`.

### Linting & quality

- ESLint config `.eslintrc.json` is included. It forbids dynamic code execution (RCE-related patterns):
  - `no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`.
- Recommended: enable ESLint in your editor to see violations while editing.

### Recent security hardening

- Global RCE-resistance policy applied.
- Added strict CSP to `manifest.json`.
- Removed redundant HTML-escaping in `live.js` (now uses `textContent`).
