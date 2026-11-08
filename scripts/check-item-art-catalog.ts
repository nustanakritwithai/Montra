/** Checks the real current server catalog without altering gameplay data. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {PERSONAL_ITEMS} from '../deploy/combat/PersonalItems.js';
import {POTION_ID,SHRINE_SHARD,WEAPON_STATS} from '../deploy/combat/ItemRules.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(resolve(root,'src/client/ui/030-item-art-and-comparison.js'),'utf8');
const start=source.indexOf('  const itemSheetExact'),end=source.indexOf('  // One read-only item thumbnail');
assert(start>=0&&end>start);
const art=runInNewContext(source.slice(start,end)+'\ngetItemArtKey',{POTION_ITEM_ID:POTION_ID,SHRINE_SHARD});
const coverage=JSON.parse(readFileSync(resolve(root,'docs/item-art-coverage.json'),'utf8'));
const before=JSON.stringify(PERSONAL_ITEMS), uncovered:string[]=[];
let covered=0;
for(const [id,meta] of Object.entries(PERSONAL_ITEMS)){
  const key=art(id,meta),expected=coverage.coveredIdToArtKey[id];
  if(expected){assert.equal(key,'sheet_'+expected,id);covered++;}
  else {assert(!key.startsWith('sheet_'),'Unreviewed mapping: '+id);uncovered.push(id);}
  if(meta.kind!=='mainHand')assert(!/^weapon_/.test(key),'Class armor must never use weapon art: '+id);
}
assert.equal(JSON.stringify(PERSONAL_ITEMS),before,'Artwork must not mutate the catalog');
assert.equal(Object.keys(PERSONAL_ITEMS).length,coverage.livePersonalItemCount);
assert.equal(covered,coverage.coveredPersonalItems);
assert.deepEqual(uncovered,coverage.uncoveredIds);
for(const id of [POTION_ID,...Object.keys(WEAPON_STATS)])assert(art(id,{kind:'mainHand'}).startsWith('sheet_'),id);
assert.equal(art('',null),'');assert.equal(art('unknown_item',null),'');
assert(!art('mat_fish_common',PERSONAL_ITEMS.mat_fish_common).startsWith('sheet_'));
console.log(`PASS item art: ${covered}/${Object.keys(PERSONAL_ITEMS).length} personal IDs, ${Object.keys(WEAPON_STATS).length+1} legacy IDs; ${uncovered.length} explicit gaps`);
if(process.argv[2]){
  const file=resolve(process.argv[2]);mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify(PERSONAL_ITEMS));
}
