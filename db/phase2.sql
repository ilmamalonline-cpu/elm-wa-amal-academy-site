-- LOCAL DISPOSABLE SYNTHETIC HARNESS ONLY. Not a Supabase migration.
-- Run only through scripts/phase2-reset.mjs against loopback database phase2_test.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'phase2_test' THEN RAISE EXCEPTION 'Disposable phase2_test database required'; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='phase2_authenticated') THEN CREATE ROLE phase2_authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='phase2_api') THEN CREATE ROLE phase2_api LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='phase2_bootstrap') THEN CREATE ROLE phase2_bootstrap NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='phase2_definer') THEN CREATE ROLE phase2_definer NOLOGIN NOSUPERUSER BYPASSRLS; END IF;
END $$;
GRANT phase2_authenticated TO phase2_api;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), expires_at timestamptz NOT NULL, revoked_at timestamptz);
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY; ALTER TABLE auth.users FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE auth.sessions FORCE ROW LEVEL SECURITY;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.aal2() RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT coalesce(current_setting('request.jwt.claim.aal',true)='aal2',false) $$;

CREATE TABLE public.profiles(
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id), display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 200),
  preferred_locale text NOT NULL CHECK(preferred_locale IN('ar','en')), timezone text NOT NULL,
  status text NOT NULL CHECK(status IN('active','suspended','closed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.students(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid UNIQUE REFERENCES auth.users(id),
  full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 200), age_band text NOT NULL CHECK(age_band IN('child','adult')),
  preferred_locale text NOT NULL CHECK(preferred_locale IN('ar','en')), timezone text NOT NULL,
  status text NOT NULL CHECK(status IN('active','inactive','archived')), frozen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(auth_user_id IS NULL OR age_band='adult')
);
CREATE TABLE public.user_roles(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK(role IN('admin','teacher','student','guardian')), granted_by uuid NOT NULL REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
  version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE UNIQUE INDEX roles_live ON public.user_roles(auth_user_id,role) WHERE revoked_at IS NULL;
CREATE TABLE public.capabilities(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid NOT NULL REFERENCES auth.users(id),
  capability text NOT NULL CHECK(capability IN('payment.review','roles.manage','guardian.verify')),
  granted_by uuid NOT NULL REFERENCES auth.users(id), granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX capabilities_live ON public.capabilities(auth_user_id,capability) WHERE revoked_at IS NULL;
CREATE TABLE public.teachers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id), display_name text NOT NULL, status text NOT NULL CHECK(status IN('active','inactive','suspended')));
CREATE TABLE public.guardian_links(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guardian_user_id uuid NOT NULL REFERENCES auth.users(id), student_id uuid NOT NULL REFERENCES public.students(id),
  relationship text NOT NULL CHECK(length(trim(relationship)) BETWEEN 1 AND 100), verification_status text NOT NULL CHECK(verification_status IN('pending','verified','revoked')),
  verified_by uuid REFERENCES auth.users(id), verified_at timestamptz, evidence_note text CHECK(length(evidence_note)<=500),
  consent_version text NOT NULL CHECK(length(trim(consent_version)) BETWEEN 1 AND 100), consent_method text NOT NULL CHECK(length(trim(consent_method)) BETWEEN 1 AND 100),
  consent_purpose text NOT NULL DEFAULT 'educational-access', consent_status text NOT NULL DEFAULT 'active' CHECK(consent_status IN('active','withdrawn')),
  consent_accepted_by uuid NOT NULL REFERENCES auth.users(id), consent_accepted_at timestamptz NOT NULL DEFAULT now(), consent_withdrawn_at timestamptz,
  revoked_at timestamptz, freeze_reason text,
  CHECK(consent_accepted_by=guardian_user_id), CHECK(verification_status<>'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE UNIQUE INDEX guardian_links_live ON public.guardian_links(guardian_user_id,student_id) WHERE verification_status='verified' AND revoked_at IS NULL;
CREATE TABLE public.teacher_assignments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), teacher_user_id uuid NOT NULL REFERENCES public.teachers(auth_user_id), student_id uuid NOT NULL REFERENCES public.students(id),
  status text NOT NULL CHECK(status IN('active','ended','revoked')), starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz,
  assigned_by uuid NOT NULL REFERENCES auth.users(id), CHECK(ends_at IS NULL OR ends_at>=starts_at)
);
CREATE UNIQUE INDEX assignments_live ON public.teacher_assignments(teacher_user_id,student_id) WHERE status='active';
-- Boundary fixtures only: no payment verification or educational authoring workflow.
CREATE TABLE public.published_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES public.students(id), body text NOT NULL, status text NOT NULL CHECK(status IN('draft','published','withdrawn')));
CREATE TABLE public.teacher_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES public.students(id), teacher_user_id uuid NOT NULL REFERENCES public.teachers(auth_user_id), body text NOT NULL);
CREATE TABLE public.payment_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES public.students(id), requested_by_user_id uuid NOT NULL REFERENCES auth.users(id), reference text NOT NULL, UNIQUE(id,requested_by_user_id));
CREATE TABLE public.private_files(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES auth.users(id), payment_record_id uuid NOT NULL,
  purpose text NOT NULL CHECK(purpose='payment_evidence'), object_path text UNIQUE NOT NULL, sha256 text CHECK(sha256 IS NULL OR sha256~'^[a-f0-9]{64}$'),
  mime_type text NOT NULL CHECK(mime_type IN('image/png','image/jpeg','application/pdf')), size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  validation_status text NOT NULL CHECK(validation_status IN('quarantined','validated','rejected','deleted')), scan_status text NOT NULL CHECK(scan_status IN('pending','clean','infected','not_run')),
  FOREIGN KEY(payment_record_id,owner_user_id) REFERENCES public.payment_records(id,requested_by_user_id)
);
CREATE TABLE public.audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid NOT NULL REFERENCES auth.users(id), action text NOT NULL, target_id uuid, reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.bootstrap_control(id boolean PRIMARY KEY DEFAULT true CHECK(id), preauthorized_owner_id uuid REFERENCES auth.users(id), consumed_at timestamptz);
INSERT INTO public.bootstrap_control(id) VALUES(true);
CREATE INDEX sessions_user ON auth.sessions(user_id);
CREATE INDEX guardian_student ON public.guardian_links(student_id);
CREATE INDEX assignment_student ON public.teacher_assignments(student_id);
CREATE INDEX reports_student ON public.published_reports(student_id);
CREATE INDEX notes_student ON public.teacher_notes(student_id);
CREATE INDEX payments_requester ON public.payment_records(requested_by_user_id);
CREATE INDEX files_payment ON public.private_files(payment_record_id);

