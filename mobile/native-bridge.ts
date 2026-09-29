export type NativeMethod = 'billing.authorize' | 'billing.products' | 'billing.purchase' | 'billing.restore' | 'auth.restore' | 'auth.save' | 'auth.clear' | 'treasure.connect' | 'treasure.sign' | 'treasure.collect' | 'notifications.authorize' | 'notifications.status' | 'notifications.configure' | 'notifications.settings' | 'notifications.prompt';
export type NativeRequest = { method: NativeMethod; params: Record<string, unknown>; signal: AbortSignal; url: URL };
export class NativeError extends Error {
  constructor(public code: number, message: string) { super(message); }
}
const methods = new Set<NativeMethod>(['billing.authorize', 'billing.products', 'billing.purchase', 'billing.restore', 'auth.restore', 'auth.save', 'auth.clear', 'treasure.connect', 'treasure.sign', 'treasure.collect', 'notifications.authorize', 'notifications.status', 'notifications.configure', 'notifications.settings', 'notifications.prompt']);
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const cancelled = () => new NativeError(4001, 'Request cancelled.');
export function randomDocumentId() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join(''); }
export function requireActive(signal: AbortSignal) { if (signal.aborted) throw cancelled(); }
export function fields(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (!required.every(key => Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new NativeError(-32602, 'Invalid native request.');
}
export function trustedGamePage(value: string, configuredUrl: string, development: boolean): URL | undefined {
  try {
    const url = new URL(value);
    const origins = new Set(['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world']);
    if (development) origins.add(new URL(configuredUrl).origin);
    if (url.username || url.password || !origins.has(url.origin) || !['/', '/index.html'].includes(url.pathname)) return;
    if (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) return;
    return url;
  } catch { return; }
}

function json(value: unknown) { return JSON.stringify(value).replace(/[\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16)}`); }
function documentUrl(value: string) { const url = new URL(value); url.hash = ''; return url.href; }
export function createNativeBridge(options: { configuredUrl: string; development: boolean; platform: 'apple' | 'google'; randomId: () => string; send: (script: string) => void; execute: (request: NativeRequest) => Promise<unknown>; onNavigate: () => void }) {
  let current: { id: string; url: URL; seen: Set<string>; pending: Map<string, AbortController> } | undefined;
  function invalidate() {
    for (const controller of current?.pending.values() || []) controller.abort();
    current = undefined; options.onNavigate();
  }
  function navigate(value: string) {
    invalidate();
    const url = trustedGamePage(value, options.configuredUrl, options.development);
    if (url) current = { id: options.randomId(), url, seen: new Set(), pending: new Map() };
  }
  function send(value: unknown, doc = current) {
    if (!doc || current !== doc) return;
    options.send(`if(window.top===window&&location.origin===${json(doc.url.origin)}&&window.__mossvaleNativeReceive){window.__mossvaleNativeReceive(${json({ v: 1, channel: 'mossvale-native', documentId: doc.id, ...value as object })});}true;`);
  }
  async function receive(data: string, eventUrl: string) {
    const doc = current;
    if (!doc || data.length > 32768) return;
    try { if (documentUrl(eventUrl) !== documentUrl(doc.url.href)) return; } catch { return; }
    let value: unknown;
    try { value = JSON.parse(data); } catch { return; }
    if (!record(value) || value.v !== 1 || value.channel !== 'mossvale-native' || value.documentId !== doc.id || typeof value.id !== 'string' || !uuid.test(value.id)) return;
    if (doc.seen.has(value.id)) return;
    doc.seen.add(value.id);
    if (doc.seen.size > 2048 || doc.pending.size >= 8) { send({ id: value.id, error: { code: -32002, message: 'Too many pending requests.' } }, doc); return; }
    const controller = new AbortController(); doc.pending.set(value.id, controller);
    try {
      fields(value, ['v', 'channel', 'documentId', 'id', 'method', 'params']);
      if (typeof value.method !== 'string' || !methods.has(value.method as NativeMethod) || !record(value.params)) throw new NativeError(4200, 'This native action is unavailable in the app.');
      const result = await options.execute({ method: value.method as NativeMethod, params: value.params, signal: controller.signal, url: doc.url });
      requireActive(controller.signal); send({ id: value.id, result }, doc);
    } catch (cause) {
      const error = cause instanceof NativeError ? cause : new NativeError(4000, 'The request could not finish. Please try again.');
      send({ id: value.id, error: { code: error.code, message: error.message } }, doc);
    } finally { doc.pending.delete(value.id); }
  }
  function script() {
    if (!current) return 'true;';
    const settings = json({ documentId: current.id, url: documentUrl(current.url.href), platform: options.platform });
    return `(function(){if(window.top!==window)return;const settings=${settings};const here=new URL(location.href);here.hash='';if(here.href!==settings.url)return;if(window.mossvaleNative&&window.mossvaleNative.documentId===settings.documentId)return;
const pending=new Map(),listeners=new Set();function uuid(){return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));}
function request(method,params={}){if(pending.size>=8)return Promise.reject(Object.assign(Error('A native request is already pending.'),{code:-32002}));const id=uuid();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error(method.startsWith('treasure.')?'Wallet action timed out. Check your payout and wallet activity before retrying.':'The request timed out. Check the store before retrying.'),{code:-32000}));},180000);pending.set(id,{resolve,reject,timer});window.ReactNativeWebView.postMessage(JSON.stringify({v:1,channel:'mossvale-native',documentId:settings.documentId,id,method,params}));});}
window.__mossvaleNativeReceive=function(message){if(message.v!==1||message.channel!=='mossvale-native'||message.documentId!==settings.documentId)return;if(message.event){for(const listener of listeners)listener(message.event);return;}const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);if(message.error)task.reject(Object.assign(Error(message.error.message),{code:message.error.code}));else task.resolve(message.result);};
window.mossvaleNative=Object.freeze({version:1,documentId:settings.documentId,platform:settings.platform,treasureWallet:true,notifications:true,request,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}});
window.dispatchEvent(new Event('mossvale-native-ready'));})();true;`;
  }
  return { navigate, invalidate, receive, script, event: (event: unknown) => send({ event }) };
}
