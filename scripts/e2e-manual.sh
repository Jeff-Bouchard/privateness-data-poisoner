#!/usr/bin/env bash
# Privateness.network Data Poisoner: Active Warfare MV3 — Manual E2E routine runner (Git Bash)
# This script does not automate the browser; it prints a deterministic checklist and can open helper URLs.
# Usage:
#   ./scripts/e2e-manual.sh [--browser brave|chrome] [--profile DIR] [--ext PATH]

set -euo pipefail

BROWSER="brave"
PROFILE_DIR="Default"
EXT_PATH="$(cd "$(dirname "$0")/.." && pwd)"

find_brave() {
  local CANDIDATES=(
    "/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
    "/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"
    "$LOCALAPPDATA/BraveSoftware/Brave-Browser/Application/brave.exe"
  )
  for p in "${CANDIDATES[@]}"; do
    [[ -n "$p" && -f "$p" ]] && { echo "$p"; return 0; }
  done
  if command -v brave.exe >/dev/null 2>&1; then
    command -v brave.exe; return 0
  fi
  echo ""; return 1
}

find_chrome() {
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
}

maybe_kill_running_browser() {
  local proc
  case "$BROWSER" in
    brave) proc="brave.exe";;
    chrome) proc="chrome.exe";;
    *) return 0;;
  esac

  if tasklist.exe 2>/dev/null | grep -qiE "^${proc//./\\.}\\s"; then
    echo
    echo "[!] $proc is currently running. Chromium often ignores new --load-extension flags while running."
    read -r -p "Close all $BROWSER windows for you now (taskkill /IM $proc /F)? [y/N] " ans
    if [[ "${ans:-}" =~ ^[Yy]$ ]]; then
      taskkill.exe /IM "$proc" /F >/dev/null 2>&1 || true
      echo "[i] Terminated $proc."
    else
      echo "[i] Not terminating $proc. If the extension doesn't load, close the browser manually and rerun." >&2
    fi
  fi
}

open_extensions_page() {
  local bin url
  url="$1"
  case "$BROWSER" in
    brave) bin="$(find_brave || true)";;
    chrome) bin="$(find_chrome || true)";;
    *) bin="";;
  esac
  if [[ -n "$bin" && -f "$bin" ]]; then
    "$bin" "--profile-directory=$PROFILE_DIR" "$url" >/dev/null 2>&1 &
  else
    echo "[i] Open manually: $url" >&2
  fi
}

print_help() {
  cat <<'EOF'
Usage: scripts/e2e-manual.sh [options]
  --browser brave|chrome   Which loader script to use (default: brave)
  --profile DIR            Browser profile directory name (default: Default)
  --ext PATH               Path to unpacked extension root (default: repo root)
  -h, --help               Show help

Notes:
- This is an interactive checklist runner, not an automated test.
- It assumes Git Bash on Windows.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --browser) BROWSER="$2"; shift 2;;
    --profile) PROFILE_DIR="$2"; shift 2;;
    --ext) EXT_PATH="$2"; shift 2;;
    -h|--help) print_help; exit 0;;
    *) echo "Unknown option: $1" >&2; print_help; exit 1;;
  esac
done

if [[ ! -f "$EXT_PATH/manifest.json" ]]; then
  echo "[!] manifest.json not found under --ext path: $EXT_PATH" >&2
  exit 1
fi

pause() {
  local msg="$1"
  echo
  echo "==> $msg"
  read -r -p "Press Enter to continue..." _
}

open_url() {
  local url="$1"
  # Detach open via cmd.exe
  cmd.exe /c start "" "$url" >/dev/null 2>&1 || true
}

