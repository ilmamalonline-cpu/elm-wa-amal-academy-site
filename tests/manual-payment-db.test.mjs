import assert from 'node:assert/strict';
import { test, before, beforeEach, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { startHarness } from './manual-payment-harness.mjs';
let h, fx;
before(async () => { h = await startHarness(); });
beforeEach(async () => { fx = await h.seed(); });
after(async () => { await h?.close(); });
const sql = {
 order: 'SELECT manual_payment.create_order($1,$2,$3) id',
 quote: 'SELECT manual_payment.offer_quote($1,$2,$3,$4,$5) id',
 accept: 'SELECT manual_payment.accept_quote($1,$2,$3,$4,$5,$6) id',
 attempt: 'SELECT manual_payment.submit_attempt($1,$2,$3,$4,$5,$6,$7) id',
 review: 'SELECT manual_payment.review_attempt($1,$2,$3,$4,$5,$6,$7,$8) id',
};
const policy = 'manual-payment-local-v1', method = 'synthetic-egyptian-wallet';
async function make({ user = fx.ids.guardianA, student = fx.ids.childA, accepted = true, submitted = true, ref = 'SYNTHETIC-'+randomUUID().toUpperCase() } = {}) {
 const o=randomUUID(), q=randomUUID(), a=randomUUID();
 await h.as(user,sql.order,[o,student,'quran']);
 await h.as(fx.ids.owner,sql.quote,[o,q,12345,'EGP',method]);
 if(accepted) await h.as(user,sql.accept,[o,q,12345,'EGP',method,policy]);
 if(submitted) await h.as(user,sql.attempt,[o,a,q,12345,'EGP',ref,null]);
 return {o,q,a,user,student,ref};
}
async function verify(v, overrides=[]) {
 const args=[v.o,v.a,'verified','Synthetic external verification',12345,'EGP','SYNTHETIC-LEDGER-CHECK',true];
 for(const [index,value] of overrides) args[index]=value;
 return h.as(fx.ids.owner,sql.review,args);
}
async function count(table) { return Number((await h.admin.query(`SELECT count(*) n FROM manual_payment.${table}`)).rows[0].n); }
test('accepted explicit EGP quote retains SAR snapshot; evidence alone never activates', async()=>{
 const v=await make();
 assert.equal(await count('activations'),0); assert.equal(await count('decisions'),0);
 const r=(await h.as(v.user,'SELECT manual_payment.order_status($1) data',[v.o])).rows[0].data;
 assert.equal(r.order.advertised_minor,36000); assert.equal(r.order.advertised_currency,'SAR');
 assert.deepEqual(r.order.features,['memorization','general-meanings']); assert.equal(r.quotes[0].amount_minor,12345);
 assert.equal(r.attempts[0].status,'pending'); assert.equal(r.activation,null);
});
test('protected verification atomically creates one calendar-month 8-lesson period, audit and outbox',async()=>{
 const v=await make(); const r=await verify(v); assert.ok(r.rows[0].id);
 const period=(await h.admin.query('SELECT * FROM manual_payment.activations')).rows[0];
 assert.equal(period.lesson_entitlement,8);assert.equal(period.business_zone,'Africa/Cairo');
 assert.ok(period.ends_at>period.starts_at); assert.equal(await count('decisions'),1);assert.equal(await count('outbox'),1);
 assert.equal(Number((await h.admin.query("SELECT count(*) n FROM audit_events WHERE action='manual.payment.verified'")).rows[0].n),1);
 const family=(await h.as(v.user,'SELECT manual_payment.order_status($1) data',[v.o])).rows[0].data;
 assert.equal(family.attempts[0].status,'verified'); assert.ok(!JSON.stringify(family).includes('SYNTHETIC-LEDGER-CHECK'));
});
test('sequential and concurrent exact review retries return the original activation exactly once',async()=>{
 const v=await make(); const [x,y]=await Promise.all([verify(v),verify(v)]); const z=await verify(v);
 assert.equal(x.rows[0].id,y.rows[0].id);assert.equal(y.rows[0].id,z.rows[0].id);
 assert.equal(await count('activations'),1);assert.equal(await count('outbox'),1);
 await assert.rejects(verify(v,[[3,'Different payload']]),{code:'23505'});
});
test('reject requires a reason, never activates, stays immutable and supports linked resubmission',async()=>{
 const v=await make(); await assert.rejects(verify(v,[[2,'rejected'],[3,' ']]),{code:'22023'});
 const reject=[v.o,v.a,'rejected','Synthetic transfer not received',null,null,null,false];
 await h.as(fx.ids.owner,sql.review,reject); await h.as(fx.ids.owner,sql.review,reject);
 assert.equal(await count('activations'),0);assert.equal(await count('outbox'),1);
 await assert.rejects(verify(v),{code:'23505'});
 const a=randomUUID(); await assert.rejects(h.as(v.user,sql.attempt,[v.o,a,v.q,12345,'EGP','SYNTHETIC-RETRY',null]),{code:'22023'});
 await h.as(v.user,sql.attempt,[v.o,a,v.q,12345,'EGP','SYNTHETIC-RETRY',v.a]);
 await verify({...v,a}); assert.equal(await count('activations'),1);
 const family=(await h.as(v.user,'SELECT manual_payment.order_status($1) data',[v.o])).rows[0].data;
 assert.equal(family.attempts[0].rejection_reason,reject[3]);
});
test('stale quote, missing acceptance, changed amount/currency/policy and teacher acceptance fail',async()=>{
 const v=await make({accepted:false,submitted:false});
 await assert.rejects(h.as(v.user,sql.attempt,[v.o,v.a,v.q,12345,'EGP',v.ref,null]),{code:'22023'});
 for(const args of [[v.o,v.q,999,'EGP',method,policy],[v.o,v.q,12345,'SAR',method,policy],[v.o,v.q,12345,'EGP',method,'other']]) await assert.rejects(h.as(v.user,sql.accept,args),{code:'22023'});
 await assert.rejects(h.as(fx.ids.teacherA,sql.accept,[v.o,v.q,12345,'EGP',method,policy]),{code:'42501'});
 const q2=randomUUID(); await h.as(fx.ids.owner,sql.quote,[v.o,q2,23456,'EGP',method]);
 await assert.rejects(h.as(v.user,sql.accept,[v.o,v.q,12345,'EGP',method,policy]),{code:'22023'});
 await h.as(v.user,sql.accept,[v.o,q2,23456,'EGP',method,policy]);
});
test('a pending attempt blocks quote replacement and another submitted attempt',async()=>{
 const v=await make();
 await assert.rejects(h.as(fx.ids.owner,sql.quote,[v.o,randomUUID(),55555,'EGP',method]),{code:'22023'});
 await assert.rejects(h.as(v.user,sql.attempt,[v.o,randomUUID(),v.q,12345,'EGP','SYNTHETIC-ANOTHER',v.a]),{code:'22023'});
});
test('claim mismatches, absent ledger check and absent capacity never create partial decisions',async()=>{
 const v=await make();
 for(const overrides of [[[4,999]],[[5,'SAR']],[[6,null]],[[6,'REAL-REFERENCE']],[[7,false]]]) await assert.rejects(verify(v,overrides),{code:'22023'});
 assert.equal(await count('decisions'),0);assert.equal(await count('activations'),0);assert.equal(await count('outbox'),0);
});
test('only current admin capability + live AAL2 session can offer or review',async()=>{
 const v=await make();const args=[v.o,v.a,'verified','Synthetic verification',12345,'EGP','SYNTHETIC-CHECK',true];
 for(const user of [fx.ids.guardianA,fx.ids.teacherA,fx.ids.reviewer]) await assert.rejects(h.as(user,sql.review,args),{code:'42501'});
 await assert.rejects(h.as(fx.ids.owner,sql.review,args,'aal1'),{code:'42501'});
 await h.admin.query("UPDATE capabilities SET revoked_at=now() WHERE auth_user_id=$1 AND capability='payment.review'",[fx.ids.owner]);
 await assert.rejects(verify(v),{code:'42501'});
 assert.equal(await count('decisions'),0);
});
test('revoked session, withdrawn guardian consent, inactive requester and frozen student fail closed',async()=>{
 const v=await make();
 await h.admin.query('UPDATE auth.sessions SET revoked_at=now() WHERE id=$1',[fx.sessions[fx.ids.owner]]);
 await assert.rejects(verify(v),{code:'42501'});
 await h.admin.query('UPDATE auth.sessions SET revoked_at=NULL WHERE id=$1',[fx.sessions[fx.ids.owner]]);
 await h.admin.query("UPDATE guardian_links SET consent_status='withdrawn',consent_withdrawn_at=now() WHERE guardian_user_id=$1",[v.user]);
 await assert.rejects(verify(v),{code:'42501'});
 await h.admin.query("UPDATE guardian_links SET consent_status='active',consent_withdrawn_at=NULL WHERE guardian_user_id=$1",[v.user]);
 await h.admin.query("UPDATE profiles SET status='suspended' WHERE auth_user_id=$1",[v.user]);
 await assert.rejects(verify(v),{code:'22023'});
 await h.admin.query("UPDATE profiles SET status='active' WHERE auth_user_id=$1;",[v.user]);
 await h.admin.query('UPDATE students SET frozen=true WHERE id=$1',[v.student]);
 await assert.rejects(verify(v),{code:'42501'});
 assert.equal(await count('activations'),0);
});
test('RLS hides requester financial history even from another guardian of the same child',async()=>{
 const v=await make();
 for(const user of [fx.ids.guardianB,fx.ids.teacherA,fx.ids.reviewer]) {
  assert.equal((await h.as(user,'SELECT * FROM manual_payment.orders')).rows.length,0);
  assert.equal((await h.as(user,'SELECT * FROM manual_payment.attempts')).rows.length,0);
  await assert.rejects(h.as(user,'SELECT manual_payment.order_status($1)',[v.o]),{code:'42501'});
 }
 assert.equal((await h.as(fx.ids.owner,'SELECT * FROM manual_payment.orders',[],'aal1')).rows.length,0);
});
test('direct mutation/internal helper execution is denied; all financial history is append-only',async()=>{
 const v=await make();
 for(const query of ["UPDATE manual_payment.orders SET package_id='quran'",'DELETE FROM manual_payment.attempts',"INSERT INTO manual_payment.outbox(order_id,attempt_id,event_type) VALUES(null,null,'payment.verified')",'SELECT manual_payment.lock_order(null,true)','SELECT manual_payment.require_reviewer()','SELECT * FROM manual_payment.outbox']) await assert.rejects(h.as(fx.ids.owner,query),{code:'42501'});
 await assert.rejects(h.admin.query('DELETE FROM manual_payment.attempts WHERE id=$1',[v.a]),/append only/);
 const flags=(await h.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='manual_payment' AND c.relkind='r'")).rows;
 assert.equal(flags.length,7);assert.ok(flags.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
});
test('duplicate normalized method/reference is blocked across orders and guardians',async()=>{
 const v=await make({ref:'SYNTHETIC-DUPLICATE'});
 const second=await make({user:fx.ids.guardianB,student:fx.ids.childB,submitted:false});
 await assert.rejects(h.as(second.user,sql.attempt,[second.o,second.a,second.q,12345,'EGP',' synthetic-duplicate ',null]),{code:'22023'});
 await h.as(v.user,sql.attempt,[v.o,v.a,v.q,12345,'EGP',v.ref,null]);
 await assert.rejects(h.as(v.user,sql.attempt,[v.o,v.a,v.q,12345,'EGP','SYNTHETIC-CHANGED',null]),{code:'23505'});
});
test('order/quote keys replay exactly, reject changed payload, and packages do not inherit features',async()=>{
 const o=randomUUID(),q=randomUUID();
 await Promise.all([h.as(fx.ids.guardianA,sql.order,[o,fx.ids.childA,'quran-noor-tajweed']),h.as(fx.ids.guardianA,sql.order,[o,fx.ids.childA,'quran-noor-tajweed'])]);
 await assert.rejects(h.as(fx.ids.guardianA,sql.order,[o,fx.ids.childA,'quran']),{code:'23505'});
 const row=(await h.as(fx.ids.guardianA,'SELECT * FROM manual_payment.orders')).rows[0];
 assert.equal(row.advertised_minor,65000);assert.equal(row.duration_is_maximum,true);assert.ok(!row.features.includes('general-meanings'));
 for(let i=0;i<2;i++) await h.as(fx.ids.owner,sql.quote,[o,q,25000,'EGP',method]);
 await assert.rejects(h.as(fx.ids.owner,sql.quote,[o,q,999,'EGP',method]),{code:'23505'});
 assert.equal(await count('orders'),1);assert.equal(await count('quotes'),1);
});
test('competing orders for the same child serialize activation; no overlapping or future renewals',async()=>{
 const first=await make(), second=await make({user:fx.ids.guardianB});
 const results=await Promise.allSettled([verify(first),verify(second)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal(await count('activations'),1);assert.equal(await count('decisions'),1);assert.equal(await count('outbox'),1);
});
test('review rejection racing verification can finalize only once',async()=>{
 const v=await make();
 const results=await Promise.allSettled([verify(v),h.as(fx.ids.owner,sql.review,[v.o,v.a,'rejected','Synthetic unresolved',null,null,null,false])]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(await count('decisions'),1);assert.equal(await count('outbox'),1);
 assert.ok((await count('activations'))<=1);
});
test('failure after decision insertion rolls back decision, activation, audit and outbox together',async()=>{
 const v=await make();
 await h.admin.query("CREATE FUNCTION manual_payment.synthetic_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$; CREATE TRIGGER synthetic_failure BEFORE INSERT ON manual_payment.outbox FOR EACH ROW EXECUTE FUNCTION manual_payment.synthetic_failure()");
 try {
  await assert.rejects(verify(v),/synthetic outbox failure/);
  assert.equal(await count('decisions'),0);assert.equal(await count('activations'),0);assert.equal(await count('outbox'),0);
  assert.equal(Number((await h.admin.query("SELECT count(*) n FROM audit_events WHERE action='manual.payment.verified'")).rows[0].n),0);
 } finally { await h.admin.query('DROP TRIGGER synthetic_failure ON manual_payment.outbox; DROP FUNCTION manual_payment.synthetic_failure()'); }
 await verify(v);assert.equal(await count('activations'),1);
});
test('calendar month clamps month end, retains Cairo wall time across DST, rejects gap/fold',async()=>{
 const end=async date=>(await h.admin.query("SELECT manual_payment.calendar_month_end($1::timestamptz) AT TIME ZONE 'Africa/Cairo' AS local",[date])).rows[0].local;
 // Force pg timestamp-without-timezone parser to a stable comparable ISO via SQL formatting.
 const formatted=async date=>(await h.admin.query("SELECT to_char(manual_payment.calendar_month_end($1::timestamptz) AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD HH24:MI') v",[date])).rows[0].v;
 assert.equal(await formatted('2028-01-31T10:00:00+02:00'),'2028-02-29 10:00');
 assert.equal(await formatted('2026-03-31T10:00:00+02:00'),'2026-04-30 10:00');
 await assert.rejects(end('2026-03-24T00:30:00+02:00'),{code:'22023'});
 await assert.rejects(end('2026-09-29T23:30:00+03:00'),{code:'22023'});
});
test('adult self-order works; a child has no independent login and cannot be impersonated',async()=>{
 const v=await make({user:fx.ids.adultA,student:fx.ids.adultA});await verify(v);assert.equal(await count('activations'),1);
 await assert.rejects(h.as(fx.ids.adultB,sql.order,[randomUUID(),fx.ids.childA,'quran']),{code:'42501'});
 await assert.rejects(h.admin.query('UPDATE students SET auth_user_id=$1 WHERE id=$2',[fx.ids.adultB,fx.ids.childA]),{code:'23514'});
});

test('direct SQL NULL inputs cannot bypass required fields or exact idempotency replay',async()=>{
 const v=await make();
 const checks=[
  [v.user,sql.order,[v.o,v.student,null]],
  [v.user,sql.order,[null,v.student,'quran']],
  [fx.ids.owner,sql.quote,[v.o,v.q,null,'EGP',method]],
  [fx.ids.owner,sql.quote,[v.o,v.q,12345,null,method]],
  [fx.ids.owner,sql.quote,[v.o,v.q,12345,'EGP',null]],
  [v.user,sql.accept,[v.o,v.q,null,'EGP',method,policy]],
  [v.user,sql.attempt,[v.o,v.a,v.q,null,'EGP',v.ref,null]],
  [v.user,sql.attempt,[v.o,v.a,v.q,12345,null,v.ref,null]],
  [v.user,sql.attempt,[v.o,v.a,v.q,12345,'EGP',null,null]],
  [fx.ids.owner,sql.review,[v.o,null,'verified','Synthetic review',12345,'EGP','SYNTHETIC-CHECK',true]],
 ];
 for(const [user,query,args] of checks) await assert.rejects(h.as(user,query,args),{code:'22023'});
 assert.equal(await count('orders'),1);assert.equal(await count('quotes'),1);assert.equal(await count('attempts'),1);assert.equal(await count('activations'),0);
});
