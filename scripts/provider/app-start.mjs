import { assertRuntimeReady } from './runtime-check.mjs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await assertRuntimeReady('postgresql://phase2_api@127.0.0.1:55432/phase2_provider_test');
const k=JSON.parse(await readFile('/workspace/phase2-provider-runtime/keys.json','utf8'));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3403'],{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',PHASE2_LOCAL_SECURITY:'synthetic-provider-only',PHASE2_DATABASE_URL:'postgresql://phase2_api@127.0.0.1:55432/phase2_provider_test',PHASE2_JWT_PUBLIC_KEY:k.publicKey,PHASE2_PROVIDER_STORAGE_ORIGIN:'http://127.0.0.1:55442',PHASE2_PROVIDER_STORAGE_CREDENTIAL:k.serviceKey}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
