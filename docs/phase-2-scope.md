# Phase 2 authorization and scope

The owner's “Excellent, continue” authorizes **Phase 2 only** following completion of Phase 1. It does not authorize automatic progression to Phase 3 or operational launch. The original Phase 0 archive and the historical Phase 1 approval record remain unchanged.

D01–D04 and D09 are approved. The approved D07 identity model is **guardian-managed minor student profiles, without independent minor login**. D07's detailed verification, consent, safeguarding, dispute and recovery procedures are not approved merely by accepting that model. D05, D06, D08, D10 and D11 remain pending.

## Permitted local work

A synthetic, loopback-only identity and isolation foundation: PostgreSQL schema, four roles, live capabilities, adult/child identity constraints, guardian consent/link and teacher-assignment boundaries, session revocation, row-level security and column projections, closed synthetic admin bootstrap, audit, and private-file authorization tests.

The application keeps the Phase 1 bilingual public pages. It adds a default-disabled, read-only `/api/phase2/*` namespace for test identities. It does not add account onboarding, child login, a public bootstrap route, working signup/login/recovery forms, or business workflows for payments, scheduling or education. Payment/report/note rows are synthetic isolation probes, not implementation of those later phases.

## Integration limitation

The roadmap names Supabase Auth/Postgres/RLS/Private Storage. This environment was not connected to a hosted project, Docker or a full Supabase stack. The implemented local PostgreSQL `auth.users`/`auth.sessions` shims, ephemeral signed JWT test issuer and filesystem fixture store are **test adapters**, not a claim that Supabase Auth, PostgREST, Storage bucket policies, real MFA, email delivery or provider recovery have been integrated or tested. The local tests exercise actual PostgreSQL RLS and actual HTTP requests to Next.js, not an in-memory authorization mock.

Consequently the local foundation can be reviewed, but the full provider-specific Phase 2 acceptance gate remains open. Closing it needs separately authorized synthetic provider integration and verification; no service connection or provisioning is implied by this work.

## Explicit prohibitions retained

No commit, push, deploy, live migration, external-service configuration, real account provisioning, real personal/child data, real money, Quran import, recording, outbound notification or contact activation. Test SQL is guarded for disposable local database `phase2_test`; it is not a production migration. Real users and children remain blocked until the unresolved operational/legal/safeguarding gates are approved and verified.
