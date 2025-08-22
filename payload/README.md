# Payload Definitions (Manual)

This directory accepts JSON definitions that describe external payload artifacts you may deploy manually (outside the extension) where legal and ethical.

Important:
- The extension does not bundle, serve, or trigger any payload.
- These JSON files are for documentation/cataloging only. You can import them in the options page to store metadata locally.

## Schema

See `schema.json` in this directory. Minimal fields:
- name (string)
- version (string)
- type (string; e.g., "archive", "decoy", "document", etc.)
- description (string)
- legal_note (string)
- sources (array of URLs or notes)
- files (array of objects: { path | url, size_estimate, note })
- deploy_instructions (string)

## Example

See `example.json`.
