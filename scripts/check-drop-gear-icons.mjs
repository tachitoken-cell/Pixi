import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { registerHooks } from 'node:module';
import { GEAR, starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';

const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {gearArt,renderItemDetails}=await import('../src/character-ui.ts');hook.deregister();
const items=Object.values(GEAR).filter(item=>item.dropOnly),hashes=new Set(),names=new Set();
assert.equal(items.length,128);
let totalBytes=0;
for(const item of items){
  assert.equal(item.icon,item.id,'each drop has its own icon key');
  assert(!names.has(item.label),`${item.id}: unique display name`);names.add(item.label);
  const path=`/ui/gear/${item.icon}.png`,png=readFileSync(new URL(`../public${path}`,import.meta.url));totalBytes+=png.length;
  assert(gearArt(item).includes(`src="${path}"`),'all gear UI uses the item icon');
  assert.equal(png.subarray(1,4).toString(),'PNG');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert(width>=192&&width===height);
  assert.equal(png[24],8);assert.equal(png[25],6,'RGBA artwork retains transparency');assert.equal(png[28],0);
  const chunks=[];
  for(let at=8;at<png.length;){const length=png.readUInt32BE(at);assert(at+length+12<=png.length);if(png.toString('ascii',at+4,at+8)==='IDAT')chunks.push(png.subarray(at+8,at+8+length));at+=length+12;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(stride*height);assert.equal(raw.length,(stride+1)*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  let at=0,visible=0,transparent=0;
  for(let y=0;y<height;y++){
    const filter=raw[at++];assert(filter<=4);
    for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;pixels[i]=(raw[at++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
    for(let x=0;x<width;x++){const alpha=pixels[y*stride+x*4+3];if(alpha===0)transparent++;if(alpha>64)visible++;if(x<2||y<2||x>=width-2||y>=height-2)assert.equal(alpha,0,`${item.id}: edges stay unclipped`);}
  }
  assert(visible>width*height*.02&&transparent>width*height*.1,`${item.id}: visible artwork and a transparent surround`);
  hashes.add(createHash('sha256').update(pixels).digest('hex'));
  const player={level:50,appearance:{className:item.className},...starterGear(item.className),...newBags(),gold:0,inventory:{wood:0,crystal:0,herb:0,relic:0,potion:0},carriedItems:{}};player.ownedGear.push(item.id);
  const detail=renderItemDetails(player,item.id);
  const renderedName=item.label.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  assert(detail.includes(renderedName)&&detail.includes(`Level ${item.requiredLevel}`)&&detail.includes(`quality-${item.quality}`)&&detail.includes(path),'inventory details show the real item identity');
  for(const [stat,value] of Object.entries(item.stats))assert(detail.toLowerCase().includes(`+${value} ${{strength:'strength',agility:'agility',intellect:'intellect',stamina:'stamina',spirit:'spirit',primaryDamage:'attack damage',specialDamage:'magic (skill damage)',defense:'defense (armor)'}[stat]}`),`${item.id}: displays its real ${stat}`);
}
assert.equal(hashes.size,128,'all 128 icons contain distinct rendered pixels');
assert(totalBytes<6_000_000,'the 128 inventory icons remain a modest download');
assert(gearArt(GEAR['cleric-mace']).includes('/ui/gear/cleric-weapon.png'),'legacy equipment keeps its original model icon');
console.log(`PASS: 128 individual RGBA icons, unique rendered pixels and names, real stats/levels/rarity in inventory details, legacy icon fallback; ${totalBytes} bytes.`);
