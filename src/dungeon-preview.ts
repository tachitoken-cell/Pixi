import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDungeonWorld } from './zones';
import { DUNGEONS, getDungeon, dungeonLayout, dungeonStages, crossedDungeonPortal, dungeonReturn, dungeonBounds, dungeonCheckpoint, dungeonPreparation, inDungeonPreparation, DUNGEON_START, dungeonRoomPortalOpen } from './dungeon';
import { animateCharacter, animateEnemy, loadCharacterAssets, setMonsterAssets, makeCharacter, makeEnemy } from './characters';
import { setThemedMonsterAssets, setDungeonBossAssets } from './monster-models';
import { dungeonBossVisual } from './dungeon-boss-models';
import { DEFAULT_APPEARANCE } from './appearance';
import { createDayNightCycle } from './day-night';
import { canTraverse } from './realm';
import { dungeonHazardPattern, dungeonDeathHazardPattern, dungeonHazardContains, dungeonHazardAttack } from './dungeon-mechanics';
import { createMonsterEffects } from './monster-effects';
import { DEATH_ANIMATION_MS, type DungeonHazard, type DungeonState, type Enemy } from './shared';
import { createDungeonApproaches } from './dungeon-portals';
import { DUNGEON_TEMPLE_ROUTE } from './dungeon-approach-layout';
import { groundHeight, surfaceAt, WATER_LEVEL, TERRAIN_STEP } from './landscape';
import { WORLD_BOUNDS, WORLD_COLLIDERS, WORLD_SCENERY } from './realm';

// A local Vite entry point: geometry, assets, lights and collision use the game modules.
const canvas = document.querySelector<HTMLCanvasElement>('#preview')!;
const select = document.querySelector<HTMLSelectElement>('#room')!;
const status = document.querySelector<HTMLElement>('#status')!;
const params=new URLSearchParams(location.search),definition=getDungeon(params.get('dungeon'))??DUNGEONS[0],entranceView=params.get('view')==='entrance';
const stages=dungeonStages(definition.id), layout=dungeonLayout(definition.id), bounds=dungeonBounds(definition.id), returnPoint=dungeonReturn(definition.id), preparation=dungeonPreparation(definition.id);
const dungeonSelect=document.querySelector<HTMLSelectElement>('#dungeon')!;
dungeonSelect.replaceChildren(...DUNGEONS.map(entry=>new Option(`${entry.name} · Levels ${entry.minLevel}–${entry.maxLevel}`,entry.id)));dungeonSelect.value=definition.id;
dungeonSelect.onchange=()=>{params.set('dungeon',dungeonSelect.value);location.search=params.toString();};
document.querySelector('h1')!.textContent=definition.name;
document.querySelector('#identity')!.textContent=definition.description;
document.querySelector<HTMLButtonElement>('#view')!.textContent=entranceView?'Explore interior':'Inspect entrance';
document.querySelector<HTMLButtonElement>('#view')!.onclick=()=>{params.set('view',entranceView?'interior':'entrance');location.search=params.toString();};
const clearButton = document.querySelector<HTMLButtonElement>('#clear')!;
const sealsButton = document.querySelector<HTMLButtonElement>('#seals')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .1, 500);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.17;
const hemisphere = new THREE.HemisphereLight('#ecf0d0', '#6d8264', 1.8); scene.add(hemisphere);
const sun = new THREE.DirectionalLight('#fff0d2', 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 100 });
sun.shadow.bias = -.0003; sun.shadow.normalBias = .035; scene.add(sun);
const dayNight = createDayNightCycle(scene, hemisphere, sun);
const controls = new OrbitControls(camera, canvas); controls.enablePan = false;
controls.minDistance = 4; controls.maxDistance = 40; controls.minPolarAngle = .3; controls.maxPolarAngle = Math.PI / 2 - .05;
const cleared = new Set<string>(), activated = new Set<string>();
const keys = new Set<string>(), position = new THREE.Vector3(DUNGEON_START.x, 0, DUNGEON_START.z);
let state: DungeonState;

