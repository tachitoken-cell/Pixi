import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { graphics } from './graphics-settings.ts';
import { SPELL_VISUALS, SPELL_CHOREOGRAPHY_SOURCES, type SpellMotif } from './spell-visuals.ts';
import { SPELLS, SPELL_EFFECT_IDS, type AbilityId, type SpellArtId } from './spells.ts';
import type { SpellArt } from './spell-choreography.ts';
import { drawMageSpell } from './spell-art-mage.ts';
import { drawRangerSpell } from './spell-art-ranger.ts';
import { drawKnightSpell } from './spell-art-knight.ts';
import { drawClericSpell } from './spell-art-cleric.ts';

const motifs: SpellMotif[] = ['flame', 'shard', 'spark', 'rune', 'leaf', 'feather', 'shield', 'slash', 'ring', 'arrow'];
type EffectMotif = SpellMotif | 'stroke' | 'radiance' | 'mist' | `fx_${AbilityId}` | `fx_${AbilityId}__${string}`;
const geometries = new Map<EffectMotif, THREE.BufferGeometry>();
const CAPACITY = 256, TOTAL_BUDGET = 1536;
export const SPELL_MODEL_SOURCES: Partial<Record<SpellArtId, SpellArtId>> = { ...SPELL_CHOREOGRAPHY_SOURCES, [SPELL_EFFECT_IDS.revivify]:'guardian-of-the-dawn', [SPELL_EFFECT_IDS.roll]:'survival-instinct', [SPELL_EFFECT_IDS.blink]:'blinkward', [SPELL_EFFECT_IDS.lightspeed]:'light-of-dawn', 'edict-of-the-dawn':'prayer-of-mending', 'titans-edict':'divine-aegis', 'eternal-edict':'sanctuary', 'tame-beast':'heart-of-the-wild', 'combined-assault':'razor-flurry' };
export const SPELL_REDESIGN_MODELS = {
  [SPELL_EFFECT_IDS.roll]: 'Spell_roll', [SPELL_EFFECT_IDS.blink]: 'Spell_blink', [SPELL_EFFECT_IDS.lightspeed]: 'Spell_lighspeed',
  'poison-cloud': 'Spell_poison_cloud', 'edict-of-the-dawn': 'Spell_edict_of_the_dawn', 'titans-edict': 'Spell_titans_edict', 'eternal-edict': 'Spell_eternal_edict',
} as const;
const modelParts = new Map<AbilityId, { motif: EffectMotif; role: string }[]>();

/** Keep the authored kit shared across scene/realm changes; instances own only their GPU buffers. */
export function setSpellEffectAssets(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const prepared = new Map<EffectMotif, THREE.BufferGeometry>();
  for (const motif of motifs) {
    const source = root.getObjectByName(`spell_${motif}`);
    if (!(source instanceof THREE.Mesh)) throw new Error(`Missing spell mesh: ${motif}`);
    const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
    geometry.computeBoundingBox();
    if (!geometry.getAttribute('position').count || !geometry.boundingBox || !Number.isFinite(geometry.boundingBox.max.length())) throw new Error(`Invalid spell mesh: ${motif}`);
    prepared.set(motif, geometry);
  }
  // Continuous strokes keep authored outlines readable; the star mesh tapers to hairline tips.
  prepared.set('stroke', new THREE.CylinderGeometry(.5,.5,1,5).rotateX(Math.PI/2));
  prepared.set('radiance',new THREE.PlaneGeometry(1,1));
  for (const [motif, geometry] of prepared) { geometries.get(motif)?.dispose(); geometries.set(motif, geometry); }
}

