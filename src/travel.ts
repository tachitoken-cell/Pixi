import { SWIM_SPEED } from './landscape.ts';
import type { EnemyKind } from './bestiary.ts';

export const VERDANT_REVENANT_DROP = { mount: 'verdant-revenant', dungeon: 'veilhaven', boss: 'veiled-abbess', stageId: 'throne', oneIn: 10_000 } as const;

export const MOUNTS = [
  { id: 'horse', name: 'Briar Horse', description: 'A sure-footed woodland horse trained for the roads of Mossvale.', icon: '/ui/mount-horse.png', quality: 'epic', storeOnly: false, dropOnly: false, nftAssetId: null, source: null, dropChance: 0, dungeonDrop: null },
  { id: 'wolf', name: 'Moonfang Wolf', description: 'A silver-maned riding wolf with a steady stride and a watchful gaze.', icon: '/ui/mount-wolf.png', quality: 'epic', storeOnly: false, dropOnly: false, nftAssetId: null, source: null, dropChance: 0, dungeonDrop: null },
  { id: 'verdant-revenant', name: 'Verdant Revenant', description: 'A jade spirit dragon with flowing antlers and a spectral green mane. Its hovering stride follows ordinary riding rules and does not grant flight.', icon: '/ui/mount-verdant-revenant.png', quality: 'epic', storeOnly: false, dropOnly: true, nftAssetId: 1, source: VERDANT_REVENANT_DROP.boss, dropChance: 1 / VERDANT_REVENANT_DROP.oneIn, dungeonDrop: VERDANT_REVENANT_DROP },
  { id: 'store-embermane', name: 'Embermane', description: 'A flame-crowned steed in ember-forged armor.', icon: '/ui/mount-store-embermane.png', quality: 'epic', storeOnly: true, dropOnly: false, nftAssetId: 2, source: null, dropChance: 0, dungeonDrop: null },
  { id: 'store-cinderfang', name: 'Cinderfang', description: 'An ember wolf with a blazing mane and smoldering armored flanks.', icon: '/ui/mount-store-cinderfang.png', quality: 'epic', storeOnly: true, dropOnly: false, nftAssetId: 3, source: null, dropChance: 0, dungeonDrop: null },
  { id: 'wayfarer-stag', name: 'Wayfarer Stag', description: 'A noble woodland stag with branching antlers, traveling gear and two saddles. Earned through 25 qualified referrals, shared across your account and never traded.', icon: '/ui/mount-wayfarer-stag.png', quality: 'epic', storeOnly: false, dropOnly: false, nftAssetId: null, source: null, dropChance: 0, dungeonDrop: null, referralOnly: true, seats: 2 },
] as const satisfies readonly { id: string; name: string; referralOnly?: boolean; seats?: number; description: string; icon: string; quality: 'epic'; storeOnly: boolean; dropOnly: boolean; nftAssetId: number | null; source: EnemyKind | null; dropChance: number; dungeonDrop: { dungeon: string; boss: EnemyKind; stageId: string; oneIn: number } | null }[];
export type MountId = typeof MOUNTS[number]['id'];
export function rollDungeonMount(dungeon: string | undefined, enemy: { kind: string; stageId?: string; dungeonBoss?: boolean }, _owned: readonly MountId[], randomInt: (max: number) => number): MountId | null {
  for (const mount of MOUNTS) {
    const drop = mount.dungeonDrop;
    if (drop && dungeon === drop.dungeon && enemy.kind === drop.boss && enemy.dungeonBoss === true && enemy.stageId === drop.stageId
      && randomInt(drop.oneIn) === 0) return mount.id;
  }
  return null;
}
export interface TravelState { mount: MountId | null; stamina: number; sprinting: boolean; exhausted: boolean; driverId?: string; passengerId?: string }

export const MOUNT_UNLOCK_LEVEL = 25;
export const MOUNT_UPGRADE_LEVEL = 50;
export const MOUNT_CAST_MS = 2000;
export const WALK_SPEED = 5.8;
export const SPRINT_SPEED = 8.2;
export const SWIM_SPRINT_SPEED = SWIM_SPEED * SPRINT_SPEED / WALK_SPEED;
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 12.5;
export const STAMINA_RECOVERY = 18;
export const EXHAUSTION_RECOVERY = 25;
export function mountSpeed(level: number, ridingRank?: 0 | 1 | 2): number {
  const rank = ridingRank === undefined ? level >= MOUNT_UPGRADE_LEVEL ? 2 : level >= MOUNT_UNLOCK_LEVEL ? 1 : 0 : ridingRank;
  return level < MOUNT_UNLOCK_LEVEL || ![1, 2].includes(rank) ? 0 : level >= MOUNT_UPGRADE_LEVEL && rank === 2 ? 14 : 10;
}
export const canSprint = (travel?: TravelState) => !travel?.mount && !travel?.exhausted && (travel?.stamina ?? STAMINA_MAX) > 0;
export const newTravel = (): TravelState => ({ mount: null, stamina: STAMINA_MAX, sprinting: false, exhausted: false });
