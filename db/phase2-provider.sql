-- LOCAL phase2_provider_test ONLY. Follow scripts/provider-init.mjs, not a deployment migration.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'phase2_provider_test' THEN RAISE EXCEPTION 'Disposable provider database required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='phase2_rest') THEN CREATE ROLE phase2_rest LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; END IF;
END $$;
GRANT phase2_authenticated TO authenticated;
GRANT authenticated,anon TO phase2_rest;
REVOKE service_role FROM phase2_rest;
CREATE SCHEMA api;
CREATE SCHEMA provider_private;
REVOKE ALL ON SCHEMA api,provider_private FROM PUBLIC;
GRANT USAGE ON SCHEMA api,provider_private TO authenticated,anon;
ALTER ROLE phase2_rest SET statement_timeout='5s';
ALTER ROLE authenticated SET statement_timeout='5s';

-- Never expose public tables or privileged command/helper functions through REST.
-- PostgreSQL15+ security_invoker views preserve underlying column grants AND RLS.
CREATE VIEW api.students WITH(security_invoker=true,security_barrier=true) AS SELECT id,full_name,age_band,preferred_locale,timezone,status FROM public.students;
CREATE VIEW api.profiles WITH(security_invoker=true,security_barrier=true) AS SELECT auth_user_id,display_name,preferred_locale,timezone,status FROM public.profiles;
CREATE VIEW api.reports WITH(security_invoker=true,security_barrier=true) AS SELECT id,student_id,body,status FROM public.published_reports;
CREATE VIEW api.notes WITH(security_invoker=true,security_barrier=true) AS SELECT id,student_id,teacher_user_id,body FROM public.teacher_notes;
CREATE VIEW api.payments WITH(security_invoker=true,security_barrier=true) AS SELECT id,student_id,requested_by_user_id,reference FROM public.payment_records;
CREATE VIEW api.files WITH(security_invoker=true,security_barrier=true) AS SELECT id,mime_type,size_bytes FROM public.private_files;
CREATE VIEW api.guardian_links WITH(security_invoker=true,security_barrier=true) AS SELECT id,guardian_user_id,student_id,verification_status,revoked_at FROM public.guardian_links;
CREATE VIEW api.assignments WITH(security_invoker=true,security_barrier=true) AS SELECT id,teacher_user_id,student_id,status FROM public.teacher_assignments;
CREATE VIEW api.audit WITH(security_invoker=true,security_barrier=true) AS SELECT id,actor_user_id,action,target_id,reason,created_at FROM public.audit_events;
GRANT SELECT ON ALL TABLES IN SCHEMA api TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA api FROM anon;

CREATE FUNCTION provider_private.check_request() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
BEGIN
 IF NOT(c ?& ARRAY['role','iss','sub','session_id','aal','iat','exp']) OR c->>'role' IS DISTINCT FROM 'authenticated' OR c->>'iss' IS DISTINCT FROM 'http://127.0.0.1:55441' OR coalesce(c->>'aal','') NOT IN('aal1','aal2') OR coalesce(c->>'sub','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' OR coalesce(c->>'session_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN
  RAISE SQLSTATE 'PT401' USING MESSAGE='authentication_required';
 END IF;
 IF (c->>'exp')::bigint-(c->>'iat')::bigint>900 OR (c->>'exp')::bigint<=extract(epoch FROM now()) OR (c->>'iat')::bigint>extract(epoch FROM now()) THEN RAISE SQLSTATE 'PT401' USING MESSAGE='authentication_required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',c->>'sub',true),set_config('request.jwt.claim.session_id',c->>'session_id',true),set_config('request.jwt.claim.aal',c->>'aal',true);
 IF NOT public.session_is_active((c->>'session_id')::uuid) THEN RAISE SQLSTATE 'PT401' USING MESSAGE='authentication_required'; END IF;
 IF current_setting('request.method',true) NOT IN('GET','HEAD','OPTIONS') THEN RAISE SQLSTATE 'PT405' USING MESSAGE='read_only_api'; END IF;
 PERFORM set_config('response.headers','[{"Cache-Control":"private, no-store, max-age=0"},{"Pragma":"no-cache"},{"Vary":"Authorization"},{"X-Content-Type-Options":"nosniff"}]',true);
END $$;
REVOKE ALL ON FUNCTION provider_private.check_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provider_private.check_request() TO authenticated,anon;
-- Old AAL2 JWTs must not authorize commands after native factor unenrollment.
GRANT SELECT(id,user_id,status,factor_type) ON auth.mfa_factors TO phase2_definer;
CREATE OR REPLACE FUNCTION auth.aal2() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal')='aal2',false)
 AND EXISTS(SELECT FROM auth.sessions s JOIN auth.mfa_factors f ON f.id=s.factor_id AND f.user_id=s.user_id WHERE s.id=nullif(current_setting('request.jwt.claim.session_id',true),'')::uuid AND s.user_id=auth.uid() AND s.aal='aal2' AND f.status='verified' AND f.factor_type='totp')
$$;
ALTER FUNCTION auth.aal2() OWNER TO phase2_definer;
-- No policies grant end users object/bucket access: downloads stay server-mediated.
-- Storage initialization creates its own schema; the test setup verifies public=false
-- and zero anon/authenticated object policies before trusting private fixture delivery.
COMMIT;
