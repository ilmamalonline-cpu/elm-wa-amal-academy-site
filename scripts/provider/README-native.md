# Native Phase 2 local test components

This is the canonical native-provider path, authorized only for synthetic data on the current sandbox. It uses real components, not a complete Supabase CLI/Docker/gateway stack. The incompatible alternative adapter/installer and its commands have been retired by owner decision; see [the retirement inventory](../../docs/phase-2-provider-collisions.md). Do not restore or apply the alternative to this database.

## Components actually exercised

- PostgreSQL16.15: `/workspace/phase2-tools/root/usr/lib/postgresql/16/bin`, data `/workspace/phase2-runtime/pgdata`, TCP127.0.0.1:55432. Database `phase2_provider_test` is separate from the original `phase2_test` harness. JIT is disabled for the provider test database because this extracted runtime does not ship LLVM.
- [Supabase Auth](https://github.com/supabase/auth/releases/tag/v2.197.0) v2.197.0, commit `4eee58f296d9698a1c2c0ae14d7a0b379c7622d3`, native binary `/workspace/phase2-provider-runtime/bin/gotrue`. Source archive SHA256 `04ec4c36926121abdccce20061633d0a5c41afae5487d75e7367fb2627eec885`; binary SHA256 `b5f84e8e119b55731e3bc4924dcbbfe860c93c653038e5af20fe9a5a963d4afb`. Listener127.0.0.1:55441, dedicated non-superuser login `supabase_auth_admin`, schema search path `auth,public`.
- [Supabase Storage](https://github.com/supabase/storage/releases/tag/v1.83.5) v1.83.5, commit `c826a70ac6e6f56d3e6033ccb164fb1ff5282570`, source `/workspace/phase2-provider-runtime/storage-src`. Its package manifest retains the unrelated package version1.11.2; release/commit above identify the actual tested source. `npm ci --ignore-scripts`, build and `npm rebuild fs-xattr` were used outside the project. Listener127.0.0.1:55442; dedicated `supabase_storage_admin` can assume standard Storage roles. File backend `/workspace/phase2-provider-runtime/storage-data`, no S3/image processing/queue/telemetry integration enabled.
- [PostgREST](https://docs.postgrest.org/en/v16/references/configuration.html)16.4, binary `/workspace/phase2-provider-tools/postgrest/postgrest`. API127.0.0.1:55443, readiness127.0.0.1:55444. Login `phase2_rest` can assume anon/authenticated but **not service_role**. Only safe `api` views are exposed; live JWT/session pre-request hook, no public privileged RPCs.
- [Mailpit](https://mailpit.axllent.org/docs/configuration/runtime-options/)1.31.6, binary `/workspace/phase2-provider-tools/mailpit/mailpit`, archive SHA256 `10fa12ccc610f653d4ed4df848c1817f9935dcf4e9a6a458a19ab0fa02093f91`. SMTP127.0.0.1:55445, HTTP127.0.0.1:55446; no forwarding/relay. Disable version checks and reverse DNS. Recovery addresses are reserved `.invalid` fixtures, never real recipients.

## Canonical contracts and offline checks

The application still imports `src/lib/phase2/security.ts`. Native issuer is `http://127.0.0.1:55441`, audience/role `authenticated`, ES256 user tokens with live native session/profile checks and a maximum 900-second lifetime. PostgREST exposes only nine safe `api` views; the app reads metadata through PostgreSQL RLS. Private bucket `phase2-private` has no direct end-user policies: Storage bytes are fetched only by the server after metadata authorization. There is no gateway `/storage/v1` prefix or direct-client Storage adapter.

`scripts/provider-plan.mjs` pins the three canonical SQL inputs. Changed inputs require an explicit source-contract review/fingerprint update, not bypassing the check. `scripts/provider-roles.mjs` defines allowed role flags and memberships; application/REST startup validates them read-only and refuses unsafe drift without repair.

```bash
npm run phase2:native:plan       # offline: does not import pg or open a socket
npm run phase2:native:init       # also defaults to offline planning now
npm run test:phase2:hardening    # offline mocks/catalog-contract tests only
# Optional: creates/stops/removes a NEW temporary PostgreSQL16 cluster;
# refuses an occupied port55432 rather than touching an existing service:
PHASE2_PROVIDER_INIT_TEST=synthetic-only npm run test:phase2:init-postgres
```

`PHASE2_PROVIDER_RENDER_SQL=/new/path.sql npm run phase2:native:plan` writes the combined application SQL with mode600 and exclusive creation; existing files are never overwritten. The generated SQL is review material, not an instruction to run it manually outside the guarded initializer. Storage migration/guard SQL remains separate.

## Prepared local launch, not clean installation

No native component service was started during hardening. Do not assume the prepared database is running. Native services require the extracted local PostgreSQL cluster on loopback55432 and the dedicated roles/ownership already prepared during the earlier acceptance. These launchers are **not a portable clean-machine installer**. Tests overwrite synthetic fixtures; never point them at real data or a concurrent reviewer's session.

Runtime `/workspace/phase2-provider-runtime` must be mode700; `keys.json` and generated `storage.env` must be mode600, outside source and not symlinks. The Storage data directory must be mode700. Unexpected upstream `.env`, `.env.local` or `.env.production` files refuse launch. Storage child environments are isolated from inherited service settings. `keys-create.mjs` still refuses listening provider ports and unacknowledged replacement; cold-start/key rotation remains unvalidated.

For a **previously provisioned, reviewed local fixture**, run separate managed local processes:

```bash
/workspace/phase2-provider-tools/mailpit/mailpit --listen 127.0.0.1:55446 --smtp 127.0.0.1:55445 --disable-version-check --smtp-disable-rdns --quiet
scripts/provider/auth-start.sh serve
PHASE2_PROVIDER_STORAGE_START=prepared-synthetic-only scripts/provider/storage-start.sh
node scripts/provider/rest-start.mjs
NEXT_TELEMETRY_DISABLED=1 npm run build
node scripts/provider/app-start.mjs
PHASE2_PROVIDER_TEST=synthetic-only npm run test:phase2:native
```

Application/REST startup uses read-only catalog checks and never provisions the schema. The app binds127.0.0.1:3403; its Storage credential remains server-only. Ordinary `npm start` does not enable identity. Auth has public signup/phone/external providers disabled and uses only the local SMTP sink. Fixture helpers accept known synthetic labels and reserved `.invalid` emails; no child login is created.

**Storage limitation:** v1.83.5 always calls `runMigrationsOnTenant` during startup; supported strategies are `on_request`, `progressive` and `full_fleet`, not `disabled`. The launcher therefore requires explicit prepared-synthetic startup opt-in and read-only checks for exact canonical target/role, prepared tables, buckets/objects RLS, zero direct policies, private bucket state and exact source migration IDs/names/hashes. It sets `DB_ALLOW_MIGRATION_REFRESH=false` and starts only prebuilt artifacts, with no npm install/build. These guards are not a guarantee of migration-free upstream startup or immunity to check/start races.

## Explicit provisioning, only on a fresh disposable local fixture

Do not run these steps on the existing prepared application database. Native PostgreSQL roles/ownership and upstream binaries/build artifacts must be provisioned/reviewed separately; installation is not hidden in startup. The revised sequence below is documented but has **not** been exercised end-to-end against native services during hardening.

1. Migrate native Auth explicitly: `PHASE2_PROVIDER_MIGRATE=synthetic-only scripts/provider/auth-start.sh migrate`. Normal `serve` refuses this migration opt-in; the GoTrue serve command has no migration path in the pinned source.
2. Review `npm run phase2:native:plan`, then, only on a fresh native-Auth database, use:

   ```bash
   PHASE2_PROVIDER_DATABASE_URL=postgresql://ubuntu@127.0.0.1:55432/phase2_provider_test \
   PHASE2_PROVIDER_ALLOW_INIT=synthetic-only npm run phase2:native:apply
   ```

   Base application plus provider SQL execute in one advisory-locked transaction. Native Auth tables are preserved. Existing public relations/application namespaces, unsafe roles, missing Auth tables and source drift refuse without repair. No automatic reset is performed. New synthetic PostgreSQL tests prove rollback/retry and contention behavior, not full native cold installation.
3. With prepared native Storage artifacts, use `PHASE2_PROVIDER_MIGRATE=synthetic-only scripts/provider/storage-provision.sh`. It regenerates fixed configuration, validates only the target (so a fresh unmigrated Storage schema is allowed), then invokes upstream `npm run migration:run`; it never installs, builds or starts a listener.
4. Explicitly review/apply `db/phase2-provider-storage.sql` only to this disposable local database after native Storage migrations. It grants standard schema usage and rejects public buckets/direct end-user policies. It is separate from the atomic application initializer. Startup then requires the stricter prepared-catalog checks described above; a missing bucket may subsequently be created by the trusted synthetic fixture helper, never publicly.

If initialization fails, the application transaction rolls back. If the connection is lost around commit, inspect the existing catalog before a manual retry. Existing/partial application namespaces are deliberately refused; diagnose with a separate disposable copy rather than resetting the prepared database. No hosted migrations, operational recovery or real-user procedure is authorized.

See [fresh hardening results and limitations](../../docs/phase-2-provider-hardening.md). Historical native acceptance, policy gates, scanner/uploads, delivery, deployment, TLS/gateway and Phase 3 remain separate.
