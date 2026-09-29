import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { GOLD_CARAVAN, GOLD_MERCHANT, GOLD_CARAVAN_COLLIDERS } from '../src/gold-merchant.ts';
import { CITY_RADIUS, CITY_WALL_RADIUS } from '../src/city.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { surfaceAt, groundHeight } from '../src/landscape.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, PLAYER_RADIUS, canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { createOverworld } from '../src/zones.ts';
import { starterGear } from '../src/progression.ts';
import { actorCanStand, actorFloor } from '../src/collision3d.ts';

assert.deepEqual(GOLD_MERCHANT.dialogue,["I'm waiting for a new shipment of MOSS."]);
assert(!VILLAGE_NPCS.some(npc=>npc.id===GOLD_MERCHANT.id),'waiting merchant is not a trading service');
const front={x:GOLD_MERCHANT.x+Math.sin(GOLD_MERCHANT.rotation)*1.2,z:GOLD_MERCHANT.z+Math.cos(GOLD_MERCHANT.rotation)*1.2};
assert(canTraverse(front,GOLD_MERCHANT),'merchant has a clear interaction approach');
const gate={x:0,z:CITY_WALL_RADIUS-3},path=findPath(gate,front,WORLD_COLLIDERS,WORLD_BOUNDS);
assert(path.length,'a walking route leads from the south gate to the merchant');
let previous=gate;for(const point of path){assert(canTraverse(previous,point));assert(!surfaceAt(point.x,point.z).water);previous=point;}
assert(Math.hypot(previous.x-front.x,previous.z-front.z)<.01);
for(const x of [-2,0,2])assert(canTraverse({x,z:75},{x,z:96}),'caravan leaves the south gate road open');
for(const collider of GOLD_CARAVAN_COLLIDERS){assert(WORLD_COLLIDERS.includes(collider));assert(!canTraverse(collider,collider),'carriage and horses block authoritative movement');}
// This corner is physically clear, but remains inside the conservative caravan
// interaction envelope. The older approach overlapped the authored carriage.
const blocked={x:GOLD_MERCHANT.x+.8,z:GOLD_MERCHANT.z-.3};
assert(Math.hypot(blocked.x-GOLD_MERCHANT.x,blocked.z-GOLD_MERCHANT.z)<3&&!canTraverse(blocked,GOLD_MERCHANT),'nearby caravan guard rejects the blocked approach');

const originalLoad=GLTFLoader.prototype.loadAsync,scene=new THREE.Scene();let world,caravan,authoredMerchantPosition;
GLTFLoader.prototype.loadAsync=async function(url){
  assert(typeof url==='string'&&url.startsWith('/models/')&&url.endsWith('.glb')&&!url.includes('..'));
  const bytes=readFileSync(new URL(`../public${url}`,import.meta.url));
  const result=await this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  if(url==='/models/gold-merchant-caravan.glb'){
    caravan=result.scene;caravan.updateMatrixWorld(true);
    const origin=new THREE.Object3D();origin.position.set(GOLD_CARAVAN.x,groundHeight(GOLD_CARAVAN.x,GOLD_CARAVAN.z),GOLD_CARAVAN.z);origin.rotation.y=GOLD_CARAVAN.rotation;origin.updateMatrix();
    authoredMerchantPosition=caravan.getObjectByName('merchant').getWorldPosition(new THREE.Vector3()).applyMatrix4(origin.matrix);
  }
  return result;
};
try{
  world=await createOverworld(scene);scene.updateMatrixWorld(true);
  assert(caravan&&scene.getObjectByName('gold-merchant-caravan'),'actual authored caravan loads into the overworld');
  const merchant=world.villagers.get(GOLD_MERCHANT.id);assert(merchant,'merchant is registered with normal NPC picking and animation');
  assert(merchant.getWorldPosition(new THREE.Vector3()).distanceTo(authoredMerchantPosition)<1e-6,'merchant interaction matches the authored caravan model');
  assert.equal(merchant.rotation.y,GOLD_MERCHANT.rotation);
  assert(!caravan.getObjectByName('merchant'),'standalone NPC replaces the original merchant geometry');
  let merchantBodies=0;scene.traverse(node=>{if(node.name==='merchant-body')merchantBodies++;});assert.equal(merchantBodies,1,'merchant is drawn exactly once');
  const entourage=['guard-captain','guard-crossbow','guard-spear','draft-horse-chestnut','draft-horse-dapple','secured-carriage'];
  for(const name of entourage){const node=caravan.getObjectByName(name);assert(node,`${name} remains in the caravan`);assert(!new THREE.Box3().setFromObject(node).isEmpty());}
  assert(caravan.getObjectByName('drawbars-traces-and-reins'),'horses remain harnessed to the carriage');
  const bounds=new THREE.Box3().setFromObject(caravan);bounds.union(new THREE.Box3().setFromObject(merchant));
  assert(bounds.min.z>CITY_RADIUS&&bounds.max.z<CITY_RADIUS+20,'entire entourage is just outside Greenwood city');
  for(let x=bounds.min.x;x<=bounds.max.x;x+=.5)for(let z=bounds.min.z;z<=bounds.max.z;z+=.5){const surface=surfaceAt(x,z);assert.equal(surface.zone,'greenwood');assert(!surface.water);assert(Math.abs(groundHeight(x,z)-bounds.min.y)<.03,'all parked feet and wheels rest on flat dry ground');}
  for(const [name,collider] of [['secured-carriage',GOLD_CARAVAN_COLLIDERS[0]],['draft-horse-dapple',GOLD_CARAVAN_COLLIDERS[1]],['draft-horse-chestnut',GOLD_CARAVAN_COLLIDERS[2]]]){
    const point=new THREE.Vector3();caravan.getObjectByName(name).traverse(node=>{if(!node.isMesh)return;for(let i=0;i<node.geometry.attributes.position.count;i++){
      point.fromBufferAttribute(node.geometry.attributes.position,i).applyMatrix4(node.matrixWorld);if(point.y>2.3)continue;
      assert(Math.abs(point.x-collider.x)<=collider.halfWidth+PLAYER_RADIUS&&Math.abs(point.z-collider.z)<=collider.halfDepth+PLAYER_RADIUS,`${name} reachable geometry is protected by its player collision envelope`);
    }});
  }
  const resources=new Map();for(const root of [caravan,merchant])root.traverse(node=>{if(node.isMesh)for(const resource of [node.geometry,...(Array.isArray(node.material)?node.material:[node.material])])resources.set(resource,0);});
  for(const resource of resources.keys())resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));
  world.dispose();world.dispose();assert.equal(scene.children.length,0);assert([...resources.values()].every(count=>count===1),'world replacement releases all caravan resources exactly once');
}finally{world?.dispose();GLTFLoader.prototype.loadAsync=originalLoad;}

