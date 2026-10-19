import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes}from'node:crypto';
import {decodeJwt,decodeProtectedHeader,jwtVerify,importSPKI}from'jose';
import {providerPool,account,login,auth,app,rest,keys,localFetch,origins}from'./provider-helpers.mjs';
let pool;
before(async()=>{pool=providerPool();await pool.query('TRUNCATE public.audit_events,public.private_files,public.payment_records,public.teacher_notes,public.published_reports,public.teacher_assignments,public.guardian_links,public.capabilities,public.user_roles,public.teachers,public.students,public.profiles,public.bootstrap_control CASCADE');await pool.query('INSERT INTO public.bootstrap_control(id) VALUES(true)');});
after(async()=>{await pool?.end();});
async function profile(user){await pool.query("INSERT INTO public.profiles(auth_user_id,display_name,preferred_locale,timezone,status) VALUES($1,'Synthetic auth fixture','en','UTC','active') ON CONFLICT(auth_user_id) DO NOTHING",[user.id]);}
function totp(secret){
 let bits='';for(const char of secret.toUpperCase().replace(/=+$/,'')){const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);if(n<0)throw new Error('Invalid local TOTP fixture');bits+=n.toString(2).padStart(5,'0');}
 const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();const offset=digest.at(-1)&15;
 return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
