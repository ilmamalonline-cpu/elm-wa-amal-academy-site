-- Only after official native Storage migrations; never a deployment migration.
BEGIN;
DO $$ BEGIN IF current_database()<>'phase2_provider_test' THEN RAISE EXCEPTION 'Disposable provider database required'; END IF; END $$;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
-- Native migrations grant table operations; RLS has NO end-user object policies.
-- service_role bypass is used only server-side, after application metadata RLS.
DO $$ BEGIN
 IF EXISTS(SELECT FROM storage.buckets WHERE id='phase2-private' AND public) THEN RAISE EXCEPTION 'Private bucket must not be public'; END IF;
 IF EXISTS(SELECT FROM pg_policies WHERE schemaname='storage' AND tablename IN('objects','buckets') AND ('anon'=ANY(roles) OR 'authenticated'=ANY(roles) OR 'public'=ANY(roles))) THEN RAISE EXCEPTION 'No direct end-user Storage policies permitted'; END IF;
END $$;
COMMIT;
