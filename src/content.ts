export type ZoneId = 'greenwood' | 'amberwild' | 'frostmarch' | 'hollow' | 'sunveil' | 'mistwood';
import type { EnemyKind } from './bestiary.ts';
import { CITY_CLOCKTOWER } from './city.ts';
export type { EnemyKind } from './bestiary.ts';
export type NodeKind = 'crystal' | 'ember-shard' | 'star-fragment' | 'heartroot' | 'timber' | 'herb'
  | 'copper-vein' | 'silver-birch' | 'moonpetal' | 'cobalt-vein' | 'ironwood' | 'frostbloom'
  | 'sunstone-vein' | 'elderwood' | 'sunblossom'
  | 'brook-shoal' | 'silver-shoal' | 'glacial-shoal' | 'moonfin-shoal';
export type Ending = 'rekindle' | 'release';
export interface QuestState {
  chapter: number;
  stage: 0 | 1 | 2 | 3;
  kills: number;
  crystals: number;
  progress: Record<string, number>;
  completed: boolean;
  ending: Ending | null;
}
export interface NPC { id: string; name: string; title: string; zone: ZoneId; x: number; z: number; dialogue: string[] }
export interface Gateway { id: string; zone: ZoneId; x: number; z: number; destination: ZoneId; unlockChapter: number; label: string }
export interface Beacon { id: string; name: string; zone: ZoneId; x: number; z: number; litChapter: number }
export interface Zone {
  id: ZoneId; name: string; subtitle: string; description: string;
  sky: string; fog: string; ground: string; accent: string;
  spawn: { x: number; z: number }; unlockChapter: number;
  npc: NPC; beacon?: Beacon; gateways: Gateway[]; enemyKind: EnemyKind; nodeKind: NodeKind;
  enemies: { id: string; kind: EnemyKind; x: number; z: number }[];
  nodes: { id: string; kind: NodeKind; x: number; z: number }[];
}
export interface Objective { id: string; kind: 'kill' | 'gather' | 'interact'; target: string; label: string; count: number }
export interface Chapter {
  id: number; title: string; zone: ZoneId; npcId: string; summary: string;
  objectives: Objective[];
  dialogue: { intro: string[]; progress: string[]; complete: string[] };
  reward: { xp: number; gold: number; potions?: number };
}

export const NPCS: NPC[] = [
  { id: 'rowan', name: 'Rowan', title: 'Keeper of the village lantern', zone: 'greenwood', x: CITY_CLOCKTOWER.x, z: CITY_CLOCKTOWER.z - 4, dialogue: ['Every lantern in Mossvale answers another. Lately, the lights beyond our forest have stopped answering.', 'If you ever lose your way, follow the road home. There will be a place for you by this flame.'] },
  { id: 'sable', name: 'Sable', title: 'Cartographer of the forgotten roads', zone: 'amberwild', x: 0, z: 0, dialogue: ['Maps remember the paths that people stop walking. This one keeps drawing a road through the heart of the world.', 'The sentinels once tended these gardens. Something beneath their roots is calling them to war.'] },
  { id: 'iona', name: 'Iona', title: 'Astronomer of the last observatory', zone: 'frostmarch', x: 0, z: 0, dialogue: ['The stars have not gone out. Their reflections have been stolen from our lanterns.', 'When you listen long enough, even the ice has a story to tell.'] },
  { id: 'eris', name: 'Eris', title: 'Echo of the first keeper', zone: 'hollow', x: 0, z: 0, dialogue: ['I once thought keeping everyone safe meant never letting anything change.', 'The roots are holding my promise together. I need you to discover whether that promise is still worth keeping.'] },
  { id: 'samira', name: 'Samira', title: 'Warden of the Sunveil caravans', zone: 'sunveil', x: 0, z: 0, dialogue: ['Welcome to Sunveil. Our sandstone walls shelter the caravans from the dunes. The work beyond them is suited to adventurers of level 30 and above.', 'Visit the noticeboard for patrols and supply expeditions. Follow the glass dunes east to find the routes toward Mistwood.'] },
  { id: 'talan', name: 'Talan', title: 'Keeper of the emerald canopy', zone: 'mistwood', x: 0, z: 0, dialogue: ['The jungle remembers every footstep. Beyond our lanterns, the canopy shelters dangers for adventurers from level 45 to 60.', 'Begin in Canopy Reach, then follow the wardens toward the ancient trees. Their contracts will prepare you for the deepest wilds.'] },
];

