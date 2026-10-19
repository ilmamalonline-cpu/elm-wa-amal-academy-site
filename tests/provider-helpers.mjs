import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';
export const origins={auth:'http://127.0.0.1:55441',storage:'http://127.0.0.1:55442',rest:'http://127.0.0.1:55443',mail:'http://127.0.0.1:55446',app:'http://127.0.0.1:3403'};
export const databaseUrl='postgresql://ubuntu@127.0.0.1:55432/phase2_provider_test';
export const fixtureLabels=Object.freeze(['owner','admin','guardianA','guardianB','teacherA','teacherB','adultA','adultB','password','metadata','logout','ban','totp','mfa-role-target','recovery']);
const syntheticEmailPattern=/^synthetic-[a-z0-9-]+@phase2\.example\.invalid$/;
function requireSyntheticOnly(){
 if(process.env.PHASE2_PROVIDER_TEST!=='synthetic-only')throw new Error('Explicit synthetic-only provider tests required');
}
function requireSyntheticEmail(email){
 if(typeof email!=='string'||!syntheticEmailPattern.test(email))throw new Error('Provider tests accept only reserved synthetic email addresses');
}
function validateSyntheticBody(body){
 if(!body||typeof body!=='object')return;
 for(const [key,value] of Object.entries(body))if(key.toLowerCase()==='email')requireSyntheticEmail(value);
}
export function providerPool(){
 requireSyntheticOnly();
 return new Pool({connectionString:databaseUrl,max:2});
}
export async function localFetch(url,options={}){
 requireSyntheticOnly();
 const target=new URL(url);
 if(!Object.values(origins).includes(target.origin)||target.username||target.password||target.hash)throw new Error('Provider tests cannot contact remote endpoints');
 if(options.redirect!==undefined&&options.redirect!=='manual')throw new Error('Provider tests require manual redirect handling');
 if(options.credentials!==undefined&&options.credentials!=='omit')throw new Error('Provider tests cannot send credentials');
 return fetch(target,{...options,credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(10000)});
}
export async function keys(){requireSyntheticOnly();return JSON.parse(await readFile('/workspace/phase2-provider-runtime/keys.json','utf8'));}
export async function auth(path,{token,admin=false,method='GET',body}={}){
 requireSyntheticOnly();
 validateSyntheticBody(body);
 const k=await keys();
 return localFetch(origins.auth+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${admin?k.serviceKey:token??k.anonKey}`,apikey:k.anonKey},body:body===undefined?undefined:JSON.stringify(body)});
}
export function syntheticAccountFixture(label){
 requireSyntheticOnly();
 if(!fixtureLabels.includes(label))throw new Error(`Unknown synthetic fixture label: ${label}`);
 const email=`synthetic-${label.toLowerCase()}-${randomUUID()}@phase2.example.invalid`;
 const password='Synthetic-only-'+randomBytes(24).toString('base64url')+'aA7!';
 requireSyntheticEmail(email);
 return {email,password};
}
export async function account(label){
 const {email,password}=syntheticAccountFixture(label);
 const response=await auth('/admin/users',{admin:true,method:'POST',body:{email,password,role:'authenticated',email_confirm:true,user_metadata:{display_name:`Synthetic ${label}`}}});
 if(!response.ok)throw new Error(`Local synthetic account fixture failed (${response.status})`);
 const user=await response.json();return{id:user.id,email,password};
}
export async function login(user){
 const response=await auth('/token?grant_type=password',{method:'POST',body:{email:user.email,password:user.password}});
 if(!response.ok)throw new Error(`Local synthetic login failed (${response.status})`);
 return response.json();
}
export async function rest(path,token,{method='GET',body,headers={}}={}){
 return localFetch(origins.rest+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
}
export async function app(path,token,{method='GET',body}={}){
 return localFetch(origins.app+'/api/phase2/'+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
export async function storage(path,token,{method='GET',body,headers={}}={}){
 return localFetch(origins.storage+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...headers},body});
}
export const fixturePdf=Buffer.from('%PDF-1.4\n% Synthetic-only provider fixture. No personal data.\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
export async function dataFixture(pool){
 requireSyntheticOnly();
 const users={};const sessions={};
 for(const label of ['owner','admin','guardianA','guardianB','teacherA','teacherB','adultA','adultB']){
  users[label]=await account(label);sessions[label]=await login(users[label]);
 }
 const ids=Object.fromEntries(['childA','childB','adultA','adultB','linkA','linkB','assignmentA','assignmentB','reportA','reportB','draftA','noteA','noteB','paymentA','paymentB','fileA','fileB'].map(x=>[x,randomUUID()]));
 const fixture={users,sessions,ids,pdf:fixturePdf};
 await resetData(pool,fixture);
 const k=await keys();
 const bucket=await storage('/bucket',k.serviceKey,{method:'POST',body:JSON.stringify({id:'phase2-private',name:'phase2-private',public:false,file_size_limit:5242880,allowed_mime_types:['application/pdf','image/png','image/jpeg']}),headers:{'Content-Type':'application/json'}});
 if(!bucket.ok && bucket.status!==409 && bucket.status!==400)throw new Error(`Local private bucket fixture failed (${bucket.status})`);
 for(const fileId of [ids.fileA,ids.fileB]){
  const uploaded=await storage(`/object/phase2-private/${fileId}.pdf`,k.serviceKey,{method:'POST',body:fixturePdf,headers:{'Content-Type':'application/pdf','x-upsert':'true'}});
  if(!uploaded.ok)throw new Error(`Local private object fixture failed (${uploaded.status})`);
 }
 return fixture;
}
export async function resetData(pool,{users:u,ids:i}){
 requireSyntheticOnly();
 await pool.query('TRUNCATE public.audit_events,public.private_files,public.payment_records,public.teacher_notes,public.published_reports,public.teacher_assignments,public.guardian_links,public.capabilities,public.user_roles,public.teachers,public.students,public.profiles,public.bootstrap_control CASCADE');
 await pool.query('INSERT INTO public.bootstrap_control(id,consumed_at) VALUES(true,now())');
 for(const [label,user]of Object.entries(u)){
  await pool.query("INSERT INTO public.profiles(auth_user_id,display_name,preferred_locale,timezone,status) VALUES($1,$2,'en','UTC','active')",[user.id,`Synthetic ${label}`]);
  const role=label.startsWith('guardian')?'guardian':label.startsWith('teacher')?'teacher':label.startsWith('adult')?'student':'admin';
  await pool.query('INSERT INTO public.user_roles(auth_user_id,role,granted_by,reason) VALUES($1,$2,$3,\'synthetic-only fixture\')',[user.id,role,u.owner.id]);
 }
 for(const capability of ['roles.manage','guardian.verify'])await pool.query("INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES($1,$2,$1,'synthetic-only fixture')",[u.owner.id,capability]);
 for(const suffix of ['A','B']){
  const guardian=u['guardian'+suffix].id;const teacher=u['teacher'+suffix].id;const adult=u['adult'+suffix].id;
  await pool.query("INSERT INTO public.students(id,full_name,age_band,preferred_locale,timezone,status) VALUES($1,$2,'child','en','UTC','active')",[i['child'+suffix],`Synthetic child ${suffix}`]);
  await pool.query("INSERT INTO public.students(id,auth_user_id,full_name,age_band,preferred_locale,timezone,status) VALUES($1,$2,$3,'adult','en','UTC','active')",[i['adult'+suffix],adult,`Synthetic adult ${suffix}`]);
  await pool.query("INSERT INTO public.teachers(auth_user_id,display_name,status) VALUES($1,'Synthetic teacher','active')",[teacher]);
  await pool.query("INSERT INTO public.guardian_links(id,guardian_user_id,student_id,relationship,verification_status,verified_by,verified_at,consent_version,consent_method,consent_accepted_by,evidence_note) VALUES($1,$2,$3,'synthetic relationship','verified',$4,now(),'synthetic-v1','synthetic fixture',$2,'INTERNAL SYNTHETIC VERIFICATION')",[i['link'+suffix],guardian,i['child'+suffix],u.owner.id]);
  await pool.query("INSERT INTO public.teacher_assignments(id,teacher_user_id,student_id,status,assigned_by) VALUES($1,$2,$3,'active',$4)",[i['assignment'+suffix],teacher,i['child'+suffix],u.owner.id]);
  await pool.query("INSERT INTO public.published_reports(id,student_id,body,status) VALUES($1,$2,$3,'published')",[i['report'+suffix],i['child'+suffix],`Synthetic published report ${suffix}`]);
  await pool.query('INSERT INTO public.teacher_notes(id,student_id,teacher_user_id,body) VALUES($1,$2,$3,$4)',[i['note'+suffix],i['child'+suffix],teacher,`Synthetic teacher private note ${suffix}`]);
  await pool.query("INSERT INTO public.payment_records(id,student_id,requested_by_user_id,reference) VALUES($1,$2,$3,'synthetic-reference')",[i['payment'+suffix],i['child'+suffix],guardian]);
  await pool.query("INSERT INTO public.private_files(id,owner_user_id,payment_record_id,purpose,object_path,sha256,mime_type,size_bytes,validation_status,scan_status) VALUES($1,$2,$3,'payment_evidence',$4,$5,'application/pdf',$6,'validated','clean')",[i['file'+suffix],guardian,i['payment'+suffix],`${i['file'+suffix]}.pdf`,createHash('sha256').update(fixturePdf).digest('hex'),fixturePdf.length]);
 }
 await pool.query("INSERT INTO public.published_reports(id,student_id,body,status) VALUES($1,$2,'Synthetic unpublished report','draft')",[i.draftA,i.childA]);
}
