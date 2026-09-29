import assert from 'node:assert/strict';
import { GEAR, GEAR_QUALITIES, gearById, gearQuality, gearStatBreakdown, gearUpgradeQuote } from '../src/progression.ts';

const catalogBefore=JSON.stringify(GEAR);
for(const id of ['warden-longbow','starfall-staff','ranger-bow']) {
  const base=gearById(id);
  for(const row of gearStatBreakdown(id)) assert.deepEqual(row,{stat:row.stat,base:base.stats[row.stat],roll:0,min:0,max:0,upgrade:0,total:base.stats[row.stat]});
  const upgraded=gearUpgradeQuote(id)?.next;
  if(upgraded) for(const row of gearStatBreakdown(upgraded.id)) {
    assert.equal(row.roll,0);assert.equal(row.max,0);
    assert.equal(row.upgrade,Math.max(1,Math.ceil(row.base*.1)));
    assert.equal(row.base+row.upgrade,upgraded.stats[row.stat]);
  }
}
const highLevel=Object.values(GEAR).find(gear=>gear.requiredLevel===50&&gear.slot==='weapon');
assert(highLevel);
for(const base of [GEAR['warden-longbow'],highLevel]) for(const version of [1,2]) for(const [tier,quality] of GEAR_QUALITIES.entries()) {
  let minimumSeen=false,maximumSeen=false;
  for(let seed=0;seed<256;seed++) {
    const id=`${base.id}~${version}~${quality}~${seed.toString(16).padStart(16,'0')}~0`;
    const original=gearById(id),before=JSON.stringify(original),rows=gearStatBreakdown(id);
    assert.equal(rows.filter(row=>row.roll).length,Math.min(5,tier+1),'only the affixes selected by this versioned seed have ranges');
    for(const row of rows) {
      assert.equal(row.base,base.stats[row.stat]??0);
      assert.equal(row.base+row.roll+row.upgrade,row.total);
      assert.equal(row.total,original.stats[row.stat]);
      if(!row.roll){assert.equal(row.min,0);assert.equal(row.max,0);continue;}
      const expectedMax=row.stat==='speed'?[1,2,2,3,3,4][tier]:[1,2,3,4,5,6][tier]+Math.floor(base.requiredLevel/12);
      assert.equal(row.min,1);assert.equal(row.max,expectedMax);
      assert(row.roll>=row.min&&row.roll<=row.max);
      minimumSeen ||= row.roll===row.min;maximumSeen ||= row.roll===row.max;
      if(version===1) assert(['primaryDamage','specialDamage','damage','defense','speed'].includes(row.stat));
    }
    const upgraded=gearStatBreakdown(id.slice(0,-1)+'5');
    for(const row of upgraded) {
      const unupgraded=rows.find(entry=>entry.stat===row.stat);
      assert.equal(row.roll,unupgraded.roll);assert.equal(row.min,unupgraded.min);assert.equal(row.max,unupgraded.max);
      assert.equal(row.upgrade,5*Math.max(1,Math.ceil(unupgraded.total*.1)));
      assert.equal(row.total,unupgraded.total+row.upgrade);
    }
    assert.equal(JSON.stringify(original),before,'inspection never mutates the rolled gear');
  }
  assert(minimumSeen&&maximumSeen,`${base.id} v${version} ${quality}: exercise actual minimum and maximum rolls`);
}
for(const id of [undefined,null,{},'__proto__','invalid','warden-longbow~3~rare~0000000000000000~0']) assert.deepEqual(gearStatBreakdown(id),[]);
assert.equal(JSON.stringify(GEAR),catalogBefore,'inspection leaves every catalog stat unchanged');
assert.equal(gearQuality(GEAR['warden-longbow']),'uncommon');
console.log('PASS: fixed and upgraded items, both roll versions, every rarity, actual min/max examples, selected affixes only and immutable stats.');
