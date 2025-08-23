# Privateness — Privacy Policy (Zero Collection)

Effective date: 2025-09-01

Privateness is “the quality of being private.” This browser extension protects users by reducing tracking and fingerprinting inside the browser. We operate with a strict zero‑collection promise.

## 1) What the extension does

- Reduces tracking and fingerprinting (e.g., suppresses analytics beacons, adds small noise to fingerprinting APIs, clamps timing precision).
- All protections run locally on the user’s device.

## 2) Zero data collection

- We do not collect, receive, transmit, sell, rent, or share any personal or non‑personal user data.
- The extension does not send telemetry or analytics to us or any third party.
- We have no server‑side components for this extension’s operation.

## 3) Local‑only operation

- Any operational state is stored locally in the browser (e.g., settings). We do not receive it.
- Optional diagnostic logs (when explicitly enabled by the user via Audit/Diagnostic mode) remain on device and never leave it.

## 4) Instant ON/OFF and deletion

- A global ON/OFF control (Benji) is available in Options. Green = ON, Red = OFF. Turning OFF disables protections immediately.
- A Reset control deletes all locally stored diagnostic traces and counters immediately.

## 5) Audit/Diagnostic mode (optional)

- When ON, the extension may observe and log matching events locally to help troubleshoot breakage.
- By default, Audit/Diagnostic mode is OFF. When OFF, no diagnostic logs are recorded.

## 6) Permissions and scope

- Requests the minimum permissions necessary to reduce tracking within pages you visit.
- Does not access or transmit page content or identities to us.

## 7) Children’s privacy

- Not directed to children. No data is collected.

## 8) Security

- Minimized permissions, validated inputs, local‑only processing.
- RCE-resistance: no dynamic code execution (no `eval`, no `new Function`, no string-based timers).
- DOM safety: user-controlled data is written with `textContent` (no `innerHTML` for untrusted data).
- Content Security Policy (extension pages): `script-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'`.

## 9) Contact

- [privacy@privateness.network](mailto:privacy@privateness.network)

## Links

- Bitcointalk announcement: <https://bitcointalk.org/index.php?topic=5272741.0>

---

Publisher Certification: We certify that this extension collects no personal or non‑personal data. All operation is on‑device. Users can disable protections instantly and delete local traces at any time.
