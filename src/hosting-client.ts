import { createHostingConfig, parseHostingConfig, type HostingConfig, type RealmId } from './hosting-realms.ts';

export let hostingConfig: HostingConfig = createHostingConfig();
let activeRealmId: RealmId | undefined = hostingConfig.realmId, realmController = new AbortController();
export function configureHosting(value: unknown) {
  hostingConfig = parseHostingConfig(value); setActiveHostingRealm(hostingConfig.realmId);
}
/** Invalidate captured wallet destinations before leaving a realm; never accept a caller-provided origin. */
export function setActiveHostingRealm(realmId: RealmId | undefined) {
  if (realmId !== undefined && !hostingConfig.realms.some(realm => realm.id === realmId && realm.origin !== null)) throw Error('This realm is not open yet.');
  const previous = realmController;
  activeRealmId = realmId; realmController = new AbortController(); previous.abort();
}
export function activeRealmTarget(path: '/api/config' | '/api/turnkey/wallet') {
  if (path !== '/api/config' && path !== '/api/turnkey/wallet') throw Error('Unsupported realm wallet endpoint.');
  if (activeRealmId === undefined) throw Error('Finish connecting to your realm before opening the wallet.');
  return { url: realmAddress(activeRealmId, path), signal: realmController.signal };
}
export const guestSessionKey = 'mossvale-session';

export function realmAddress(realmId: RealmId, path: string, localOrigin = location.origin): string {
  const realm = hostingConfig.realms.find(realm => realm.id === realmId);
  if (!realm || realm.origin === null) throw Error('This realm is not open yet.');
  const url = new URL(path, realm.origin || localOrigin);
  if (path === '/socket') url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

export function leaveHostingRealm(connection: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const failure = () => finish(Error('Could not confirm your progress was saved. Reconnect before changing realm.'));
    const timer = setTimeout(failure, 10000);
    function finish(error?: Error) {
      clearTimeout(timer); connection.removeEventListener('message', onMessage); connection.removeEventListener('close', failure);
      if (error) reject(error); else resolve();
    }
    function onMessage(event: MessageEvent) {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message?.type === 'realmLeft') finish();
    }
    connection.addEventListener('message', onMessage); connection.addEventListener('close', failure);
    try { connection.send(JSON.stringify({ type: 'leaveRealm' })); } catch { failure(); }
  });
}
