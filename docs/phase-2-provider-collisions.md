# Provider collision resolved: inactive alternative retired

**The owner chose retirement, not reconciliation or a separate experiment.** The inactive, incompatible implementation has been removed from the working source tree. The native-provider path remains canonical; this cleanup does not authorize Phase 3, deployment or real users.

## Canonical path retained

The application imports `src/lib/phase2/security.ts`, including its explicit `synthetic-provider-only` mode. The native test database is `phase2_provider_test`; Auth is 127.0.0.1:55441, Storage 55442, PostgREST 55443 and application 3403. `scripts/provider-init.mjs`, `db/phase2-provider.sql`, `db/phase2-provider-storage.sql`, `scripts/provider/*`, `tests/provider-helpers.mjs` and `tests/phase2-provider-{auth,data}.test.mjs` are this integration. Use `test:phase2:native` only with explicit synthetic-only opt-in and prepared local services. The original `phase2_test` harness remains separate and intact.

## Removed from the working tree

| Removed file | Retired purpose |
|---|---|
| `src/lib/phase2/local-supabase.ts` | Unmounted alternate HTTP adapter. |
| `db/supabase-local-storage.sql` | Alternate bucket `phase2-synthetic-evidence`, incompatible with canonical `phase2-private`. |
| `scripts/provider-schema.mjs` | Alternate converter targeting `phase2_supabase_test`. |
| `scripts/supabase-local-install.mjs` | Alternate installer/plan generator. |
| `tests/local-supabase.test.ts` | Alternate offline adapter tests. |
| `tests/provider-schema.test.mjs` | Alternate converter tests. |
| `tests/supabase-local-safety.test.mjs` | Alternate installer/smoke gating tests. |
| `tests/provider-postgres-contract.test.mjs` | Alternate PostgreSQL contract harness. |
| `tests/local-supabase-provider.test.ts` | Alternate opt-in provider smoke suite. |

Removed npm commands: `test:supabase:contracts`, `test:supabase:provider`, `supabase:local:plan` and `supabase:local:install`. Obsolete `PHASE2_SUPABASE_*` examples and the README's alternate run instructions were removed. No replacement compatibility shim or installer redirects remain. The new `test:phase2:retirement` command checks the removal and canonical wiring offline.

## Historical evidence and recovery

At the earlier native-provider review, these nine files were preserved byte-for-byte and the owner choice was still open. That historical preservation is now superseded by the explicit retirement decision. The incompatible approaches had different database guards, JWT assumptions, URL prefixes, roles, buckets and converters; no merge was attempted.

Original logs under `docs/checks/supabase-local/` and `docs/checks/phase2-provider/` remain unchanged as historical evidence only. In particular, `docs/checks/supabase-local/planned-schema.sql` is a historical generated artifact, **not an approved migration or current installer input**. Old file inventories, package listings and test results in those directories describe the pre-retirement tree and do not imply that the removed stack is supported or provider-accepted.

The original internal collision snapshot remains at `/workspace/phase2-provider-runtime/concurrent-tree-preserved.tar.gz`. A restricted, SHA-256-verified recovery-only archive of exactly the nine removed files is `/workspace/phase2-provider-runtime/retired-alternative-recovery.tar.gz`, outside the project and without any launch wiring. It is rollback evidence, not a maintained experiment; restoring or reconciling it requires a new explicit decision. Since most project files were already untracked, Git diff alone is not a reliable before/after inventory. The retirement fingerprints are in [before.json](checks/phase2-retirement/before.json).

## Authorization remains local and synthetic

No native application/security/SQL/launcher/test behavior was changed. No installer, database reset, provider start, migration, key rotation, hosted-service action, real data use, commit, push or deployment is part of this retirement. Existing unrelated local processes and databases are not cleanup targets. The historical native-provider acceptance results remain those in [the native report](phase-2-provider-report.md); they must not be presented as newly rerun acceptance.

## Retirement verification

- [Offline/static checks](checks/phase2-retirement/static.log): **5/5 retirement checks passed**, TypeScript passed, ESLint passed and `git diff --check` passed.
- [Preservation and HTTP checks](checks/phase2-retirement/preservation-and-http.json): all **42 retained code/configuration/test files** in the pre-change preservation inventory are byte-for-byte unchanged; all nine retired files are absent; dependency declarations still match the unchanged lockfile and Git HEAD is unchanged. Documentation and the intended package-command changes are outside this preservation set.
- [Production-mode build](checks/phase2-retirement/build.log): passed in an isolated temporary project copy. The existing server's `.next` output was not rebuilt or replaced.
- The existing local public server still returns 503 `local_security_disabled` for `/api/phase2/me`; Arabic/English login and registration paths remain 404. No new listener was started.

Native-provider acceptance, database/API integration and full browser regression suites were **not rerun** for this removal-only change. Their earlier results remain historical; unchanged implementation fingerprints and the new offline checks are this retirement's verification boundary.

## Later canonical-only hardening

The subsequent owner-authorized continuation hardened only the canonical native path; see [the fresh hardening handoff](phase-2-provider-hardening.md). Retirement statements above describe that removal-only task, not the later behavior changes. The alternative remains retired and archived unchanged; no restoration, wholesale merge or incompatible Storage/gateway contract was adopted.
