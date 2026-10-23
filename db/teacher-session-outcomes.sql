-- PREVIEW ONLY: additive teacher session outcome controls.
-- Requires db/teacher-foundation.sql and db/family-registration.sql first.
BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;

-- Fail closed on accidental partial/duplicate application: ALTER TABLE itself
-- must fail if either contract column already exists.
ALTER TABLE public.academy_individual_lessons
  ADD COLUMN outcome text,
  ADD COLUMN follow_up_note text NOT NULL DEFAULT '';

ALTER TABLE public.academy_individual_lessons
  ADD CONSTRAINT academy_individual_lessons_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('attended_completed', 'attended_incomplete', 'absent')),
  ADD CONSTRAINT academy_individual_lessons_follow_up_note_check
  CHECK (
    char_length(follow_up_note) <= 500
    AND follow_up_note !~ U&'[\0001-\0008\000B-\001F\007F-\009F]'
    AND (follow_up_note = '' OR btrim(follow_up_note,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> '')
    AND (outcome IS NOT NULL OR follow_up_note = '')
  );

-- Outcome updates fire the foundation assignment guard. Keep its row-locking
-- check, but run it with migration-owner privileges so clients do not need
-- assignment-table locking privileges.
CREATE OR REPLACE FUNCTION public.academy_individual_lesson_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.status = 'scheduled' AND NOT EXISTS (
    SELECT 1 FROM public.academy_teacher_assignments a
    JOIN public.academy_teachers t ON t.id = a.teacher_id
    WHERE a.teacher_id = NEW.teacher_id AND a.child_id = NEW.child_id
      AND a.status = 'active' AND t.status = 'active'
    FOR SHARE OF a, t
  ) THEN
    RAISE EXCEPTION 'active teacher assignment required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.academy_individual_lesson_assignment_guard() FROM PUBLIC, anon, authenticated;

-- A revoked/suspended teacher must not retain either schedule reads or outcome
-- writes. The old guardian table policy is intentionally removed: guardians get
-- only the summary RPC below, never raw lesson rows.
DROP POLICY academy_lessons_guardian_read_own ON public.academy_individual_lessons;
DROP POLICY academy_lessons_teacher_read_assigned ON public.academy_individual_lessons;
CREATE POLICY academy_lessons_teacher_read_assigned ON public.academy_individual_lessons
  FOR SELECT TO authenticated
  USING (
    teacher_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.academy_teacher_assignments a
      JOIN public.academy_teachers t ON t.id = a.teacher_id
      WHERE a.teacher_id = academy_individual_lessons.teacher_id
        AND a.child_id = academy_individual_lessons.child_id
        AND a.status = 'active'
        AND t.status = 'active'
    )
  );

CREATE POLICY academy_lessons_teacher_update_outcomes ON public.academy_individual_lessons
  FOR UPDATE TO authenticated
  USING (
    status = 'scheduled'
    AND teacher_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.academy_teacher_assignments a
      JOIN public.academy_teachers t ON t.id = a.teacher_id
      WHERE a.teacher_id = academy_individual_lessons.teacher_id
        AND a.child_id = academy_individual_lessons.child_id
        AND a.status = 'active'
        AND t.status = 'active'
    )
  )
  WITH CHECK (
    status = 'scheduled'
    AND teacher_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.academy_teacher_assignments a
      JOIN public.academy_teachers t ON t.id = a.teacher_id
      WHERE a.teacher_id = academy_individual_lessons.teacher_id
        AND a.child_id = academy_individual_lessons.child_id
        AND a.status = 'active'
        AND t.status = 'active'
    )
  );

-- Foundation granted whole-row SELECT. Replace it with an explicit projection:
-- teachers need teacher_id for their adapter, but created_at is not client data.
REVOKE SELECT ON TABLE public.academy_individual_lessons FROM authenticated;
GRANT SELECT (
  id, teacher_id, child_id, subject, starts_at, ends_at, time_zone, status,
  outcome, follow_up_note
) ON TABLE public.academy_individual_lessons TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.academy_individual_lessons FROM authenticated;
REVOKE UPDATE ON TABLE public.academy_individual_lessons FROM authenticated;
GRANT UPDATE (outcome, follow_up_note)
  ON TABLE public.academy_individual_lessons TO authenticated;

-- SECURITY DEFINER is deliberately narrow and returns no teacher identity or
-- created_at. It is the only guardian lesson interface after the raw-table
-- guardian policy is removed. The explicit search_path and qualified names
-- prevent search-path object hijacking.
CREATE FUNCTION public.academy_guardian_session_summaries(
  p_child_id uuid,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  child_id uuid,
  subject text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  status text,
  outcome text,
  follow_up_note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id, l.child_id, l.subject, l.starts_at, l.ends_at, l.time_zone,
         l.status, l.outcome, l.follow_up_note
  FROM public.academy_individual_lessons l
  JOIN public.academy_children c ON c.id = l.child_id
    AND c.guardian_id = (SELECT auth.uid())
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND l.child_id = p_child_id
  ORDER BY l.starts_at, l.id
  LIMIT 51 OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.academy_guardian_session_summaries(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_guardian_session_summaries(uuid, integer)
  TO authenticated;

COMMIT;