export const BEACONS: Beacon[] = [
  { id: 'amber-beacon', name: 'Amber Beacon', zone: 'amberwild', x: 0, z: -12, litChapter: 4 },
  { id: 'frost-beacon', name: 'Frost Beacon', zone: 'frostmarch', x: 0, z: -12, litChapter: 7 },
];

export const GATEWAYS: Gateway[] = [
  { id: 'greenwood-north', zone: 'greenwood', x: 0, z: -28, destination: 'amberwild', unlockChapter: 1, label: 'The Amber Road' },
  { id: 'amberwild-south', zone: 'amberwild', x: 0, z: 28, destination: 'greenwood', unlockChapter: 0, label: 'Road to Greenwood' },
  { id: 'amberwild-north', zone: 'amberwild', x: 0, z: -28, destination: 'frostmarch', unlockChapter: 4, label: 'The Starlit Pass' },
  { id: 'frostmarch-south', zone: 'frostmarch', x: 0, z: 28, destination: 'amberwild', unlockChapter: 1, label: 'Road to Amberwild' },
  { id: 'frostmarch-north', zone: 'frostmarch', x: 0, z: -28, destination: 'hollow', unlockChapter: 7, label: 'The Root Stair' },
  { id: 'hollow-south', zone: 'hollow', x: 0, z: 28, destination: 'frostmarch', unlockChapter: 4, label: 'Stair to Frostmarch' },
];

const enemyStarts = [[10, 1], [15, -5], [8, -10], [18, 7]];
const nodeStarts = [[-9, -4], [-13, 3], [11, -12]];
const zoneDefinitions = [
  { id: 'greenwood', name: 'Greenwood', subtitle: 'Where every journey takes root', description: 'Lanternreach’s bustling city, wandering woodland, and the first unanswered lantern.', sky: '#cce4dd', fog: '#c4dacf', ground: '#719561', accent: '#d8c27d', spawn: { x: 0, z: 8 }, unlockChapter: 0, enemyKind: 'moss-slime', nodeKind: 'crystal' },
  { id: 'amberwild', name: 'Amberwild', subtitle: 'The gardens that remember the fire', description: 'Autumn orchards grow through a fallen city. Its ancient sentinels guard a beacon buried in leaves.', sky: '#e9c5a0', fog: '#d9b394', ground: '#a8844c', accent: '#f5a94e', spawn: { x: 0, z: 22 }, unlockChapter: 1, enemyKind: 'briar-sentinel', nodeKind: 'ember-shard' },
  { id: 'frostmarch', name: 'Frostmarch', subtitle: 'Under a sky of borrowed stars', description: 'A snowbound observatory shelters the last astronomer and a truth the keepers chose to forget.', sky: '#aabfd8', fog: '#b9cede', ground: '#c9d8dc', accent: '#83d9ee', spawn: { x: 0, z: 22 }, unlockChapter: 4, enemyKind: 'ice-wisp', nodeKind: 'star-fragment' },
  { id: 'hollow', name: 'The Hollow', subtitle: 'A promise beneath the roots', description: 'Luminous roots descend into a violet cavern where a sleeping keeper has become the prison she built.', sky: '#241c3c', fog: '#3b2b50', ground: '#554462', accent: '#ce99ee', spawn: { x: 0, z: 22 }, unlockChapter: 7, enemyKind: 'root-warden', nodeKind: 'heartroot' },
  { id: 'sunveil', name: 'Sunveil Desert', subtitle: 'Caravans beneath a copper sun', description: 'Wind-carved sandstone, golden dunes and palm-lined oases shelter the caravan towns of the western frontier.', sky: '#e8ceb0', fog: '#d6b184', ground: '#c7a16a', accent: '#f2cd72', spawn: { x: 0, z: 22 }, unlockChapter: 0, enemyKind: 'dune-scorpion', nodeKind: 'ember-shard' },
  { id: 'mistwood', name: 'Mistwood Jungle', subtitle: 'The emerald frontier', description: 'Layered broadleaf canopies rise above low river valleys, carved timber towns and ancient ruins veiled in green mist.', sky: '#9cc7bb', fog: '#6b9f87', ground: '#426f41', accent: '#a2e09a', spawn: { x: 0, z: 22 }, unlockChapter: 0, enemyKind: 'marsh-toad', nodeKind: 'heartroot' },
] as const;

