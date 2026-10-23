-- PREVIEW ONLY: dyyvpcntbbwbuzskiidb. Never apply to Production.
-- Schema only: no auth.users writes, roster, invitations, seed rows or policy changes
-- on existing family tables. Application enrollment remains disabled.
BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.academy_teachers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  time_zone text NOT NULL,
  status text NOT NULL DEFAULT 'suspended' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academy_teacher_assignments (
  teacher_id uuid NOT NULL REFERENCES public.academy_teachers(id) ON DELETE RESTRICT,
  child_id uuid NOT NULL REFERENCES public.academy_children(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, child_id)
);

CREATE TABLE public.academy_individual_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  child_id uuid NOT NULL,
  subject text NOT NULL CHECK (subject IN ('quran', 'nur_al_bayan', 'tajweed')),
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  ends_at timestamptz NOT NULL CHECK (isfinite(ends_at)),
  time_zone text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (teacher_id, child_id) REFERENCES public.academy_teacher_assignments(teacher_id, child_id) ON DELETE CASCADE,
  CHECK (ends_at > starts_at),
  -- One child per row; no group, meeting, recording, material or payment fields.
  -- Half-open ranges allow adjacent sessions, but forbid concurrent double booking.
  EXCLUDE USING gist (teacher_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status = 'scheduled'),
  EXCLUDE USING gist (child_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status = 'scheduled')
);
CREATE INDEX academy_teacher_assignments_child ON public.academy_teacher_assignments(child_id, teacher_id);
CREATE INDEX academy_individual_lessons_teacher_time ON public.academy_individual_lessons(teacher_id, starts_at, id);
CREATE INDEX academy_individual_lessons_child_time ON public.academy_individual_lessons(child_id, starts_at, id);

CREATE FUNCTION public.academy_teacher_time_zone_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'valid IANA time zone required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER academy_teachers_time_zone BEFORE INSERT OR UPDATE ON public.academy_teachers
  FOR EACH ROW EXECUTE FUNCTION public.academy_teacher_time_zone_guard();
CREATE TRIGGER academy_lessons_time_zone BEFORE INSERT OR UPDATE ON public.academy_individual_lessons
  FOR EACH ROW EXECUTE FUNCTION public.academy_teacher_time_zone_guard();

CREATE FUNCTION public.academy_individual_lesson_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
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
CREATE TRIGGER academy_lessons_assignment BEFORE INSERT OR UPDATE ON public.academy_individual_lessons
  FOR EACH ROW EXECUTE FUNCTION public.academy_individual_lesson_assignment_guard();

ALTER TABLE public.academy_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_teachers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academy_teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_teacher_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academy_individual_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_individual_lessons FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academy_teachers, public.academy_teacher_assignments, public.academy_individual_lessons FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_teacher_time_zone_guard(), public.academy_individual_lesson_assignment_guard() FROM PUBLIC, anon, authenticated;
-- No browser/client role may self-enroll, activate itself, assign children or edit a schedule.
-- Provisioning requires a separately approved roster and privileged operator process.
GRANT SELECT ON TABLE public.academy_teachers, public.academy_teacher_assignments, public.academy_individual_lessons TO authenticated;
CREATE POLICY academy_teachers_read_self ON public.academy_teachers FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) AND status = 'active');
CREATE POLICY academy_teacher_assignments_read_self ON public.academy_teacher_assignments FOR SELECT TO authenticated
  USING (teacher_id = (SELECT auth.uid()) AND status = 'active' AND EXISTS (
    SELECT 1 FROM public.academy_teachers t WHERE t.id = teacher_id AND t.status = 'active'
  ));
CREATE POLICY academy_lessons_teacher_read_assigned ON public.academy_individual_lessons FOR SELECT TO authenticated
  USING (teacher_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_teacher_assignments a
    WHERE a.teacher_id = academy_individual_lessons.teacher_id
      AND a.child_id = academy_individual_lessons.child_id AND a.status = 'active'
  ));
CREATE POLICY academy_lessons_guardian_read_own ON public.academy_individual_lessons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())));
COMMIT;
