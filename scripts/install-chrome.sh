#!/usr/bin/env bash
# Privateness.network Data Poisoner: Active Warfare MV3 — Chrome loader
# Loads unpacked extension into Chrome with a fresh profile

set -euo pipefail

# Default values
EXT_PATH="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="$HOME/.config/chromium/PrivatenessPoisoner"
CHROME_BIN="google-chrome"  # Change to 'chromium-browser' or 'google-chrome-stable' as needed

print_help() {
  cat <<EOF
Usage: $0 [options]
  -e, --extension PATH  Path to unpacked extension (default: parent of scripts/)
  -p, --profile DIR     Chrome profile directory (default: ~/.config/chromium/PrivatenessPoisoner)
  -b, --binary PATH     Chrome/Chromium binary path (default: $CHROME_BIN)
  -h, --help            Show this help

Example:
  $0 -b chromium-browser --profile ~/chrome-test-profile
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--extension) EXT_PATH="$2"; shift 2 ;;
    -p|--profile) PROFILE_DIR="$2"; shift 2 ;;
    -b|--binary) CHROME_BIN="$2"; shift 2 ;;
    -h|--help) print_help; exit 0 ;;
    *) echo "Unknown option: $1" >&2; print_help; exit 1 ;;
  esac
done

# Check if Chrome/Chromium is installed
if ! command -v "$CHROME_BIN" >/dev/null 2>&1; then
  echo "[!] $CHROME_BIN not found. Please install Chrome/Chromium or specify binary with -b"
  exit 1
fi

# Create profile directory if it doesn't exist
mkdir -p "$PROFILE_DIR"

# Launch Chrome with the extension loaded
echo "[+] Launching Chrome with Privateness.network Data Poisoner..."
echo "    - Profile: $PROFILE_DIR"
echo "    - Extension: $EXT_PATH"

"$CHROME_BIN" \
  --no-default-browser-check \
  --no-first-run \
  --user-data-dir="$PROFILE_DIR" \
  --load-extension="$EXT_PATH" \
  --enable-extension-activity-logging \
  --enable-logging=stderr \
  --v=1 \
  about:blank

echo "[!] Chrome has exited. To launch again with the same profile:"
echo "    $CHROME_BIN --user-data-dir=\"$PROFILE_DIR\" --load-extension=\"$EXT_PATH\""
