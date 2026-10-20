-- Family registration persistence for Supabase project vbulxdnfknoybdkuhayz.
-- Apply only in the intended project; this migration deliberately fails on object collisions.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.academy_guardians (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  locale text NOT NULL CHECK (locale IN ('ar', 'en')),
  consent_version text NOT NULL CHECK (length(trim(consent_version)) BETWEEN 1 AND 100),
  consented_at timestamptz NOT NULL
);

CREATE TABLE public.academy_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid NOT NULL REFERENCES public.academy_guardians(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  birth_year integer NOT NULL CHECK (birth_year >= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.academy_guardians_immutable_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'guardian id is immutable' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academy_guardians_id_guard
  BEFORE UPDATE OF id ON public.academy_guardians
  FOR EACH ROW EXECUTE FUNCTION public.academy_guardians_immutable_id();

-- CURRENT_DATE cannot appear in an immutable CHECK constraint. Keep the lower
-- bound declarative and enforce the moving upper bound at every insert/update.
CREATE FUNCTION public.academy_children_check_birth_year()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.birth_year > EXTRACT(YEAR FROM CURRENT_DATE)::integer THEN
    RAISE EXCEPTION 'birth_year must not be in the future' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academy_children_birth_year_guard
  BEFORE INSERT OR UPDATE OF birth_year ON public.academy_children
  FOR EACH ROW EXECUTE FUNCTION public.academy_children_check_birth_year();

ALTER TABLE public.academy_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academy_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_children FORCE ROW LEVEL SECURITY;

-- Hosted default privileges may grant ALL to API roles on newly created tables.
-- Reset them explicitly: RLS does not protect TRUNCATE or REFERENCES privileges.
REVOKE ALL ON TABLE public.academy_guardians, public.academy_children FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_guardians_immutable_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academy_children_check_birth_year() FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.academy_guardians TO authenticated;
-- id is included in the app's conflict/upsert payload. The trigger above
-- permits id=id for that merge but rejects any attempted identity change.
GRANT UPDATE (id, display_name, locale, consent_version, consented_at)
  ON TABLE public.academy_guardians TO authenticated;
GRANT DELETE ON TABLE public.academy_guardians TO authenticated;

GRANT SELECT, INSERT ON TABLE public.academy_children TO authenticated;
GRANT UPDATE (display_name, birth_year) ON TABLE public.academy_children TO authenticated;
GRANT DELETE ON TABLE public.academy_children TO authenticated;

CREATE POLICY academy_guardians_select_own ON public.academy_guardians
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY academy_guardians_insert_own ON public.academy_guardians
  FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY academy_guardians_update_own ON public.academy_guardians
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY academy_guardians_delete_own ON public.academy_guardians
  FOR DELETE TO authenticated USING (id = (SELECT auth.uid()));

CREATE POLICY academy_children_select_own ON public.academy_children
  FOR SELECT TO authenticated
  USING (guardian_id = (SELECT auth.uid()));
CREATE POLICY academy_children_insert_own ON public.academy_children
  FOR INSERT TO authenticated
  WITH CHECK (guardian_id = (SELECT auth.uid()));
CREATE POLICY academy_children_update_own ON public.academy_children
  FOR UPDATE TO authenticated
  USING (guardian_id = (SELECT auth.uid()))
  WITH CHECK (guardian_id = (SELECT auth.uid()));
CREATE POLICY academy_children_delete_own ON public.academy_children
  FOR DELETE TO authenticated USING (guardian_id = (SELECT auth.uid()));

COMMIT;
