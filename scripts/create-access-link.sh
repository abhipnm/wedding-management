#!/usr/bin/env bash
# Generates a new 6-digit Group ID that grants full access to the app, and
# prints it plus the shareable link. Same thing the "Generate a new Group
# ID" button on the landing page does — this is just the terminal version,
# handy for generating a batch of codes at once.
#
# Usage:
#   ./scripts/create-access-link.sh ["Label, e.g. Bride's mom"] [base-url]

set -euo pipefail

LABEL="${1:-}"
BASE_URL="${2:-http://localhost:8000}"

cd "$(dirname "$0")/.."

RESULT=$(supabase db query --linked "select token from public.generate_access_code($( [ -n "$LABEL" ] && echo "'${LABEL}'" || echo "null" ));" -o json 2>&1)

TOKEN=$(echo "$RESULT" | python3 -c "
import json, sys
try:
    raw = sys.stdin.read()
    d = json.loads(raw[raw.index('{'):])
    print(d['rows'][0]['token'])
except Exception:
    sys.exit(1)
" 2>/dev/null) || { echo "Couldn't generate a code:" >&2; echo "$RESULT" >&2; exit 1; }

echo "Group ID: ${TOKEN}"
echo "Link: ${BASE_URL}/?t=${TOKEN}"
