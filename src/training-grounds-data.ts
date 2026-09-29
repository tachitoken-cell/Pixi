import type { CharacterClass } from './shared.ts';

export const TRAINING_GROUNDS = [
  { className: 'Knight', name: 'Oakshield Yard', trainerId: 'trainer-greenwood-knight-trainer', x: -40, z: -24 },
  { className: 'Ranger', name: 'Fletchers’ Range', trainerId: 'trainer-greenwood-ranger-trainer', x: -40, z: -9 },
  { className: 'Mage', name: 'Moonstone Court', trainerId: 'trainer-greenwood-mage-trainer', x: -8, z: -39.5 },
  { className: 'Cleric', name: 'Dawnleaf Sanctuary', trainerId: 'trainer-greenwood-cleric-trainer', x: -31, z: -38 },
] as const;

const prop = (id: string, kind: string, x: number, z: number, width: number, depth: number, rotation = 0) =>
  ({ id: `training-${id}`, kind, x, z, width, depth, rotation });
/** Individual solids leave the existing streets and each trainer's front approach open. */
export const TRAINING_PROPS = [
  prop('dummy-1', 'dummy', -41.5, -27, 1.6, 1),
  prop('dummy-2', 'dummy', -38.7, -27, 1.6, 1),
  prop('weapon-rack', 'weapon-rack', -41, -19, 2.6, 1),
  prop('knight-banner', 'class-banner-knight', -38.6, -18.5, 1.2, .7),
  prop('bullseye-1', 'archery-target', -41.8, -12.5, 2.5, 1),
  prop('bullseye-2', 'archery-target', -38.7, -12.5, 2.5, 1),
  prop('arrow-rack', 'arrow-rack', -38.5, -14.5, 2.2, 1),
  prop('ranger-banner', 'class-banner-ranger', -42.3, -15.3, 1.2, .7),
  prop('crystal-1', 'arcane-target', -10.3, -42.2, 2, 2),
  prop('crystal-2', 'arcane-target', -5.7, -42.2, 2, 2),
  prop('mage-lectern', 'lectern', -12, -41, 1.3, 1.1),
  prop('mage-banner', 'class-banner-mage', -11.8, -37.5, 1.2, .7),
  prop('shrine-1', 'healing-shrine', -29.2, -41.2, 2.4, 1.4),
  prop('shrine-2', 'healing-shrine', -29.2, -36.5, 2.4, 1.4, Math.PI / 2),
  prop('cleric-lectern', 'lectern', -28.2, -38.8, 1.3, 1.1),
  prop('cleric-banner', 'class-banner-cleric', -28.2, -34.4, 1.2, .7),
];

const practice = (id: string, name: string, className: CharacterClass, x: number, z: number, target: string, phase: number) =>
  ({ id: `training-${id}`, name, title: `${className} apprentice`, className, x, z, targetId: `training-${target}`, phase });
export const TRAINING_PRACTICE = [
  practice('knight-1', 'Rowan Oakshield', 'Knight', -41.5, -25.4, 'dummy-1', 0),
  practice('knight-2', 'Bryn Ironleaf', 'Knight', -38.7, -25.4, 'dummy-2', 1.7),
  practice('ranger-1', 'Wren Fletchwood', 'Ranger', -41.8, -6.5, 'bullseye-1', .7),
  practice('ranger-2', 'Finch Reed', 'Ranger', -38.7, -6.5, 'bullseye-2', 2.8),
  practice('mage-1', 'Lumi Ashbrook', 'Mage', -10.3, -36.7, 'crystal-1', 1.1),
  practice('mage-2', 'Orin Moonwell', 'Mage', -5.7, -36.7, 'crystal-2', 3.2),
  practice('cleric-1', 'Mira Dawnleaf', 'Cleric', -32.5, -36.5, 'shrine-1', 0),
  practice('cleric-2', 'Sol Willowmend', 'Cleric', -32.5, -40, 'shrine-2', 2.5),
];

export const TRAINING_GROUND_COLLIDERS = TRAINING_PROPS.map(p => {
  const turned = Math.abs(Math.sin(p.rotation)) > .5;
  return { x: p.x, z: p.z, r: Math.hypot(p.width, p.depth) / 2,
    halfWidth: (turned ? p.depth : p.width) / 2, halfDepth: (turned ? p.width : p.depth) / 2 };
});