export const ZONES: Zone[] = zoneDefinitions.map(zone => ({
  ...zone,
  npc: NPCS.find(npc => npc.zone === zone.id)!,
  beacon: BEACONS.find(beacon => beacon.zone === zone.id),
  gateways: GATEWAYS.filter(gateway => gateway.zone === zone.id),
  enemies: (zone.id === 'hollow' ? [[0, -12]] : zone.id === 'greenwood' ? [[-90,5],[-94,15],[-96,26],[-96,35]] : enemyStarts).map(([x, z], index) => ({ id: zone.id === 'greenwood' ? `slime-${index}` : `${zone.enemyKind}-${index}`, kind: zone.enemyKind, x, z })),
  nodes: [
    ...(zone.id === 'greenwood' ? [[-90,10],[-96,20],[-98,32]] : nodeStarts).map(([x, z], index) => ({ id: zone.id === 'greenwood' ? `crystal-${index}` : `${zone.id === 'sunveil' || zone.id === 'mistwood' ? `${zone.id}-` : ''}${zone.nodeKind}-${index}`, kind: zone.nodeKind, x, z })),
    ...(zone.id === 'greenwood' ? [[-38,88],[-28,90]] : [[-8, 10], [-13, 16]]).map(([x, z], index) => ({ id: `timber-${zone.id}-${index}`, kind: 'timber' as const, x, z })),
    ...(zone.id === 'greenwood' ? [[-18,90],[-11,94]] : [[7, 11], [4, 19]]).map(([x, z], index) => ({ id: `herb-${zone.id}-${index}`, kind: 'herb' as const, x, z })),
  ],
}));

