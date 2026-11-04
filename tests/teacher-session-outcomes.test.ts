import { test } from "node:test";
import assert from "node:assert/strict";
import { updateSession, validOutcomeFields, TeacherFoundationError, type FetchLike } from "../src/lib/academy/teacher-foundation";
import { validMeetingUrl } from "../src/lib/academy/meeting-url";
const uid="11111111-1111-4111-8111-111111111111", id="22222222-2222-4222-8222-222222222222";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"preview/academy-synthetic",ACADEMY_SUPABASE_URL:"https://dyyvpcntbbwbuzskiidb.supabase.co",ACADEMY_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_mock_public_test_key_only"};
const teacher={id:uid,display_name:"Synthetic teacher",time_zone:"UTC"};
const identity={id:uid,is_anonymous:false,email_confirmed_at:"2026-01-01T00:00:00Z"};
const body={action:"update-session",id,meeting_url:"https://meet.google.com/abc-defg-hij",outcome:"attended_completed",follow_up_note:"راجع الحروف\nPractice letters."};
const lesson={id,child_id:"33333333-3333-4333-8333-333333333333",subject:"quran",starts_at:"2026-01-01T10:00:00Z",ends_at:"2026-01-01T10:30:00Z",time_zone:"UTC",status:"scheduled",meeting_url:body.meeting_url,outcome:body.outcome,follow_up_note:body.follow_up_note};
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status});
function mock(responses:Response[]){const calls:{url:string,init?:RequestInit}[]=[];const fetchImpl:FetchLike=async(input,init)=>{calls.push({url:String(input),init});const r=responses.shift();if(!r)throw Error("unexpected fetch");return r};return{fetchImpl,calls};}
const denied=(p:Promise<unknown>,status:number,code:string)=>assert.rejects(p,e=>e instanceof TeacherFoundationError&&e.status===status&&e.code===code);
test("meeting URL validation accepts only strict HTTPS allowlisted hosts",()=>{
 const allowed=[null,"https://meet.google.com/abc-defg-hij","https://teams.microsoft.com/l/meetup-join/abc?context=%7B%22id%22%3A%221%22%7D","https://teams.live.com/meet/abc?p=123","https://zoom.us/j/123456?pwd=AbC%2F12","https://us02web.zoom.us/j/123456?pwd=AbC%2F12"];
 const rejected=[undefined,"","http://meet.google.com/abc","https://meet.google.com","https://meet.google.com/","https://meet.google.com.evil.example/abc","https://meet.google.com@evil.example/abc","https://user@meet.google.com/abc","https://meet.google.com:443/abc","https://a.b.zoom.us/j/123","https://-bad.zoom.us/j/123","https://evil.example/abc","https://meet.google.com/a b","https://meet.google.com/%ZZ","https://meet.google.com/"+"a".repeat(300),"https://meet.google.com/abc\\evil"];
 for(const url of allowed)assert.equal(validMeetingUrl(url),true,String(url));
 for(const url of rejected)assert.equal(validMeetingUrl(url),false,String(url));
});
test("outcome and note limits match database Unicode semantics",()=>{
 for(const outcome of [null,"attended_completed","attended_incomplete","absent"])assert.equal(validOutcomeFields(outcome,""),true);
 assert.equal(validOutcomeFields("absent","😀".repeat(500)),true);
 assert.equal(validOutcomeFields("absent","a\tb\nc"),true);
 for(const [outcome,note] of [["unknown",""],[undefined,""],[null,"note"],["absent"," "],["absent","x".repeat(501)],["absent","😀".repeat(501)],["absent","x\r"],["absent","x\u0085"],["absent",null]])assert.equal(validOutcomeFields(outcome,note),false);
});
test("write verifies identity and active profile then PATCHes only allowed fields with caller token",async()=>{
 const m=mock([json(identity),json([teacher]),json([lesson])]);
 assert.deepEqual(await updateSession("caller-token",body,{env,fetchImpl:m.fetchImpl}),lesson);
 assert.equal(m.calls.length,3);const last=m.calls[2];assert.match(last.url,new RegExp(`id=eq.${id}&teacher_id=eq.${uid}&status=eq.scheduled`));
 assert.equal(last.init?.method,"PATCH");assert.deepEqual(JSON.parse(last.init!.body as string),{meeting_url:body.meeting_url,outcome:body.outcome,follow_up_note:body.follow_up_note});
 for(const c of m.calls){assert.equal(c.init?.cache,"no-store");assert.equal(c.init?.redirect,"error");assert.equal((c.init?.headers as Record<string,string>).Authorization,"Bearer caller-token");}
});
test("identity, schedule, assignment and extra payload fields fail before provider calls",async()=>{
 for(const patch of [{teacher_id:uid},{child_id:uid},{starts_at:"2030-01-01"},{ends_at:"2030-01-01"},{subject:"quran"},{status:"cancelled"},{time_zone:"UTC"},{created_at:"x"},{id:"id=eq.bad"},{outcome:"completed"},{follow_up_note:"x".repeat(501)}]){
  const m=mock([]);await denied(updateSession("token",{...body,...patch},{env,fetchImpl:m.fetchImpl}),400,"invalid_session_outcome");assert.equal(m.calls.length,0);
 }
 for(const meeting_url of ["https://evil.example/meet","https://meet.google.com","https://meet.google.com/%GG"]){const m=mock([]);await denied(updateSession("token",{...body,meeting_url},{env,fetchImpl:m.fetchImpl}),400,"invalid_meeting_url");assert.equal(m.calls.length,0);}
});
test("missing, suspended, anonymous and unconfirmed teachers never reach PATCH",async()=>{
 for(const identityResponse of [{...identity,is_anonymous:true},{...identity,email_confirmed_at:null}]){const m=mock([json(identityResponse)]);await denied(updateSession("token",body,{env,fetchImpl:m.fetchImpl}),401,"authentication_required");assert.equal(m.calls.length,1);}
 const m=mock([json(identity),json([])]);await denied(updateSession("token",body,{env,fetchImpl:m.fetchImpl}),403,"teacher_profile_required");assert.equal(m.calls.length,2);
});
test("RLS filtered no-op and forbidden writes are not reported as saved",async()=>{
 for(const response of [json([]),json({message:"private error"},403)])await denied(updateSession("token",body,{env,fetchImpl:mock([json(identity),json([teacher]),response]).fetchImpl}),403,"session_not_available");
 for(const response of [json({message:"private"},400),json({message:"private"},409)])await denied(updateSession("token",body,{env,fetchImpl:mock([json(identity),json([teacher]),response]).fetchImpl}),400,"invalid_session_outcome");
 await denied(updateSession("token",body,{env,fetchImpl:mock([json(identity),json([teacher]),json({},500)]).fetchImpl}),503,"teacher_roster_unavailable");
});
test("malformed, stale and mismatched update responses fail closed",async()=>{
 for(const rows of [[{...lesson,id:uid}],[{...lesson,status:"cancelled"}],[{...lesson,outcome:null}],[{...lesson,follow_up_note:"other"}],[lesson,lesson],{}])await denied(updateSession("token",body,{env,fetchImpl:mock([json(identity),json([teacher]),json(rows)]).fetchImpl}),503,"teacher_roster_unavailable");
});
test("write gate refuses main, Production and old Supabase before fetching",async()=>{
 for(const patch of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},{ACADEMY_SUPABASE_URL:"https://vbulxdnfknoybdkuhayz.supabase.co"}]){const m=mock([]);await denied(updateSession("token",body,{env:{...env,...patch},fetchImpl:m.fetchImpl}),503,"teacher_roster_unavailable");assert.equal(m.calls.length,0);}
});
