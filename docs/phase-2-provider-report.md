# Phase 2: native providers tested locally

**The native component integration passed with synthetic data only. Phase 3 has not started.** Real GoTrue login/MFA/recovery, PostgREST authorization and private Supabase Storage were exercised against a separate disposable database. This closes the earlier report's *unexecuted native-component tests*, not the full operational or production acceptance gate.

**Retirement follow-up:** the owner subsequently chose to retire the incompatible inactive alternative. Its nine implementation/test files, four npm entry points and obsolete configuration/run instructions have been removed. The native implementation and its original evidence remain intact. See [the resolved collision inventory](phase-2-provider-collisions.md). Results below describe the earlier native acceptance run, not a new provider run during retirement.

**Canonical hardening follow-up:** the later local-only continuation is recorded in [the hardening handoff](phase-2-provider-hardening.md), with new offline, disposable-database and original DB/API checks. The native 24-case and browser 68-case results below remain historical; they were not rerun for hardening. Startup/init instructions have changed; use the current native runbook.

## What changed

The active application adapter, `src/lib/phase2/security.ts`, now has an explicit `synthetic-provider-only` mode alongside the original fixture mode. It verifies native ES256 JWTs, binds every request to a live native session/profile and downloads private objects server-side only after metadata RLS permits access. Downloads remain size-bounded, hash/signature checked, attachments and `no-store`. The Storage credential never reaches clients.

`db/phase2-provider.sql` adds nine safe PostgREST views with invoker RLS, a live-session/read-only pre-request gate and native MFA checks tied to the current verified factor. Privileged commands cannot be reached through REST. `db/phase2-provider-storage.sql` keeps the bucket private and rejects end-user object policies. `scripts/provider-init.mjs` preserves GoTrue-managed Auth tables and refuses an already-initialized application database rather than destructively resetting it.

The native Auth/Storage/REST/app launchers and ephemeral-key helper are under `scripts/provider/`. Tests are `tests/phase2-provider-auth.test.mjs`, `tests/phase2-provider-data.test.mjs` and `tests/provider-helpers.mjs`; package command is `test:phase2:native`. README now distinguishes the original harness, accepted native path and preserved alternative. [Component versions and runner limits](../scripts/provider/README-native.md) identify PostgreSQL16.15, Auth2.197.0, Storage1.83.5, PostgREST16.4 and Mailpit1.31.6. No new project dependency was required for this continuation.

All child records remain guardian-managed profiles without an independent login. Login identities, passwords, TOTP secrets, consent evidence, PDFs and recovery addresses used in tests are synthetic; addresses use `.invalid`. Recovery email went only to the local sink, with no relay or real mailbox.

## Checks actually run

| Check | Final result | Evidence |
|---|---:|---|
| Native Auth + PostgREST/Storage acceptance | **24/24 passed** | [native-tests.log](checks/phase2-provider/native-tests.log) |
| Original independent RLS/API harness | **18 DB +23 API passed** | [original regression](checks/phase2-provider/original-phase2-regression.log) |
| Public desktop/mobile Chromium regression | **68/68 passed**; eight screenshot-only captures intentionally excluded | [e2e.log](checks/phase2-provider/e2e.log), [JSON](checks/phase2-provider/e2e-results.json) |
| TypeScript, ESLint, key-helper syntax | Passed | [static checks](checks/phase2-provider/static-and-preserved-offline.log) |
| Now-retired alternative, historical offline checks only | **20 adapter +6 converter passed** before retirement; not provider acceptance or a current supported suite | [same static log](checks/phase2-provider/static-and-preserved-offline.log) |
| Next.js production-mode build | Passed | [build.log](checks/phase2-provider/build.log) |
| Current project dependency audit | Zero reported vulnerabilities | [audit JSON](checks/phase2-provider/dependency-audit.json) |
| Active-service key-replacement refusal | Refused; key file unchanged | [key-safety.log](checks/phase2-provider/key-safety.log) |
| Runtime credential scan of source/docs/tests/artifacts | No matches; scan exclusions explicitly recorded | [scan JSON](checks/phase2-provider/credential-scan.json) |

Native tests proved actual password login, unconfirmed-user denial, refresh rotation, immediate logout/ban denial of already-issued JWTs, metadata non-escalation, real TOTP challenge/AAL2 bootstrap, no second bootstrap, privileged denial after factor removal, local recovery/password replacement, old-password/session denial and action-link non-reuse. Data tests proved cross-family/adult/teacher isolation, published-only reports, safe fields, live capability/link/consent revocation, freezes, no public writes/RPCs, direct Storage denial, owner/financial-review-only private delivery and fail-closed corrupt/missing/quarantined files. Synthetic `clean` metadata is **not a malware scan**.

Initial failures were retained where recorded. They exposed local runtime/search-path, explicit provider-role and HTTP-envelope/assertion mismatches; final acceptance was rerun after correction. Storage's native error responses may use HTTP400 with a403/404 error envelope; tests also have successful service-mediated object reads as positive controls. The final 24-case result includes the live-factor guard, not just a JWT AAL claim.

## Overlapping work: historical preservation, now retired

A second stopped subtask left an incompatible alternative targeting `phase2_supabase_test` and another bucket/adapter contract. At the native acceptance handoff, nine overlapping source/test files and their package scripts were preserved unchanged pending an owner decision. The owner has since explicitly chosen retirement, and those files and commands are now removed; no reconciliation was attempted. The app still imports only the active adapter. [The resolved collision inventory](phase-2-provider-collisions.md) records the removal, historical evidence and restricted recovery archive. The alternative installer, database harness and real-provider smoke suite were not run during the native continuation or retirement. Neither approach was applied to the other's database.

## Runtime and authorization boundary

All native services started for this continuation, including the disposable database, were stopped; [shutdown evidence](checks/phase2-provider/shutdown.txt) shows no native listeners. An already-running default-disabled public server on127.0.0.1:3000 was reused for UI regression and left untouched when the attempted second start found the port occupied. It serves this project; `/api/phase2/me` returns503 `local_security_disabled`, while account routes remain404 ([HTTP checks](checks/phase2-provider/public-http.txt)). No public deployment exists.

Runtime binaries, synthetic database/files and restricted ephemeral key material remain outside source. This is a native loopback component setup, **not** a full Supabase CLI/Docker/Kong/TLS deployment. Initial role ownership preparation was manual; a clean-machine/cold-start installer and key-rotation sequence were not validated end-to-end. Storage emitted a TUS lock-notifier shutdown warning, then stopped; no acceptance test failed or listener remained. No commit, push, deploy, live migration, hosted account/service change, real data, payment, outward notification or onboarding occurred.

## Still needs the owner

D05, D06, D08, D10 and D11 remain pending. D07 approves only the guardian-managed/no-minor-login model; detailed safeguarding, identity/consent verification, disputes/revocation and recovery operations remain unapproved. Native mechanics do not settle those policies. Real delivery, scanner/uploads, operational MFA/bootstrap ownership, retention/export/deletion, deployment/hosting/region choices, pilot and launch remain gated. The inactive-scaffolding decision is resolved by owner-authorized retirement; none of the other gates is closed by that cleanup.

**Stop here: Phase 2 local evidence is ready for review; no Phase 3 or real-user authorization is implied.**