try {
  if(entranceView){
    const root=new THREE.Group();scene.add(root);const approaches=await createDungeonApproaches(root);
    const at=definition.entrance,y=groundHeight(at.x,at.z);
    const palette = { greenwood: [0x73a14f,0x79a957,0x6c9a49], amberwild: [0x999649,0xa39e51,0x8f8e45], frostmarch: [0xd1e0e4,0xdde9ea,0xc3d7dd], hollow: [0x564562,0x604d6b,0x4c3e58], sunveil: [0xcfa667,0xd9b16f,0xc49a5e], mistwood: [0x416f42,0x497c49,0x38653e] };
    const terrain = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:1}),44*44), pose=new THREE.Object3D(),color=new THREE.Color();
    terrain.name='Preview: actual biome terrain';terrain.receiveShadow=true;
    const left=Math.floor((at.x-88)/TERRAIN_STEP)*TERRAIN_STEP,front=Math.floor((at.z-68)/TERRAIN_STEP)*TERRAIN_STEP;
    let cell=0;
    for(let ix=0;ix<44;ix++)for(let iz=0;iz<44;iz++){
      const x=left+(ix+.5)*TERRAIN_STEP,z=front+(iz+.5)*TERRAIN_STEP,surface=surfaceAt(x,z),index=Math.abs(Math.round(x/4)*13+Math.round(z/4)*7)%3;
      const top=surface.water?WATER_LEVEL:surface.height,tint=surface.water?0x265881:surface.beach?surface.zone==='frostmarch'?0xb3c2bd:surface.zone==='hollow'?0xa3929f:0xd0bd88:palette[surface.zone][index];
      pose.position.set(x,(top-3)/2,z);pose.scale.set(TERRAIN_STEP,top+3,TERRAIN_STEP);pose.updateMatrix();terrain.setMatrixAt(cell,pose.matrix);terrain.setColorAt(cell++,color.setHex(tint));
    }
    terrain.computeBoundingSphere();scene.add(terrain);
    const trees=(await new GLTFLoader().loadAsync('/models/giant-trees.glb')).scene;
    const forest=new THREE.Group();forest.name='Preview: actual nearby scenery';scene.add(forest);
    for(const solid of WORLD_SCENERY){
      if(Math.hypot(solid.x-at.x,solid.z-at.z)>76)continue;
      if(solid.kind==='tree'){
        const template=trees.getObjectByName(solid.treeModel??(solid.zone==='frostmarch'?'WoodlandPine':'WoodlandOak'));if(!template)continue;
        const tree=template.clone(true);tree.position.set(solid.x,groundHeight(solid.x,solid.z),solid.z);tree.scale.setScalar(solid.scale);tree.rotation.y=(solid.x*.7+solid.z*.3)%(Math.PI*2);
        tree.traverse(part=>{if(part instanceof THREE.Mesh){part.material=(part.material as THREE.Material).clone();(part.material as THREE.MeshStandardMaterial).color.setHex(solid.zone==='frostmarch'?0xa1c7cb:solid.zone==='amberwild'?0xf2bd68:solid.zone==='hollow'?0xaa92c9:0xffffff);part.castShadow=part.receiveShadow=true;}});forest.add(tree);
      }else if(solid.kind==='rock'){
        const rock=new THREE.Mesh(new THREE.BoxGeometry(1.1,.64,1),new THREE.MeshStandardMaterial({color:solid.zone==='frostmarch'?0x809caa:solid.zone==='amberwild'?0x89745a:0x746178,roughness:1}));
        rock.position.set(solid.x,groundHeight(solid.x,solid.z)+.32*solid.scale,solid.z);rock.scale.setScalar(solid.scale);rock.castShadow=rock.receiveShadow=true;forest.add(rock);
      }
    }
    await loadCharacterAssets();const avatar=makeCharacter(DEFAULT_APPEARANCE);scene.add(avatar);avatar.rotation.y=Math.PI;
    const start=DUNGEON_TEMPLE_ROUTE[0];position.set(at.x+start.x,groundHeight(at.x+start.x,at.z+start.z),at.z+start.z);avatar.position.copy(position);controls.target.set(at.x,y+4,at.z+30);camera.position.set(at.x+55,y+53,at.z+112);camera.far=260;camera.updateProjectionMatrix();controls.enablePan=true;controls.maxDistance=150;
    Object.assign(sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,far:180});sun.shadow.camera.updateProjectionMatrix();
    sun.position.set(at.x+20,y+65,at.z+45);sun.target.position.set(at.x,y,at.z+30);scene.add(sun.target);scene.background=new THREE.Color(definition.id==='frosthollow'?'#9dafc4':definition.id==='cindercrypt'?'#b2b090':'#71647f');scene.fog=new THREE.Fog(scene.background,150,240);
    document.querySelector<HTMLElement>('#demo-controls')!.hidden=true;document.querySelector<HTMLElement>('#encounters')!.hidden=true;document.querySelector<HTMLElement>('#room-controls')!.hidden=true;
    status.textContent=`Level ${definition.minLevel} entrance · Explore the courtyards and broken side passages to reach the inner portal.`;
    document.querySelector('#loading')!.remove();document.body.dataset.ready='true';
    const desiredCamera=new THREE.Vector3();
    let last=performance.now(),walkingView=false;renderer.setAnimationLoop(now=>{const dt=Math.min(.05,(now-last)/1000);last=now;const move=new THREE.Vector3(Number(keys.has('d'))-Number(keys.has('a')),0,Number(keys.has('s'))-Number(keys.has('w')));
      if(move.lengthSq()){move.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP,controls.getAzimuthalAngle()).multiplyScalar(dt*7);const next=position.clone().add(move);if(canTraverse(position,next,WORLD_COLLIDERS,WORLD_BOUNDS)){if(crossedDungeonPortal(position,next,definition.entrance)){params.set('view','interior');location.search=params.toString();renderer.setAnimationLoop(null);return;}position.copy(next);position.y=groundHeight(position.x,position.z);
        const target=position.clone();target.y+=1.4;
        if(!walkingView){const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(23);camera.position.copy(target).add(offset);walkingView=true;}
        else camera.position.add(target.clone().sub(controls.target));
        controls.target.copy(target);
      }avatar.rotation.y=Math.atan2(move.x,move.z);}
      avatar.position.copy(position);animateCharacter(avatar,now/1000,move.lengthSq()>0);approaches.update(now/1000,position);controls.update();desiredCamera.copy(camera.position);if(walkingView)approaches.constrainCamera(controls.target,camera.position);renderer.render(scene,camera);camera.position.copy(desiredCamera);});
    Object.assign(window,{dungeonPreview:{scene,camera,controls,position,definition,approaches,get rendererInfo(){return renderer.info.render;}}});
  }else{
  const [world] = await Promise.all([createDungeonWorld(scene,definition.id), loadCharacterAssets(), new GLTFLoader().loadAsync('/models/monster-kit.glb').then(({scene,animations})=>setMonsterAssets(scene,animations)), new GLTFLoader().loadAsync('/models/themed-monsters.glb').then(({scene,animations})=>setThemedMonsterAssets(scene,animations)), new GLTFLoader().loadAsync('/models/legacy-dungeon-bosses.glb').then(({scene,animations})=>setDungeonBossAssets(scene,animations))]);
  renderer.clippingPlanes = world.dungeonRoomClipping ?? [];
  const monsterEffects = createMonsterEffects(scene,()=>0,enemy=>enemies.find(view=>view.id===enemy.id)?.height);
  const avatar = makeCharacter(DEFAULT_APPEARANCE); avatar.name = 'Local preview adventurer'; scene.add(avatar);
  const enemies = stages.flatMap(stage => stage.enemies.map((enemy,index) => {
    const visual = dungeonBossVisual(definition.id,stage.id,index), mesh = makeEnemy(visual?.model??enemy.kind); mesh.position.set(enemy.x, 0, enemy.z); scene.add(mesh);
    return { id: `${stage.id}-${index}`, stageId: stage.id, mesh, kind: enemy.kind, ...visual, height: visual?new THREE.Box3().setFromObject(mesh).max.y:undefined, dungeonBoss: enemy.boss===true||stage.id==='throne'&&index===0, spawn:{x:enemy.x,z:enemy.z} };
  }));
  const overviewButton=document.querySelector<HTMLButtonElement>('#overview')!, mechanicButton=document.querySelector<HTMLButtonElement>('#mechanic')!, mechanicNote=document.querySelector<HTMLElement>('#mechanic-note')!;
  let overview=false, abilitySequence=0, wasPreparing=false;
  const portalLabels = layout.portals.map(portal => {
    const el = document.createElement('button'); el.className = 'room-portal-label'; el.dataset.portal = portal.id;
    el.onclick = () => usePortal(portal.id); document.body.append(el); return { portal, el };
  });
  const demonstrations: {hazard:DungeonHazard;source:typeof enemies[number];leap?:boolean;corpse?:boolean;resolved?:boolean}[]=[];
  select.replaceChildren(...(preparation ? [new Option('Arrival sanctuary', 'preparation')] : []), ...stages.map(stage => new Option(stage.name + (stage.optional ? ' (side room)' : ''), stage.id)));
  const ready = (id: string) => {
    const stage = stages.find(stage => stage.id === id);
    return !!stage && stage.requires.every(id => cleared.has(id)) && (id !== 'confluence' || layout.objects.filter(object => object.kind === 'seal').every(object => activated.has(object.id)));
  };
  function syncState() {
    const stage = stages.find(stage => stage.id === select.value), preparing = inDungeonPreparation(position,definition.id); wasPreparing = preparing;
    state = { id: 'local-preview', kind: definition.id, name: definition.name, room: Math.min(stages.length, cleared.size + 1), rooms: stages.length,
      completed: stages.every(stage => cleared.has(stage.id)), wipes: 0, encounterName: stage?.name ?? select.selectedOptions[0].text,
      objectives: [], clearedStages: [...cleared], hazards: demonstrations.map(item=>item.hazard), checkpoint: { ...dungeonCheckpoint(definition.id), active: activated.has('sanctuary') },
      objects: layout.objects.map(({ stageId, ...object }) => ({ ...object, available: cleared.has(stageId) && !activated.has(object.id), activated: activated.has(object.id) })) };
    world.setDungeonRoom?.(overview ? null : select.value); world.setDungeonState?.(state, Date.now());
    for (const enemy of enemies) enemy.mesh.visible = (overview || enemy.stageId === select.value) && !cleared.has(enemy.stageId) && ready(enemy.stageId);
    clearButton.disabled = preparing || !stage || cleared.has(stage.id) || !ready(stage.id);
    mechanicButton.disabled=preparing||overview||!stage||cleared.has(stage.id)||!ready(stage.id)||demonstrations.length>0;
    sealsButton.disabled = !state.objects.some(object => object.kind === 'seal' && object.available);
    status.textContent = preparing ? 'Arrival sanctuary · Prepare here, then use the room teleport.' : !stage ? 'Choose a room teleport.' : cleared.has(stage.id) ? 'Encounter cleared. Room portals can now open.' : ready(stage.id) ? `${stage.enemies.length} monsters remain. All exits are sealed until this room is cleared.` : 'Teleport sealed. Clear earlier encounters and activate the two rune seals.';
    const exits = layout.portals.filter(portal => portal.roomId === select.value);
    document.querySelector<HTMLElement>('#gates')!.textContent = `${exits.length} room ${exits.length === 1 ? 'exit' : 'exits'} · ${exits.filter(portal => !dungeonRoomPortalOpen(portal, cleared, activated)).length} sealed · ${cleared.size}/${stages.length} encounters cleared`;
    for (const { portal, el } of portalLabels) {
      const open = dungeonRoomPortalOpen(portal, cleared, activated);
      el.textContent = open ? `E · ${portal.label}` : `Sealed · ${portal.seals?.length ? 'Activate both seals' : 'Defeat enemies to unlock'}`;
      el.disabled = !open; el.title = portal.label;
    }
  }
  function inspect(id: string, arrival?: { x: number; z: number }) {
    const room = layout.rooms.find(room => room.id === id); if (!room) throw new Error(`Unknown preview room: ${id}`);
    const stage = stages.find(stage => stage.id === id);
    overview=false;overviewButton.textContent='Layout overview';controls.maxDistance=64;demonstrations.length=0;monsterEffects.clear();mechanicNote.textContent='';
    for(const enemy of enemies){enemy.mesh.position.set(enemy.spawn.x,0,enemy.spawn.z);enemy.mesh.rotation.z=0;}
    select.value = id; position.set(arrival?.x ?? (id==='preparation'?DUNGEON_START.x:stage?.x??room.x), 0, arrival?.z ?? (id==='preparation'?DUNGEON_START.z:(stage?.z??room.z)+.5));
    avatar.position.copy(position); avatar.rotation.y = Math.PI;
    controls.target.copy(position).y += 1.2;
    camera.position.copy(controls.target).add(id==='preparation' ? new THREE.Vector3(3,26,15) : new THREE.Vector3(0, .74, .68).multiplyScalar(Math.max(30, room.width * .95)));
    controls.update(); syncState();
  }
  function usePortal(id?: string) {
    const portal = id ? layout.portals.find(portal => portal.id === id) : layout.portals.find(portal => Math.hypot(portal.x-position.x,portal.z-position.z)<=3);
    if (!portal || Math.hypot(portal.x-position.x,portal.z-position.z)>3) { mechanicNote.textContent = 'Walk onto a blue teleport, then press E.'; return false; }
    if (!dungeonRoomPortalOpen(portal,cleared,activated)) { mechanicNote.textContent = 'Sealed. Clear the defending enemies and required rune seals first.'; return false; }
    if (!canTraverse(position,portal,world.colliders,bounds)) return false;
    keys.clear(); inspect(portal.targetRoomId,portal.destination); canvas.focus(); return true;
  }
  window.addEventListener('keydown', event => { if (event.target === canvas && event.key.toLowerCase() === 'e') { event.preventDefault(); usePortal(); } });
  function clearEncounter() { if (!clearButton.disabled) { demonstrations.length=0;mechanicNote.textContent='';cleared.add(select.value); syncState(); } }
  function activateSeals() { for (const object of state.objects) if (object.kind === 'seal' && object.available) activated.add(object.id); syncState(); }
  function reset() { cleared.clear(); activated.clear(); inspect(preparation?'preparation':stages[0].id); }
  function selfCheck() {
    reset(); inspect(stages[0].id);
    if (enemies.filter(enemy => enemy.stageId === stages[0].id && enemy.mesh.visible).length !== stages[0].enemies.length) throw new Error('Initial encounter did not spawn');
    clearEncounter();
    if (enemies.some(enemy => enemy.stageId === stages[0].id && enemy.mesh.visible)) throw new Error('Cleared encounter retained visible monsters');
    if (enemies.some(enemy => enemy.mesh.visible)) throw new Error('A different room leaked into the cleared chamber');
    const next = stages.find(stage => stage.id !== stages[0].id && ready(stage.id));
    if (!next) throw new Error('Next encounter did not unlock');
    inspect(next.id);
    if (!enemies.some(enemy => enemy.stageId === next.id && enemy.mesh.visible)) throw new Error('Next room did not reveal its monsters');
    if (enemies.some(enemy => enemy.stageId !== next.id && enemy.mesh.visible)) throw new Error('A remote room retained visible monsters');
    reset(); return 'PASS: current room, encounter clear, destination reveal and reset';
  }
  select.onchange = () => inspect(select.value); clearButton.onclick = clearEncounter; sealsButton.onclick = activateSeals;
  document.querySelector<HTMLButtonElement>('#reset')!.onclick = reset;
  function fitOverview() {
    controls.target.set((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);
    const direction=new THREE.Vector3(.14,1,.66).normalize(),right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
    const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;
    let distance=40;
    for(const x of [bounds.minX,bounds.maxX])for(const z of [bounds.minZ,bounds.maxZ])for(const y of [0,8]){
      const corner=new THREE.Vector3(x,y,z).sub(controls.target),depth=corner.dot(direction);
      distance=Math.max(distance,depth+Math.abs(corner.dot(right))/tanX,depth+Math.abs(corner.dot(up))/tanY);
    }
    controls.maxDistance=distance*1.6;camera.far=distance*3;camera.updateProjectionMatrix();camera.position.copy(controls.target).addScaledVector(direction,distance*1.12);controls.update();
  }
  window.addEventListener('resize',()=>{if(overview){camera.aspect=innerWidth/innerHeight;fitOverview();}});
  overviewButton.onclick=()=>{
    if(overview){inspect(select.value);return;}
    overview=true;overviewButton.textContent='Return to room';fitOverview();syncState();
  };
  mechanicButton.onclick=()=>{
    if(mechanicButton.disabled)return;
    const source=enemies.find(enemy=>enemy.stageId===select.value&&definition.id==='frosthollow'&&enemy.kind==='frost-yeti')??enemies.find(enemy=>enemy.stageId===select.value&&(dungeonHazardPattern(definition.id,{...enemy,...enemy.mesh.position},position,abilitySequence)||dungeonDeathHazardPattern(definition.id,{...enemy,...enemy.mesh.position})));
    if(!source)return;
    const point={kind:source.kind,x:source.mesh.position.x,z:source.mesh.position.z,dungeonBoss:source.dungeonBoss};
    const death=dungeonDeathHazardPattern(definition.id,point),pattern=death??dungeonHazardPattern(definition.id,point,position,abilitySequence++);if(!pattern)return;
    const now=Date.now();
    for(const [i,spec] of pattern.hazards.filter(spec=>!inDungeonPreparation(spec,definition.id)&&canTraverse(source.mesh.position,spec,world.colliders,bounds)).entries()) demonstrations.push({source,corpse:!!death,leap:spec.leap,hazard:{leap:spec.leap,id:`demo-${now}-${i}`,x:spec.x,z:spec.z,r:spec.r,innerR:spec.innerR,kind:spec.kind,label:spec.label,startedAt:now,endsAt:now+spec.delayMs,damage:0}});
    if(!demonstrations.length){mechanicNote.textContent='Stone cover blocks this ability.';return;}
    mechanicNote.textContent=`${pattern.hazards[0].label} · WASD to dodge`;
    syncState();canvas.focus();
  };

  Object.assign(window, { dungeonPreview: { inspect, clearEncounter, activateSeals, usePortal, reset, selfCheck, fitOverview, scene, camera, controls, world, position, bounds, layout, stages, definition,
    get state() { return state; }, get rendererInfo() { return renderer.info.render; } } });
  selfCheck();
  const requestedRoom = params.get('room');
  if (requestedRoom && [...select.options].some(option => option.value === requestedRoom)) inspect(requestedRoom);
  document.querySelector('#loading')!.remove(); document.body.dataset.ready = 'true';
  let last = performance.now();
  const movement = new THREE.Vector3(), previous = new THREE.Vector3(), desiredCamera = new THREE.Vector3();
  renderer.setAnimationLoop(now => {
    if (document.hidden || now - last < 1000 / 30) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    previous.copy(position); movement.set(Number(keys.has('d')) - Number(keys.has('a')), 0, Number(keys.has('s')) - Number(keys.has('w')));
    if (!overview && movement.lengthSq()) {
      movement.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, controls.getAzimuthalAngle()).multiplyScalar(dt * 7);
      const next = position.clone().add(movement);
      if (canTraverse(position, next, world.colliders, bounds)) {
        if(state.completed&&crossedDungeonPortal(position,next,returnPoint)){params.set('view','entrance');location.search=params.toString();renderer.setAnimationLoop(null);return;}
        position.copy(next);
      }
      avatar.rotation.y = Math.atan2(movement.x, movement.z);
    }
    if(wasPreparing!==inDungeonPreparation(position,definition.id))syncState();
    const clock=Date.now();
    for(const demo of demonstrations)if(!demo.resolved&&clock>=demo.hazard.endsAt){
      demo.resolved=true;const clearPath=canTraverse(demo.source.mesh.position,demo.hazard,world.colliders,bounds);
      const hit=!inDungeonPreparation(position,definition.id)&&clearPath&&dungeonHazardContains(demo.hazard,position)&&canTraverse(demo.hazard,position,world.colliders,bounds);
      mechanicNote.textContent=hit?`Hit by ${demo.hazard.label}. Try again and move out of the marked area.`:`Dodged ${demo.hazard.label}.`;
      if(demo.leap&&clearPath)demo.source.mesh.position.set(demo.hazard.x,0,demo.hazard.z);
    }
    if(demonstrations.length&&demonstrations.every(demo=>clock>demo.hazard.endsAt+500)){demonstrations.length=0;syncState();}
    avatar.position.copy(position); if(!overview){controls.target.add(position.clone().sub(previous)); camera.position.add(position.clone().sub(previous));}
    animateCharacter(avatar, now / 1000, !position.equals(previous));
    for (const enemy of enemies) if (enemy.mesh.visible) {
      const demo=demonstrations.find(demo=>demo.source===enemy&&clock<demo.hazard.endsAt+450), attack=demo?dungeonHazardAttack(demo.hazard,{x:enemy.mesh.position.x,z:enemy.mesh.position.z,rotation:enemy.mesh.rotation.y}):undefined;
      if(demo&&demo.leap&&!demo.resolved)enemy.mesh.rotation.y=Math.atan2(demo.hazard.x-enemy.mesh.position.x,demo.hazard.z-enemy.mesh.position.z);
      animateEnemy(enemy.mesh, now / 1000, false,attack&&!demo?.corpse?{style:demo?.leap?'leap':attack.style,progress:(clock-attack.startedAt)/(attack.endsAt-attack.startedAt),impactProgress:(attack.impactAt-attack.startedAt)/(attack.endsAt-attack.startedAt)}:undefined,demo?.corpse?Math.min(1,(clock-demo.hazard.startedAt)/DEATH_ANIMATION_MS):undefined);
    }
    monsterEffects.update(demonstrations.filter(demo=>overview||demo.source.stageId===select.value).map(demo=>({id:demo.source.id,kind:demo.source.kind,model:demo.source.model,alive:true,x:demo.source.mesh.position.x,z:demo.source.mesh.position.z,instanceId:'local-preview',worldBoss:demo.source.dungeonBoss,attack:dungeonHazardAttack(demo.hazard,{x:demo.source.mesh.position.x,z:demo.source.mesh.position.z,rotation:demo.source.mesh.rotation.y})} as Enemy)),clock);
    controls.update(); desiredCamera.copy(camera.position); if(!overview)world.constrainCamera?.(controls.target, camera.position);
    dayNight.update(Date.now(), 'hollow', true, position, camera); if(overview)scene.fog=null; world.update(now / 1000, position, camera, 1);
    for (const { portal, el } of portalLabels) {
      const screen = new THREE.Vector3(portal.x, 3.1, portal.z).project(camera);
      el.hidden = overview || portal.roomId !== select.value || screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1;
      if (!el.hidden) { el.style.left = `clamp(100px, ${(screen.x*.5+.5)*innerWidth}px, calc(100vw - 100px))`; el.style.top = `${(-screen.y*.5+.5)*innerHeight}px`; }
    }
    renderer.render(scene, camera); camera.position.copy(desiredCamera);
  });
  }
} catch (error) {
  status.textContent = error instanceof Error ? error.message : 'Dungeon preview failed to load.';
  document.querySelector<HTMLElement>('#loading')!.textContent = 'Preview failed. See error above.'; console.error(error);
}
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.addEventListener('keydown', event => { if (event.target === canvas && ['w', 'a', 's', 'd'].includes(event.key.toLowerCase())) { keys.add(event.key.toLowerCase()); event.preventDefault(); } });
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase())); window.addEventListener('blur', () => keys.clear());
