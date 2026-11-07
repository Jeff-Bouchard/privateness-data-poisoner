# Contributing Guidelines

Thank you for considering a contribution!

## Development Setup

- Load the unpacked extension (README Install section).
- Enable ESLint in your editor. Rules forbid dynamic code (RCE-related patterns).

## Manual E2E routine (no dependencies)

Use this checklist to validate end-to-end behavior after changes (MV3 SW + content + page-world + UI).

### 0) Clean start

- In `brave://extensions` (or `chrome://extensions`):
  - Click the extension’s Reload icon.
- Open the extension card:
  - Click “Service worker” (Inspect).
  - In the SW DevTools console, run `chrome.storage.local.clear()` if you want a clean config test.
  - Close the SW DevTools, then Reload the extension again.

### 1) Options defaults and persistence

- Open the Options page (opens in a tab via `options_ui`).
- Assert:
  - Mode default is **Strict + Data Poisoning**.
  - `poisonConfig` defaults exist (RID/jitter enabled, fake PII disabled, meme banner disabled).
- Toggle “Meme banner” on, Save/Apply.
- Reload the Options page.
- Assert:
  - “Meme banner” remains enabled (persisted).

### 2) Live Log tab and event stream

- In Options: click **Live log (tab)**.
- Assert:
  - A `live.html` tab opens.
- Click **Live log (tab)** again.
- Assert:
  - The existing `live.html` tab is focused/reused (no duplicate live tabs).

### 3) Generate strict-mode poisoning events (real page)

- In a normal browsing tab, open a tracker-heavy site (news site, social site, etc.).
  - Keep this site off the extension whitelist.
- In the Live Log tab:
  - Ensure Play is enabled.
  - Turn scope to “All” if you want cross-tab events.
- Interact with the site for 10–30 seconds (scroll, click a few links).

Assert in Live Log:

- You see events of type “Poison” (and potentially “DNR”).
- The URL column shows the **remote endpoint** (not `live.html`).
- Type filter buttons actually hide/show rows as expected.

### 4) Payload semantics assertions (poison preview)

- From Options “Recent threats” (or Live log if preview surfaced there), open a poison preview.
- Assert the poisoned payload contains the expected synthetic markers:
  - URL-encoded payloads: keys such as `rid`, `j`, and funnel fields (`funnel`, `ab`, `cv`, `sid`, `src`).
  - JSON payloads: `meta.poise_ts`, `meta.poise_rid`, `meta.poise_noise`, `meta.poise_funnel`.
  - If Meme banner is enabled: `poise_banner` (form) or `meta.poise_banner` (json).

### 5) Audit mode non-mutation sanity check

- In Options: enable Audit/Diagnostic mode.
- Repeat section (3).
- Assert:
  - Requests are not mutated/poisoned (pass-through), but audit-type events/logs may appear locally.

## Coding Standards

- No dynamic code: avoid `eval`, `new Function`, and string-arg timers.
- DOM safety: use `textContent` for user-controlled strings. Avoid `innerHTML` for untrusted data.
- Keep changes minimal and well-scoped. Include tests or logs where helpful.

## Commit Messages

- Use concise, descriptive messages. Example: "Global RCE-Resistance and Hardening".
- Reference files changed when relevant.

## Pull Requests

- Describe the change and rationale.
- Note any user-facing impacts.
- Ensure lint passes.

## Security

- Follow the `SECURITY.md` policy and global no-RCE rule.
- Report vulnerabilities privately to <security@privateness.network>.
