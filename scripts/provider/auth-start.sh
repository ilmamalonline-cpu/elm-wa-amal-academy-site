#!/usr/bin/env bash
# Local synthetic native GoTrue only. No hosted endpoint or real account.
set -Eeuo pipefail
umask 077
ROOT_RUNTIME=/workspace/phase2-provider-runtime
KEYS_FILE="$ROOT_RUNTIME/keys.json"
BIN="$ROOT_RUNTIME/bin/gotrue"
DB_URL=postgres://supabase_auth_admin@127.0.0.1:55432/phase2_provider_test
ACTION="${1:-serve}"
[[ -x "$BIN" && -r "$KEYS_FILE" ]] || { echo 'Missing local Auth binary/ephemeral keys' >&2; exit 2; }
[[ "$(stat -c '%a' "$KEYS_FILE")" == 600 ]] || { echo 'Runtime key file must be mode600' >&2; exit 2; }
mapfile -t _key_exports < <(python3 - "$KEYS_FILE" <<'PY'
import json,shlex,sys
with open(sys.argv[1]) as f: d=json.load(f)
private=dict(d['privateJwk']); private['key_ops']=['sign','verify']
keys=[private]+[k for k in d['jwksVerify']['keys'] if k['kty']=='oct']
print('GOTRUE_JWT_KEYS='+shlex.quote(json.dumps(keys,separators=(',',':'))))
print('GOTRUE_JWT_SECRET='+shlex.quote(d['jwtSecret']))
PY
)
for assignment in "${_key_exports[@]}"; do eval "export $assignment"; done
export GOTRUE_DB_DRIVER=postgres DATABASE_URL="$DB_URL" DB_NAMESPACE=auth
export API_EXTERNAL_URL=http://127.0.0.1:55441 GOTRUE_JWT_ISSUER=http://127.0.0.1:55441
export GOTRUE_SITE_URL=http://127.0.0.1:3403 GOTRUE_URI_ALLOW_LIST='http://127.0.0.1:3403/**'
export GOTRUE_API_HOST=127.0.0.1 PORT=55441 GOTRUE_JWT_EXP=900 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
export GOTRUE_DISABLE_SIGNUP=true GOTRUE_MAILER_AUTOCONFIRM=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_EXTERNAL_PHONE_ENABLED=false
export GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true
export GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=0
export GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=55445 GOTRUE_SMTP_ADMIN_EMAIL=no-reply@phase2.example.invalid GOTRUE_SMTP_SENDER_NAME='Synthetic Local Auth'
export GOTRUE_SMTP_MAX_FREQUENCY=0s GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 LOG_LEVEL=error
case "$ACTION" in
 migrate)
  [[ "${PHASE2_PROVIDER_MIGRATE:-}" == synthetic-only ]] || {
    echo 'refusing Auth migration: set PHASE2_PROVIDER_MIGRATE=synthetic-only for the disposable local database' >&2
    exit 2
  }
  exec "$BIN" migrate
  ;;
 serve)
  # GoTrue v2.197.0 serve only opens the DB and starts HTTP; migration is a
  # separate Cobra command. Keep migration opt-in out of ordinary serving.
  [[ "${PHASE2_PROVIDER_MIGRATE:-}" != synthetic-only ]] || {
    echo 'refusing Auth serve while migration opt-in is set; run migrate separately, then unset it' >&2
    exit 2
  }
  exec "$BIN" serve
  ;;
 *) echo 'usage: auth-start.sh {migrate|serve}' >&2; exit 2 ;;
esac
