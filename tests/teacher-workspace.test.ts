import { test } from "node:test";
import assert from "node:assert/strict";
import { teacherSecurity, teacherToken, teacherCookie, teacherBody, teacherLogin, teacherPublicData, TEACHER_COOKIE } from "../src/lib/academy/teacher-workspace";
import { teacherProfilePendingCopy } from "../src/lib/academy/teacher-workspace-copy";
import { TeacherFoundationError, type FetchLike } from "../src/lib/academy/teacher-foundation";
import * as route from "../src/app/api/teacher/route";
const HOST="elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"preview/academy-synthetic",ACADEMY_SUPABASE_URL:"https://dyyvpcntbbwbuzskiidb.supabase.co",ACADEMY_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_mock_public_test_key_only"};
const uid="11111111-1111-4111-8111-111111111111";
const identity={id:uid,is_anonymous:false,email_confirmed_at:"2026-01-01T00:00:00Z"};
const teacher={id:uid,display_name:"Teacher",time_zone:"Asia/Riyadh"};
const lesson={id:"22222222-2222-4222-8222-222222222222",child_id:"33333333-3333-4333-8333-333333333333",subject:"quran",starts_at:"2026-01-01T10:00:00Z",ends_at:"2026-01-01T11:00:00Z",time_zone:"Asia/Riyadh",status:"scheduled",outcome:null,follow_up_note:""};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json"}});
const req=(method="GET",url=`https://${HOST}/api/teacher`,headers:Record<string,string>={})=>new Request(url,{method,headers:{host:HOST,"x-teacher-workspace":"real-preview",...headers}});
const reject=(p:Promise<unknown>,status:number,code:string)=>assert.rejects(p,e=>e instanceof TeacherFoundationError&&e.status===status&&e.code===code);
function mocked(responses:Response[]){let i=0;const urls:string[]=[];const fetchImpl:FetchLike=async(input)=>{urls.push(String(input));return responses[i++]??new Response("unexpected",{status:500})};return{fetchImpl,urls};}

