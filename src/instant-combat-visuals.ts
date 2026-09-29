import type { Enemy } from './shared';
import type { EnemyAttackPose } from './monster-models';
import { INSTANT_COMBAT, INSTANT_COMBAT_CREATURES, type InstantCombatState } from './instant-combat.ts';
import { INSTANT_COMBAT_SKILLS } from './instant-combat-skills.ts';

export const INSTANT_COMBAT_BOSS_CLIPS: Record<string, readonly string[]> = Object.fromEntries(
 Object.values(INSTANT_COMBAT_CREATURES).flatMap(map=>map.bosses.map(boss=>[boss.model,[...INSTANT_COMBAT_SKILLS[boss.model].map(skill=>`skill-${skill.id}`),boss.mechanic]])),
);
const attackClips: Record<string,string> = {'Rending Cleave':'cleave','Ruin Cross':'cross','Hollow Nova':'ring','Falling Ruin':'barrage','Umbral Charge':'charge'};

/** Cosmetic only. Real attacks contact at their server impact; shield channels stop with the mechanic. */
export function instantCombatCastCue(state:InstantCombatState|null|undefined,enemy:Enemy,now:number):EnemyAttackPose|undefined {
 const run=state?.run,clips=enemy.model&&INSTANT_COMBAT_BOSS_CLIPS[enemy.model];
 const ranged=enemy.attack;
 if(run?.phase==='fighting'&&enemy.alive&&ranged?.rangedAuto&&ranged.launchAt!==undefined&&ranged.startedAt<=now&&ranged.endsAt>now)
  return {basic:true,style:'spit',progress:(now-ranged.startedAt)/(ranged.endsAt-ranged.startedAt),impactProgress:(ranged.launchAt-ranged.startedAt)/(ranged.endsAt-ranged.startedAt)};
 if(!run||run.phase!=='fighting'||!enemy.alive||run.boss?.id!==enemy.id||!clips||!Number.isFinite(now))return;
 const attack=enemy.attack;
 if(attack&&!attack.basic&&attack.startedAt<=now&&attack.endsAt>now&&attack.impactAt>attack.startedAt){
  const skill=INSTANT_COMBAT_SKILLS[enemy.model!]?.find(skill=>attack.name===skill.name);
  if(skill)return {clip:`skill-${skill.id}`,style:attack.style,progress:Math.min(1,(now-attack.startedAt)/skill.castMs),impactProgress:.5,authoredTime:true};
  const clip=attackClips[attack.name?.split(' · ')[0]??'']??run.mechanic?.kind;
  if(clip&&clips.includes(clip))return {clip,style:attack.style,progress:(now-attack.startedAt)/(attack.endsAt-attack.startedAt),impactProgress:(attack.impactAt-attack.startedAt)/(attack.endsAt-attack.startedAt)};
 }
 if(run.boss.shielded&&run.mechanic&&run.boss.endsAt>now&&clips.includes(run.mechanic.kind)){
  const startedAt=run.boss.endsAt-INSTANT_COMBAT.mechanicMs;
  if(now<startedAt)return;
  return {clip:run.mechanic.kind,style:'pulse',progress:Math.min(.4,(now-startedAt)/2000),impactProgress:.5};
 }
}
