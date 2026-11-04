# Protected teacher workspace — Preview only

## Connected access

`/ar/teacher` and `/en/teacher` use the separate Preview Supabase project `dyyvpcntbbwbuzskiidb`, only on `preview/academy-synthetic`. Other projects, branches, Production and unapproved hosts fail closed. The routes are dynamic/noindex and the APIs private/no-store.

An existing approved adult signs in using Supabase password authentication. Every operation verifies `/auth/v1/user`, rejects anonymous/unconfirmed identities, and requires an active stored teacher profile. Calls use the caller's access token and a public application key, never an administrative key. A narrow HttpOnly, SameSite=Strict cookie is scoped to `/api/teacher`, Secure on the approved HTTPS Preview alias. No refresh token is stored or returned. Expiry requires signing in again; logout changes only this cookie.

Public signup remains closed. The Preview-only `/auth/teacher/invite` callback accepts a valid Supabase invitation token only when it belongs to the single approved email `ilmamalonline@gmail.com`, then lets that recipient choose a password; it does not send invitations, persist the invite token or password, create a teacher profile, grant workspace access, or create assignments or lessons. It uses only the preview project's public Auth API key and keeps the token in page memory only. A display-only `?review=1` view is provided for owner review, omits the recipient email, and makes no Auth requests. No privileged Auth operation, roster, assignment or administrative schedule operation is exposed. Children do not log in.

## The only teacher-editable fields

The additive `db/teacher-session-outcomes.sql` follows the unchanged foundation migration. It adds:

- `outcome`: nullable, one of `attended_completed`, `attended_incomplete`, or `absent`. Null explicitly means no recorded outcome.
- `follow_up_note`: non-null text, empty by default, maximum 500 Unicode characters. A nonempty note requires a recorded outcome; whitespace-only notes and control characters other than tab/newline are rejected.

The note is explicitly shared with the child's guardian; it is not a private teacher note. Plain text rendering prevents HTML execution. No synthetic outcome is substituted for missing data.

Only an active teacher with an active assignment may UPDATE these two columns on their own scheduled individual session. UPDATE column grants exclude every identity/schedule field, including session/teacher/child IDs, subject, dates, time zone, scheduled/cancelled status and creation time. Mixed allowed/forbidden updates fail atomically. No client INSERT, DELETE, TRUNCATE, enrollment, activation or assignment privileges are introduced. Cancelled sessions cannot be edited. Existing assignment locking guards remain in force through a fixed-search-path, non-client-executable trigger function; clients receive no assignment UPDATE privilege.

The teacher API uses a strict body allowlist, authenticated teacher-ID filter, session-ID filter, scheduled-status filter and database RLS. A zero-row write is denied, never reported as saved. No automatic write retries occur after an uncertain response. Reads remain bounded to 50 sessions in stable start/id order, with a maximum offset of 10,000. Explicit field projection omits child foreign keys, family details and all unapproved fields from teacher responses.

## Guardian summaries, not raw session rows

The old direct guardian SELECT policy on `academy_individual_lessons` is removed. Base-table rows remain readable only to the assigned active teacher. Guardians instead use `academy_guardian_session_summaries(p_child_id,p_offset)`, a deliberately narrow SECURITY DEFINER read function with fixed `pg_catalog` search path, fully qualified object references, explicit `auth.uid()` ownership checks, no dynamic SQL, bounded offset and LIMIT 51.

The meeting-link migration recreates that RPC and explicitly sets its owner to `postgres` before revoking and re-granting EXECUTE. Supabase documents that SECURITY DEFINER runs as its owner, and that the `postgres` owner bypasses RLS even when a table has `FORCE ROW LEVEL SECURITY`; therefore the `auth.uid()` guardian/child ownership filter remains essential. The local PostgreSQL test asserts the owner, pinned search path, ACLs, forced-RLS flags on both queried tables, and that two different guardians only receive their own child's rows.