test("security validates enabled gates, host, forwarded guards, origin and workspace header",()=>{
 assert.equal(teacherSecurity(req(),env),0); assert.equal(teacherSecurity(new Request("http://localhost:3000/api/teacher",{headers:{host:"localhost:3000","x-teacher-workspace":"real-preview"}}),env),0);
 for(const h of ([{host:"evil"},{"x-forwarded-host":"evil"},{"x-forwarded-proto":"http"},{origin:"https://evil"},{"sec-fetch-site":"cross-site"},{"x-teacher-workspace":"bad"}] as Record<string,string>[]))assert.throws(()=>teacherSecurity(req("GET",undefined,h),env));
 for(const u of [`https://${HOST}/other`,`http://${HOST}/api/teacher`])assert.throws(()=>teacherSecurity(req("GET",u),env));
 assert.throws(()=>teacherSecurity(req("GET",undefined,{}),{...env,VERCEL:"0"}));
});
test("pagination and POST CSRF rules reject unknown, duplicate, malformed and out of bounds params",()=>{
 assert.equal(teacherSecurity(req("GET",`https://${HOST}/api/teacher?offset=10000`,{origin:`https://${HOST}`}),env),10000);
 for(const q of ["offset=01","offset=-1","offset=10001","offset=1.2","offset=1&offset=2","foo=1"])assert.throws(()=>teacherSecurity(req("GET",`https://${HOST}/api/teacher?${q}`,{origin:`https://${HOST}`}),env));
 assert.equal(teacherSecurity(req("POST",undefined,{origin:`https://${HOST}`}),env),0); assert.throws(()=>teacherSecurity(req("POST",undefined),env)); assert.throws(()=>teacherSecurity(req("POST",`https://${HOST}/api/teacher?offset=1`,{origin:`https://${HOST}`}),env));
});
test("cookie parser ignores other families and rejects duplicates; cookie attributes are narrow",()=>{
 const t="A".repeat(20); assert.equal(teacherToken(req("GET",undefined,{cookie:`academy_access=x; demo_teacher=y; ${TEACHER_COOKIE}=${t}`})),t);
 for(const c of [`${TEACHER_COOKIE}=short`,`${TEACHER_COOKIE}=bad token`,`${TEACHER_COOKIE}=${t}; ${TEACHER_COOKIE}=B${t}`])assert.equal(teacherToken(req("GET",undefined,{cookie:c})),null);
 const c=teacherCookie(t,3600,HOST); assert.match(c,/HttpOnly/);assert.match(c,/SameSite=Strict/);assert.match(c,/Path=\/api\/teacher/);assert.match(c,/Max-Age=3600/);assert.match(c,/Secure/);assert.doesNotMatch(teacherCookie(t,1,"localhost:3000"),/ Secure;/);
});
test("body parser enforces JSON, object shape and 4 KiB limit",async()=>{
 for(const [body,status] of [["{",400],["[]",400],["x".repeat(4097),413]] as [string,number][])await reject(teacherBody(new Request(`https://${HOST}/api/teacher`,{method:"POST",headers:{"content-type":"application/json"},body})),status,status===413?"payload_too_large":"invalid_request");
 await reject(teacherBody(new Request(`https://${HOST}/api/teacher`,{method:"POST",headers:{"content-type":"text/plain"},body:"{}"})),400,"invalid_request"); assert.deepEqual(await teacherBody(new Request(`https://${HOST}/api/teacher`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"logout"})})),{action:"logout"});
});
test("login verifies Auth token, identity, active profile and assignments without fallback or writes",async()=>{
 const token="T".repeat(24),m=mocked([json({access_token:token,refresh_token:"ignore",expires_in:7200}),json(identity),json([teacher]),json([lesson])]); const r=await teacherLogin({action:"login",email:"teacher@example.test",password:"x"},env,m.fetchImpl);
 assert.equal(r.token,token);assert.equal(r.maxAge,3600);assert.deepEqual(r.data.lessons[0],{id:lesson.id,subject:lesson.subject,starts_at:lesson.starts_at,ends_at:lesson.ends_at,time_zone:lesson.time_zone,status:lesson.status,outcome:lesson.outcome,follow_up_note:lesson.follow_up_note});assert.match(m.urls[3],/academy_teacher_assignments!inner\(status\)/);assert.match(m.urls[3],/academy_teacher_assignments.status=eq.active/);assert.ok(m.urls.every(u=>!/(signup|refresh|insert|update|delete|rpc)/.test(u)));
});
test("login rejects extra role/teacher_id, anonymous/unconfirmed/wrong identity, missing/suspended profile and provider errors",async()=>{
 for(const b of [{action:"login",email:"a@b.test",password:"x",role:"teacher"},{action:"login",email:"a@b.test",password:"x",teacher_id:uid},{action:"signup",email:"a@b.test",password:"x"}])await reject(teacherLogin(b,env,mocked([]).fetchImpl),400,"invalid_credentials");
 for(const id of [{...identity,is_anonymous:true},{...identity,email_confirmed_at:null},{...identity,id:"bad"}])await reject(teacherLogin({action:"login",email:"a@b.test",password:"x"},env,mocked([json({access_token:"T".repeat(20),expires_in:60}),json(id)]).fetchImpl),401,"authentication_required");
 await reject(teacherLogin({action:"login",email:"a@b.test",password:"x"},env,mocked([json({access_token:"T".repeat(20),expires_in:60}),json(identity),json([])]).fetchImpl),403,"teacher_profile_required");
 for(const r of [new Response("x",{status:401}),new Response("x",{status:500}),new Response("bad")])await reject(teacherLogin({action:"login",email:"a@b.test",password:"x"},env,mocked([r]).fetchImpl),r.status===401?401:503,r.status===401?"authentication_required":"teacher_roster_unavailable");
});
test("public data strips child_id and private fields",()=>{const r=teacherPublicData({teacher,lessons:[{...lesson,private_note:"x"} as never],has_more:true,offset:0});assert.equal("child_id" in r.lessons[0],false);assert.deepEqual(r.lessons[0],{id:lesson.id,subject:lesson.subject,starts_at:lesson.starts_at,ends_at:lesson.ends_at,time_zone:lesson.time_zone,status:lesson.status,outcome:lesson.outcome,follow_up_note:lesson.follow_up_note});});
function routeReq(method:string,body?:unknown,headers:Record<string,string>={}){return new Request(`https://${HOST}/api/teacher`,{method,headers:{host:HOST,"x-teacher-workspace":"real-preview",...(method==="POST"?{origin:`https://${HOST}`,"content-type":"application/json"}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
async function routeEnv(fetchImpl:typeof fetch,fn:()=>Promise<void>){const old={...process.env},of=globalThis.fetch;Object.assign(process.env,env);globalThis.fetch=fetchImpl;try{await fn()}finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);globalThis.fetch=of}}
test("direct route GET/POST emits safe responses and cookie behavior",async()=>{
 const token="T".repeat(24);const fetchImpl=(async(input)=>{const u=String(input);if(u.includes("/auth/v1/user"))return json(identity);if(u.includes("academy_teachers"))return json([teacher]);return json([lesson])}) as typeof fetch;
 await routeEnv(fetchImpl,async()=>{const ok=await route.GET(routeReq("GET",undefined,{cookie:`${TEACHER_COOKIE}=${token}`}));assert.equal(ok.status,200);assert.equal("child_id" in (await ok.json()).lessons[0],false);const no=await route.GET(routeReq("GET"));assert.equal(no.status,401);assert.match(no.headers.get("set-cookie")!,/Max-Age=0/)});
 await routeEnv((async()=>json({access_token:token,expires_in:60})) as typeof fetch,async()=>{const bad=await route.POST(routeReq("POST",{action:"login",email:"a@b.test",password:"x"}));assert.equal(bad.status,401);assert.match(bad.headers.get("set-cookie")!,/Max-Age=0/);const out=await route.POST(routeReq("POST",{action:"logout"}));assert.equal(out.status,200);assert.match(out.headers.get("set-cookie")!,/Max-Age=0/)})
});

test("route denies guardian/unassigned login without granting a teacher session or reading lessons", async () => {
 const token="T".repeat(24),m=mocked([json({access_token:token,expires_in:3600}),json(identity),json([])]);
 await routeEnv(m.fetchImpl,async()=>{
  const denied=await route.POST(routeReq("POST",{action:"login",email:"guardian@example.test",password:"local-test-only"}));
  assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{error:"teacher_profile_required"});
  assert.match(denied.headers.get("set-cookie")!,/Max-Age=0/);assert.doesNotMatch(denied.headers.get("set-cookie")!,new RegExp(token));
  assert.equal(m.urls.length,3);assert.ok(!m.urls.some(u=>u.includes("academy_individual_lessons")));
 });
});
test("route active teacher login returns only public fields and unsupported actions make no provider calls", async()=>{
 const token="T".repeat(24),m=mocked([json({access_token:token,refresh_token:"never expose",expires_in:3600}),json(identity),json([teacher]),json([lesson])]);
 await routeEnv(m.fetchImpl,async()=>{
  const ok=await route.POST(routeReq("POST",{action:"login",email:"teacher@example.test",password:"local-test-only"}));
  assert.equal(ok.status,200);assert.match(ok.headers.get("set-cookie")!,/HttpOnly; SameSite=Strict; Secure;/);
  const text=await ok.text();assert.doesNotMatch(text,/child_id|refresh_token|access_token|never expose/);assert.match(ok.headers.get("cache-control")!,/no-store/);
  for(const action of ["signup","attendance","follow-up","invite"]){const denied=await route.POST(routeReq("POST",{action}));assert.equal(denied.status,400)}
  assert.equal(m.urls.length,4);
 });
 const revoked=mocked([json(identity),json([])]);
 await routeEnv(revoked.fetchImpl,async()=>{const denied=await route.GET(routeReq("GET",undefined,{cookie:`${TEACHER_COOKIE}=${token}`}));assert.equal(denied.status,403);assert.match(denied.headers.get("set-cookie")!,/Max-Age=0/);assert.equal(revoked.urls.length,2)});
 const expired=mocked([json({error:"expired"},401)]);
 await routeEnv(expired.fetchImpl,async()=>{const denied=await route.GET(routeReq("GET",undefined,{cookie:`${TEACHER_COOKIE}=${token}`}));assert.equal(denied.status,401);assert.match(denied.headers.get("set-cookie")!,/Max-Age=0/)});
});

test("real POST outcome route refuses anonymous and forbidden fields and strips private response keys",async()=>{
 const token="T".repeat(24),update={action:"update-session",id:lesson.id,outcome:"absent",follow_up_note:"Practice tomorrow."};
 const m=mocked([json(identity),json([teacher]),json([{...lesson,outcome:update.outcome,follow_up_note:update.follow_up_note,private_note:"never expose"}])]);
 await routeEnv(m.fetchImpl,async()=>{
  const anonymous=await route.POST(routeReq("POST",update));assert.equal(anonymous.status,401);assert.equal(m.urls.length,0);
  const forbidden=await route.POST(routeReq("POST",{...update,status:"cancelled"},{cookie:`${TEACHER_COOKIE}=${token}`}));assert.equal(forbidden.status,400);assert.equal(m.urls.length,0);
  const saved=await route.POST(routeReq("POST",update,{cookie:`${TEACHER_COOKIE}=${token}`}));assert.equal(saved.status,200);const data=await saved.json();assert.equal(data.lesson.outcome,"absent");assert.equal(data.lesson.follow_up_note,update.follow_up_note);assert.equal("child_id" in data.lesson,false);assert.equal("private_note" in data.lesson,false);assert.match(saved.headers.get("cache-control")!,/no-store/);assert.equal(m.urls.length,3);
 });
 const revoked=mocked([json(identity),json([teacher]),json([])]);
 await routeEnv(revoked.fetchImpl,async()=>{const result=await route.POST(routeReq("POST",update,{cookie:`${TEACHER_COOKIE}=${token}`}));assert.equal(result.status,403);assert.deepEqual(await result.json(),{error:"session_not_available"});});
});

test("pending teacher access copy is clear in Arabic and English without exposing internal or personal data",()=>{
 assert.match(teacherProfilePendingCopy.ar,/تم التحقق من بيانات الدخول/);
 assert.match(teacherProfilePendingCopy.ar,/قد ضبطت كلمة المرور من دعوة/);
 assert.match(teacherProfilePendingCopy.ar,/تواصل مع مسؤول الأكاديمية/);
 assert.match(teacherProfilePendingCopy.en,/sign-in was accepted/);
 assert.match(teacherProfilePendingCopy.en,/set a password from an invitation/);
 assert.match(teacherProfilePendingCopy.en,/contact the academy administrator/);
 assert.match(teacherProfilePendingCopy.en,/do not need to reset your password or create another account/);
 assert.doesNotMatch(`${teacherProfilePendingCopy.ar} ${teacherProfilePendingCopy.en}`,/academy_teachers|academy_teacher_assignments|@/i);
});