async function bootstrap(user,token){
 const c=decodeJwt(token);const client=await pool.connect();
 try{await client.query('BEGIN');await client.query('SET LOCAL ROLE phase2_bootstrap');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.session_id',$2,true),set_config('request.jwt.claim.aal',$3,true)",[c.sub,c.session_id,c.aal]);await client.query("SELECT public.bootstrap_admin($1,'synthetic native MFA bootstrap')",[user.id]);await client.query('COMMIT');}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function roleCommand(operation,target,token){
 const c=decodeJwt(token),client=await pool.connect();
 try{await client.query('BEGIN');await client.query('SET LOCAL ROLE phase2_authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.session_id',$2,true),set_config('request.jwt.claim.aal',$3,true)",[c.sub,c.session_id,c.aal]);await client.query(operation==='grant'?"SELECT public.grant_role($1,'guardian','synthetic native MFA')":"SELECT public.revoke_role($1,'guardian','synthetic native MFA')",[target]);await client.query('COMMIT');}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
test('native provider disables public signup and exposes only public asymmetric verification keys',async()=>{
 const settings=await(await auth('/settings')).json();assert.equal(settings.disable_signup,true);
 const signup=await auth('/signup',{method:'POST',body:{email:'synthetic-signup@phase2.example.invalid',password:'Synthetic-only-password-A7!'}});assert.equal(signup.ok,false);
 const jwks=await(await localFetch(origins.auth+'/.well-known/jwks.json')).json();
 assert.ok(jwks.keys.some(k=>k.kty==='EC'&&k.alg==='ES256'));assert.equal(jwks.keys.some(k=>Boolean(k.d||k.k)),false);
 const unauthorized=await auth('/admin/users');assert.equal(unauthorized.ok,false);
});
test('actual password login produces bounded ES256 native session JWTs accepted by the app and REST',async()=>{
 const user=await account('password');await profile(user);const session=await login(user);const k=await keys();
 const verified=await jwtVerify(session.access_token,await importSPKI(k.publicKey,'ES256'),{algorithms:['ES256'],issuer:origins.auth,audience:'authenticated'});
 assert.equal(decodeProtectedHeader(session.access_token).alg,'ES256');assert.equal(verified.payload.sub,user.id);assert.equal(verified.payload.aal,'aal1');assert.ok(verified.payload.exp-verified.payload.iat<=900);
 assert.equal((await app('me',session.access_token)).status,200);assert.equal((await rest('/students?select=id',session.access_token)).status,200);
 const db=await pool.query('SELECT user_id FROM auth.sessions WHERE id=$1',[verified.payload.session_id]);assert.equal(db.rows[0].user_id,user.id);
 const invalid=await auth('/token?grant_type=password',{method:'POST',body:{email:user.email,password:'Definitely-not-the-generated-password'}});assert.equal(invalid.ok,false);
});
test('native unconfirmed users cannot password-login or gain educational access',async()=>{
 const email=`synthetic-unconfirmed-${randomBytes(8).toString('hex')}@phase2.example.invalid`;const password='Synthetic-only-A7!'+randomBytes(20).toString('hex');
 const created=await auth('/admin/users',{admin:true,method:'POST',body:{email,password,email_confirm:false}});assert.equal(created.ok,true);
 const response=await auth('/token?grant_type=password',{method:'POST',body:{email,password}});assert.equal(response.ok,false);
});
test('editing mutable Auth metadata cannot grant admin or a financial capability',async()=>{
 const user=await account('metadata');await profile(user);const session=await login(user);
 const changed=await auth('/user',{token:session.access_token,method:'PUT',body:{data:{role:'admin',roles:['admin'],capabilities:['payment.review']}}});assert.equal(changed.ok,true);
 const refreshed=await auth('/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});assert.equal(refreshed.ok,true);const rotated=await refreshed.json();
 const me=await app('me',rotated.access_token);assert.equal(me.status,200);assert.deepEqual((await me.json()).roles,[]);
 assert.deepEqual(await(await rest('/students?select=id',rotated.access_token)).json(),[]);
});
test('native refresh rotates tokens and logout invalidates already-issued JWTs and refresh tokens immediately',async()=>{
 const user=await account('logout');await profile(user);const first=await login(user);
 const refreshed=await auth('/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:first.refresh_token}});assert.equal(refreshed.ok,true);const next=await refreshed.json();
 assert.equal(first.refresh_token!==next.refresh_token,true);assert.equal(decodeJwt(next.access_token).sub,user.id);
 assert.equal((await app('me',next.access_token)).status,200);
 const loggedOut=await auth('/logout?scope=global',{token:next.access_token,method:'POST'});assert.equal(loggedOut.status,204);
 assert.ok(decodeJwt(next.access_token).exp>Math.floor(Date.now()/1000));
 assert.equal((await app('me',next.access_token)).status,401);assert.equal((await app('me',first.access_token)).status,401);assert.equal((await rest('/students?select=id',next.access_token)).status,401);
 const staleRefresh=await auth('/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:next.refresh_token}});assert.equal(staleRefresh.ok,false);
});
test('native account ban blocks the same issued token on the next app and REST request',async()=>{
 const user=await account('ban');await profile(user);const session=await login(user);
 assert.equal((await app('me',session.access_token)).status,200);
 const banned=await auth(`/admin/users/${user.id}`,{admin:true,method:'PUT',body:{ban_duration:'1h'}});assert.equal(banned.ok,true);
 assert.equal((await app('me',session.access_token)).status,401);assert.equal((await rest('/students?select=id',session.access_token)).status,401);
});
test('real native TOTP challenge upgrades AAL and gates the closed one-shot synthetic bootstrap',async()=>{
 const user=await account('totp');await profile(user);const first=await login(user);
 await pool.query('UPDATE public.bootstrap_control SET preauthorized_owner_id=$1,consumed_at=NULL WHERE id=true',[user.id]);
 await assert.rejects(()=>bootstrap(user,first.access_token));
 const enroll=await auth('/factors',{token:first.access_token,method:'POST',body:{factor_type:'totp',friendly_name:'Synthetic TOTP fixture'}});assert.equal(enroll.ok,true);const factor=await enroll.json();
 assert.ok(factor.id&&factor.totp?.secret);
 const challenge=await auth(`/factors/${factor.id}/challenge`,{token:first.access_token,method:'POST',body:{}});assert.equal(challenge.ok,true);const challengeId=(await challenge.json()).id;
 const verified=await auth(`/factors/${factor.id}/verify`,{token:first.access_token,method:'POST',body:{challenge_id:challengeId,code:totp(factor.totp.secret)}});assert.equal(verified.ok,true);const second=await verified.json();
 assert.equal(decodeJwt(second.access_token).aal,'aal2');
 const nativeSession=await pool.query('SELECT aal,factor_id FROM auth.sessions WHERE id=$1',[decodeJwt(second.access_token).session_id]);assert.equal(nativeSession.rows[0].aal,'aal2');assert.equal(nativeSession.rows[0].factor_id,factor.id);
 await bootstrap(user,second.access_token);await assert.rejects(()=>bootstrap(user,second.access_token));
 const granted=await pool.query('SELECT capability FROM public.capabilities WHERE auth_user_id=$1 ORDER BY capability',[user.id]);assert.deepEqual(granted.rows.map(r=>r.capability),['guardian.verify','roles.manage']);
 assert.equal((await app('me',second.access_token)).status,200);
 const target=await account('mfa-role-target');await profile(target);await roleCommand('grant',target.id,second.access_token);
 const removed=await auth(`/factors/${factor.id}`,{token:second.access_token,method:'DELETE'});assert.equal(removed.ok,true);
 await assert.rejects(()=>roleCommand('revoke',target.id,second.access_token),/role authorization failed/);
});
test('native recovery email stays in the local sink, updates a synthetic password and cannot reuse its action link',async()=>{
 const user=await account('recovery');await profile(user);const first=await login(user);
 const recovery=await auth('/recover',{method:'POST',body:{email:user.email}});assert.equal(recovery.ok,true);
 let message;
 for(let i=0;i<30&&!message;i++){
  const summary=await(await localFetch(origins.mail+'/api/v1/messages')).json();
  const found=summary.messages?.find(m=>m.To?.some(t=>t.Address===user.email));
  if(found)message=await(await localFetch(origins.mail+'/api/v1/message/'+found.ID)).json();else await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(message,'Expected synthetic recovery mail in local SMTP sink');
 const link=(message.HTML??'').match(/href="([^"]*\/verify\?[^"]+)"/)?.[1]?.replaceAll('&amp;','&');assert.ok(link,'Expected native recovery action link');
 const target=new URL(link);assert.equal(target.origin,origins.auth);assert.equal(target.searchParams.get('type'),'recovery');
 const verified=await localFetch(target);assert.ok([302,303].includes(verified.status));
 const destination=new URL(verified.headers.get('location'));assert.equal(destination.origin,origins.app);
 const params=new URLSearchParams(destination.hash.slice(1));const recoveryToken=params.get('access_token');assert.ok(recoveryToken);
 const replacement='Synthetic-new-A7!'+randomBytes(24).toString('base64url');
 const update=await auth('/user',{token:recoveryToken,method:'PUT',body:{password:replacement}});assert.equal(update.ok,true);
 const old=await auth('/token?grant_type=password',{method:'POST',body:{email:user.email,password:user.password}});assert.equal(old.ok,false);
 const fresh=await login({...user,password:replacement});assert.equal((await app('me',fresh.access_token)).status,200);
 const reused=await localFetch(target);assert.ok([302,303].includes(reused.status));const reuseTarget=new URL(reused.headers.get('location'));assert.equal(new URLSearchParams(reuseTarget.hash.slice(1)).has('access_token'),false);
 // Recovery procedures remain pending owner approval; test only the native mechanics.
 const oldSession=await app('me',first.access_token);assert.equal(oldSession.status,401);
 await auth('/logout?scope=global',{token:fresh.access_token,method:'POST'});
});
