#!/usr/bin/env bash
set -euo pipefail

# Exfil API bash test script
# Usage examples:
#   BASE_URL=http://127.0.0.1:9095 ./scripts/test_exfil.sh --files /abs/pic.jpg
#   ./scripts/test_exfil.sh --plan Starter --files /abs/pic.jpg /abs/clip.mp4
#   ./scripts/test_exfil.sh --plan Pro --files /abs/pic.jpg --txid REAL_TXID --ipfs
#
# Notes:
# - Requires curl. IPFS upload step requires jq to parse out.json.
# - API keys are read from below (generated in exfil/keys.json).

BASE_URL=${BASE_URL:-http://localhost:9095}
PLAN=Starter
TXID=""
DO_IPFS=0
FILES=()

# API keys (from exfil/keys.json)
STARTER_KEY="NCH_starter_Bm6pQeWcH3J7K2d8zX4rL1aV9yT0fS"
PRO_KEY="NCH_pro_T8xZ1qLmP4vR9cJ2sN7eH5kD3bU6wY"

usage() {
  echo "Usage: $0 [--plan Starter|Pro] --files /abs/a [ /abs/b ... ] [--txid TXID] [--ipfs]" >&2
  exit 2
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      PLAN="$2"; shift 2;;
    --files)
      shift
      while [[ $# -gt 0 && "$1" != --* ]]; do FILES+=("$1"); shift; done;;
    --txid)
      TXID="$2"; shift 2;;
    --ipfs)
      DO_IPFS=1; shift;;
    *) usage;;
  esac
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No files provided. Use --files /abs/a [/abs/b ...]" >&2
  exit 2
fi

if [[ "$PLAN" != "Starter" && "$PLAN" != "Pro" && "$PLAN" != "Free" ]]; then
  echo "Unsupported plan: $PLAN" >&2
  exit 2
fi

API_KEY=""
if [[ "$PLAN" == "Starter" ]]; then API_KEY="$STARTER_KEY"; fi
if [[ "$PLAN" == "Pro" ]]; then API_KEY="$PRO_KEY"; fi

echo "Base: $BASE_URL | Plan: $PLAN"

# 1) Address
echo "== Address =="
curl -sf "$BASE_URL/api/payments/address" || { echo; echo "Address call failed" >&2; exit 1; }
echo

# 2) Optional: verify payment
if [[ -n "$TXID" ]]; then
  echo "== Verify ($TXID) =="
  curl -sf -X POST "$BASE_URL/api/payments/verify" \
    -H 'content-type: application/json' \
    -d "{\"txid\":\"$TXID\"}" || { echo; echo "Verify failed" >&2; exit 1; }
  echo
fi

# 3) Clean
echo "== Clean =="
CURL_ARGS=( -s -X POST "$BASE_URL/api/clean" )
CURL_ARGS+=( -H "x-plan: $PLAN" )
if [[ -n "$API_KEY" ]]; then CURL_ARGS+=( -H "x-api-key: $API_KEY" ); fi
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then echo "Not a file: $f" >&2; exit 2; fi
  CURL_ARGS+=( -F "files=@$f" )
done

# Save to out.json in CWD
CLEAN_OUT="out.json"
curl "${CURL_ARGS[@]}" | tee "$CLEAN_OUT" >/dev/null || { echo "Clean failed" >&2; exit 1; }
echo "Saved: $CLEAN_OUT"

# 4) Optional IPFS (Pro only)
if [[ "$PLAN" == "Pro" && $DO_IPFS -eq 1 ]]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq not found; skipping IPFS upload. Install jq to enable." >&2
    exit 0
  fi
  FILENAME=$(jq -r '.results[0].filename // empty' "$CLEAN_OUT")
  DATA=$(jq -r '.results[0].dataBase64 // empty' "$CLEAN_OUT")
  if [[ -z "$FILENAME" || -z "$DATA" ]]; then
    echo "No result to upload to IPFS" >&2; exit 0
  fi
  echo "== IPFS upload ($FILENAME) =="
  curl -sf -X POST "$BASE_URL/api/ipfs/add" \
    -H 'content-type: application/json' \
    -H 'x-plan: Pro' \
    -H "x-api-key: $API_KEY" \
    -d "{\"filename\":\"$FILENAME\",\"dataBase64\":\"$DATA\"}" || { echo; echo "IPFS upload failed" >&2; exit 1; }
  echo
fi

echo "Done"
