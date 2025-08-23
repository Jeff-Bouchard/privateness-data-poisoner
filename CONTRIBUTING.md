# Contributing Guidelines

Thank you for considering a contribution!

## Development Setup

- Load the unpacked extension (README Install section).
- Enable ESLint in your editor. Rules forbid dynamic code (RCE-related patterns).

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
- Report vulnerabilities privately to security@privateness.network.
