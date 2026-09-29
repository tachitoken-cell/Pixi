import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const ids=['brook-trout','silver-carp','glacial-char','moonfin','dream-petal','nightmare-shard','slime-residue','gnarled-bark','chipped-fang','cracked-carapace','frost-shard','tattered-pelt','bog-gland','void-dust',
  'trail-bread','roast-meat','berry-tart','hearty-stew','prismatic-pearl','ancient-coin','stormhorn-core','greater-tonic','moss-voucher','treasure-map'];
const folder=new URL('../public/ui/loot/',import.meta.url),hashes=new Set();
assert.deepEqual(readdirSync(folder).filter(file=>file.endsWith('.png')).sort(),ids.map(id=>id+'.png').sort());
let bytes=0;
for(const id of ids){
  const png=readFileSync(new URL(id+'.png',folder));bytes+=png.length;
  assert(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),`${id}: valid PNG signature`);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.equal(width,id==='moss-voucher'?256:192);assert.equal(height,width);
  assert.equal(png[24],8);assert.equal(png[25],6,`${id}: retains true RGBA transparency`);assert.equal(png[28],0);
  const chunks=[];
  for(let at=8;at<png.length;){
    const length=png.readUInt32BE(at);assert(at+length+12<=png.length);
    if(png.toString('ascii',at+4,at+8)==='IDAT')chunks.push(png.subarray(at+8,at+8+length));
    at+=length+12;
  }
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(stride*height);
  assert.equal(raw.length,(stride+1)*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  let at=0,visible=0,transparent=0,partial=0;
  for(let y=0;y<height;y++){
    const filter=raw[at++];assert(filter<=4);
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;
      pixels[i]=(raw[at++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
    }
    for(let x=0;x<width;x++){
      const alpha=pixels[y*stride+x*4+3];
      if(alpha===0)transparent++;else if(alpha<255)partial++;
      if(alpha>64)visible++;
      if(x<4||x>=width-4||y<4||y>=height-4)assert.equal(alpha,0,`${id}: clear padding prevents clipped edges`);
    }
  }
  assert(visible>width*height*.1&&visible<width*height*.85,`${id}: visible item with no opaque background`);
  assert(transparent>width*height*.15&&partial>0,`${id}: generated alpha and antialiased edges survive normalization`);
  hashes.add(createHash('sha256').update(pixels).digest('hex'));
}
assert.equal(hashes.size,ids.length,'each item has distinct artwork');
assert(bytes<900_000,'the complete icon set has a bounded web download');
const original=readFileSync(new URL('../assets/source/loot-icons-atlas.png',import.meta.url));
assert.equal(original[25],6,'the original generated atlas is preserved with alpha');
const notes=readFileSync(new URL('../assets/source/loot-icons-prompt.md',import.meta.url),'utf8');
assert(notes.includes('built-in image generation')&&notes.includes('Normalization:')&&notes.includes('ROW FOUR'));
console.log(`PASS: all ${ids.length} distinct loot icons, RGBA, transparent padding and visible artwork, authored source/prompt retained, ${bytes} total bytes.`);
