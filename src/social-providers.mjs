/** Public broker aliases only; credentials and provider validation stay in Keycloak. */
export function socialProvidersFor(keycloak, configured = '') {
  const value = configured.trim();
  const mossvale = keycloak?.url === 'https://auth.mossvale.world' && keycloak.realm === 'mossvale';
  const names = (value === 'none' ? '' : value || (mossvale ? 'google,apple' : '')).split(',').map(name => name.trim()).filter(Boolean);
  if (value && value !== 'none' && !names.length || names.some(name => !['google', 'apple'].includes(name)) || new Set(names).size !== names.length) {
    throw Error('KEYCLOAK_SOCIAL_PROVIDERS must contain google and/or apple without duplicates, or none.');
  }
  return keycloak && (names.length || value === 'none') ? Object.fromEntries(names.map(name => [name, name])) : undefined;
}
