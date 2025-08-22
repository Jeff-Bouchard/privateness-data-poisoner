# Privateness.network Data Poisoner: Active Warfare MV3 (Brave)

Aggressive Manifest V3 extension to degrade tracking/fingerprinting surfaces. Modes: Conservative, Standard, Aggressive, Active Warfare.

## Install (Brave/Chromium)

1. Open brave://extensions
2. Enable "Developer mode".
3. Click "Load unpacked" and choose the cloned project folder (this repo's root directory).
4. Click the toolbar icon or open the options page to select mode (default: Aggressive).

## What it does

- Strips common tracking params from URLs (DNR + link sanitation in `content.js`).
- Blocks/redirects analytics beacons and pixels to `204.html`.
- Page‑world patches in `injector.js` introduce deterministic, per‑origin noise:
  - Canvas/WebGL/Audio readouts, performance.now quantization, navigator/Intl clamping, tracker‑key storage hygiene.
- Modes increase intensity up to "Active Warfare" (most breakage risk).

## Files

- `manifest.json` — MV3 config
- `service_worker.js` — config, per‑origin key management
- `rules_analytics.json` — DNR removeParams + block/redirect rules
- `content.js` — injects page‑world patches; sanitizes links and current URL
- `injector.js` — page‑world patches (noise + clamps)
- `options.html`, `options.js` — UI to select mode and toggles
- `204.html` — empty page for safe redirects
- `payload/` — JSON payload definitions (documentation only; no artifacts)

## Modes

- Conservative: minimal noise, lowest breakage
- Standard: balanced
- Aggressive: heavier noise, blocks more beacons
- Active Warfare: strongest clamps/noise, timezone/locale clamp, expect CAPTCHAs/breakage

## Payload definitions (manual deployment)

This project ships **no payload artifacts**. The `payload/` directory contains JSON definitions and schema for cataloging payloads you may deploy manually (outside the extension) where legal and ethical. The extension will not serve or transmit such files.

## Notes & Limits

- MV3 limits header manipulation; DNR block/redirect is used where possible.
- Monkey‑patching may be detectable and cause site issues.
- Deterministic per‑origin noise reduces churn; still, be ready to whitelist sites if needed.

## Development

- Edit files and press the "Reload" button in brave://extensions for this extension.
- Open DevTools for the extension service worker for logs.
