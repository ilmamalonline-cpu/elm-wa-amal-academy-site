-- PREVIEW ONLY: additive meeting-link field for assigned individual lessons.
-- Requires db/teacher-foundation.sql and db/teacher-session-outcomes.sql.
-- Draft only: do not apply to any hosted Supabase project without review.
BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;

ALTER TABLE public.academy_individual_lessons
  ADD COLUMN meeting_url text;

-- Clean up any legacy cancelled rows before enforcing the invariant. This runs
-- only if an owner later approves and applies this draft migration.
UPDATE public.academy_individual_lessons
SET meeting_url = NULL
WHERE status = 'cancelled' AND meeting_url IS NOT NULL;

-- Cancellation clears the link in the same row update. The CHECK below is a
-- second line of defense against any path that bypasses this trigger.
CREATE FUNCTION public.academy_individual_lesson_clear_cancelled_meeting_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    NEW.meeting_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.academy_individual_lesson_clear_cancelled_meeting_url()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER academy_individual_lesson_clear_cancelled_meeting_url
  BEFORE INSERT OR UPDATE OF status, meeting_url
  ON public.academy_individual_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.academy_individual_lesson_clear_cancelled_meeting_url();

ALTER TABLE public.academy_individual_lessons
  ADD CONSTRAINT academy_individual_lessons_meeting_url_check
  CHECK (
    meeting_url IS NULL OR (
      char_length(meeting_url) <= 300
      AND meeting_url ~ '^https://(meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)?zoom\.us)/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+(\?[A-Za-z0-9._~!$&''()*+,;=:@%/?-]*)?(#[A-Za-z0-9._~!$&''()*+,;=:@%/?-]*)?$'
      AND meeting_url !~ '%([^0-9A-Fa-f]|$)|%[0-9A-Fa-f]([^0-9A-Fa-f]|$)'
    )
  ),
  ADD CONSTRAINT academy_individual_lessons_cancelled_meeting_url_check
  CHECK (status <> 'cancelled' OR meeting_url IS NULL);

COMMENT ON COLUMN public.academy_individual_lessons.meeting_url IS
  'External HTTPS meeting link; teachers use their own Quran/Tajweed/Nur al-Bayan materials in the meeting. The platform does not import or manage those materials.';

-- Add only the new column privileges. Existing SELECT/UPDATE column grants and
-- the active-assigned-teacher RLS policy remain unchanged and continue to gate access.
GRANT SELECT (meeting_url)
  ON TABLE public.academy_individual_lessons TO authenticated;
GRANT UPDATE (meeting_url)
  ON TABLE public.academy_individual_lessons TO authenticated;

-- PostgreSQL cannot alter a function's table return type. Replace it in-place
-- within this transaction, preserving the same ownership check and narrow RPC contract.
DROP FUNCTION public.academy_guardian_session_summaries(uuid, integer);
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
  meeting_url text,
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
         l.status,
         CASE WHEN l.status = 'cancelled' THEN NULL ELSE l.meeting_url END,
         l.outcome, l.follow_up_note
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
