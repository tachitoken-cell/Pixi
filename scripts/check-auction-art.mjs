import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hashes=new Set();let total=0;
for(const name of ['crest','shopping','selling','auctions']){
 const data=readFileSync(new URL(`../public/ui/auction/${name}.png`,import.meta.url)),size=name==='crest'?384:96;
 assert.equal(data.subarray(1,4).toString(),'PNG');assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);
 assert.equal(data[25],6,'RGBA artwork');hashes.add(createHash('sha256').update(data).digest('hex'));total+=data.length;
}
assert.equal(hashes.size,4,'distinct artwork for the crest and each tab');assert(total<300000,'small UI texture budget');
assert(statSync(new URL('../assets/source/auction-ui.blend',import.meta.url)).size>10000);
assert(readFileSync(new URL('../scripts/build-auction-ui-assets.py',import.meta.url),'utf8').includes('bpy.ops.render.render'));
console.log(`PASS: four distinct Blender-rendered RGBA auction assets, exact desktop sizes, editable source and ${total} bytes.`);
