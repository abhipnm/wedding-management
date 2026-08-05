#!/usr/bin/env bash
# Generate a one-time sign-in link for someone and send it to them yourself
# (WhatsApp, SMS, etc.) instead of making them type their email into the
# app's login screen.
#
# This has to run locally, never in the deployed app: it uses the Supabase
# *service role* key, which bypasses every access rule in the database. The
# web app only ever holds the public anon key, by design — this script is
# the one place that touches the privileged key, and it only ever does so
# to mint a single-use, ~1-hour link. Requires the Supabase CLI to be
# installed and logged in on this machine (same session `supabase db query`
# already uses).
#
# Usage:
#   ./scripts/generate-login-link.sh someone@example.com
#   ./scripts/generate-login-link.sh someone@example.com https://your-deployed-url.onrender.com
#
# The redirect URL (2nd arg, defaults to http://localhost:3000) must already
# be listed under Supabase Dashboard -> Authentication -> URL Configuration
# -> Redirect URLs, or the link will fail to log the person in. Add your
# Render URL there once, and it'll work for every link after that.
#
# Before handing someone a link: make sure they already have a row in
# public.user_roles for their email (Supabase Table Editor), or they'll
# sign in to an empty app with no guests visible.

set -euo pipefail

EMAIL="${1:?Usage: generate-login-link.sh <email> [redirect-url]}"
REDIRECT="${2:-http://localhost:3000}"
PROJECT_REF="espogvypdjdpujckwkiz"

SERVICE_KEY=$(supabase projects api-keys --project-ref "$PROJECT_REF" -o json | python3 -c "
import json, sys
for k in json.load(sys.stdin):
    if k.get('id') == 'service_role':
        print(k['api_key'])
        break
")

if [ -z "$SERVICE_KEY" ]; then
  echo "Couldn't fetch the service role key — is 'supabase login' still active?" >&2
  exit 1
fi

RESP=$(curl -s -X POST "https://${PROJECT_REF}.supabase.co/auth/v1/admin/generate_link" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"email\":\"${EMAIL}\",\"redirect_to\":\"${REDIRECT}\"}")

python3 -c "
import json, sys
d = json.loads('''$RESP''')
link = d.get('action_link')
if link:
    print(f'Sign-in link for {\"$EMAIL\"} (valid ~1 hour, single use):')
    print(link)
else:
    print('Error generating link:', d.get('msg') or d.get('error_description') or d, file=sys.stderr)
    sys.exit(1)
"