export const CHAPTERS: Chapter[] = [
  {
    id: 0, title: 'A Light in the Leaves', zone: 'greenwood', npcId: 'rowan', summary: 'Help Rowan steady Greenwood’s lantern, and discover why the distant beacons have fallen silent.',
    objectives: [
      { id: 'grove-slimes', kind: 'kill', target: 'moss-slime', label: 'Defeat woodland slimes', count: 3 },
      { id: 'grove-crystals', kind: 'gather', target: 'crystal', label: 'Gather grove crystals', count: 3 },
    ],
    dialogue: {
      intro: ['You arrived just as our lantern began to fade. Beyond Greenwood, the Amber and Frost Beacons have gone dark.', 'Before we can follow their roads, help me protect the village: quiet three woodland slimes and gather three grove crystals. A small kindness is still a kind of light.'],
      progress: ['The crystals will steady our lantern. The slimes have been drawn here by its failing warmth. Help the grove, then come back to me.'],
      complete: ['There. Can you hear it? Our lantern is singing again — but there is no answer from the north.', 'Take the Amber Road through the northern gate. My friend Sable maps the ruined gardens of Amberwild. Tell her the lanterns have started dreaming.'],
    }, reward: { xp: 100, gold: 60, potions: 2 },
  },
  {
    id: 1, title: 'The Cartographer’s Fire', zone: 'amberwild', npcId: 'sable', summary: 'Follow the Amber Road and find Sable among the autumn ruins.',
    objectives: [{ id: 'meet-sable', kind: 'interact', target: 'sable', label: 'Speak with Sable in Amberwild', count: 1 }],
    dialogue: {
      intro: ['Rowan’s letter spoke of quiet roads. It did not mention a traveler brave enough to reopen them.', 'Look at this map. Every broken road bends toward the Hollow, though no cartographer remembers drawing it.'],
      progress: ['Find Sable beside Amberwild’s ruined plaza. She knows the way to its beacon.'],
      complete: ['The Amber Beacon remembers every person who ever warmed their hands beside it. Something has torn those memories into shards.', 'Recover three ember shards and quiet three briar sentinels. They are guarding a city that no longer exists. We can give them something better to protect.'],
    }, reward: { xp: 20, gold: 10 },
  },
  {
    id: 2, title: 'What the Fire Remembers', zone: 'amberwild', npcId: 'sable', summary: 'Recover the city’s scattered memories and free its sentinels from their endless watch.',
    objectives: [
      { id: 'briar-watch', kind: 'kill', target: 'briar-sentinel', label: 'Defeat briar sentinels', count: 3 },
      { id: 'ember-memory', kind: 'gather', target: 'ember-shard', label: 'Recover ember shards', count: 3 },
    ],
    dialogue: {
      intro: ['An ember holds more than heat. These contain market songs, autumn suppers, and the names carved into an old school bench.', 'Bring them back with care. A ruined city deserves to be remembered as more than the day it fell.'],
      progress: ['Three ember shards, and three sentinels released from their watch. The beacon will know when the city is ready.'],
      complete: ['One of the shards carries a woman’s voice: “Let me hold the dark. Let them keep the morning.” Her name was Eris, the first keeper.', 'The Amber Beacon stands north of this plaza. Carry these memories to its empty bowl, and let the city answer Rowan.'],
    }, reward: { xp: 80, gold: 50, potions: 1 },
  },
  {
    id: 3, title: 'A City Answers', zone: 'amberwild', npcId: 'amber-beacon', summary: 'Ignite the Amber Beacon and open the starlit pass into Frostmarch.',
    objectives: [{ id: 'light-amber', kind: 'interact', target: 'amber-beacon', label: 'Ignite the Amber Beacon', count: 1 }],
    dialogue: {
      intro: ['Within the cold stone bowl, the ember shards turn like a constellation waiting for its sky.'],
      progress: ['The Amber Beacon waits north of Sable’s plaza.'],
      complete: ['Amber light spills across the ruins. For a heartbeat, the empty windows are filled with people coming home.', 'A thread of fire climbs the northern pass. In it you hear Eris whisper: “I thought a promise could last forever.” Find Iona at the observatory in Frostmarch.'],
    }, reward: { xp: 60, gold: 30 },
  },
  {
    id: 4, title: 'The Astronomer’s Silence', zone: 'frostmarch', npcId: 'iona', summary: 'Reach the snowbound observatory and ask Iona what became of the first keeper.',
    objectives: [{ id: 'meet-iona', kind: 'interact', target: 'iona', label: 'Meet Iona in Frostmarch', count: 1 }],
    dialogue: {
      intro: ['I saw Amberwild wake from the observatory. I had almost forgotten what hope looks like through a telescope.', 'Eris did not defeat the darkness. She bound it to herself beneath the world, and the lanterns shared the weight. When we forgot her, she was left carrying it alone.'],
      progress: ['Iona keeps watch beside the observatory plaza.'],
      complete: ['The Frost Beacon can show us what happened, but its stars have scattered across the snow.', 'Recover three star fragments and still three ice wisps. They are echoes of a warning we should have listened to long ago.'],
    }, reward: { xp: 25, gold: 15 },
  },
  {
    id: 5, title: 'Stars Beneath the Snow', zone: 'frostmarch', npcId: 'iona', summary: 'Gather the observatory’s fallen stars and recover the keeper’s missing testimony.',
    objectives: [
      { id: 'still-wisps', kind: 'kill', target: 'ice-wisp', label: 'Still ice wisps', count: 3 },
      { id: 'fallen-stars', kind: 'gather', target: 'star-fragment', label: 'Recover star fragments', count: 3 },
    ],
    dialogue: {
      intro: ['These fragments remember the sky on the night Eris descended. Put them together, and we may finally hear her whole promise.'],
      progress: ['The wisps gather near the eastern ice. Star fragments glow where the old observatory paths cross the snow.'],
      complete: ['Here is the part our histories left out: “Hold the lanterns together. No one should have to be the light alone.”', 'Go to the Frost Beacon north of the plaza. It will open the Root Stair — and show you the cost of our silence.'],
    }, reward: { xp: 120, gold: 70, potions: 2 },
  },
  {
    id: 6, title: 'The Promise We Forgot', zone: 'frostmarch', npcId: 'frost-beacon', summary: 'Awaken the Frost Beacon and witness Eris’s sacrifice.',
    objectives: [{ id: 'light-frost', kind: 'interact', target: 'frost-beacon', label: 'Ignite the Frost Beacon', count: 1 }],
    dialogue: {
      intro: ['The star fragments rise above the basin, their light catching in a thousand frozen tears.'],
      progress: ['The Frost Beacon stands north of the observatory plaza.'],
      complete: ['You see Eris step beneath the roots, trusting the people above to keep the lanterns burning. Seasons pass. Her name becomes a story, then a footnote, then silence.', 'Her fear has become the Rootbound Warden. Descend through the northern Root Stair, defeat it, and cleanse three heartroots. Eris is waiting for someone to finish listening.'],
    }, reward: { xp: 75, gold: 40 },
  },
  {
    id: 7, title: 'The Heart That Held the Dark', zone: 'hollow', npcId: 'eris', summary: 'Break the Rootbound Warden’s hold and free the heartroots from Eris’s centuries of fear.',
    objectives: [
      { id: 'break-warden', kind: 'kill', target: 'root-warden', label: 'Defeat the Rootbound Warden', count: 1 },
      { id: 'cleanse-roots', kind: 'gather', target: 'heartroot', label: 'Cleanse heartroots', count: 3 },
    ],
    dialogue: {
      intro: ['I remember your footsteps from a dream. Have you come to replace me?', 'No. Please, let the answer be no. The Warden is everything I was afraid to let go. Break its hold, cleanse the three heartroots, and come back to me.'],
      progress: ['The Warden waits in the northern root chamber. The heartroots carry its fear through this place. Quiet them all, and I can finally stand.'],
      complete: ['For the first time in centuries, the roots loosen. Eris looks less like a legend than someone who has been awake far too long.', 'Take my lantern home to Rowan. You can rekindle the network, with its burden shared by every village. Or release its borrowed light, and teach us to meet the night together. I will trust your choice.'],
    }, reward: { xp: 180, gold: 100, potions: 2 },
  },
  {
    id: 8, title: 'The Lanterns Between', zone: 'greenwood', npcId: 'rowan', summary: 'Bring Eris’s lantern home, and choose how Mossvale will greet its next morning.',
    objectives: [{ id: 'bring-light-home', kind: 'interact', target: 'rowan', label: 'Return to Rowan and choose the lantern’s future', count: 1 }],
    dialogue: {
      intro: ['You have brought back more than a flame. Sable’s roads are open. Iona can see the stars. Eris can finally leave the dark.', 'We can rekindle the lanterns, promising that every village will share their keeping. Or release the old magic, trusting one another to build a world that no longer needs a keeper beneath its roots.', 'Neither road erases what came before. Which future shall we begin?'],
      progress: ['Return through Frostmarch and Amberwild to Rowan in Greenwood. The last choice belongs at home.'],
      complete: ['The village gathers around the lantern. This time, everyone knows the keeper’s name.'],
    }, reward: { xp: 250, gold: 180, potions: 3 },
  },
];

