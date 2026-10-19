import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { startHarness } from './manual-payment-harness.mjs';
let h, fixture, keys, publicKey, server;
before(async()=>{
 h=await startHarness();fixture=await h.seed();keys=await generateKeyPair('ES256',{extractable:true});publicKey=await exportSPKI(keys.publicKey);
});
async function stopServer(){
 if(!server)return;
 const child=server;server=undefined;
 if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
}
after(async()=>{await stopServer();await h?.close();});
async function startServer(enabled){
 const port=await new Promise((resolve,reject)=>{const socket=net.createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(error=>error?reject(error):resolve(port));});});
 const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',PHASE2_LOCAL_SECURITY:'synthetic-only',PHASE2_DATABASE_URL:h.databaseUrl,PHASE2_JWT_PUBLIC_KEY:publicKey};
 if(enabled)env.PHASE2_MANUAL_PAYMENT='synthetic-only';
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:process.cwd(),env,stdio:['ignore','ignore','ignore']});
 const base=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error('Owned local app exited before readiness');
  try{const r=await fetch(base+'/api/manual-payments/orders');if(r.status===(enabled?401:503))return base;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Owned local app did not become ready');
}
async function token(user){
 const now=Math.floor(Date.now()/1000);
 return new SignJWT({role:'authenticated',aal:'aal2',session_id:fixture.sessions[user]}).setProtectedHeader({alg:'ES256'}).setIssuer('http://127.0.0.1:3402/auth/v1').setAudience('authenticated').setSubject(user).setIssuedAt(now).setExpirationTime(now+300).sign(keys.privateKey);
}
async function call(base,user,path,body){
 const r=await fetch(base+'/api/manual-payments/'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${await token(user)}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get('cache-control'),/no-store/);return r.json();
}
test('built Next route reaches default-disabled handler without publishing wallet instructions',async()=>{
 const base=await startServer(false);
 try{
  const r=await fetch(base+'/api/manual-payments/orders');assert.equal(r.status,503);assert.equal((await r.json()).error,'manual_payment_disabled');
  const publicPage=await fetch(base+'/ar/packages');assert.equal(publicPage.status,200);const html=await publicPage.text();assert.ok(html.includes('ريال سعودي'));assert.ok(!/01[0125][0-9]{8}/.test(html));
  assert.equal((await fetch(base+'/ar/login')).status,404);
 }finally{await stopServer();}
});
test('built Next HTTP flow preserves auth, read-only old API and single protected activation',async()=>{
 const base=await startServer(true);
 try{
  const order=randomUUID(),quote=randomUUID(),attempt=randomUUID(),family=fixture.ids.guardianA,reviewer=fixture.ids.owner;
  assert.equal((await fetch(base+'/api/manual-payments/orders')).status,401);
  await call(base,family,'orders',{id:order,studentId:fixture.ids.childA,packageId:'quran'});
  await call(base,reviewer,`orders/${order}/quotes`,{id:quote,amountMinor:12345,currency:'EGP',method:'synthetic-egyptian-wallet'});
  await call(base,family,`orders/${order}/acceptance`,{quoteId:quote,amountMinor:12345,currency:'EGP',method:'synthetic-egyptian-wallet',policyVersion:'manual-payment-local-v1'});
  await call(base,family,`orders/${order}/attempts`,{id:attempt,quoteId:quote,amountMinor:12345,currency:'EGP',reference:'SYNTHETIC-HTTP-ONLY',previousAttemptId:null});
  assert.equal((await call(base,family,`orders/${order}`)).data.activation,null);
  const decision={attemptId:attempt,decision:'verified',reason:'Synthetic independently checked ledger',actualMinor:12345,actualCurrency:'EGP',verificationSource:'SYNTHETIC-HTTP-CHECK',capacityConfirmed:true};
  const first=await call(base,reviewer,`orders/${order}/review`,decision),second=await call(base,reviewer,`orders/${order}/review`,decision);assert.equal(first.id,second.id);
  assert.equal((await call(base,family,`orders/${order}`)).data.activation.lesson_entitlement,8);
  const old=await fetch(base+'/api/phase2/payments',{method:'POST',headers:{Authorization:`Bearer ${await token(reviewer)}`}});assert.equal(old.status,405);assert.equal((await old.json()).error,'read_only_api');
  const count=(await h.admin.query('SELECT count(*)::int n FROM manual_payment.activations')).rows[0].n;assert.equal(count,1);
 }finally{await stopServer();}
});