/** Detailed centerpieces are authored as separate solid meshes in Blender. */
export function setSpellModelAssets(root:THREE.Object3D) {
  root.updateMatrixWorld(true);
  for(const id of Object.keys(SPELLS) as AbilityId[]) {
    const name=`fx_${id}` as const, source=root.getObjectByName(`fx_${SPELL_MODEL_SOURCES[id] || id}`);
    if(!(source instanceof THREE.Mesh))continue;
    const geometry=source.geometry.clone().applyMatrix4(source.matrixWorld);geometry.computeBoundingBox();
    geometry.userData.grounded=!!geometry.boundingBox&&geometry.boundingBox.min.y>=-.02;
    geometries.get(name)?.dispose();geometries.set(name,geometry);
  }
}
/** Preserve Blender's separate moving pieces while sharing their geometry across every cast. */
export function setSpellRedesignAssets(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  for (const [id, name] of Object.entries(SPELL_REDESIGN_MODELS) as [AbilityId, string][]) {
    const source = root.getObjectByName(name), parts: { motif: EffectMotif; role: string }[] = [];
    if (!source) throw new Error(`Missing spell model: ${name}`);
    source.traverse(mesh => {
      if (!(mesh instanceof THREE.Mesh)) return;
      const role = mesh.name.split('_').at(-1)!, motif: EffectMotif = role === 'core' ? `fx_${id}` : `fx_${id}__${mesh.name}`;
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).translate(0, -1, 0);
      geometry.computeBoundingBox();
      if (!geometry.getAttribute('position')?.count || !geometry.boundingBox || !Number.isFinite(geometry.boundingBox.max.length())) throw new Error(`Invalid spell part: ${mesh.name}`);
      geometry.userData.ability = id;
      geometry.userData.grounded = true;
      geometries.get(motif)?.dispose(); geometries.set(motif, geometry);
      parts.push({ motif, role });
    });
    if (parts.filter(part => part.role === 'core').length !== 1) throw new Error(`Spell requires one core: ${name}`);
    modelParts.set(id, parts);
  }
}
export async function loadSpellEffectAssets() {
  const loader=new GLTFLoader();
  setSpellEffectAssets((await loader.loadAsync('/models/spell-effects.glb')).scene);
  await Promise.all(['ranger','knight','mage','cleric'].map(async name=>setSpellModelAssets((await loader.loadAsync(`/models/spell-models-${name}.glb`)).scene)));
  setSpellRedesignAssets((await loader.loadAsync('/models/spell-redesign.glb')).scene);
}

function radianceMaterial(mist=false) {
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:mist?THREE.NormalBlending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`varying vec2 glowUv; varying vec3 glowColor;
      void main(){glowUv=uv;glowColor=instanceColor;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        gl_Position=projectionMatrix*center;}`,
    fragmentShader:`varying vec2 glowUv;varying vec3 glowColor;
      void main(){float d=length(glowUv*2.-1.);float a=pow(max(0.,1.-d),${mist?'1.5':'2.8'});
        gl_FragColor=vec4(glowColor,a*${mist?'.42':'.28'});}`,
  });
}

