import { assertRuntimeReady } from './runtime-check.mjs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await assertRuntimeReady('postgresql://phase2_rest@127.0.0.1:55432/phase2_provider_test');
const keys=JSON.parse(await readFile('/workspace/phase2-provider-runtime/keys.json','utf8'));
const child=spawn('/workspace/phase2-provider-tools/postgrest/postgrest',[],{stdio:'inherit',env:{...process.env,
 PGRST_DB_URI:'postgresql://phase2_rest@127.0.0.1:55432/phase2_provider_test',
 PGRST_DB_SCHEMAS:'api',PGRST_DB_EXTRA_SEARCH_PATH:'public',PGRST_DB_ANON_ROLE:'anon',
 PGRST_DB_PRE_REQUEST:'provider_private.check_request',PGRST_JWT_SECRET:JSON.stringify(keys.publicJwks),
 PGRST_JWT_AUD:'authenticated',PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55443',
 PGRST_ADMIN_SERVER_HOST:'127.0.0.1',PGRST_ADMIN_SERVER_PORT:'55444',
 PGRST_DB_POOL:'4',PGRST_DB_CONFIG:'false',PGRST_OPENAPI_MODE:'disabled',PGRST_LOG_LEVEL:'error',PGRST_CLIENT_ERROR_VERBOSITY:'minimal'
}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
