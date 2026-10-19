# Canonical native provider: local hardening

**The canonical native path is hardened locally; Phase 3 remains closed.** All new test data was synthetic. The prepared provider database and retired implementation were not opened or modified. No provider service, hosted migration, deployment, commit or push was performed.

## What changed

**Initialization is offline by default and atomic when explicitly applied.** `scripts/provider-plan.mjs` pins SHA-256 fingerprints for the three canonical SQL inputs. Any source drift, including otherwise harmless edits, refuses planning until explicitly reviewed. The existing checked Auth-preserving transformation was extracted, not replaced with the retired converter. `provider-init.mjs` now defaults to `--plan`; `--apply` requires the exact disposable database URL and `PHASE2_PROVIDER_ALLOW_INIT=synthetic-only`.

One dedicated PostgreSQL connection wraps the base application schema, native API views, grants and MFA helper in one transaction. A transaction-scoped advisory lock refuses concurrent initialization. Preflight rejects any existing public relation/application namespace, missing native Auth tables, the wrong database/operator/host or PostgreSQL older than 16. Native Auth provisioning and Storage migrations remain separate; this is not a transaction spanning multiple services.

**Unsafe roles fail closed instead of being repaired.** `scripts/provider-roles.mjs` checks login, superuser, BYPASSRLS, create-role/database, replication and required inheritance attributes. It allowlists application/REST membership edges, rejects unexpected privilege bridges/admin options and disallows entry paths into the trusted definer/bootstrap roles. BYPASSRLS is permitted only for the designated non-login definer and native service role. Application and REST launchers use a read-only catalog preflight, so post-initialization role drift also blocks startup. Initial provisioning of native roles remains an operator prerequisite, not a new automatic installer.

**Normal launch is separated from explicit preparation.** Auth migration requires its own synthetic-only opt-in. Storage startup no longer installs packages or builds upstream code. Storage preparation regenerates fixed loopback-only configuration from restricted runtime keys, refuses symlinks/unsafe permissions and unexpected dotenv files, and isolates the upstream process environment. Explicit Storage provisioning has a separate command and opt-in; it validates the target without incorrectly requiring migrations to be complete already.

Storage startup additionally requires `PHASE2_PROVIDER_STORAGE_START=prepared-synthetic-only` and read-only checks for the canonical non-superuser target, safe application roles, required Storage tables, RLS on buckets/objects, zero direct bucket/object policies, no public `phase2-private` bucket, and exact numeric migration IDs/names/upstream hashes. These checks do not create a bucket or repair catalog drift.

**Private delivery and fixtures have negative coverage.** The application continues to authorize metadata through RLS before server-mediated native Storage reads. It now requires UUID-derived object names matching the file ID/MIME, strict size/hash formats, exact native origin, safe credentials, decimal Content-Length and bounded complete streams. Redirects, malformed lengths, overflow, truncation, stream errors, bad hashes and bad signatures fail closed. Test helpers require synthetic opt-in before key reads/network/fixture mutation, immutable known-label allowlists and reserved `.invalid` identities; real addresses and remote/credential-bearing URL routes are refused.

## Fresh checks

| Check actually run | Result | Evidence |
|---|---|---|
| Offline planner/roles, fixtures, launchers, Storage guards and retirement boundary | 34 passed | [offline.log](checks/phase2-hardening/offline.log) |
| Offline native download/configuration/stream negatives | 6 passed | [same log](checks/phase2-hardening/offline.log) |
| Fresh temporary PostgreSQL16 initialization/runtime/Storage catalogs | 8 passed | [init-postgres.log](checks/phase2-hardening/init-postgres.log) |
| Original independent database + API regressions | 18 DB + 23 API passed | [original-regression.log](checks/phase2-hardening/original-regression.log) |
| TypeScript, ESLint, Node/shell syntax and whitespace | Passed | [static.log](checks/phase2-hardening/static.log), launcher tests |
| Next.js production-mode build, telemetry disabled | Passed | [build.log](checks/phase2-hardening/build.log) |

The PostgreSQL tests created their own temporary clusters and stopped/removed them afterward. Auth/Storage catalog tables in the new eight-case suite are explicitly synthetic stubs, **not native-component acceptance**. Original API regression ran the current built application on loopback port 3402 against another fresh cluster on 55435. Historical logs were restored byte-for-byte. An initial offline test-double dispatch error was corrected; its failed first log remains under `checks/phase2-hardening/`.

The earlier **24/24 native acceptance** and **68/68 browser regression** results in the provider report remain historical and were not rerun. No dependency audit was rerun and no new dependency was added.

## Recovery and limitations

1. If application initialization fails before commit, PostgreSQL rolls back the entire application transaction, including new roles; a safe retry was proved. Existing/partially initialized application namespaces are refused without deletion or repair. Diagnose on a separate disposable copy; do not reset the prepared database. A connection loss at commit can have an ambiguous outcome: inspect the existing catalog before any manual retry.
2. Storage v1.83.5 **always invokes its migration runner at startup** and has no supported disabled strategy. `DB_ALLOW_MIGRATION_REFRESH=false` disables hash-mismatch refresh, not migrations. Prepared-catalog/hash checks and explicit startup opt-in reduce risk but do not guarantee migration-free upstream startup, eliminate check/start races or pin the entire upstream binary/source tree. Do not describe this limitation as solved.
3. The revised native Auth/Storage launch/provision sequence, true cold install and key rotation have not been exercised end-to-end. Provisioning native ownership/roles, upstream artifacts and the separate Storage schema guard remain explicit local operator steps. No production installer or upgrade/recovery procedure is claimed.
4. Downloads still rely on pre-marked clean synthetic fixtures, not a malware scanner. Real uploads, delivery, real-user safeguarding/recovery, retention/export/deletion, hosting/region and operational MFA/bootstrap ownership remain unapproved.

D05, D06, D08, D10 and D11 remain pending; D07 still approves only guardian-managed profiles without minor login. No Phase 3 or real-user permission follows from these tests.

## Files and preservation

The exact added/modified file inventory, SHA-256 hashes, unchanged Git HEAD, unchanged retired archive, historical-evidence preservation and final listener state are recorded in [after.json](checks/phase2-hardening/after.json). Before-change source fingerprints are in [before.json](checks/phase2-hardening/before.json).

A restricted canonical pre-hardening source backup is `/workspace/phase2-provider-runtime/canonical-pre-hardening.tar.gz`. The existing `/workspace/phase2-provider-runtime/retired-alternative-recovery.tar.gz` remains recovery-only and unchanged; no retired file was restored, merged or copied into the canonical path.
