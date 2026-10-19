import { randomUUID } from 'node:crypto';

/** Every reset creates a fresh synthetic namespace; no fixture UUID is reused. */
export function makeIds() {
  const u = () => randomUUID();
  return Object.freeze({ owner: u(), guardianA: u(), guardianB: u(), teacherA: u(), teacherB: u(), adultA: u(), adultB: u(), childA: u(), childB: u(), reviewer: u(), reportA: u(), reportB: u(), draftA: u(), noteA: u(), noteB: u(), paymentA: u(), paymentB: u(), fileA: u(), fileB: u(), quarantineFile: u() });
}

export async function reset(pool) {
  const ids = makeIds();
  await pool.query(`TRUNCATE audit_events, private_files, payment_records, teacher_notes, published_reports, teacher_assignments, guardian_links, capabilities, user_roles, teachers, students, profiles, auth.sessions, auth.users CASCADE`);
  await pool.query('INSERT INTO public.bootstrap_control(id) VALUES(true) ON CONFLICT(id) DO UPDATE SET preauthorized_owner_id=NULL,consumed_at=NULL');
  const users = [ids.owner, ids.guardianA, ids.guardianB, ids.teacherA, ids.teacherB, ids.adultA, ids.adultB, ids.reviewer];
  await pool.query(`INSERT INTO auth.users(id) SELECT unnest($1::uuid[])`, [users]);
  await pool.query(`INSERT INTO profiles(auth_user_id,display_name,preferred_locale,timezone,status) SELECT x,'Synthetic '||substr(x::text,1,8),'en','UTC','active' FROM unnest($1::uuid[]) x`, [users]);
  await pool.query(`INSERT INTO students(id,auth_user_id,full_name,age_band,preferred_locale,timezone,status) VALUES ($1,$1,'Adult A','adult','en','UTC','active'),($2,$2,'Adult B','adult','en','UTC','active'),($3,NULL,'Child A','child','en','UTC','active'),($4,NULL,'Child B','child','en','UTC','active')`, [ids.adultA,ids.adultB,ids.childA,ids.childB]);
  await pool.query(`INSERT INTO teachers(auth_user_id,display_name,status) VALUES ($1,'Teacher A','active'),($2,'Teacher B','active')`, [ids.teacherA,ids.teacherB]);
  const sessions = {};
  for (const user of users) { const id = randomUUID(); await pool.query(`INSERT INTO auth.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')`, [id, user]); sessions[user] = id; }
  return { ids, sessions };
}

export async function setClaims(client, user, session, aal = 'aal2') {
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.aal',$2,true), set_config('request.jwt.claim.session_id',$3,true)`, [user, aal, session]);
}
