const realmIds = ['eu', 'us', 'asia'] as const;
export type RealmId = typeof realmIds[number];
export interface HostingRealm { id: RealmId; name: string; origin: string | null }
export interface HostingConfig { realmId: RealmId; realms: HostingRealm[] }

const names = { eu: 'Europe', us: 'North America', asia: 'Asia' } as const;
export const realmIdValid = (value: unknown): value is RealmId => realmIds.some(id => id === value);

export function hostingOrigin(value: unknown): string {
  if (typeof value !== 'string' || !/^https?:\/\/[^/?#\s]+\/?$/i.test(value)) throw Error('Realm addresses must be HTTP(S) origins.');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('Realm addresses must be HTTPS origins without credentials, paths, queries or fragments; local development may use HTTP.');
  }
  return url.origin;
}

export function createHostingConfig(realmId: unknown = 'eu', euOrigin = '', usOrigin = '', asiaOrigin = ''): HostingConfig {
  if (!realmIdValid(realmId)) throw Error('REALM_ID must be eu, us or asia.');
  const origins = { eu: euOrigin ? hostingOrigin(euOrigin) : null, us: usOrigin ? hostingOrigin(usOrigin) : null, asia: asiaOrigin ? hostingOrigin(asiaOrigin) : null };
  const configured = Object.values(origins).filter(Boolean);
  if (new Set(configured).size !== configured.length) throw Error('Realms must have different realm addresses.');
  return { realmId, realms: realmIds.map(id => ({ id, name: names[id], origin: id === realmId ? '' : origins[id] })) };
}

export function parseHostingConfig(value: unknown): HostingConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Realm settings are unavailable.');
  const config = value as Partial<HostingConfig>;
  if (!Object.hasOwn(config, 'realmId') && !Object.hasOwn(config, 'realms')) return createHostingConfig();
  if (!realmIdValid(config.realmId) || !Array.isArray(config.realms) || ![2, 3].includes(config.realms.length)
    || config.realms.some(realm => !realmIdValid(realm?.id)) || new Set(config.realms.map(realm => realm.id)).size !== config.realms.length) throw Error('Realm settings are invalid.');
  const realms = realmIds.map(id => {
    const realm = config.realms!.find(realm => realm?.id === id);
    // Older EU/US servers remain readable during the regional rollout.
    if (!realm && id === 'asia' && config.realmId !== 'asia' && config.realms!.length === 2) return { id, name: names[id], origin: null };
    if (!realm || realm.name !== names[id] || (id === config.realmId ? realm.origin !== '' : realm.origin !== null && (typeof realm.origin !== 'string' || !realm.origin))) throw Error('Realm settings are invalid.');
    return { id, name: names[id], origin: realm.origin ? hostingOrigin(realm.origin) : realm.origin };
  });
  const origins = realms.map(realm => realm.origin).filter(Boolean);
  if (new Set(origins).size !== origins.length) throw Error('Realms must have different realm addresses.');
  return { realmId: config.realmId, realms };
}
