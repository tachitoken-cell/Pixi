import { AUCTIONEERS, BANKERS } from '../src/city-services.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { WORLD_BOSSES, WORLD_BOSS_GROUP_SIZE, MONSTERS } from '../src/bestiary.ts';
import { OVERWORLD_SPAWNS, toWorld } from '../src/realm.ts';
import { ZONES, getZone } from '../src/content.ts';
import { CITY, CITY_VENDORS, AUCTIONEER, BANKER, insideCity } from '../src/city.ts';
import { EXPEDITIONS, surfaceAt, waterAt } from '../src/landscape.ts';
import { VILLAGES } from '../src/settlements.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { ZEPPELIN_PORTS } from '../src/zeppelin.ts';
import { DUNGEONS, getDungeon, dungeonStages } from '../src/dungeon.ts';
import { regionLevelRange, regionLevelLabel } from '../src/region-levels.ts';
const hooks=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {buildWorldMapScene,disposeGroup}=await import('../src/world-map.ts');hooks.deregister();
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),fields=new Map();
const context={AUCTIONEERS,BANKERS,WORLD_BOSSES,WORLD_BOSS_GROUP_SIZE,MONSTERS,OVERWORLD_SPAWNS,toWorld,ZONES,getZone,CITY,CITY_VENDORS,AUCTIONEER,BANKER,insideCity,EXPEDITIONS,surfaceAt,waterAt,VILLAGES,TRAINER_NPCS,ZEPPELIN_PORTS,DUNGEONS,getDungeon,dungeonStages,regionLevelRange,regionLevelLabel,
  player:{level:1},worldInstance:null,dungeon:null,zoneIcons:{},$:id=>{if(!fields.has(id))fields.set(id,{textContent:''});return fields.get(id);}};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function renderMapDetails('),main.indexOf('function renderAtlas('))),context);
const start=main.indexOf(' const cityDestinations=',main.indexOf('function openMap('));
runInNewContext(stripTypeScriptTypes(main.slice(start,main.indexOf(" $('panel-content').innerHTML=",start)))+';globalThis.places=places;',context);
assert.deepEqual(WORLD_BOSSES.map(boss=>MONSTERS[boss.kind].level),[10,20,30,40]);
for(const boss of WORLD_BOSSES){
  const home=OVERWORLD_SPAWNS.find(spawn=>spawn.id===boss.id),level=MONSTERS[boss.kind].level;
  assert(home?.worldBoss);assert.equal(context.places.filter(place=>place.id===boss.id).length,1);
  assert.equal(context.places.find(place=>place.id===boss.id).label,`${boss.name} · World boss · Lv ${level}`);
  const map=buildWorldMapScene(false,{minX:home.x-40,maxX:home.x+40,minZ:home.z-40,maxZ:home.z+40});
  const pin=map.markers.find(pin=>pin.name===boss.id);
  assert.equal(pin.userData.kind,'world-boss');assert.equal(pin.position.x,home.x);assert.equal(pin.position.z,home.z);
  assert.equal(map.labels.find(label=>label.point.id===boss.id).text,`${boss.name} · Lv ${level}`);disposeGroup(map.group);
  for(const playerLevel of [level-1,level,level+10]){
    context.player.level=playerLevel;context.renderMapDetails({...home,label:boss.name});
    assert.equal(fields.get('atlas-suitability').textContent,`World boss · Lv ${level} · ~${WORLD_BOSS_GROUP_SIZE} players${playerLevel<level?` · Reach level ${level} first`:''}`);
    assert.equal(fields.get('atlas-description').textContent,`${boss.name} · ${boss.description}`);
    for(const attack of boss.attacks)assert(fields.get('atlas-description').textContent.includes(attack.name));
  }
}
assert(main.includes('attack.name||monsterAttackNames[attack.style]'),'cast bars use authoritative attack names');
assert(main.includes('enemy.attack.name||monsterAttackNames[enemy.attack.style]'),'target details use authoritative attack names');
console.log('PASS: all four boss map pins, actual spawn coordinates, level guidance, destinations, named mechanics, and cast-label wiring.');