**Migration precondition:** this draft checks `current_user = 'postgres'` before any DDL or DML, then runs within one transaction. Apply it only through a workflow whose effective role is `postgres` (for example, Supabase's SQL Editor, which executes queries as `postgres`, or a direct database connection using the documented `postgres` username). This repository does not define a hosted migration runner. Do not assume that a custom or temporary/JIT CLI login has the required ownership privileges; if its effective role is different, stop and use an approved `postgres`-role workflow rather than removing the guard or weakening the explicit owner. The transaction rolls back if the guard or `ALTER FUNCTION ... OWNER TO postgres` cannot succeed. See the [Supabase roles guide](https://supabase.com/docs/guides/database/postgres/roles), [function security guide](https://supabase.com/docs/guides/database/functions), and [PostgreSQL `ALTER FUNCTION` privilege requirements](https://www.postgresql.org/docs/current/sql-alterfunction.html).

Only authenticated callers may execute it. It returns session ID, owned child ID, subject, schedule/status, outcome and guardian-visible follow-up note, never teacher identity or creation metadata. Cross-family callers receive no rows. A teacher without ownership cannot use the summary function to read another teacher's sessions. A dual-role account keeps only the access appropriate to each interface.

The guardian endpoint independently verifies the adult identity and child ownership, enforces the Preview/host/origin/CSRF boundary, and projects the permitted fields. Empty results display an empty state. Provider failures display unavailable state rather than fictitious outcomes. The real guardian workspace never obtains session outcomes from the synthetic demo.

## Isolation preserved

`/teacher-demo` remains synthetic and session-local, separate from real APIs and Supabase. No hosted teacher account, invitation, assignment, lesson or fixture is created. All successful teacher-edit and cross-family test fixtures live only in disposable localhost PostgreSQL or local browser mocks. The existing hosted family account and child profile are not read or changed during this step.

Old Supabase `vbulxdnfknoybdkuhayz`, main, Production, Auth providers/URLs/SMTP, Vercel protection/share links, billing, payments, Zoom, materials and recordings are outside this change. The invitation redirect builder reuses the already-configured Preview callback host and protection token but does not alter settings; the Supabase Auth redirect allowlist must still be checked before any invitation is sent. The original foundation SQL remains an historical migration; applying the new outcome migration is required for the new routes.

## Verification

`test:teacher:foundation` covers the original migration in isolation. `test:teacher:workspace` checks cookies, request guards and route responses. `test:teacher:outcomes` covers strict input, provider response validation, narrow writes, fail-closed deployment gates and the combined-migration disposable PostgreSQL RLS/column-privilege suite. Guardian summary tests exercise ownership, projection, unavailable/empty states and route security. Teacher and guardian browser tests cover Arabic/English, mobile, stored data, saving/failures and explicit synthetic-fixture reload behavior.

Hosted verification reads schema/privilege metadata and empty teacher/session table counts only, plus unauthenticated route denials. A real successful teacher login/edit is intentionally not claimed: no approved teacher is provisioned in the hosted project.

## Admin authorization foundation — code only

`db/teacher-admin-foundation.sql` is an unapplied migration draft for an `academy_admins` allowlist keyed by Auth user UUID. The table has forced RLS, no browser-role privileges, no client policies, and a read policy limited to `service_role`; the migration creates no admin row. `src/lib/academy/teacher-admin.ts` is server-only: it verifies the caller through Auth, then checks the allowlist with a server credential and returns only the verified admin ID. It exposes no invitation, teacher provisioning, assignment, lesson, or payment operation.

The check is disabled unless `ACADEMY_TEACHER_ADMIN_PREVIEW_ENABLED=1` is explicitly set on the exact Preview branch and project. No such flag or service credential has been configured. Production and other branches fail closed. The migration has not been applied to any hosted Supabase project; public signup remains closed, and no owner UUID or admin row has been added.

## Next provisioning decision

A separately approved real administrative provisioning workflow must exist before adding any adult teacher, child assignment or timetable. A password set by an invitee alone does not activate a teacher account. This update does not authorize sending an invitation, provisioning a profile, creating an assignment or timetable, or Production rollout.
