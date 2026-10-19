#!/usr/bin/env bash
# Synthetic-only Storage provisioning/migration. Never use for hosted or real data.
set -Eeuo pipefail
umask 077
[[ "${PHASE2_PROVIDER_MIGRATE:-}" == synthetic-only ]] || {
  echo 'refusing Storage provisioning: set PHASE2_PROVIDER_MIGRATE=synthetic-only' >&2
  exit 2
}
ROOT=/workspace/phase2-provider-runtime
SRC="$ROOT/storage-src"
ENVFILE="$ROOT/storage.env"
PREFLIGHT="$(cd "$(dirname "$0")" && pwd)/storage-preflight.mjs"
[[ -d "$SRC/node_modules" && -f "$SRC/dist/start/server.js" ]] || {
  echo 'Storage provisioning requires prebuilt node_modules and dist/start/server.js' >&2
  exit 2
}
# Provisioning is independent of startup: prepare writes fresh fixed values,
# rather than consuming an env file that could contain stale remote settings.
node "$PREFLIGHT" prepare
set -a
source "$ENVFILE"
set +a
node "$PREFLIGHT" assert-env
node "$PREFLIGHT" check-target
cd "$SRC"
exec env -i PATH="$PATH" HOME="$ROOT" bash -c 'set -a; source "$1"; set +a; cd "$2"; exec npm run migration:run' -- "$ENVFILE" "$SRC"
