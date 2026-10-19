// Catalog validation only: never silently repairs an unsafe existing role.
export const roleContract = Object.freeze({
  phase2_authenticated: { login: false, bypass: false, parents: [] },
  phase2_api: { login: true, bypass: false, inherit: false, parents: ['phase2_authenticated'] },
  phase2_bootstrap: { login: false, bypass: false, parents: [] },
  phase2_definer: { login: false, bypass: true, parents: [] },
  authenticated: { login: false, bypass: false, inherit: true, parents: ['phase2_authenticated'] },
  anon: { login: false, bypass: false, parents: [] },
  service_role: { login: false, bypass: true, parents: [] },
  phase2_rest: { login: true, bypass: false, inherit: false, parents: ['authenticated', 'anon'] },
});
export function assertRoleContract(roles, memberships, { complete = false } = {}) {
  const byName = new Map(roles.map(role => [role.rolname, role]));
  for (const [name, contract] of Object.entries(roleContract)) {
    const role = byName.get(name);
    if (!role) {
      if (complete || ['anon', 'authenticated', 'service_role'].includes(name)) throw new Error('Required canonical role missing: ' + name);
      continue;
    }
    if (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolcanlogin !== contract.login || role.rolbypassrls !== contract.bypass || (contract.inherit !== undefined && role.rolinherit !== contract.inherit)) throw new Error('Unsafe canonical role attributes: ' + name);
    const edges = memberships.filter(edge => edge.member === name);
    for (const edge of edges) {
      if (!contract.parents.includes(edge.parent) || edge.admin_option || edge.set_option === false || (contract.inherit === true && edge.inherit_option === false)) throw new Error('Unsafe canonical role membership: ' + name);
    }
    if (complete && contract.parents.some(parent => !edges.some(edge => edge.parent === parent))) throw new Error('Missing canonical role membership: ' + name);
  }
  // No login or intermediary may SET ROLE to the trusted definer/bootstrap.
  // Restrict inbound application/API role membership as well: no unexpected entry paths.
  const allowedMembers = {
    phase2_definer: [], phase2_bootstrap: [], phase2_api: [], phase2_rest: [],
    phase2_authenticated: ['phase2_api', 'authenticated'],
  };
  for (const edge of memberships) {
    if (Object.hasOwn(allowedMembers, edge.parent) && !allowedMembers[edge.parent].includes(edge.member)) throw new Error('Unexpected canonical role entry path: ' + edge.parent);
  }
}
export async function checkRoles(client, options) {
  const roles = await client.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolcanlogin,rolbypassrls,rolinherit FROM pg_roles');
  const memberships = await client.query('SELECT member.rolname member,parent.rolname parent,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid');
  assertRoleContract(roles.rows, memberships.rows, options);
}
