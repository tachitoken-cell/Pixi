// Server-only Keycloak service credentials. A browser never receives this token.
export function createAccountDeletionProvider({ keycloak, env = process.env, request = fetch } = {}) {
  const clientId = env.KEYCLOAK_DELETE_CLIENT_ID, secret = env.KEYCLOAK_DELETE_CLIENT_SECRET;
  const configured = !!keycloak && !!clientId && !!secret;
  if (!!clientId !== !!secret) throw Error('Account deletion service credentials are incomplete.');
  let access, expiresAt = 0;
  const call = async (url, options) => request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
  async function token() {
    if (access && expiresAt > Date.now() + 30000) return access;
    const realm = env.KEYCLOAK_DELETE_CLIENT_REALM || keycloak.realm;
    const response = await call(`${keycloak.url}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret }).toString(),
    });
    if (!response.ok) throw Error('Account deletion authentication is unavailable.');
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw Error('Invalid account deletion authentication response.');
    access = data.access_token; expiresAt = Date.now() + Math.min(data.expires_in, 3600) * 1000;
    return access;
  }
  return {
    enabled: configured,
    async countUsers() {
      if (!configured) throw Error('Account statistics are unavailable.');
      const response = await call(`${keycloak.url}/admin/realms/${encodeURIComponent(keycloak.realm)}/users/count`, {
        method: 'GET', headers: { Authorization: `Bearer ${await token()}` },
      });
      if (!response.ok) { if (response.status === 401) access = undefined; throw Error('Account statistics are unavailable.'); }
      const count = await response.json();
      if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid account statistics.');
      return count;
    },
    async deleteUser(subject) {
      if (!configured || typeof subject !== 'string' || !subject || subject.length > 255) throw Error('Account deletion is unavailable.');
      const url = `${keycloak.url}/admin/realms/${encodeURIComponent(keycloak.realm)}/users/${encodeURIComponent(subject)}`;
      const headers = { Authorization: `Bearer ${await token()}` };
      const before = await call(url, { method: 'GET', headers });
      if (before.status === 404) {
        // Distinguish an absent user from an inaccessible/misrouted admin API.
        const reachable = await call(`${keycloak.url}/admin/realms/${encodeURIComponent(keycloak.realm)}/users/count`, { method: 'GET', headers });
        if (!reachable.ok || !Number.isSafeInteger(await reachable.json())) throw Error('Account administration could not be confirmed.');
        return;
      }
      if (!before.ok) { if (before.status === 401) access = undefined; throw Error('Account identity could not be checked.'); }
      if ((await before.json()).id !== subject) throw Error('Account identity does not match.');
      const logout = await call(`${url}/logout`, { method: 'POST', headers });
      if (![204, 404].includes(logout.status)) { if (logout.status === 401) access = undefined; throw Error('Account session removal must be retried.'); }
      const removal = await call(url, { method: 'DELETE', headers });
      if (![204, 404].includes(removal.status)) { if (removal.status === 401) access = undefined; throw Error('Account identity removal must be retried.'); }
      const check = await call(url, { method: 'GET', headers });
      if (check.status !== 404) throw Error('Account identity removal could not be confirmed.');
    },
  };
}