launch_browser_with_extension() {
  local loader
  case "$BROWSER" in
    brave) loader="$(cd "$(dirname "$0")" && pwd)/install-brave.sh";;
    chrome) loader="$(cd "$(dirname "$0")" && pwd)/install-chrome.sh";;
    *) echo "[!] Unsupported --browser: $BROWSER" >&2; exit 1;;
  esac
  if [[ ! -f "$loader" ]]; then
    echo "[!] Loader script missing: $loader" >&2
    exit 1
  fi
  echo "[i] Launching $BROWSER with unpacked extension: $EXT_PATH"
  echo "[i] Profile directory: $PROFILE_DIR"
  "$loader" -e "$EXT_PATH" -p "$PROFILE_DIR"
}

cat <<EOF
Manual E2E routine (no dependencies)
==================================
Browser: $BROWSER
Profile: $PROFILE_DIR
Extension: $EXT_PATH

This script will:
- Launch the browser with the unpacked extension (current session).
- Open helper pages: extensions page, and the options page (you still need to click around).
- Walk you through the assertions: Strict default, Live Log reuse, Poison events, banner + funnel markers.
EOF

cat <<'EOF'
IMPORTANT (Windows / Chromium behavior)
- This script can optionally close your browser (with explicit confirmation) so the extension flags apply.
EOF

pause "0) Launch browser with the unpacked extension"
maybe_kill_running_browser
launch_browser_with_extension

pause "Open extensions page (reload / inspect service worker here)"
echo "[i] Opening extensions page..."
open_extensions_page "brave://extensions"
open_extensions_page "chrome://extensions"

cat <<'EOF'
CHECKPOINT 0A (clean start)
- Click the extension Reload icon.
- Click 'Service worker' (Inspect).
- Optional clean-config run: in SW DevTools console run:
    chrome.storage.local.clear()
  Then close SW DevTools and Reload extension again.
EOF
pause "Confirm clean start steps completed"

cat <<'EOF'
CHECKPOINT 1 (Options defaults + persistence)
- Open the Options page (the extension card has an 'Options' link).
- Assert:
  - Mode default is: Strict + Data Poisoning
  - poisonConfig defaults exist (RID/jitter enabled; fake PII disabled; meme banner disabled)
- Enable Meme banner, Save/Apply
- Reload Options page
- Assert Meme banner stays enabled
EOF
pause "Confirm Options defaults/persistence verified"

pause "2) Open Live Log (tab)"
cat <<'EOF'
CHECKPOINT 2 (Live Log tab and reuse)
- In Options: click 'Live log (tab)'
- Assert a live.html tab opens
- Click 'Live log (tab)' again
- Assert the existing live.html is reused (no duplicates)
EOF
pause "Confirm Live Log reuse verified"

cat <<'EOF'
CHECKPOINT 3 (Generate strict-mode poisoning events)
- Open a tracker-heavy site in a normal tab (NOT whitelisted)
- In Live Log:
  - Ensure Play is enabled
  - Scope = All if you want cross-tab stream
- Interact with the site for 10–30s (scroll/click)

Assert in Live Log:
- You see 'Poison' events (and possibly 'DNR')
- URL column shows remote endpoint (not live.html)
- Type filters hide/show rows correctly
EOF
pause "Confirm Poison/DNR events appear and filtering works"

cat <<'EOF'
CHECKPOINT 4 (Payload semantics in poison preview)
From Options 'Recent threats' (or Live if preview is shown there):
- Open a poison preview and assert markers:

URL-encoded payloads:
- rid, j
- funnel, ab, cv, sid, src
- poise_banner (if Meme banner enabled)

JSON payloads:
- meta.poise_ts, meta.poise_rid
- meta.poise_noise
- meta.poise_funnel
- meta.poise_banner (if Meme banner enabled)
EOF
pause "Confirm payload markers verified"

cat <<'EOF'
CHECKPOINT 5 (Audit mode non-mutation sanity)
- Enable Audit/Diagnostic mode in Options
- Repeat CHECKPOINT 3
- Assert requests are not mutated/poisoned (pass-through)
EOF
pause "Confirm Audit mode sanity verified"

echo
echo "[+] Manual E2E routine complete."
