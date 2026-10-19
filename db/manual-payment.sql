-- ADDITIVE LOCAL SYNTHETIC PROTOTYPE ONLY. Never run on a prepared/live database.
-- The test harness installs this only on its own newly-created PostgreSQL cluster.
-- Deliberately NOT included in the fingerprint-pinned native initialization plan.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('phase2_test','phase2_provider_test') OR current_setting('manual_payment.install',true) IS DISTINCT FROM 'synthetic-only' THEN
  RAISE EXCEPTION 'fresh synthetic installation required';
 END IF;
END $$;
CREATE SCHEMA manual_payment;
REVOKE ALL ON SCHEMA manual_payment FROM PUBLIC;
GRANT USAGE ON SCHEMA manual_payment TO phase2_authenticated,phase2_definer;
CREATE TABLE manual_payment.orders(
 id uuid PRIMARY KEY, student_id uuid NOT NULL REFERENCES public.students(id),
 requester_id uuid NOT NULL REFERENCES auth.users(id), package_id text NOT NULL,
 package_version text NOT NULL DEFAULT 'published-v1', advertised_minor integer NOT NULL,
 advertised_currency text NOT NULL DEFAULT 'SAR' CHECK(advertised_currency='SAR'),
 lessons integer NOT NULL DEFAULT 8 CHECK(lessons=8), duration_minutes integer NOT NULL,
 duration_is_maximum boolean NOT NULL, features text[] NOT NULL,
 policy_version text NOT NULL DEFAULT 'manual-payment-local-v1', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((package_id='quran' AND advertised_minor=36000 AND duration_minutes=60 AND NOT duration_is_maximum AND features=ARRAY['memorization','general-meanings']) OR
       (package_id='quran-noor' AND advertised_minor=50000 AND duration_minutes=60 AND NOT duration_is_maximum AND features=ARRAY['memorization','noor-al-bayan','general-meanings']) OR
       (package_id='quran-noor-tajweed' AND advertised_minor=65000 AND duration_minutes=90 AND duration_is_maximum AND features=ARRAY['memorization','noor-al-bayan','tajweed']))
);
CREATE TABLE manual_payment.quotes(
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES manual_payment.orders(id), revision integer NOT NULL CHECK(revision>0),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000), currency text NOT NULL CHECK(currency IN('EGP','SAR')),
 method text NOT NULL CHECK(method IN('synthetic-egyptian-wallet','synthetic-manual-agreement')),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(method<>'synthetic-egyptian-wallet' OR currency='EGP'), UNIQUE(order_id,revision), UNIQUE(id,order_id)
);
CREATE TABLE manual_payment.acceptances(
 quote_id uuid PRIMARY KEY REFERENCES manual_payment.quotes(id), accepted_by uuid NOT NULL REFERENCES auth.users(id),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE manual_payment.attempts(
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES manual_payment.orders(id), quote_id uuid NOT NULL,
 submitted_by uuid NOT NULL REFERENCES auth.users(id), amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000),
 currency text NOT NULL CHECK(currency IN('EGP','SAR')), reference text NOT NULL CHECK(reference~'^SYNTHETIC-[A-Z0-9-]{1,80}$'),
 previous_attempt_id uuid REFERENCES manual_payment.attempts(id), submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(quote_id,order_id) REFERENCES manual_payment.quotes(id,order_id)
);
CREATE TABLE manual_payment.decisions(
 attempt_id uuid PRIMARY KEY REFERENCES manual_payment.attempts(id), decision text NOT NULL CHECK(decision IN('verified','rejected')),
 reviewed_by uuid NOT NULL REFERENCES auth.users(id), reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 actual_minor bigint, actual_currency text, verification_source text, capacity_confirmed boolean NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(decision<>'verified' OR (actual_minor IS NOT NULL AND actual_currency IS NOT NULL AND verification_source IS NOT NULL AND verification_source~'^SYNTHETIC-[A-Z0-9-]{1,80}$' AND capacity_confirmed))
);
CREATE TABLE manual_payment.activations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL UNIQUE REFERENCES manual_payment.orders(id),
 attempt_id uuid NOT NULL UNIQUE REFERENCES manual_payment.decisions(attempt_id), student_id uuid NOT NULL REFERENCES public.students(id),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, business_zone text NOT NULL DEFAULT 'Africa/Cairo' CHECK(business_zone='Africa/Cairo'),
 lesson_entitlement integer NOT NULL DEFAULT 8 CHECK(lesson_entitlement=8), CHECK(ends_at>starts_at)
);
CREATE INDEX payment_period_student ON manual_payment.activations(student_id,ends_at);
CREATE TABLE manual_payment.outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES manual_payment.orders(id),
 attempt_id uuid NOT NULL REFERENCES manual_payment.decisions(attempt_id), event_type text NOT NULL CHECK(event_type IN('payment.verified','payment.rejected')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(attempt_id,event_type)
);
-- Everything financial is append-only. State is derived from immutable events.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['orders','quotes','acceptances','attempts','decisions','activations','outbox'] LOOP
  EXECUTE format('ALTER TABLE manual_payment.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE manual_payment.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON manual_payment.%I FOR EACH ROW EXECUTE FUNCTION public.audit_append_only()',t);
 END LOOP;
