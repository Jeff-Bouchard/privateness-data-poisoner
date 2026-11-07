#!/usr/bin/env bash
# Privateness.network Data Poisoner: Active Warfare MV3 — Brave loader (Git Bash / POSIX sh compatible)
# - Temporarily loads unpacked extension into Brave via --load-extension
# - Optional: creates a .bat launcher on Desktop (no PowerShell required)
# - Does not modify Brave settings or install permanently
#
# Usage:
#   ./scripts/install-brave.sh [-e EXT_PATH] [-p PROFILE_DIR] [--create-shortcut] [--shortcut-name NAME]
# Example:
#   ./scripts/install-brave.sh -e "$(pwd)" --create-shortcut --shortcut-name "Brave - Data Poisoner: Active Warfare"

set -euo pipefail

# Default values
EXT_PATH="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="Default"
CREATE_SHORTCUT=0
SHORTCUT_NAME="Brave - Data Poisoner: Active Warfare"

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

print_help() {
  cat <<EOF
Usage: $0 [options]
  -e, --extension PATH     Path to unpacked extension (contains manifest.json)
  -p, --profile DIR        Brave profile directory name (default: Default)
      --create-shortcut    Create a Desktop .bat launcher
      --shortcut-name NAME Name of Desktop launcher (default: "$SHORTCUT_NAME")
  -h, --help               Show this help
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--extension)
      EXT_PATH="$2"; shift 2;;
    -p|--profile)
      PROFILE_DIR="$2"; shift 2;;
    --create-shortcut)
      CREATE_SHORTCUT=1; shift;;
    --shortcut-name)
      SHORTCUT_NAME="$2"; shift 2;;
    -h|--help)
      print_help; exit 0;;
    *) echo "Unknown option: $1" >&2; print_help; exit 1;;
  esac
done

# Resolve Windows-style path for Brave args
normpath_windows() {
  if ! is_windows; then
    printf '%s' "$1"
    return 0
  fi
  # Prefer pwd -W in Git Bash for Windows path, fallback to cygpath if available
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    # Best-effort: on Git Bash, paths are already usable; replace backslashes
    python - "$1" <<'PY'
import os,sys
p=sys.argv[1]
print(p.replace('/', '\\'))
PY
  fi
}

# Validate extension path
if [[ ! -d "$EXT_PATH" ]]; then
  echo "[!] Extension path not found: $EXT_PATH" >&2; exit 1
fi
if [[ ! -f "$EXT_PATH/manifest.json" ]]; then
  echo "[!] manifest.json not found in: $EXT_PATH" >&2; exit 1
fi

# Find Brave executable
find_brave() {
  if is_windows; then
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
  fi

  local CANDIDATES_LINUX=(
    "brave-browser"
    "brave"
  )
  for b in "${CANDIDATES_LINUX[@]}"; do
    if command -v "$b" >/dev/null 2>&1; then
      command -v "$b"; return 0
    fi
  done
  echo ""; return 1
}

BRAVE_PATH="$(find_brave || true)"
if [[ -z "$BRAVE_PATH" ]]; then
  echo "[!] Brave executable not found. Install Brave or add it to PATH." >&2
  exit 1
fi

# Build arguments
EXT_WIN="$(normpath_windows "$EXT_PATH")"
ARGS=("--profile-directory=$PROFILE_DIR" "--load-extension=$EXT_WIN")

# Launch Brave detached (avoid switching this terminal into cmd.exe)
launch_brave() {
  # If Brave is already running, Chromium may ignore new process flags.
  # Best practice: close all Brave windows before running this loader.
  if is_windows; then
    if tasklist.exe 2>/dev/null | grep -qiE '^brave\.exe\s'; then
      echo "[!] Brave appears to be running already. Close all Brave windows first for --load-extension to take effect." >&2
    fi
  else
    if command -v pgrep >/dev/null 2>&1 && (pgrep -x brave-browser >/dev/null 2>&1 || pgrep -x brave >/dev/null 2>&1); then
      echo "[!] Brave appears to be running already. Close all Brave windows first for --load-extension to take effect." >&2
    fi
  fi

  # Launch the Windows .exe directly; background it so Git Bash remains usable.
  # shellcheck disable=SC2086
  "$BRAVE_PATH" ${ARGS[@]} >/dev/null 2>&1 &
}

# Create Desktop .bat launcher (no PowerShell)
create_bat_shortcut() {
  if ! is_windows; then
    echo "[!] --create-shortcut is only supported on Windows." >&2
    return 1
  fi
  local desktop batpath brave_win
  desktop=$(printf "%s" "$USERPROFILE" | sed 's|\\|/|g')
  desktop="$desktop/Desktop"
  mkdir -p "$desktop"
  batpath="$desktop/${SHORTCUT_NAME}.bat"
  brave_win="$(normpath_windows "$BRAVE_PATH")"
  {
    printf "@echo off\r\n"
    printf "setlocal enableextensions\r\n"
    printf "\"%s\" %s %s\r\n" "$brave_win" "--profile-directory=$PROFILE_DIR" "--load-extension=$EXT_WIN"
  } > "$batpath"
  echo "[+] Created launcher: $batpath"
}

# Actions
if [[ "$CREATE_SHORTCUT" -eq 1 ]]; then
  create_bat_shortcut
fi

echo "[i] Launching Brave with extension from: $EXT_PATH"
launch_brave

echo "[i] Note: This loads the unpacked extension for the current Brave session/profile."