/** Individual spell choreography, drawn with shared instanced Blender meshes. */
export function createSpellEffectDetails(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const batches = new Map<EffectMotif, THREE.InstancedMesh>();
  const transform = new THREE.Object3D(), color = new THREE.Color(), tangent = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  const vertical = new THREE.Vector3(0,1,0);
  const facing = new THREE.Quaternion(), spin = new THREE.Quaternion(), spinAxis = new THREE.Vector3(0, 0, 1);
  const displaced = new THREE.Matrix4(), displacedColor = new THREE.Color();
  let used = 0;
  const available = () => motifs.every(motif=>geometries.has(motif)) && graphics.effects !== 'off';
  const density = () => graphics.effects === 'low' ? .3 : 1;

  function part(motif: EffectMotif, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint: string, yaw = 0, pitch = 0, roll = 0, orient = false, primary = false) {
    if ((!primary && used >= TOTAL_BUDGET - 256) || Math.min(sx, sy, sz) <= 0) return;
    let batch = batches.get(motif);
    if (!batch) {
      const geometry = geometries.get(motif==='mist'?'radiance':motif);
      if (!geometry) return;
      batch = new THREE.InstancedMesh(geometry, motif==='radiance'||motif==='mist'?radianceMaterial(motif==='mist'):new THREE.MeshBasicMaterial({ vertexColors: !!geometry.getAttribute('color'), transparent: true, opacity: motif==='stroke'?.48:motif.startsWith('fx_')?.96:.72, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), CAPACITY);
      if(motif.startsWith('fx_')) {
        const material=batch.material as THREE.MeshBasicMaterial, school=SPELLS[(geometry.userData.ability ?? motif.slice(3)) as AbilityId].school;
        const time={value:0};material.userData.spellTime=time;
        const amplitude=school==='fire'?.055:school==='poison'?.025:.008;
        material.onBeforeCompile=shader=>{
          shader.uniforms.spellTime=time;
          shader.vertexShader='uniform float spellTime;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
            transformed += normal * sin(position.y*8.+position.z*5.+spellTime*9.) * ${amplitude.toFixed(3)};`);
        };
        material.customProgramCacheKey=()=>`spell-surface-${amplitude}`;
      }
      batch.name = `spell-detail-${motif}`;
      batch.count = 0;
      batch.userData.primaryCount = 0;
      batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.raycast = () => {};
      scene.add(batch);
      batches.set(motif, batch);
    }
    if (batch.count >= CAPACITY && (!primary || batch.userData.primaryCount >= CAPACITY)) return;
    const index = primary ? batch.userData.primaryCount++ : batch.count;
    if (primary && index < batch.count && batch.count < CAPACITY && used < TOTAL_BUDGET) {
      batch.getMatrixAt(index, displaced); batch.setMatrixAt(batch.count, displaced);
      batch.getColorAt(index, displacedColor); batch.setColorAt(batch.count, displacedColor);
    }
    const extendsBatch = batch.count < CAPACITY && used < TOTAL_BUDGET;
    if (!extendsBatch && index >= batch.count) return;
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    if (orient) {
      spin.setFromAxisAngle(spinAxis, roll);
      transform.quaternion.copy(facing).multiply(spin);
    } else transform.rotation.set(pitch, yaw, roll, 'YXZ');
    transform.updateMatrix();
    batch.setMatrixAt(index, transform.matrix);
    batch.setColorAt(index, color.set(tint));
    if (extendsBatch) { batch.count++; used++; }
  }

  const origin = new THREE.Vector3(), basis = new THREE.Quaternion(), localRotation = new THREE.Quaternion(), localEuler = new THREE.Euler(0,0,0,'YXZ');
  const position = new THREE.Vector3(), lineStart = new THREE.Vector3(), lineEnd = new THREE.Vector3();
  let grounded = false, phaseFade = 1;
  const palettes = Object.fromEntries(Object.entries(SPELL_VISUALS).map(([id, recipe]) => [id,[recipe.color,recipe.accent,...(recipe.tones??[`#${new THREE.Color(recipe.color).multiplyScalar(.28).getHexString()}`,'#ffa68d','#90ecff','#fff18c'])]]));
  let inks: string[] = [];
  function world(x: number,y: number,z: number,out: THREE.Vector3) {
    out.set(x,y,z).applyQuaternion(basis);
    const height = out.y;
    out.add(origin);
    out.y = grounded ? ground(out.x,out.z)+Math.max(.06,height) : Math.max(ground(out.x,out.z)+.04,out.y);
    return out;
  }
  const art: SpellArt = {
    phase:'flight', p:0,t:0,r:0,
    detail: count => Math.max(1, Math.ceil(count*density())),
    shape(motif,x,y,z,sx,sy=sx,sz=sx,tone=0,yaw=0,pitch=0,roll=0) {
      world(x,y,z,position);
      localRotation.setFromEuler(localEuler.set(pitch,yaw,roll,'YXZ'));
      facing.copy(basis).multiply(localRotation);
      part(motif,position.x,position.y,position.z,sx*phaseFade,sy*phaseFade,sz*phaseFade,inks[tone]??inks[0],0,0,0,true);
    },
    line(ax,ay,az,bx,by,bz,width,tone=1) {
      world(ax,ay,az,lineStart);world(bx,by,bz,lineEnd);
      tangent.copy(lineEnd).sub(lineStart);const length=tangent.length();if(length<.001)return;
      facing.setFromUnitVectors(up,tangent.multiplyScalar(1/length));
      position.copy(lineStart).add(lineEnd).multiplyScalar(.5);
      part('stroke',position.x,position.y,position.z,width*phaseFade,width*phaseFade,length,inks[tone]??inks[0],0,0,0,true);
    },
    ring(x,y,z,radius,tone=0,pitch=0,yaw=0) { art.shape('ring',x,y,z,radius,radius,radius,tone,yaw,pitch); },
    arc(x,y,z,radius,start,end,width,tone=0,pitch=0) {
      // Structural outlines retain their silhouette at Low; only secondary debris changes density.
      const steps=Math.max(2,Math.ceil(Math.abs(end-start)*4)),c=Math.cos(pitch),sn=Math.sin(pitch);
      for(let i=0;i<steps;i++) {const a=start+(end-start)*i/steps,b=start+(end-start)*(i+1)/steps;
        art.line(x+Math.cos(a)*radius,y-Math.sin(a)*radius*sn,z+Math.sin(a)*radius*c,x+Math.cos(b)*radius,y-Math.sin(b)*radius*sn,z+Math.sin(b)*radius*c,width,tone);
      }
    },
  };
  const drawers = {Ranger:drawRangerSpell,Knight:drawKnightSpell,Mage:drawMageSpell,Cleric:drawClericSpell};
  function drawModelParts(ability: AbilityId, progress: number, time: number) {
    const parts = modelParts.get(ability)!;
    const open = Math.min(1, progress * 5), pulse = Math.sin(progress * Math.PI), fade = phaseFade;
    for (let i = 0; i < parts.length; i++) {
      const { motif, role } = parts[i], secondary = role === 'orbit' || role === 'shard';
      if (graphics.effects === 'low' && secondary) continue;
      let x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, size = 1, sy = 1;
      const moving = role !== 'core', direction = i % 2 ? 1 : -1;
      switch (ability) {
        case SPELL_EFFECT_IDS.roll:
          pitch = -progress * Math.PI * 2;
          z = moving ? -.25 - progress * .55 : 0;
          size = moving ? .75 + pulse * .45 : .8;
          break;
        case SPELL_EFFECT_IDS.blink:
          yaw = moving ? direction * time * 2.2 : 0;
          size = .25 + Math.sin(Math.min(1, progress * 1.7) * Math.PI / 2) * .85;
          if (secondary) { size += progress * .55; y = pulse * .25; roll = direction * time; }
          break;
        case SPELL_EFFECT_IDS.lightspeed:
          pitch = moving ? -.18 - pulse * .3 : 0;
          z = moving ? -.35 - progress * .6 : 0;
          yaw = role === 'ring' ? time * 2 : 0;
          size = .65 + open * .35;
          sy = 1 + pulse * .12;
          break;
        case 'poison-cloud':
          size = .35 + open * 1.3;
          sy = .6 + pulse * .2;
          yaw = moving ? direction * time * .7 : Math.sin(time * 2) * .035;
          if (secondary) { y = pulse * .7; size *= 1.1; }
          break;
        case 'edict-of-the-dawn':
          size = .55 + open * .45;
          y = pulse * (role === 'wing' ? .35 : .12);
          yaw = role === 'ring' || role === 'rune' ? direction * time * 1.5 : 0;
          roll = role === 'wing' ? Math.sin(progress * Math.PI * 2) * .16 : 0;
          if (secondary) size += pulse * .3;
          break;
        case 'titans-edict':
          size = .55 + open * .45;
          yaw = role === 'ring' || role === 'rune' ? direction * time : 0;
          if (moving) { y = (1 - open) * .7; size += (1 - open) * .4; }
          pitch = role === 'core' ? (1 - open) * -.18 : 0;
          break;
        case 'eternal-edict':
          size = .7 + open * .3;
          yaw = moving ? direction * time * 2 : 0;
          pitch = role === 'ring' ? Math.sin(time * 2) * .4 : 0;
          y = moving ? Math.sin(time * 3 + i) * .1 : pulse * .12;
          if (secondary) roll = time * direction;
          break;
      }
      // Blender pieces share a pivot one metre above the ground; keep the caster legible inside it.
      world(x, 1 + y, z, position);
      localRotation.setFromEuler(localEuler.set(pitch, yaw, roll, 'YXZ')); facing.copy(basis).multiply(localRotation);
      part(motif, position.x, position.y, position.z, size * fade, size * sy * fade, size * fade, '#ffffff', 0, 0, 0, true);
      const batch = batches.get(motif); if (batch) (batch.material as THREE.Material).userData.spellTime.value = time;
    }
  }
  function draw(ability:AbilityId,phase:SpellArt['phase'],progress:number,time:number,radius:number) {
    inks=palettes[ability];
    art.phase=phase;art.p=progress;art.t=time;art.r=radius;
    phaseFade=phase==='flight'?1:Math.min(1,(1-progress)*5);
    const hero=`fx_${ability}` as const, spell=SPELLS[ability];
    // Poison Cloud's arrow ruptures into its grounded spore model only on contact.
    if(geometries.has(hero)&&!(ability==='poison-cloud'&&phase==='flight')) {
      const traveling=phase==='flight', radial=phase==='field'&&spell.effect==='damage';
      let size=traveling?(spell.className==='Mage'?1.35:1.1):radial?Math.max(.1,radius*.85):phase==='impact'?.75+progress*.5:1;
      let height=traveling||phase==='field'||geometries.get(hero)?.userData.grounded?0:.65;
      let heightScale=radial?1:size,roll=0,pitch=0;
      const settle=Math.max(0,1-progress*5);
      switch(ability) {
        case 'poison-cloud': size=.45+Math.min(1,progress*3.4)*1.5;heightScale=.45+Math.sin(progress*Math.PI)*.4;roll=Math.sin(time*2)*.018;break;
        case 'charge': {
          size=traveling?1.15:.85;heightScale=size;
          if(traveling) {const bounds=geometries.get(hero)!.boundingBox!;height=-(bounds.min.y+bounds.max.y)*.5*size;pitch=-.12+Math.sin(time*15)*.025;}
          else {size=.85-progress*.35;heightScale=size;pitch=-settle*.25;}
          break;
        }
        case 'powerful-throw': size=traveling?.78:.7-progress*.25;heightScale=size;roll=time*16;height=traveling?0:.7;break;
        case 'taunt': {
          size=(.8+settle*.12)*(traveling?1.35:1);heightScale=size;
          const bounds=geometries.get(hero)!.boundingBox!;
          height=traveling?-(bounds.min.y+bounds.max.y)*.5*size:.7+settle*.25;
          break;
        }
        case 'guard': size=.9;heightScale=.9*(1-settle*.08);pitch=-settle*.2;break;
        case 'adamant-guardian': size=phase==='impact'?.85*(1-progress):.85;heightScale=size*(1-settle*.18);break;
        case 'courageous-call': size=.85;heightScale=.85;height=settle*-.2;roll=-settle*.15+Math.sin(time*5)*.02;break;
        case 'lord-of-battle': size=.9;heightScale=.9;height=settle*.3;roll=Math.sin(time*3)*.015;break;
      }
      if (modelParts.has(ability)) drawModelParts(ability, progress, time);
      else {
        world(0,height,0,position);
        localRotation.setFromEuler(localEuler.set(pitch,0,roll,'YXZ'));facing.copy(basis).multiply(localRotation);
        part(hero,position.x,position.y,position.z,size*phaseFade,heightScale*phaseFade,size*phaseFade,'#ffffff',0,0,0,true);
        const heroBatch=batches.get(hero);if(heroBatch)(heroBatch.material as THREE.Material).userData.spellTime.value=time;
      }
      if(ability==='poison-cloud'&&!traveling) {
        // Overlapping soft plumes sit above the fungal caps; their gaps keep victims readable.
        const spread=Math.min(1,.15+progress*3.4)*(spell.radius??5);
        for(let i=0;i<6;i++) {
          const angle=i*Math.PI/3+progress*.45,d=spread*(.28+(i%2)*.23);
          for(let layer=0;layer<2;layer++) {
            const lift=(progress*.8+i*.13+layer*.27)%1;
            world(Math.sin(angle+lift*.18)*d,.85+lift*.8,Math.cos(angle+lift*.18)*d,position);
            const puff=(1.25+Math.sin(progress*Math.PI)*.7)*(1-lift*.25)*phaseFade;
            part('mist',position.x,position.y,position.z,puff,puff*(.7+layer*.25),1,inks[0]);
          }
        }
      }
      if(graphics.bloom) {
        world(0,traveling?0:1,0,position);
        const forest=!!SPELL_VISUALS[ability].tones;
        const halo=(traveling?3.5:radial?Math.min(6,radius*1.2):4.3)*phaseFade*(forest?.48:1);
        part('radiance',position.x,position.y,position.z,halo,halo,1,forest?inks[4]:inks[0]);
        // Tiny bright motes separate from the broad glow and follow each spell's motion.
        for(let i=0;i<art.detail(forest?4:9);i++) {const q=i*2.399+time*2,h=(i*.19+time*.7)%1;
          world(Math.cos(q)*(.45+h*.5),traveling?Math.sin(q)*.4:.2+h*1.9,traveling?-.25-h*1.5:Math.sin(q)*(.45+h*.5),position);
          const s=(.12+(1-h)*.15)*phaseFade*(forest?.65:1);part('radiance',position.x,position.y,position.z,s,s,1,forest?inks[4]:inks[1]);
        }
      }
    }
    return drawers[SPELLS[ability].className](ability,art);
  }

  function begin() {
    used=0;for(const batch of batches.values()){batch.count=0;batch.userData.primaryCount=0;}
  }

  function projectile(ability: AbilityId, age: number, progress: number, flight: number, at: {x:number;y:number;z:number}, sample:(progress:number,out:THREE.Vector3)=>void) {
    if(!available())return false;
    origin.set(at.x,at.y,at.z);grounded=false;
    sample(Math.min(1,progress+.01),tangent);tangent.sub(origin);
    if(tangent.lengthSq()<1e-10)tangent.set(0,0,1);
    basis.setFromUnitVectors(up,tangent.normalize());facing.copy(basis);
    const recipe=SPELL_VISUALS[ability],arrow=SPELLS[ability].className==='Ranger';
    // A small exact-position core remains readable when decorative instances saturate.
    part(arrow?'arrow':recipe.motif,origin.x,origin.y,origin.z,arrow?.6:.22,arrow?.6:.22,arrow?1:.32,recipe.accent,0,0,0,true,true);
    draw(ability,'flight',progress,age,0);
    if(graphics.bloom&&geometries.has(`fx_${ability}`))for(let i=1;i<=art.detail(8);i++) {
      const back=progress-i*.028;if(back<0)break;sample(back,position);
      const s=(1.15-i*.09)*(SPELLS[ability].className==='Mage'?1.35:SPELL_VISUALS[ability].tones?.45:1);
      part('radiance',position.x,position.y,position.z,s,s,1,recipe.color);
    }
    if(ability.endsWith('-beam')||ability==='chain-lightning') {
      sample(0,lineStart);const sx=lineStart.x,sy=lineStart.y,sz=lineStart.z;
      const segments=ability==='chain-lightning'?7:1;
      for(let i=0;i<segments;i++) {
        const a=i/segments,b=(i+1)/segments,ja=segments>1?Math.sin(i*3+age*30)*.35*Math.sin(Math.PI*a):0,jb=segments>1?Math.sin((i+1)*3+age*30)*.35*Math.sin(Math.PI*b):0;
        lineStart.set(sx+(origin.x-sx)*a+ja,sy+(origin.y-sy)*a,sz+(origin.z-sz)*a-ja);
        lineEnd.set(sx+(origin.x-sx)*b+jb,sy+(origin.y-sy)*b,sz+(origin.z-sz)*b-jb);
        tangent.copy(lineEnd).sub(lineStart);const length=tangent.length();if(length<.001)continue;
        facing.setFromUnitVectors(up,tangent.multiplyScalar(1/length));position.copy(lineStart).add(lineEnd).multiplyScalar(.5);
        part('stroke',position.x,position.y,position.z,.07,.07,length*1.04,recipe.accent,0,0,0,true);
      }
    }
    return true;
  }

  function impact(ability:AbilityId,x:number,y:number,z:number,progress:number,index:number,heading=0) {
    if(!available())return false;if(progress<0||progress>=1)return true;
    const recipe=SPELL_VISUALS[ability];
    part('spark',x,y,z,.25*(1-progress),.25*(1-progress),.25*(1-progress),recipe.accent,0,0,0,false,true);
    origin.set(x,ground(x,z),z);basis.setFromAxisAngle(vertical,heading);grounded=true;
    draw(ability,'impact',progress,progress*.42,ability==='adamant-guardian'?(SPELLS[ability].radius??5):0);
    return true;
  }

  function radial(ability:AbilityId,x:number,z:number,heading:number,progress:number,radius:number) {
    if(!available())return false;if(progress<0||progress>=1)return true;
    const spell=SPELLS[ability],recipe=SPELL_VISUALS[ability],support=spell.effect!=='damage';
    origin.set(x,ground(x,z),z);basis.setFromAxisAngle(vertical,heading);grounded=true;
    // Preserve target/range feedback under load without imposing one halo on every spell.
    if(support)part('spark',x,ground(x,z)+.045,z,.15,.15,.15,recipe.accent,0,0,0,false,true);
    else {const wx=x+Math.sin(heading)*radius,wz=z+Math.cos(heading)*radius;part('spark',wx,ground(wx,wz)+.1,wz,.14,.14,.14,recipe.accent,0,0,0,false,true);}
    draw(ability,'field',progress,progress*(spell.effect==='shield'?1.2:.7),radius);
    return true;
  }

  function finish() {
    for (const batch of batches.values()) {
      batch.visible = batch.count > 0;
      batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    }
  }

  function clear() {
    for (const batch of batches.values()) {
      batch.removeFromParent();
      batch.dispose();
      (batch.material as THREE.Material).dispose();
    }
    batches.clear();
  }
  return { begin, projectile, impact, radial, finish, clear };
}
