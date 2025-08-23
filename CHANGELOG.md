# Changelog

All notable changes to this project will be documented in this file.

## [0.3] - 2025-08-23

- Global RCE-Resistance and Hardening
  - Added strict MV3 CSP for extension pages: `script-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'`.
  - Enforced anti-RCE ESLint rules (`no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`).
  - Simplified `live.js` to use `textContent` directly; removed redundant HTML escaping.
  - Documentation updates: `README.md` security model and linting, `PRIVACY.md` security section.
  - Set `minimum_chrome_version` to `100` in `manifest.json`.

## [0.2]

- Options UI refinements and threat logging improvements.

## [0.1]

- Initial MV3 extension with DNR rules, injector protections, and options page.
