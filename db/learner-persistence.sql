-- Preview-only learner persistence: project dyyvpcntbbwbuzskiidb.
-- Apply only after the family schema; never apply to the Production project.
-- This migration intentionally fails on object collisions and is transactional.
BEGIN;

CREATE TABLE public.academy_learning_plans (
  child_id uuid PRIMARY KEY REFERENCES public.academy_children(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.academy_guardians(id) ON DELETE CASCADE,
  goal text NOT NULL CHECK (length(trim(goal)) BETWEEN 1 AND 500),
  weekly_target_minutes integer NOT NULL CHECK (weekly_target_minutes BETWEEN 1 AND 840),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academy_practice_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.academy_children(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.academy_guardians(id) ON DELETE CASCADE,
  activity text NOT NULL CHECK (length(trim(activity)) BETWEEN 1 AND 120),
  minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 240),
  practiced_on date NOT NULL CHECK (practiced_on >= DATE '2000-01-01'),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX academy_practice_entries_owner_recent
  ON public.academy_practice_entries (guardian_id, child_id, practiced_on DESC, created_at DESC, id DESC);

CREATE FUNCTION public.academy_learning_plans_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.academy_practice_entries_check_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.practiced_on > CURRENT_DATE THEN
    RAISE EXCEPTION 'practiced_on must not be in the future' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academy_learning_plans_updated_at
  BEFORE UPDATE OF goal, weekly_target_minutes ON public.academy_learning_plans
  FOR EACH ROW EXECUTE FUNCTION public.academy_learning_plans_touch_updated_at();

CREATE TRIGGER academy_practice_entries_date_guard
  BEFORE INSERT OR UPDATE OF practiced_on ON public.academy_practice_entries
  FOR EACH ROW EXECUTE FUNCTION public.academy_practice_entries_check_date();

ALTER TABLE public.academy_learning_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_learning_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academy_practice_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_practice_entries FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.academy_learning_plans, public.academy_practice_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_learning_plans_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_practice_entries_check_date() FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON TABLE public.academy_learning_plans TO authenticated;
GRANT INSERT (child_id, guardian_id, goal, weekly_target_minutes) ON TABLE public.academy_learning_plans TO authenticated;
GRANT UPDATE (goal, weekly_target_minutes) ON TABLE public.academy_learning_plans TO authenticated;
GRANT SELECT, DELETE ON TABLE public.academy_practice_entries TO authenticated;
GRANT INSERT (child_id, guardian_id, activity, minutes, practiced_on, note) ON TABLE public.academy_practice_entries TO authenticated;
GRANT UPDATE (activity, minutes, practiced_on, note) ON TABLE public.academy_practice_entries TO authenticated;

CREATE POLICY academy_learning_plans_select_own ON public.academy_learning_plans
  FOR SELECT TO authenticated
  USING (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));
CREATE POLICY academy_learning_plans_insert_own ON public.academy_learning_plans
  FOR INSERT TO authenticated
  WITH CHECK (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));
CREATE POLICY academy_learning_plans_update_own ON public.academy_learning_plans
  FOR UPDATE TO authenticated
  USING (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ))
  WITH CHECK (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));
CREATE POLICY academy_learning_plans_delete_own ON public.academy_learning_plans
  FOR DELETE TO authenticated
  USING (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));

CREATE POLICY academy_practice_entries_select_own ON public.academy_practice_entries
  FOR SELECT TO authenticated
  USING (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));
CREATE POLICY academy_practice_entries_insert_own ON public.academy_practice_entries
  FOR INSERT TO authenticated
  WITH CHECK (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));
CREATE POLICY academy_practice_entries_update_own ON public.academy_practice_entries
  FOR UPDATE TO authenticated
  USING (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ))
  WITH CHECK (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));
CREATE POLICY academy_practice_entries_delete_own ON public.academy_practice_entries
  FOR DELETE TO authenticated
  USING (guardian_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.academy_children c
    WHERE c.id = child_id AND c.guardian_id = (SELECT auth.uid())
  ));

COMMIT;
