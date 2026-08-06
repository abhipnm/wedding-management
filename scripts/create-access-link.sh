#!/usr/bin/env bash
# Creates a shareable access link for a role and prints the URL to send.
#
# Set up the role first (one time, via Supabase Table Editor or `supabase
# db query`):
#   1. Add a row to `roles`: name = "Family", is_admin = false
#      (or is_admin = true for a link that sees everything)
#   2. For a non-admin role, add rows to `role_relations` for each relation
#      it should see, e.g. (role_id, 'Family') / (role_id, 'Neighbors')
#
# Then run this to mint a link for that role:
#   ./scripts/create-access-link.sh "Family" "https://your-deployed-url"
#
# Every run creates a NEW token — running it twice for the same role gives
# you two different links, both valid, both scoped the same way. There's
# no expiry and no login: whoever has the URL sees what the role grants,
# same trade-off as the rest of this account's "share a link" apps.

set -euo pipefail

ROLE_NAME="${1:?Usage: create-access-link.sh <role-name> [base-url] [label]}"
BASE_URL="${2:-http://localhost:8000}"
LABEL="${3:-}"

cd "$(dirname "$0")/.."

TOKEN=$(python3 -c "import secrets; print(secrets.token_hex(12))")

RESULT=$(supabase db query --linked "
insert into public.access_links (token, role_id, label)
select '${TOKEN}', id, nullif('${LABEL}', '')
from public.roles where name = '${ROLE_NAME}'
returning token;
" -o json 2>&1)

if ! echo "$RESULT" | grep -q "$TOKEN"; then
  echo "Couldn't create the link — does a role named \"${ROLE_NAME}\" exist? (Table Editor > roles)" >&2
  echo "$RESULT" >&2
  exit 1
fi

echo "Link for \"${ROLE_NAME}\":"
echo "${BASE_URL}/?t=${TOKEN}"
