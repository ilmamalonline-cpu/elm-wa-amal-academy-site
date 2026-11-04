-- CODE-ONLY MIGRATION DRAFT. Do not apply to any hosted Supabase project without
-- a separate owner approval. No administrator row is created or seeded here.
BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;

CREATE TABLE public.academy_admins (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_admins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academy_admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academy_admins FROM service_role;
GRANT SELECT ON TABLE public.academy_admins TO service_role;

-- The table is not readable by browser roles. A server-only authorization
-- check uses the service-role credential and still requires the service claim.
CREATE POLICY academy_admins_service_role_select ON public.academy_admins
  FOR SELECT TO service_role
  USING ((SELECT auth.role()) = 'service_role');

COMMIT;
