/** Public browser identifiers only; wallet keys and service credentials never belong here. */
export function createTurnkeyConfig(env = process.env) {
  const { TURNKEY_ORGANIZATION_ID: organizationId = '', TURNKEY_AUTH_PROXY_CONFIG_ID: authProxyConfigId = '' } = env;
  if (organizationId === '' && authProxyConfigId === '') return null;
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
  if (![organizationId, authProxyConfigId].every(value => typeof value === 'string' && value.length === 36 && uuid.test(value))) {
    throw Error('TURNKEY_ORGANIZATION_ID and TURNKEY_AUTH_PROXY_CONFIG_ID must both be valid UUIDs, or both be unset.');
  }
  return { organizationId, authProxyConfigId };
}
