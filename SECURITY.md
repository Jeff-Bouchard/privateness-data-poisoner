# Security Policy

## Supported Versions

- Extension manifest: MV3 (Chrome/Brave). Minimum Chrome version: 100.

## Our Stance

- Global rule: no Remote Code Execution. User input must never execute code.
- No dynamic code evaluation (`eval`, `new Function`, string-arg timers) in this project.
- User-controlled data is rendered using `textContent`; no `innerHTML` with untrusted input.
- Strict Content Security Policy for extension pages:
  - `script-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'`

## Reporting a Vulnerability

Please email security issues to: security@privateness.network

- Include reproduction steps and impacted versions.
- Do not include sensitive personal data in reports.
- Coordinated disclosure is appreciated.

## Hardening Checklist (maintainers)

- [ ] ESLint: `no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`.
- [ ] Review DOM write paths for user-controlled content (use `textContent`).
- [ ] Validate inputs and sanitize display strings.
- [ ] Keep CSP strict and avoid inline scripts.
- [ ] Avoid broad host permissions unless justified; prefer optional host permissions where feasible.
