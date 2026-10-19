import{generateKeyPair,exportJWK,exportSPKI,SignJWT}from'jose';
import{randomBytes,randomUUID}from'node:crypto';
import{mkdir,writeFile,stat}from'node:fs/promises';
import net from'node:net';
const root='/workspace/phase2-provider-runtime';
if(process.env.PHASE2_PROVIDER_KEYS!=='synthetic-only')throw new Error('Explicit synthetic-only opt-in required');
for(const port of [3403,55441,55442,55443]){
 const listening=await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();resolve(true);});s.on('error',()=>resolve(false));s.setTimeout(500,()=>{s.destroy();resolve(false);});});
 if(listening)throw new Error('Stop all native-provider test services before generating signing keys');
}
try{await stat(root+'/keys.json');if(process.env.PHASE2_PROVIDER_REPLACE_KEYS!=='discard-synthetic-sessions')throw new Error('Keys already exist; explicit discard-synthetic-sessions replacement required');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(root,{recursive:true,mode:0o700});
const pair=await generateKeyPair('ES256',{extractable:true});
const kid='phase2-local-'+randomUUID();
const privateJwk={...await exportJWK(pair.privateKey),alg:'ES256',use:'sig',kid};
const publicJwk={...await exportJWK(pair.publicKey),alg:'ES256',use:'sig',kid};
const publicKey=await exportSPKI(pair.publicKey);
const jwtSecret=randomBytes(48).toString('base64url');
const secret=Buffer.from(jwtSecret);
const legacy={kty:'oct',k:secret.toString('base64url'),alg:'HS256',use:'sig',kid:'synthetic-legacy'};
async function token(role){return new SignJWT({role,ref:'phase2-local-only'}).setProtectedHeader({alg:'HS256',kid:legacy.kid}).setIssuer('supabase-local').setAudience('authenticated').setIssuedAt().setExpirationTime('2h').sign(secret);}
const keys={privateJwk,publicKey,jwtSecret,publicJwks:{keys:[publicJwk]},jwksVerify:{keys:[publicJwk,legacy]},anonKey:await token('anon'),serviceKey:await token('service_role')};
await writeFile(root+'/keys.json',JSON.stringify(keys,null,2)+'\n',{mode:0o600});
console.log('Created ephemeral local-only signing material outside the source tree; no credential values printed.');