const dir=mkdtempSync(join(tmpdir(),'mossvale-gold-merchant-')),clients=[];let game;
const hero=(name,point)=>({id:randomUUID(),name,coordinateVersion:2,zone:'greenwood',...point,rotation:0,characterCreated:true,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},...starterGear('Ranger'),
  onboarding:{version:1,looted:true,bagViewed:true,gearViewed:true,completed:true},talents:[],level:1,xp:0,gold:500,hp:100,maxHp:100,
  inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},quest:{chapter:0,stage:0,kills:0,crystals:0,progress:{'grove-slimes':0,'grove-crystals':0},completed:false,ending:null}});
const heroes=[hero('Near caravan',front),hero('Distant caravan',{x:0,z:8}),hero('Blocked caravan',blocked)],tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
async function until(fn,label){const end=Date.now()+6000;while(Date.now()<end){const result=fn();if(result)return result;await delay(15);}throw Error(`Timed out: ${label}`);}
const assets=player=>structuredClone({gold:player.gold,inventory:player.inventory,ownedGear:player.ownedGear,quest:player.quest});
try{
  writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(heroes.map((hero,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[hero]}]))));
  game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});const port=await game.start();
  for(const hero of heroes){
    const floor=actorFloor('overworld',hero.x,hero.z,groundHeight(hero.x,hero.z)+.5);
    assert(actorCanStand('overworld',hero.x,floor,hero.z),`${hero.name} fixture has physical standing room`);
  }
  for(let i=0;i<heroes.length;i++){
    const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,messages:[]};clients.push(client);
    client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(player=>player.id===heroes[i].id);
    socket.on('message',raw=>{const message=JSON.parse(raw);client.messages.push(message);if(message.type==='snapshot')client.snapshot=message;});
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});client.send({type:'join',token:tokens[i],characterId:heroes[i].id});await until(()=>client.player(),'join isolated caravan fixture');
    assert(Math.hypot(client.player().x-heroes[i].x,client.player().z-heroes[i].z)<.01,'fixture preserves the intended legal approach');
  }
  const [near,far,obstructed]=clients,before=assets(near.player());near.send({type:'interact',targetId:GOLD_MERCHANT.id});
  const dialogue=await until(()=>near.messages.find(message=>message.type==='dialogue'),'nearby gold merchant dialogue');
  assert.equal(dialogue.npcId,GOLD_MERCHANT.id);assert.equal(dialogue.title,GOLD_MERCHANT.name);assert.deepEqual(dialogue.lines,["I'm waiting for a new shipment of MOSS."]);assert.equal(dialogue.services,undefined);assert.equal(dialogue.choices,undefined);
  for(const client of [far,obstructed]){const index=client.messages.length;client.send({type:'interact',targetId:GOLD_MERCHANT.id});await until(()=>client.messages.slice(index).some(message=>message.type==='event'&&message.kind==='info'),'far or caravan-guarded interaction rejected');assert(!client.messages.some(message=>message.type==='dialogue'));}
  for(const message of [{type:'npcService',service:'trade'},{type:'npcService',service:'potion'},{type:'buyGear',itemId:'ranger-head'}]){
    await delay(650); // The server throttles rejection notices to one per 600ms.
    const index=near.messages.length;near.send({...message,npcId:GOLD_MERCHANT.id});await until(()=>near.messages.slice(index).some(message=>message.type==='event'&&message.kind==='info'),'forged merchant service rejected');
  }
  await delay(150);assert.deepEqual(assets(near.player()),before,'dialogue and forged services neither grant goods nor advance quests');assert(!near.messages.some(message=>message.type==='villageService'));
  console.log('PASS gold merchant: authored full entourage, one merchant at matching world coordinates, exterior dry placement, open gate route, shared collisions, resource disposal, real nearby dialogue, range/caravan guard rejection and no forged trading.');
}finally{for(const client of clients)client.socket.terminate();await game?.stop();rmSync(dir,{recursive:true,force:true});}
