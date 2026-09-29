import type { Player } from './shared';

export interface TitleDefinition { id: string; name: string; description: string; achievementId?: string }
export const TITLES: TitleDefinition[] = [
  { id: 'death-defier', name: 'Death Defier', description: 'Defeat the Horned Apostle with a level-60 raid.' },
  { id: 'pons-lover', name: 'Pons Lover', description: 'Pay MEADGod 100,000 gold in Willowbrook.' },
  { id: 'burned', name: 'Burned', description: 'Retired store title. Existing owners can still equip it.' },
  { id: 'beta-tester', name: 'Beta Tester', description: 'Joined Mossvale before 13 September 2026, Stockholm time.' },
  { id: 'adventurer', name: 'Adventurer', description: 'Earn Growing Roots by reaching level 5.', achievementId: 'growing-roots' },
  { id: 'veteran', name: 'Veteran', description: 'Earn Road Veteran by reaching level 25.', achievementId: 'road-veteran' },
  { id: 'living-legend', name: 'Living Legend', description: 'Reach character level 60.', achievementId: 'living-legend' },
  { id: 'trail-warden', name: 'Trail Warden', description: 'Defeat 25 monsters.', achievementId: 'trail-warden' },
  { id: 'giant-slayer', name: 'Giant Slayer', description: 'Help defeat a world boss.', achievementId: 'giant-slayer' },
  { id: 'lantern-bearer', name: 'Lantern Bearer', description: 'Complete four campaign chapters.', achievementId: 'lantern-bearer' },
  { id: 'mossvale-hero', name: 'Hero of Mossvale', description: 'Complete the campaign.', achievementId: 'mossvale-hero' },
  { id: 'explorer', name: 'Explorer', description: 'Earn Far Horizons by visiting all six regions.', achievementId: 'far-horizons' },
  { id: 'artisan', name: 'Artisan', description: 'Earn Workshop Regular by crafting 25 recipes.', achievementId: 'workshop-regular' },
  { id: 'rootvault-conqueror', name: 'Rootvault Conqueror', description: 'Clear the Rootvault dungeon.', achievementId: 'rootvault-conqueror' },
];
export const getTitle = (id: unknown): TitleDefinition | undefined => TITLES.find(title => title.id === id);
/** betaTester is an account entitlement projected by the realm, never a character save flag. */
export function titleUnlocked(player: Pick<Player, 'achievements' | 'betaTester' | 'storePurchases' | 'meadGodPaid' | 'raidProgress'>, title: TitleDefinition | undefined): boolean {
  return !!title && (title.id === 'death-defier' ? (player.raidProgress?.clears||0)>0 : title.id === 'pons-lover' ? player.meadGodPaid === true : title.id === 'burned' ? player.storePurchases?.includes('burned') === true : title.id === 'beta-tester' ? player.betaTester === true : !!title.achievementId && player.achievements?.unlocked[title.achievementId] !== undefined);
}
export function playerTitle(player: Pick<Player, 'title' | 'achievements' | 'betaTester' | 'storePurchases' | 'meadGodPaid' | 'raidProgress'>): string | null {
  const title = getTitle(player.title);
  return titleUnlocked(player, title) ? title!.name : null;
}
