#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/workspace/phase2-provider-runtime
SRC="$ROOT/storage-src"
DATA="$ROOT/storage-data"
KEYS="$ROOT/keys.json"
ENVFILE="$ROOT/storage.env"
PREFLIGHT="$(cd "$(dirname "$0")" && pwd)/storage-preflight.mjs"

# Refuse before any runtime write, including config/data directory creation.
[[ "${PHASE2_PROVIDER_STORAGE_START:-}" == prepared-synthetic-only ]] || {
  echo 'refusing Storage startup: set PHASE2_PROVIDER_STORAGE_START=prepared-synthetic-only' >&2
  exit 2
}
[[ -r "$KEYS" ]] || { echo "missing $KEYS (main must create it chmod 600)" >&2; exit 2; }
[[ -d "$SRC/node_modules" ]] || { echo "missing prepared Storage node_modules; run the synthetic-only provisioning step" >&2; exit 2; }
[[ -f "$SRC/dist/start/server.js" ]] || { echo "missing prepared Storage dist/start/server.js; run the synthetic-only provisioning step" >&2; exit 2; }
node "$PREFLIGHT" prepare
set -a; source "$ENVFILE"; set +a
node "$PREFLIGHT" assert-env
node "$PREFLIGHT" check-db
cd "$SRC"
# Storage v1.83.5 always calls runMigrationsOnTenant during server startup.
# on_request is the least invasive supported strategy; no migration-free
# upstream strategy exists (only on_request/progressive/full_fleet).
exec env -i PATH="$PATH" HOME="$ROOT" bash -c 'set -a; source "$1"; set +a; cd "$2"; exec npm run start' -- "$ENVFILE" "$SRC"
