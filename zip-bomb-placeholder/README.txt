Zip-bomb Placeholder (Manual Deployment Only)
===========================================

This extension does NOT include, serve, or trigger any harmful payload.
This folder is documentation-only to support manual experimentation by
researchers in jurisdictions where such artifacts are legal and ethical.

Guidance (high-level, non-functional):
- If you choose to create a compressed file designed to exhaust resources
  (commonly called a "zip bomb"), generate it OUTSIDE the browser extension
  using offline tooling. Do not configure the extension to deliver it.
- NEVER deploy against systems you do not own or have explicit authorization
  to test. Misuse can be illegal and unethical.
- Keep such files quarantined and clearly labeled to avoid accidental use.
- Consider safer decoy files (e.g., large but finite random data, or benign
  placeholders) for testing flows that expect an attachment without risk.

Reference ideas (do NOT include here):
- Recursive archive structures multiplying expansion size.
- Multi-part archives requiring user interaction to unpack.

Again: this project will not bundle or transmit such files. Any action you
take is strictly at your discretion and responsibility.
