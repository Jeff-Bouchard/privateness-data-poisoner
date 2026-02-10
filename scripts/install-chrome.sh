#!/usr/bin/env bash
# Privateness.network Data Poisoner: Active Warfare MV3 — Chrome loader
# Loads unpacked extension into Chrome (Windows Git Bash + Linux)

set -euo pipefail

# Default values
EXT_PATH="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="Default"
CHROME_BIN=""

is_windows() {
  case "$(uname -s 2>/dev/null || echo '')" in
    MINGW*|MSYS*|CYGWIN*) return 0;;
    *) return 1;;
  esac
}

abs_path() {
  if command -v realpath >/dev/null 2>&1; then
    realpath "$1"
  else
    (cd "$1" && pwd)
  fi
}

EXT_PATH="$(abs_path "$(cd "$(dirname "$0")/.." && pwd)")"

normpath_windows() {
  if ! is_windows; then
    printf '%s' "$1"
    return 0
  fi
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    python - "$1" <<'PY'
import sys
print(sys.argv[1].replace('/', '\\'))
PY
  fi
}

find_chrome() {
  if is_windows; then
    local CANDIDATES=(
      "/c/Program Files/Google/Chrome/Application/chrome.exe"
      "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
      "$LOCALAPPDATA/Google/Chrome/Application/chrome.exe"
    )
    for p in "${CANDIDATES[@]}"; do
      [[ -n "$p" && -f "$p" ]] && { echo "$p"; return 0; }
    done
    if command -v chrome.exe >/dev/null 2>&1; then
      command -v chrome.exe; return 0
    fi
    echo ""; return 1
  fi

  local CANDIDATES_LINUX=(
    "google-chrome"
    "google-chrome-stable"
    "chromium"
    "chromium-browser"
  )
  for b in "${CANDIDATES_LINUX[@]}"; do
    if command -v "$b" >/dev/null 2>&1; then
      command -v "$b"; return 0
    fi
  done
  echo ""; return 1
}

print_help() {
  cat <<EOF
Usage: $0 [options]
  -e, --extension PATH  Path to unpacked extension (contains manifest.json)
  -p, --profile DIR     Chrome profile directory name (default: Default)
  -b, --binary PATH     Chrome binary path (default: auto-detect)
  -h, --help            Show this help

Example:
  $0 -b "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" -p Default
  $0 -b google-chrome -p Default
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

if [[ ! -f "$EXT_PATH/manifest.json" ]]; then
  echo "[!] manifest.json not found in: $EXT_PATH" >&2
  exit 1
fi

if [[ -z "$CHROME_BIN" ]]; then
  CHROME_BIN="$(find_chrome || true)"
fi
if [[ -z "$CHROME_BIN" ]]; then
  echo "[!] Chrome binary not found. Install Chrome/Chromium or pass -b with the full path/binary name." >&2
  exit 1
fi
if is_windows && [[ ! -f "$CHROME_BIN" ]]; then
  echo "[!] chrome.exe not found at: $CHROME_BIN" >&2
  exit 1
fi

EXT_WIN="$(normpath_windows "$EXT_PATH")"

if is_windows; then
  profile_base=$(printf "%s" "$USERPROFILE" | sed 's|\\|/|g')
  USER_DATA_DIR="$profile_base/AppData/Local/PrivatenessPoisonerChrome/$PROFILE_DIR"
  mkdir -p "$USER_DATA_DIR"
  USER_DATA_WIN="$(normpath_windows "$USER_DATA_DIR")"
  if tasklist.exe 2>/dev/null | grep -qiE '^chrome\.exe\s'; then
    echo "[!] Chrome appears to be running already. Close all Chrome windows first for --load-extension to take effect." >&2
  fi
else
  USER_DATA_DIR="$HOME/.cache/PrivatenessPoisonerChrome/$PROFILE_DIR"
  mkdir -p "$USER_DATA_DIR"
  USER_DATA_WIN="$USER_DATA_DIR"
  if command -v pgrep >/dev/null 2>&1 && pgrep -x chrome >/dev/null 2>&1; then
    echo "[!] Chrome appears to be running already. Close all Chrome windows first for --load-extension to take effect." >&2
  fi
  if command -v pgrep >/dev/null 2>&1 && pgrep -x chromium >/dev/null 2>&1; then
    echo "[!] Chromium appears to be running already. Close all Chromium windows first for --load-extension to take effect." >&2
  fi
fi

echo "[i] Launching Chrome with unpacked extension from: $EXT_PATH"
echo "[i] User data dir: $USER_DATA_DIR"

# shellcheck disable=SC2086
"$CHROME_BIN" \
  --no-default-browser-check \
  --no-first-run \
  --user-data-dir="$USER_DATA_WIN" \
  --load-extension="$EXT_WIN" \
  about:blank >/dev/null 2>&1 &