export const ENDINGS: Record<Ending, { label: string; title: string; epilogue: string[] }> = {
  rekindle: {
    label: 'Rekindle — share the light', title: 'Keeper of the Shared Flame',
    epilogue: ['You set Eris’s lantern beside Rowan’s. Across the world, Amber and Frost answer, and hundreds of ordinary windows begin to glow.', 'Sable draws a map of the new lantern roads. Iona records a constellation named for the first keeper. Eris watches her first sunrise without carrying it on her shoulders.', 'Every village takes its turn tending the network. No one is asked to become the light alone. And when travelers speak of you, they call you the Keeper of the Shared Flame.'],
  },
  release: {
    label: 'Release — welcome the dawn', title: 'Friend of the First Dawn',
    epilogue: ['You open Eris’s lantern and let its light rise into the morning. Across the world, the ancient beacons dim softly, like people finally allowed to rest.', 'Sable’s roads fill with lanterns made by human hands. Iona teaches children to navigate by real stars. Eris plants a small garden where the first beacon once stood.', 'The nights are darker now, but no one faces them alone. The world begins keeping its own promises. And when travelers speak of you, they call you the Friend of the First Dawn.'],
  },
};

export const getZone = (id: ZoneId) => ZONES.find(zone => zone.id === id)!;
export const getChapter = (quest: QuestState) => CHAPTERS[quest.chapter];
