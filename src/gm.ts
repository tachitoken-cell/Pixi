import { auctionItemValid, AUCTION_MAX_GOLD } from './auction.ts';
import { bagKindValid } from './bags.ts';
import { MAX_LEVEL } from './progression.ts';
import { MOUNTS } from './travel.ts';

const uuid = (value: unknown) => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(value);
const integer = (value: unknown, max: number) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= max;
const reasonValid = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 160 && value === value.trim() && !/[<>\u0000-\u001f\u007f]/.test(value);
export const GM_MAX_LEVEL = MAX_LEVEL;
export const GM_FLY_SPEED = 18;
export const GM_FLY_MAX_HEIGHT = 80;
/** Only call this on claims returned by jwtVerify, never on a decoded browser token. */
export function verifiedGmRole(payload: { realm_access?: unknown }): 'gm' | 'player' {
  const roles = (payload.realm_access as { roles?: unknown } | undefined)?.roles;
  return Array.isArray(roles) && roles.includes('gm') ? 'gm' : 'player';
}
export function gmActionValid(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.type !== 'gmAction' || !uuid(message.targetId)) return false;
  const fields: Record<string, string[]> = {
    ban: ['reason'], kick: ['reason'], kill: [], levelUp: ['amount'], giveGold: ['amount'], spawnItem: ['item'],
    teleportTo: [], bring: [], return: [], spawnTreasureGoblin: [], startInstantCombat: [], startLootTrace: [], stopLootTrace: [], getLootTrace: [], setInvisible: ['enabled'], setTagHidden: ['enabled'], setFlying: ['enabled'],
  };
  if (typeof message.action !== 'string' || !Object.hasOwn(fields, message.action)
      || Object.keys(message).some(key => !['type', 'action', 'targetId', ...fields[message.action as string]].includes(key))) return false;
  if (['setInvisible', 'setTagHidden', 'setFlying'].includes(message.action as string)) return typeof message.enabled === 'boolean';
  if (message.action === 'ban' || message.action === 'kick') return reasonValid(message.reason);
  if (message.action === 'levelUp' || message.action === 'giveGold') return integer(message.amount, message.action === 'levelUp' ? GM_MAX_LEVEL - 1 : AUCTION_MAX_GOLD);
  if (message.action !== 'spawnItem') return true;
  const item = message.item as { kind?: unknown; id?: unknown; quantity?: unknown } | undefined;
  return auctionItemValid(item) || !!item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 3
    && item.quantity === 1 && (item.kind === 'bag' && bagKindValid(item.id)
      || item.kind === 'mount' && MOUNTS.some(mount => mount.id === item.id && mount.dropOnly));
}
export function gmLevelAward(player: { level: number }, amount: number): number {
  const count = Math.min(amount, Math.max(0, GM_MAX_LEVEL - player.level));
  return count * (2 * player.level + count - 1) * 50;
}
export function accountBanValid(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ban = value as Record<string, unknown>;
  return Object.keys(ban).length === 3 && Number.isSafeInteger(ban.at) && (ban.at as number) > 0 && uuid(ban.by) && reasonValid(ban.reason);
}