END $$;
CREATE FUNCTION manual_payment.requester_can_access(s uuid,u uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.current_active_user() AND u=auth.uid() AND (public.own_student(s) OR public.linked_student(s))
$$;
CREATE FUNCTION manual_payment.can_read(o uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM manual_payment.orders r WHERE r.id=o AND public.student_open(r.student_id) AND
   (manual_payment.requester_can_access(r.student_id,r.requester_id) OR (public.has_capability('payment.review') AND auth.aal2())))
$$;
CREATE POLICY orders_read ON manual_payment.orders FOR SELECT TO phase2_authenticated USING(manual_payment.can_read(id));
CREATE POLICY quotes_read ON manual_payment.quotes FOR SELECT TO phase2_authenticated USING(manual_payment.can_read(order_id));
CREATE POLICY accepts_read ON manual_payment.acceptances FOR SELECT TO phase2_authenticated USING(EXISTS(SELECT FROM manual_payment.quotes q WHERE q.id=quote_id));
CREATE POLICY attempts_read ON manual_payment.attempts FOR SELECT TO phase2_authenticated USING(manual_payment.can_read(order_id));
-- Detailed verification notes remain reviewer-only, not exposed to the family.
CREATE POLICY decisions_read ON manual_payment.decisions FOR SELECT TO phase2_authenticated USING(public.has_capability('payment.review') AND auth.aal2() AND EXISTS(SELECT FROM manual_payment.attempts a WHERE a.id=attempt_id));
CREATE POLICY activations_read ON manual_payment.activations FOR SELECT TO phase2_authenticated USING(manual_payment.can_read(order_id));
-- outbox has no application read policy/grant, and no dispatcher is activated.
CREATE FUNCTION manual_payment.require_reviewer() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_capability('payment.review') OR NOT auth.aal2() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='protected review required'; END IF;
END $$;
CREATE FUNCTION manual_payment.lock_order(o uuid,reviewer boolean) RETURNS manual_payment.orders
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r manual_payment.orders;
BEGIN
 IF o IS NULL OR reviewer IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='explicit order context required'; END IF;
 IF reviewer THEN PERFORM manual_payment.require_reviewer(); END IF;
 SELECT * INTO r FROM manual_payment.orders WHERE id=o FOR UPDATE;
 IF NOT FOUND OR NOT public.student_open(r.student_id) OR (NOT reviewer AND NOT manual_payment.requester_can_access(r.student_id,r.requester_id)) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='order unavailable';
 END IF;
 RETURN r;
END $$;
CREATE FUNCTION manual_payment.create_order(o uuid,s uuid,p text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r manual_payment.orders; price integer; minutes integer; maximum boolean; f text[];
BEGIN
 IF o IS NULL OR s IS NULL OR p IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='required order fields'; END IF;
 IF NOT (public.own_student(s) OR public.linked_student(s)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='requester required'; END IF;
 -- Serializes first-use replay of the client-generated order UUID.
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text,711));
 SELECT * INTO r FROM manual_payment.orders WHERE id=o;
 IF FOUND THEN
  IF r.requester_id IS DISTINCT FROM auth.uid() OR r.student_id IS DISTINCT FROM s OR r.package_id IS DISTINCT FROM p THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='idempotency conflict'; END IF;
  RETURN o;
 END IF;
 CASE p
 WHEN 'quran' THEN price:=36000; minutes:=60; maximum:=false; f:=ARRAY['memorization','general-meanings'];
 WHEN 'quran-noor' THEN price:=50000; minutes:=60; maximum:=false; f:=ARRAY['memorization','noor-al-bayan','general-meanings'];
 WHEN 'quran-noor-tajweed' THEN price:=65000; minutes:=90; maximum:=true; f:=ARRAY['memorization','noor-al-bayan','tajweed'];
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unknown package'; END CASE;
 INSERT INTO manual_payment.orders(id,student_id,requester_id,package_id,advertised_minor,duration_minutes,duration_is_maximum,features) VALUES(o,s,auth.uid(),p,price,minutes,maximum,f);
 PERFORM public.audit('manual.order.created',o,'synthetic order'); RETURN o;
END $$;
CREATE FUNCTION manual_payment.offer_quote(o uuid,q uuid,amount bigint,c text,m text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior manual_payment.quotes; revision integer;
BEGIN
 IF o IS NULL OR q IS NULL OR amount IS NULL OR c IS NULL OR m IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='required quote fields'; END IF;
 PERFORM manual_payment.lock_order(o,true);
 SELECT * INTO prior FROM manual_payment.quotes WHERE id=q;
 IF FOUND THEN
  IF prior.order_id IS DISTINCT FROM o OR prior.amount_minor IS DISTINCT FROM amount OR prior.currency IS DISTINCT FROM c OR prior.method IS DISTINCT FROM m THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='idempotency conflict'; END IF;
  RETURN q;
 END IF;
 IF EXISTS(SELECT FROM manual_payment.activations WHERE order_id=o) OR EXISTS(SELECT FROM manual_payment.attempts a WHERE a.order_id=o AND NOT EXISTS(SELECT FROM manual_payment.decisions d WHERE d.attempt_id=a.id)) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='resolve pending attempt before replacing quote';
 END IF;
 SELECT coalesce(max(v.revision),0)+1 INTO revision FROM manual_payment.quotes v WHERE order_id=o;
 INSERT INTO manual_payment.quotes(id,order_id,revision,amount_minor,currency,method,created_by) VALUES(q,o,revision,amount,c,m,auth.uid());
 PERFORM public.audit('manual.quote.offered',o,'synthetic explicit financial agreement'); RETURN q;
END $$;
CREATE FUNCTION manual_payment.accept_quote(o uuid,q uuid,amount bigint,c text,m text,policy text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r manual_payment.orders; v manual_payment.quotes;
BEGIN
 IF o IS NULL OR q IS NULL OR amount IS NULL OR c IS NULL OR m IS NULL OR policy IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='required acceptance fields'; END IF;
 r:=manual_payment.lock_order(o,false);
 SELECT * INTO v FROM manual_payment.quotes WHERE order_id=o ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND OR v.id IS DISTINCT FROM q OR v.amount_minor IS DISTINCT FROM amount OR v.currency IS DISTINCT FROM c OR v.method IS DISTINCT FROM m OR r.policy_version IS DISTINCT FROM policy THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='explicit current agreement required';
 END IF;
 IF EXISTS(SELECT FROM manual_payment.acceptances WHERE quote_id=q) THEN RETURN q; END IF;
 IF EXISTS(SELECT FROM manual_payment.activations WHERE order_id=o) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='order finalized'; END IF;
 INSERT INTO manual_payment.acceptances(quote_id,accepted_by) VALUES(q,auth.uid());
 PERFORM public.audit('manual.quote.accepted',o,'synthetic requester acceptance'); RETURN q;
END $$;
CREATE FUNCTION manual_payment.submit_attempt(o uuid,a uuid,q uuid,amount bigint,c text,ref text,previous uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v manual_payment.quotes; prior manual_payment.attempts; last_attempt uuid;
BEGIN
 IF o IS NULL OR a IS NULL OR q IS NULL OR amount IS NULL OR c IS NULL OR ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='required attempt fields'; END IF;
 PERFORM manual_payment.lock_order(o,false);
 ref:=upper(trim(ref));
 SELECT * INTO prior FROM manual_payment.attempts WHERE id=a;
 IF FOUND THEN
  IF prior.order_id IS DISTINCT FROM o OR prior.quote_id IS DISTINCT FROM q OR prior.submitted_by IS DISTINCT FROM auth.uid() OR prior.amount_minor IS DISTINCT FROM amount OR prior.currency IS DISTINCT FROM c OR prior.reference IS DISTINCT FROM ref OR prior.previous_attempt_id IS DISTINCT FROM previous THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='idempotency conflict'; END IF;
  RETURN a;
 END IF;
 SELECT * INTO v FROM manual_payment.quotes WHERE order_id=o ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND OR v.id IS DISTINCT FROM q OR NOT EXISTS(SELECT FROM manual_payment.acceptances WHERE quote_id=q AND accepted_by=auth.uid()) OR v.amount_minor IS DISTINCT FROM amount OR v.currency IS DISTINCT FROM c THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted current agreement required';
 END IF;
 IF EXISTS(SELECT FROM manual_payment.activations WHERE order_id=o) OR EXISTS(SELECT FROM manual_payment.attempts t WHERE t.order_id=o AND NOT EXISTS(SELECT FROM manual_payment.decisions d WHERE d.attempt_id=t.id)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='order finalized or pending'; END IF;
 SELECT id INTO last_attempt FROM manual_payment.attempts WHERE order_id=o ORDER BY submitted_at DESC,id DESC LIMIT 1;
 IF previous IS DISTINCT FROM last_attempt THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='resubmission chain required'; END IF;
 -- Conservative duplicate quarantine: a used method/reference cannot be reused even after rejection.
 PERFORM pg_advisory_xact_lock(hashtextextended(v.method||':'||ref,712));
 IF EXISTS(SELECT FROM manual_payment.attempts t JOIN manual_payment.quotes z ON z.id=t.quote_id WHERE z.method=v.method AND t.reference=ref) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reference requires separate investigation'; END IF;
 INSERT INTO manual_payment.attempts(id,order_id,quote_id,submitted_by,amount_minor,currency,reference,previous_attempt_id) VALUES(a,o,q,auth.uid(),amount,c,ref,previous);
 PERFORM public.audit('manual.attempt.submitted',o,'synthetic text reference only; not verification'); RETURN a;
END $$;
CREATE FUNCTION manual_payment.calendar_month_end(start_time timestamptz) RETURNS timestamptz
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE local_end timestamp; result timestamptz;
BEGIN
 local_end:=(start_time AT TIME ZONE 'Africa/Cairo')+interval '1 month';
 result:=local_end AT TIME ZONE 'Africa/Cairo';
 -- Cairo DST is one hour. Reject nonexistent or ambiguous local boundaries;
 -- do not silently choose a shifted time or one of the two possible offsets.
 IF (result AT TIME ZONE 'Africa/Cairo')<>local_end OR ((result-interval '1 hour') AT TIME ZONE 'Africa/Cairo')=local_end OR ((result+interval '1 hour') AT TIME ZONE 'Africa/Cairo')=local_end THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='calendar boundary needs explicit operational resolution';
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION manual_payment.review_attempt(o uuid,a uuid,outcome text,why text,actual bigint,c text,source text,capacity boolean) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r manual_payment.orders; t manual_payment.attempts; q manual_payment.quotes; prior manual_payment.decisions; activation uuid; start_time timestamptz;
BEGIN
 IF o IS NULL OR a IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='required review context'; END IF;
 r:=manual_payment.lock_order(o,true);
 IF outcome IS NULL OR outcome NOT IN('verified','rejected') OR why IS NULL OR length(trim(why)) NOT BETWEEN 1 AND 500 OR capacity IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reasoned decision required'; END IF;
 SELECT * INTO t FROM manual_payment.attempts WHERE id=a AND order_id=o FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='attempt unavailable'; END IF;
 SELECT * INTO prior FROM manual_payment.decisions WHERE attempt_id=a;
 IF FOUND THEN
  IF prior.decision IS DISTINCT FROM outcome OR prior.reason IS DISTINCT FROM trim(why) OR prior.actual_minor IS DISTINCT FROM actual OR prior.actual_currency IS DISTINCT FROM c OR prior.verification_source IS DISTINCT FROM source OR prior.capacity_confirmed IS DISTINCT FROM capacity THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='final decision immutable'; END IF;
  SELECT id INTO activation FROM manual_payment.activations WHERE attempt_id=a; RETURN activation;
 END IF;
 IF EXISTS(SELECT FROM manual_payment.activations WHERE order_id=o) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='order already activated'; END IF;
 SELECT * INTO q FROM manual_payment.quotes WHERE order_id=o ORDER BY revision DESC LIMIT 1;
 IF q.id IS DISTINCT FROM t.quote_id OR NOT EXISTS(SELECT FROM manual_payment.acceptances WHERE quote_id=q.id AND accepted_by=r.requester_id) OR NOT EXISTS(SELECT FROM public.profiles WHERE auth_user_id=r.requester_id AND status='active') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='agreement unavailable'; END IF;
 -- Re-check current requester ownership/consent independently of reviewer identity.
 IF NOT EXISTS(SELECT FROM public.students s WHERE s.id=r.student_id AND ((s.age_band='adult' AND s.auth_user_id=r.requester_id AND EXISTS(SELECT FROM public.user_roles WHERE auth_user_id=r.requester_id AND role='student' AND revoked_at IS NULL)) OR EXISTS(SELECT FROM public.guardian_links g JOIN public.user_roles u ON u.auth_user_id=g.guardian_user_id AND u.role='guardian' AND u.revoked_at IS NULL WHERE g.student_id=s.id AND g.guardian_user_id=r.requester_id AND g.verification_status='verified' AND g.revoked_at IS NULL AND g.consent_status='active' AND g.consent_withdrawn_at IS NULL AND g.consent_purpose='educational-access'))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='requester access revoked'; END IF;
 IF outcome='verified' THEN
  IF actual IS DISTINCT FROM q.amount_minor OR c IS DISTINCT FROM q.currency OR actual IS DISTINCT FROM t.amount_minor OR c IS DISTINCT FROM t.currency OR source IS NULL OR source!~'^SYNTHETIC-[A-Z0-9-]{1,80}$' OR NOT capacity THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='matching protected verification and capacity required'; END IF;
  PERFORM 1 FROM public.students WHERE id=r.student_id FOR UPDATE;
  start_time:=clock_timestamp();
  IF EXISTS(SELECT FROM manual_payment.activations WHERE student_id=r.student_id AND ends_at>start_time) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='overlapping enrollment; no advance renewal'; END IF;
 END IF;
 INSERT INTO manual_payment.decisions(attempt_id,decision,reviewed_by,reason,actual_minor,actual_currency,verification_source,capacity_confirmed) VALUES(a,outcome,auth.uid(),trim(why),actual,c,source,capacity);
 IF outcome='verified' THEN
  INSERT INTO manual_payment.activations(order_id,attempt_id,student_id,starts_at,ends_at) VALUES(o,a,r.student_id,start_time,manual_payment.calendar_month_end(start_time)) RETURNING id INTO activation;
 END IF;
 PERFORM public.audit('manual.payment.'||outcome,o,trim(why));
 INSERT INTO manual_payment.outbox(order_id,attempt_id,event_type) VALUES(o,a,'payment.'||outcome);
 RETURN activation;
END $$;
-- Family-visible status includes a rejection reason, never verification notes.
CREATE FUNCTION manual_payment.order_status(o uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT manual_payment.can_read(o) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='order unavailable'; END IF;
 SELECT jsonb_build_object('mode','synthetic-only','order',to_jsonb(r),
 'quotes',coalesce((SELECT jsonb_agg(to_jsonb(q)||jsonb_build_object('accepted_at',v.accepted_at) ORDER BY q.revision) FROM manual_payment.quotes q LEFT JOIN manual_payment.acceptances v ON v.quote_id=q.id WHERE q.order_id=o),'[]'::jsonb),
 'attempts',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('status',coalesce(d.decision,'pending'),'rejection_reason',CASE WHEN d.decision='rejected' THEN d.reason ELSE NULL END) ORDER BY a.submitted_at) FROM manual_payment.attempts a LEFT JOIN manual_payment.decisions d ON d.attempt_id=a.id WHERE a.order_id=o),'[]'::jsonb),
 'activation',(SELECT to_jsonb(v) FROM manual_payment.activations v WHERE v.order_id=o)) INTO result FROM manual_payment.orders r WHERE r.id=o;
 RETURN result;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA manual_payment FROM PUBLIC,phase2_api,phase2_authenticated,phase2_bootstrap;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA manual_payment FROM PUBLIC,phase2_api,phase2_authenticated,phase2_bootstrap;
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA manual_payment TO phase2_definer;
-- Row locking requires UPDATE privilege, but immutable triggers forbid mutation.
GRANT UPDATE ON manual_payment.orders,manual_payment.attempts TO phase2_definer;
GRANT SELECT ON manual_payment.orders,manual_payment.quotes,manual_payment.acceptances,manual_payment.attempts,manual_payment.decisions,manual_payment.activations TO phase2_authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='manual_payment' LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO phase2_definer',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION manual_payment.can_read(uuid),manual_payment.requester_can_access(uuid,uuid),manual_payment.create_order(uuid,uuid,text),manual_payment.offer_quote(uuid,uuid,bigint,text,text),manual_payment.accept_quote(uuid,uuid,bigint,text,text,text),manual_payment.submit_attempt(uuid,uuid,uuid,bigint,text,text,uuid),manual_payment.review_attempt(uuid,uuid,text,text,bigint,text,text,boolean),manual_payment.order_status(uuid) TO phase2_authenticated;
COMMIT;
