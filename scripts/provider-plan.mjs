// Canonical native-provider source contract. Local synthetic planning only.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export const sourceFingerprints = Object.freeze({
  'db/phase2.sql': 'a9094b1c36606f9b986f9b87e9a7d8d2ffd268df66232249f7adcc800e1e338f',
  'db/phase2-provider.sql': '5e79ab9adb10fecc59bad9cf1c8fddd8ada4a52934a7bec079ac7c303a2c6cc7',
  'db/phase2-provider-storage.sql': 'f8fb378af014c9be71ef3fd090d0d61cd89077d851e5af3ab9b2b59822f30674',
});
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
function once(sql, from, to) {
  if (sql.split(from).length !== 2) throw new Error('Base schema contract changed; review the provider transformation');
  return sql.replace(from, to);
}
function unwrap(sql) {
  if ((sql.match(/^BEGIN;$/gm) || []).length !== 1 || (sql.match(/^COMMIT;$/gm) || []).length !== 1 || !sql.trimEnd().endsWith('COMMIT;')) throw new Error('Expected exactly one outer SQL transaction');
  return sql.replace(/^BEGIN;\n/m, '').replace(/^COMMIT;\s*$/m, '');
}
export async function loadSources() {
  return Object.fromEntries(await Promise.all(Object.keys(sourceFingerprints).map(async (file) => [file, await readFile(new URL('../' + file, import.meta.url), 'utf8')])));
}
export function buildProviderPlan(sources) {
  for (const [file, expected] of Object.entries(sourceFingerprints)) {
    if (typeof sources[file] !== 'string' || sha256(sources[file]) !== expected) throw new Error('Canonical SQL source drift: ' + file + '; explicit review and fingerprint update required');
  }
  let sql = sources['db/phase2.sql'];
  sql = sql.replaceAll("'phase2_test'", "'phase2_provider_test'");
  const start = sql.indexOf('CREATE SCHEMA auth;');
  const end = sql.indexOf('CREATE TABLE public.profiles(');
  if (start < 0 || end < start) throw new Error('Base auth boundary missing');
  sql = sql.slice(0,start) + `-- Preserve native GoTrue auth tables/migrations. Only add our helper functions.\nCREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT nullif(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'),'')::uuid $$;\nCREATE OR REPLACE FUNCTION auth.aal2() RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT coalesce(coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal')='aal2',false) $$;\n\n` + sql.slice(end);
  sql = once(sql, 'CREATE INDEX sessions_user ON auth.sessions(user_id);', '-- Native GoTrue owns its session indexes.');
  sql = once(sql, "SELECT EXISTS(SELECT FROM public.profiles p JOIN auth.sessions s ON s.user_id=p.auth_user_id WHERE p.auth_user_id=auth.uid() AND p.status='active' AND s.id=nullif(current_setting('request.jwt.claim.session_id',true),'')::uuid AND s.revoked_at IS NULL AND s.expires_at>now())", "SELECT EXISTS(SELECT FROM public.profiles p JOIN auth.sessions s ON s.user_id=p.auth_user_id JOIN auth.users u ON u.id=p.auth_user_id WHERE p.auth_user_id=auth.uid() AND p.status='active' AND s.id=nullif(current_setting('request.jwt.claim.session_id',true),'')::uuid AND (s.not_after IS NULL OR s.not_after>now()) AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()))");
  sql = once(sql, 'REVOKE ALL ON ALL TABLES IN SCHEMA public,auth FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap;', 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap;\nREVOKE ALL ON auth.users,auth.sessions FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap,authenticated,anon;');
  sql = once(sql, 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,auth FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap;', 'REVOKE ALL ON FUNCTION auth.uid(),auth.aal2() FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap;\nREVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,phase2_authenticated,phase2_api,phase2_bootstrap;');
  sql = once(sql, 'GRANT SELECT ON ALL TABLES IN SCHEMA public,auth TO phase2_definer;', 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO phase2_definer;\nGRANT SELECT ON auth.users,auth.sessions TO phase2_definer;');
  sql = once(sql, "WHERE n.nspname IN('public','auth')", "WHERE ((n.nspname='public' AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')) OR (n.nspname='auth' AND p.proname IN('uid','aal2')))");
  const applicationSql = unwrap(sql) + '\n' + unwrap(sources['db/phase2-provider.sql']);
  return {
    contract: 'canonical-native-v1', database: 'phase2_provider_test', host: '127.0.0.1', port: 55432,
    bucket: 'phase2-private', sourceFingerprints, applicationSha256: sha256(applicationSql),
    steps: ['native Auth provision/migrate separately', 'single application transaction with advisory lock', 'native Storage provision/migrate separately', 'private Storage guard separately'],
    applicationSql,
  };
}