CREATE FUNCTION public.current_active_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM public.profiles p JOIN auth.sessions s ON s.user_id=p.auth_user_id WHERE p.auth_user_id=auth.uid() AND p.status='active' AND s.id=nullif(current_setting('request.jwt.claim.session_id',true),'')::uuid AND s.revoked_at IS NULL AND s.expires_at>now())
$$;
CREATE FUNCTION public.session_is_active(p_session_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.current_active_user() AND p_session_id=nullif(current_setting('request.jwt.claim.session_id',true),'')::uuid
$$;
CREATE FUNCTION public.has_role(r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.current_active_user() AND EXISTS(SELECT FROM public.user_roles WHERE auth_user_id=auth.uid() AND role=r AND revoked_at IS NULL) $$;
CREATE FUNCTION public.has_capability(c text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.has_role('admin') AND EXISTS(SELECT FROM public.capabilities WHERE auth_user_id=auth.uid() AND capability=c AND revoked_at IS NULL) $$;
CREATE FUNCTION public.student_open(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT FROM public.students WHERE id=s AND status='active' AND NOT frozen) $$;
CREATE FUNCTION public.own_student(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.has_role('student') AND public.student_open(s) AND EXISTS(SELECT FROM public.students WHERE id=s AND auth_user_id=auth.uid()) $$;
CREATE FUNCTION public.linked_student(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.has_role('guardian') AND public.student_open(s) AND EXISTS(SELECT FROM public.guardian_links WHERE guardian_user_id=auth.uid() AND student_id=s AND verification_status='verified' AND revoked_at IS NULL AND consent_status='active' AND consent_withdrawn_at IS NULL AND consent_purpose='educational-access')
$$;
CREATE FUNCTION public.assigned_student(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.has_role('teacher') AND public.student_open(s) AND EXISTS(SELECT FROM public.teacher_assignments a JOIN public.teachers t ON t.auth_user_id=a.teacher_user_id WHERE a.teacher_user_id=auth.uid() AND a.student_id=s AND a.status='active' AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now()) AND t.status='active')
$$;
CREATE FUNCTION public.audit(a text,t uuid,r text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ INSERT INTO public.audit_events(actor_user_id,action,target_id,reason) VALUES(auth.uid(),a,t,r) $$;
CREATE FUNCTION public.bootstrap_admin(owner_id uuid,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.bootstrap_control%ROWTYPE;
BEGIN
 SELECT * INTO b FROM public.bootstrap_control WHERE id=true FOR UPDATE;
 IF b.consumed_at IS NOT NULL OR b.preauthorized_owner_id IS DISTINCT FROM owner_id OR auth.uid() IS DISTINCT FROM owner_id OR NOT auth.aal2() OR NOT public.current_active_user() THEN RAISE EXCEPTION 'bootstrap unavailable'; END IF;
 IF EXISTS(SELECT FROM public.user_roles WHERE role='admin' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'bootstrap unavailable'; END IF;
 INSERT INTO public.user_roles(auth_user_id,role,granted_by,reason) VALUES(owner_id,'admin',owner_id,why);
 INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES(owner_id,'roles.manage',owner_id,why),(owner_id,'guardian.verify',owner_id,why);
 UPDATE public.bootstrap_control SET consumed_at=now() WHERE id=true;
 PERFORM public.audit('bootstrap.admin',owner_id,why);
END $$;
CREATE FUNCTION public.grant_role(target uuid,r text,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_capability('roles.manage') OR NOT auth.aal2() OR NOT EXISTS(SELECT FROM public.profiles WHERE auth_user_id=target AND status='active') THEN RAISE EXCEPTION 'role authorization failed'; END IF;
 INSERT INTO public.user_roles(auth_user_id,role,granted_by,reason) VALUES(target,r,auth.uid(),why); PERFORM public.audit('role.grant',target,why);
END $$;
CREATE FUNCTION public.revoke_role(target uuid,r text,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_capability('roles.manage') OR NOT auth.aal2() THEN RAISE EXCEPTION 'role authorization failed'; END IF;
 UPDATE public.user_roles SET revoked_at=now() WHERE auth_user_id=target AND role=r AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'active role unavailable'; END IF; PERFORM public.audit('role.revoke',target,why);
END $$;
CREATE FUNCTION public.grant_capability(target uuid,c text,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_capability('roles.manage') OR NOT auth.aal2() OR NOT EXISTS(SELECT FROM public.user_roles u JOIN public.profiles p USING(auth_user_id) WHERE u.auth_user_id=target AND u.role='admin' AND u.revoked_at IS NULL AND p.status='active') THEN RAISE EXCEPTION 'capability authorization failed'; END IF;
 INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES(target,c,auth.uid(),why); PERFORM public.audit('capability.grant',target,why);
END $$;
CREATE FUNCTION public.revoke_capability(target uuid,c text,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_capability('roles.manage') OR NOT auth.aal2() THEN RAISE EXCEPTION 'capability authorization failed'; END IF;
 UPDATE public.capabilities SET revoked_at=now() WHERE auth_user_id=target AND capability=c AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'active capability unavailable'; END IF; PERFORM public.audit('capability.revoke',target,why);
END $$;
-- Consent inputs represent a synthetic recorded decision, not an approved real verification procedure.
CREATE FUNCTION public.grant_guardian_link(g uuid,s uuid,rel text,consent text,method text,evidence text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x uuid;
BEGIN
 IF NOT public.has_capability('guardian.verify') OR NOT auth.aal2() OR NOT public.student_open(s) OR NOT EXISTS(SELECT FROM public.profiles p JOIN public.user_roles r USING(auth_user_id) WHERE p.auth_user_id=g AND p.status='active' AND r.role='guardian' AND r.revoked_at IS NULL) THEN RAISE EXCEPTION 'guardian authorization failed'; END IF;
 INSERT INTO public.guardian_links(guardian_user_id,student_id,relationship,verification_status,verified_by,verified_at,evidence_note,consent_version,consent_method,consent_accepted_by) VALUES(g,s,rel,'verified',auth.uid(),now(),evidence,consent,method,g) RETURNING id INTO x;
 PERFORM public.audit('guardian_link.grant',x,'synthetic verified consent decision'); RETURN x;
END $$;
CREATE FUNCTION public.revoke_guardian_link(x uuid,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_capability('guardian.verify') OR NOT auth.aal2() THEN RAISE EXCEPTION 'guardian authorization failed'; END IF;
 UPDATE public.guardian_links SET verification_status='revoked',revoked_at=now(),consent_status='withdrawn',consent_withdrawn_at=now(),freeze_reason=why WHERE id=x AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'active link unavailable'; END IF; PERFORM public.audit('guardian_link.revoke',x,why);
END $$;
CREATE FUNCTION public.assign_teacher(t uuid,s uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x uuid;
BEGIN
 IF NOT public.has_role('admin') OR NOT auth.aal2() OR NOT public.student_open(s) OR NOT EXISTS(SELECT FROM public.teachers te JOIN public.profiles p USING(auth_user_id) JOIN public.user_roles r USING(auth_user_id) WHERE te.auth_user_id=t AND te.status='active' AND p.status='active' AND r.role='teacher' AND r.revoked_at IS NULL) THEN RAISE EXCEPTION 'assignment authorization failed'; END IF;
 INSERT INTO public.teacher_assignments(teacher_user_id,student_id,status,assigned_by) VALUES(t,s,'active',auth.uid()) RETURNING id INTO x; PERFORM public.audit('teacher.assign',x,'synthetic assignment'); RETURN x;
END $$;
CREATE FUNCTION public.revoke_teacher(x uuid,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_role('admin') OR NOT auth.aal2() THEN RAISE EXCEPTION 'assignment authorization failed'; END IF;
 UPDATE public.teacher_assignments SET status='revoked',ends_at=greatest(now(),starts_at) WHERE id=x AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'active assignment unavailable'; END IF; PERFORM public.audit('teacher.revoke',x,why);
END $$;
CREATE FUNCTION public.freeze_student(s uuid,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_role('admin') OR NOT auth.aal2() THEN RAISE EXCEPTION 'freeze authorization failed'; END IF;
 UPDATE public.students SET frozen=true WHERE id=s AND NOT frozen;
 IF NOT FOUND THEN RAISE EXCEPTION 'student unavailable'; END IF; PERFORM public.audit('student.freeze',s,why);
END $$;
CREATE FUNCTION public.protect_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'history deletion prohibited'; END IF;
 IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') THEN RAISE EXCEPTION 'only one-time revocation permitted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER roles_history BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.protect_history();
CREATE TRIGGER capabilities_history BEFORE UPDATE OR DELETE ON public.capabilities FOR EACH ROW EXECUTE FUNCTION public.protect_history();
CREATE FUNCTION public.audit_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'audit append only'; END $$;
CREATE TRIGGER audit_no_mutation BEFORE UPDATE OR DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_append_only();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','students','user_roles','capabilities','teachers','guardian_links','teacher_assignments','published_reports','teacher_notes','payment_records','private_files','audit_events','bootstrap_control'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND (auth_user_id=auth.uid() OR public.has_role('admin')));
CREATE POLICY students_read ON public.students FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND NOT frozen AND status='active' AND (public.own_student(id) OR public.linked_student(id) OR public.assigned_student(id) OR public.has_role('admin')));
CREATE POLICY roles_read ON public.user_roles FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND (auth_user_id=auth.uid() OR public.has_role('admin')));
CREATE POLICY teachers_read ON public.teachers FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND (auth_user_id=auth.uid() OR public.has_role('admin')));
CREATE POLICY guardian_read ON public.guardian_links FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND (public.has_role('admin') OR (guardian_user_id=auth.uid() AND public.linked_student(student_id))));
CREATE POLICY assignments_read ON public.teacher_assignments FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND (public.has_role('admin') OR (teacher_user_id=auth.uid() AND public.assigned_student(student_id))));
CREATE POLICY reports_read ON public.published_reports FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND EXISTS(SELECT FROM public.students s WHERE s.id=student_id) AND (public.has_role('admin') OR public.assigned_student(student_id) OR (status='published' AND (public.linked_student(student_id) OR public.own_student(student_id)))));
CREATE POLICY notes_read ON public.teacher_notes FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND EXISTS(SELECT FROM public.students s WHERE s.id=student_id) AND (public.has_role('admin') OR (teacher_user_id=auth.uid() AND public.assigned_student(student_id))));
CREATE POLICY payments_read ON public.payment_records FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND ((requested_by_user_id=auth.uid() AND (public.has_role('guardian') OR public.has_role('student'))) OR public.has_capability('payment.review')));
CREATE POLICY files_read ON public.private_files FOR SELECT TO phase2_authenticated USING(public.current_active_user() AND validation_status='validated' AND scan_status='clean' AND ((owner_user_id=auth.uid() AND EXISTS(SELECT FROM public.payment_records p WHERE p.id=payment_record_id AND p.requested_by_user_id=auth.uid())) OR public.has_capability('payment.review')));
CREATE POLICY audit_read ON public.audit_events FOR SELECT TO phase2_authenticated USING(public.has_role('admin'));

REVOKE ALL ON ALL TABLES IN SCHEMA public,auth FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,auth FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap;
GRANT USAGE ON SCHEMA public,auth TO phase2_authenticated,phase2_definer,phase2_bootstrap;
-- Dedicated non-login definer is a trusted SQL boundary, not an application credential.
GRANT SELECT ON ALL TABLES IN SCHEMA public,auth TO phase2_definer;
GRANT INSERT,UPDATE ON public.user_roles,public.capabilities,public.guardian_links,public.teacher_assignments,public.students,public.bootstrap_control TO phase2_definer;
GRANT INSERT ON public.audit_events TO phase2_definer;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname IN('public','auth') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO phase2_definer',f.signature);
 END LOOP;
END $$;
GRANT SELECT(auth_user_id,display_name,preferred_locale,timezone,status) ON public.profiles TO phase2_authenticated;
GRANT SELECT(id,full_name,age_band,preferred_locale,timezone,status) ON public.students TO phase2_authenticated;
GRANT SELECT(auth_user_id,role,revoked_at) ON public.user_roles TO phase2_authenticated;
GRANT SELECT(id,teacher_user_id,student_id,status) ON public.teacher_assignments TO phase2_authenticated;
GRANT SELECT(id,guardian_user_id,student_id,verification_status,revoked_at) ON public.guardian_links TO phase2_authenticated;
GRANT SELECT(id,student_id,body,status) ON public.published_reports TO phase2_authenticated;
GRANT SELECT(id,student_id,teacher_user_id,body) ON public.teacher_notes TO phase2_authenticated;
GRANT SELECT(id,student_id,requested_by_user_id,reference) ON public.payment_records TO phase2_authenticated;
GRANT SELECT(id,owner_user_id,purpose,object_path,sha256,mime_type,size_bytes,validation_status,scan_status) ON public.private_files TO phase2_authenticated;
GRANT SELECT(id,actor_user_id,action,target_id,reason,created_at) ON public.audit_events TO phase2_authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.aal2(),public.current_active_user(),public.session_is_active(uuid),public.has_role(text),public.has_capability(text),public.own_student(uuid),public.linked_student(uuid),public.assigned_student(uuid) TO phase2_authenticated;
GRANT EXECUTE ON FUNCTION public.grant_role(uuid,text,text),public.revoke_role(uuid,text,text),public.grant_capability(uuid,text,text),public.revoke_capability(uuid,text,text),public.grant_guardian_link(uuid,uuid,text,text,text,text),public.revoke_guardian_link(uuid,text),public.assign_teacher(uuid,uuid),public.revoke_teacher(uuid,text),public.freeze_student(uuid,text) TO phase2_authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin(uuid,text),auth.uid(),auth.aal2() TO phase2_bootstrap;
COMMIT;
