# Protected teacher workspace — Preview only

## What is connected

`/ar/teacher` and `/en/teacher` are the real, read-only teacher workspace. They use the existing separate Supabase Preview project `dyyvpcntbbwbuzskiidb`, only on branch `preview/academy-synthetic`. Production, other branches/projects and unapproved hosts fail closed. The pages are dynamic and noindex; the API is private/no-store.

An existing adult account signs in with Supabase password authentication. No account creation, teacher signup, invitations, reset-email workflow, privileged Auth API or teacher provisioning is exposed. Every read verifies the caller with `/auth/v1/user`, requires a confirmed non-anonymous identity and an active stored `academy_teachers` profile matching that identity, and uses the caller's access token with RLS. A guardian account, missing profile or suspended profile cannot enter as a teacher. A separate narrow HttpOnly/SameSite=Strict cookie is scoped to `/api/teacher` (Secure on the approved HTTPS Preview alias); it never shares or changes the guardian/demo session. No refresh token is stored or returned. Expiry requires signing in again; sign-out clears only this workspace cookie.

The workspace reads individual lessons using an authenticated teacher-ID filter and an inner join against active `academy_teacher_assignments`. The explicit join matters because guardian SELECT policies are additive: even a dual-role guardian/teacher must not see a revoked assignment in the teacher workspace through their guardian permissions. Results are paginated in stable start/id order, 50 at a time, with a bounded offset. Child tables are never queried by this adapter. The API strips child foreign keys and all non-allowlisted fields; no child names, emails or family details are shown.

## Read-only is the schema boundary

The existing tables grant authenticated users SELECT only. Lesson status supports `scheduled` and `cancelled`, but there is no client UPDATE grant, attendance field, outcome or follow-up field. Consequently the workspace displays the schedule/status only. It exposes no create, edit, cancellation, attendance, result or follow-up operation. Do not add those controls or reinterpret demo-only state as persistent data. Adding them requires a separately approved business decision and database migration.

An authenticated account without an active teacher profile sees a clear localized message that teacher access must be assigned. An active teacher without assigned lessons sees an empty schedule, not fictitious students. `/ar/teacher-demo` and `/en/teacher-demo` remain explicitly synthetic and page-memory-only, with no connection to this API or Supabase.

## Existing database foundation

`db/teacher-foundation.sql` remains unchanged. `academy_teachers` links adult Auth identities and defaults to suspended. Assignments default inactive. Individual lessons have exactly one teacher and one child, an approved subject identifier, absolute start/end instants, a named time zone, and scheduled/cancelled status. Exclusion constraints prevent concurrent scheduled overlaps for either person. Forced RLS scopes profiles, assignments and lessons. Clients cannot enroll themselves, activate profiles, assign children or write schedules.

No teacher roster, Auth account, invitation, assignment, lesson or fixture has been inserted in hosted Supabase by this work. All teacher fixtures are local automated tests only. Signup remains disabled. No migrations, existing family permissions, Auth settings, Vercel protection/share links, main, Production, old Supabase project, Zoom or payments are changed. Children still do not log in; no Quran/Nur al-Bayan materials are imported.

## Verification

`npm run test:teacher:foundation` covers adapter authorization and a disposable localhost PostgreSQL database, including guardian/teacher isolation, suspension/revocation, no client writes, overlap constraints and dual-role revoked-assignment protection. `npm run test:teacher:workspace` covers request security, bounded input, cookie isolation, mocked login/provider failures and actual GET/POST handler behavior. `npm run test:teacher:real:browser` checks localized/mobile access states and schedule rendering with local HTTP mocks only. Existing teacher demo and family/learner suites remain separate regression tests.

Hosted checks use schema metadata/counts only plus anonymous access and the already-existing adult test account's denied teacher access. No family child details are read. A successful real teacher login is intentionally not claimed: the hosted teacher tables are empty and no teacher has been provisioned.

## Next owner decision

Teacher access must be assigned by a separately approved privileged provisioning process. Before any account or roster is created, obtain the approved adults, account/login approach, individual assignments, subjects and timetable. The current route does not authorize provisioning, invitations, wider access or Production rollout.
