import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { storyQuestById } from '../src/story-quests.ts';
import { STORY_ENEMIES, STORY_OBJECTS, STORY_ENCOUNTERS } from '../src/story-world-data.ts';
import { OVERWORLD_SPAWNS, toWorld } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
import { getDungeon, dungeonLayout } from '../src/dungeon.ts';
import { monsterSpawnLevel } from '../src/bestiary.ts';
import { NPCS as LOCAL_NPCS } from '../src/content.ts';
import { BANKERS, AUCTIONEERS, CITY_SERVICE_NPCS } from '../src/city-services.ts';
import { TRAINER_NPCS } from '../src/training.ts';
const text=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),source=ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true);
let callback;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='storyQuestUI')callback=node.initializer.arguments[0].properties.find(property=>property.name?.getText(source)==='findNpc').initializer;ts.forEachChild(node,visit);}visit(source);assert(callback,'actual main tracking callback found');
const script=ts.transpileModule('globalThis.track = '+callback.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture(id,patch={}){
 const quest=storyQuestById(id),waypoints=[],messages=[],targets=[...LOCAL_NPCS.map(npc=>toWorld(npc.zone,npc)),...TRAINER_NPCS,...CITY_SERVICE_NPCS];
 const ctx={player:{zone:quest?.zone??'greenwood',storyQuests:{active:quest?{[id]:quest.objectives.map(()=>0)}:{},completed:[]}},position:{x:0,z:0},worldInstance:null,worldZone:quest?.zone??'greenwood',dungeon:null,storyEncounter:null,enemies:[],nodes:[],STORY_ENEMIES,STORY_OBJECTS,STORY_ENCOUNTERS,OVERWORLD_SPAWNS,WORLD_GATHERING_NODES,storyQuestById,getDungeon,surfaceAt,monsterSpawnLevel,toWorld,
  NPCS:LOCAL_NPCS.map(npc=>toWorld(npc.zone,npc)),BANKERS,AUCTIONEERS,CITY_SERVICE_NPCS,TRAINER_NPCS,
  trackedStoryQuestId:'',updateHUD:()=>{},targetPoints:()=>targets,closePanel:()=>{},setWaypoint:point=>waypoints.push(point),toast:message=>messages.push(message),...patch};
 runInNewContext(script,ctx);return {ctx,waypoints,messages,targets,track:()=>ctx.track(id)};
}
{
 const f=fixture('story-briar-in-the-meadow'),spawn=STORY_ENEMIES.find(enemy=>enemy.kind==='briar-sentinel');
 f.ctx.enemies=[{...spawn,alive:true,instanceId:null},{...OVERWORLD_SPAWNS.find(enemy=>enemy.kind==='briar-sentinel'),alive:true,instanceId:null}];f.track();assert.equal(f.waypoints.at(-1).id,spawn.id,'regional kill tracks the authored public target');
 f.ctx.enemies=[];f.track();assert(STORY_ENEMIES.some(enemy=>enemy.id===f.waypoints.at(-1).id),'absent/defeated live enemies fall back to actual eligible spawn homes');
}
{
 const f=fixture('story-runes-in-the-ash'),spawn=OVERWORLD_SPAWNS.find(enemy=>enemy.zone==='amberwild'&&surfaceAt(enemy.x,enemy.z).regionId==='emberfall');
 f.ctx.enemies=[{...spawn,alive:true,instanceId:null}];f.track();assert.equal(f.waypoints.at(-1)?.id,spawn.id,'wildcard regional hunts can track actual matching creatures');
}
{
 const f=fixture('story-the-fen-garden'),site=WORLD_GATHERING_NODES.find(node=>node.kind==='herb'&&surfaceAt(node.x,node.z).regionId==='greenwood');
 const dangerous=WORLD_GATHERING_NODES.find(node=>node.kind==='herb'&&node.siteId==='slimefen-garden');Object.assign(f.ctx.position,dangerous);
 f.ctx.nodes=[{...dangerous,available:true},{...site,available:true}];f.track();assert.equal(f.waypoints.at(-1).id,site.id,'nearby Slimefen herbs cannot redirect the level5 garden lesson');
 f.ctx.nodes=[];f.track();assert.equal(f.waypoints.at(-1).id,site.id,'unavailable herbs still track the safe southern city garden');
}
{
 const f=fixture('story-glacial-supper'),safe=WORLD_GATHERING_NODES.find(node=>node.id==='fishing-frostmarch-11'),dangerous=WORLD_GATHERING_NODES.find(node=>node.id==='fishing-frostmarch-9');
 Object.assign(f.ctx.position,dangerous);f.ctx.nodes=[{...dangerous,available:true},{...safe,available:true}];f.track();assert.equal(f.waypoints.at(-1)?.id,safe.id,'fishing tracking uses the sheltered scoped node even beside a higher-level Winterspire shoal');
 f.ctx.nodes=[];f.track();assert.equal(f.waypoints.at(-1)?.id,safe.id,'unavailable fishing node keeps its safe destination');
}
{
 const f=fixture('story-temple-keys'),keepers=STORY_ENEMIES.filter(enemy=>enemy.id.startsWith('story-temple-keeper-'));
 f.ctx.enemies=keepers.map(enemy=>({...enemy,alive:true}));Object.assign(f.ctx.position,keepers[2]);f.track();assert.equal(f.waypoints.at(-1).id,keepers[0].id,'first distinct key does not track a nearer wrong keeper');
 f.ctx.player.storyQuests.active['story-temple-keys']=[1,0,0];f.track();assert.equal(f.waypoints.at(-1).id,keepers[1].id,'finished keeper advances tracking to next distinct key');
}
{
 const f=fixture('story-the-bell-that-rings-alone');f.ctx.player.storyQuests.active['story-the-bell-that-rings-alone']=[1,0,0];f.track();assert.equal(f.waypoints.at(-1).id,'story-jungle-bell-2','ordered objectives track the next eligible bell');
}
{
 const id='story-the-paymaster-s-ledger',f=fixture(id);f.track();assert.equal(f.waypoints.at(-1).label,getDungeon('emberfall').name,'overworld ledger tracking leads to Foundry entrance');
 const cache=dungeonLayout('emberfall').objects.find(object=>object.id==='crossing-east-branch-cache');assert(cache,'tracked optional cache actually exists');
 f.ctx.worldInstance='dungeon:test';f.ctx.dungeon={kind:'emberfall',objects:[cache]};f.track();assert.equal(f.waypoints.at(-1).id,cache.id,'inside Foundry tracks actual optional ledger cache');
 f.ctx.dungeon={kind:'rootvault',objects:[]};const before=f.waypoints.length;f.track();assert.equal(f.waypoints.length,before,'wrong instance cannot receive an overworld waypoint');assert(f.messages.length);
}
{
 const id='story-the-wounded-caravan',f=fixture(id);f.ctx.player.storyQuests.active[id]=[1,0];const origin=STORY_OBJECTS.find(object=>object.id==='story-caravan-survivors');
 const current={...origin,x:origin.x+7,z:origin.z+4};f.targets.push(current);f.track();assert.equal(f.waypoints.at(-1).x,current.x,'rescue tracking uses current traveler position');
 f.targets.length=0;f.ctx.storyEncounter={id:'story-escort-caravan',objectId:origin.id,x:origin.x+9,z:origin.z+6,hp:100,phase:'moving',wave:2,waves:2};f.track();assert.equal(f.waypoints.at(-1).x,f.ctx.storyEncounter.x,'snapshot fallback keeps tracking a moving traveler before renderer catches up');
}
{
 const f=fixture('story-welcome-to-lanternreach');f.ctx.player.storyQuests.active['story-welcome-to-lanternreach']=[1,0,0,0];f.track();const banker=BANKERS.find(npc=>npc.zone==='greenwood');assert.equal(f.waypoints.at(-1)?.x,banker.x,'generic banker objective resolves current region service');
 f.ctx.player.storyQuests.active['story-welcome-to-lanternreach']=[1,1,0,0];f.track();assert.equal(f.waypoints.at(-1)?.x,AUCTIONEERS.find(npc=>npc.zone==='greenwood').x,'generic auctioneer objective resolves service');
 f.ctx.player.storyQuests.active['story-welcome-to-lanternreach']=[1,1,1,0];f.ctx.player.appearance={className:'Mage'};f.track();assert.equal(f.waypoints.at(-1)?.id,TRAINER_NPCS.find(npc=>npc.zone==='greenwood'&&npc.className==='Mage').id,'class trainer objective resolves actual player class');
}
console.log('PASS: actual main quest tracking resolves region/site/wildcard/spawn identity, live and unavailable targets, ordered objectives, dungeon ledger cache, moving rescue snapshot and local service roles.');
