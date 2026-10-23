# Protected teacher workspace — Preview only

## Connected access

`/ar/teacher` and `/en/teacher` use the separate Preview Supabase project `dyyvpcntbbwbuzskiidb`, only on `preview/academy-synthetic`. Other projects, branches, Production and unapproved hosts fail closed. The routes are dynamic/noindex and the APIs private/no-store.

An existing approved adult signs in using Supabase password authentication. Every operation verifies `/auth/v1/user`, rejects anonymous/unconfirmed identities, and requires an active stored teacher profile. Calls use the caller's access token and a public application key, never an administrative key. A narrow HttpOnly, SameSite=Strict cookie is scoped to `/api/teacher`, Secure on the approved HTTPS Preview alias. No refresh token is stored or returned. Expiry requires signing in again; logout changes only this cookie.

No account creation, teacher signup, invitations, emails, reset flow, privileged Auth operation, roster, assignment or administrative schedule operation is exposed. Public signup stays closed. Children do not log in.

## The only teacher-editable fields

The additive `db/teacher-session-outcomes.sql` follows the unchanged foundation migration. It adds:

- `outcome`: nullable, one of `attended_completed`, `attended_incomplete`, or `absent`. Null explicitly means no recorded outcome.
- `follow_up_note`: non-null text, empty by default, maximum 500 Unicode characters. A nonempty note requires a recorded outcome; whitespace-only notes and control characters other than tab/newline are rejected.

The note is explicitly shared with the child's guardian; it is not a private teacher note. Plain text rendering prevents HTML execution. No synthetic outcome is substituted for missing data.

Only an active teacher with an active assignment may UPDATE these two columns on their own scheduled individual session. UPDATE column grants exclude every identity/schedule field, including session/teacher/child IDs, subject, dates, time zone, scheduled/cancelled status and creation time. Mixed allowed/forbidden updates fail atomically. No client INSERT, DELETE, TRUNCATE, enrollment, activation or assignment privileges are introduced. Cancelled sessions cannot be edited. Existing assignment locking guards remain in force through a fixed-search-path, non-client-executable trigger function; clients receive no assignment UPDATE privilege.

The teacher API uses a strict body allowlist, authenticated teacher-ID filter, session-ID filter, scheduled-status filter and database RLS. A zero-row write is denied, never reported as saved. No automatic write retries occur after an uncertain response. Reads remain bounded to 50 sessions in stable start/id order, with a maximum offset of 10,000. Explicit field projection omits child foreign keys, family details and all unapproved fields from teacher responses.

## Guardian summaries, not raw session rows

The old direct guardian SELECT policy on `academy_individual_lessons` is removed. Base-table rows remain readable only to the assigned active teacher. Guardians instead use `academy_guardian_session_summaries(p_child_id,p_offset)`, a deliberately narrow SECURITY DEFINER read function with fixed `pg_catalog` search path, fully qualified object references, explicit `auth.uid()` ownership checks, no dynamic SQL, bounded offset and LIMIT 51.

Only authenticated callers may execute it. It returns session ID, owned child ID, subject, schedule/status, outcome and guardian-visible follow-up note, never teacher identity or creation metadata. Cross-family callers receive no rows. A teacher without ownership cannot use the summary function to read another teacher's sessions. A dual-role account keeps only the access appropriate to each interface.

The guardian endpoint independently verifies the adult identity and child ownership, enforces the Preview/host/origin/CSRF boundary, and projects the permitted fields. Empty results display an empty state. Provider failures display unavailable state rather than fictitious outcomes. The real guardian workspace never obtains session outcomes from the synthetic demo.

## Isolation preserved

`/teacher-demo` remains synthetic and session-local, separate from real APIs and Supabase. No hosted teacher account, invitation, assignment, lesson or fixture is created. All successful teacher-edit and cross-family test fixtures live only in disposable localhost PostgreSQL or local browser mocks. The existing hosted family account and child profile are not read or changed during this step.

Old Supabase `vbulxdnfknoybdkuhayz`, main, Production, Auth providers/URLs/SMTP, Vercel protection/share links, billing, payments, Zoom, materials and recordings are outside this change. The original foundation SQL remains an historical migration; applying the new outcome migration is required for the new routes.

## Verification

`test:teacher:foundation` covers the original migration in isolation. `test:teacher:workspace` checks cookies, request guards and route responses. `test:teacher:outcomes` covers strict input, provider response validation, narrow writes, fail-closed deployment gates and the combined-migration disposable PostgreSQL RLS/column-privilege suite. Guardian summary tests exercise ownership, projection, unavailable/empty states and route security. Teacher and guardian browser tests cover Arabic/English, mobile, stored data, saving/failures and explicit synthetic-fixture reload behavior.

Hosted verification reads schema/privilege metadata and empty teacher/session table counts only, plus unauthenticated route denials. A real successful teacher login/edit is intentionally not claimed: no approved teacher is provisioned in the hosted project.

## Next provisioning decision

A separately approved real administrative provisioning workflow must exist before adding any adult teacher, child assignment or timetable. This update does not authorize provisioning or Production rollout.
