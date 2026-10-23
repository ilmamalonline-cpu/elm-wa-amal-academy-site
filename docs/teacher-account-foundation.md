# Teacher accounts and individual schedules — Preview foundation

This is preparation, not an account rollout. It targets only branch `preview/academy-synthetic` and Supabase project `dyyvpcntbbwbuzskiidb`. Never apply `db/teacher-foundation.sql` to Production or the old Supabase project. The operator must explicitly verify the project ID before applying; SQL alone does not establish the hosted project's identity.

## What exists

- Empty `academy_teachers` profiles linked to existing adult Auth identities. Profiles default to `suspended`; no emails or passwords are stored in these tables.
- Empty `academy_teacher_assignments` linking a teacher to one existing child. Assignments default to `inactive`.
- Empty `academy_individual_lessons`: exactly one teacher and one child per row, an approved subject identifier, absolute start/end instants, a valid named time zone, and scheduled/cancelled status.
- Atomic exclusion constraints reject overlapping scheduled lessons for either teacher or child. Adjacent lessons are allowed; cancelled lessons do not reserve time. Named zones support Cairo daylight-saving conversion; the operator must resolve a local time to its exact instant before a future write.
- Forced RLS: an active teacher reads only their own profile, active assignments and assigned lessons. Suspending a teacher or revoking an assignment removes teacher access immediately. A guardian can read lessons only through ownership of their child. Teacher access does not expand permissions on existing child, guardian or learning tables.
- Authenticated users have SELECT only on the new tables; anonymous users have no access. Clients cannot self-enroll, activate themselves, assign children or edit schedules. Trigger functions have no direct API execution grant.
- A dormant server-side read-only adapter validates identity through Auth, requires an active stored teacher profile, and uses the caller's token with database RLS. It is not imported by any route or UI. It must remain disabled until the roster and login/provisioning design are approved.

## What has not changed

The teacher demo is still fictional and page-memory-only; its numbered identities do not correspond to database profiles. No demo rows were copied into Supabase. No teacher accounts, invitations, emails, assignments or lessons were created. Local disposable database fixtures are tests only, not a roster or proposed timetable.

Children still do not log in. All lessons remain individual. Quran, Nur al-Bayan and Tajweed materials stay teacher-operated inside independently managed Zoom sessions. There are no meeting links, live Zoom integration, recordings, instructional material uploads or payment fields in this foundation.

No changes are authorized to main, Production, the old Supabase project, Auth signup settings, SMTP, Vercel protection or the existing share link. No environment activation flag is set by this work.

## Verification

Run `npm run test:teacher:foundation` for mocked adapter tests and an isolated localhost PostgreSQL cluster. Database tests cover empty migration, RLS, no self-enrollment, teacher/guardian isolation, suspension/revocation, invalid inputs and foreign identities, overlap rejection including concurrent inserts, adjacency and cancelled lessons, inactive defaults and collision rollback. They never connect to hosted Supabase.

Hosted verification is metadata/counts only: zero rows in all three new tables, forced RLS, no anonymous access and no authenticated write privileges. Existing Auth and family row counts must be unchanged. No teacher login is claimed to have been tested: there is no approved teacher account.

## Stop point before activation

Ask the owner for the approved teacher list: display name, login email, taught subject(s), available days/times and time zone. Ask which approved existing child profiles are assigned to each teacher before creating any assignments or actual lessons. Confirm a Preview-only account provisioning/login approach separately; this foundation deliberately adds no teacher signup route, email invitation process, admin role or credential collection.

The owner supplying a roster does not authorize Production rollout or changes to the current signup lock. Obtain explicit approval before any new account/email/provisioning step. Do not import real teacher or student records merely to demonstrate this foundation.
