// Cross-check read-only graph edges against the actual server catalog and refine ratio.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {PERSONAL_ITEMS} from './PersonalItems.js';
import {REFINE_INPUT} from './WorldResources.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=readFileSync(resolve(root,'src/client/ui/053-gear-training-and-crafting.js'),'utf8');
const start=source.indexOf('  function benchRecipeEdges()'),end=source.indexOf('  function inspectBenchItem(',start);
assert(start>=0&&end>start);
const before=JSON.stringify(PERSONAL_ITEMS);
const edges=runInNewContext(source.slice(start,end)+'\nbenchRecipeEdges()',{personalItems:PERSONAL_ITEMS,refineInput:REFINE_INPUT});
let expected=0;
for(const [id,def] of Object.entries(PERSONAL_ITEMS)){
 if(def.recipe?.length){
  expected++;const edge=edges.find((edge:{id:string})=>edge.id==='craft:'+id);assert(edge,id);
  assert.equal(edge.output,id);assert.equal(edge.quantity,1);assert.equal(JSON.stringify(edge.inputs),JSON.stringify(def.recipe));
 }
 if(def.refinesTo){
  expected++;const edge=edges.find((edge:{id:string})=>edge.id==='refine:'+id);assert(edge,id);
  assert.equal(edge.output,def.refinesTo);assert.equal(edge.quantity,def.kind==='catalyst'?2:1);
  assert.equal(edge.inputs[0].item,id);assert.equal(edge.inputs[0].qty,def.kind==='catalyst'?1:REFINE_INPUT);
 }
}
assert.equal(edges.length,expected);assert.equal(JSON.stringify(PERSONAL_ITEMS),before);
assert(PERSONAL_ITEMS.wp_twins_1.recipe?.some(part=>part.item==='mat_metal_1'));
assert.equal(PERSONAL_ITEMS.mat_raw_stone_1.refinesTo,'mat_metal_1');
console.log(`PASS actual recipe catalog: ${expected} edges from ${Object.keys(PERSONAL_ITEMS).length} items, unchanged server data`);
if(process.argv[2]){const file=resolve(process.argv[2]);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(PERSONAL_ITEMS));}
