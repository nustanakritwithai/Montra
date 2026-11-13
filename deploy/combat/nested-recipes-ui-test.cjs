// Exercise server-catalog recipe relationships without issuing economy mutations.
const assert=require('node:assert/strict');
const {fixture,recipeIngredient}=require('./crafting-pages-ui-test.cjs');
let count=0;const test=(name,run)=>{run();count++;console.log('PASS '+name);};
const descend=(node,predicate)=>[...(predicate(node)?[node]:[]),...(node.children||[]).flatMap(child=>descend(child,predicate))];
const nodes=(f,id)=>descend(f.$(id),n=>n.tagName==='BUTTON'&&n.dataset.item);
const tap=(f,host,id)=>{const node=nodes(f,host).find(n=>n.dataset.item===id);assert(node,`missing ${id} in ${host}`);node.click();};
const text=node=>[node.textContent,...(node.children||[]).map(text)].join(' ');
test('ingredient pictures drill through crafting and refining, back restores the root recipe',()=>{
 const f=fixture();f.items.raw_ore={name:'หินปนแร่',kind:'material',refinesTo:'mat_metal_1'};f.choose('all','blade_25');
 assert.equal(f.$('benchCraftDetails').hidden,false);assert.match(text(f.$('benchCreatedFrom')),/แท่งเหล็ก/);
 const panel=f.$('craftRecipePanel');assert.equal(panel.tagName,'SECTION');
 panel.showModal=()=>assert.fail('Recipe navigation opened a modal');
 f.callbacks.economy_state({gold:1000,craftBatchMax:10});
 f.$('benchQuantity').value='2';f.$('benchQuantity').oninput();
 const thumbnail=recipeIngredient(f,'mat_ingot_1');assert.equal(thumbnail.tagName,'BUTTON');assert.match(thumbnail.getAttribute('aria-label'),/ดูสูตร.*แท่งเหล็ก/);thumbnail.click();
 assert.equal(f.$('craftRecipePanel'),panel);assert.equal(panel.hidden,false);assert.equal(f.$('craftRecipePane').hidden,true);
 assert.equal(f.$('benchOutput').textContent,'แท่งเหล็ก');assert.equal(f.$('benchCraftDetails').hidden,false);
 assert.equal(f.$('benchRecipe').value,'mat_ingot_1');assert.equal(f.$('benchQuantity').value,'1');
 assert.equal(f.$('benchCraft').textContent,'หลอมเหล็ก');
 assert.equal(f.$('benchInspectChoose'),null);
 tap(f,'benchCreatedFrom','mat_metal_1');assert.match(text(f.$('benchCreatedFrom')),/หินปนแร่.*มี 0 \/ 2.*ขาด 2.*แร่เหล็ก.*×1.*แปรรูป/);
 tap(f,'benchCreatedFrom','raw_ore');assert.match(text(f.$('benchCreatedFrom')),/ไม่มีสูตรสร้างหรือแปรรูป/);assert.match(text(f.$('benchUsedFor')),/แร่เหล็ก/);
 f.$('benchInspectBack').click();assert.equal(f.$('benchInspectTitle').textContent,'แร่เหล็ก');
 f.$('benchInspectBack').click();assert.equal(f.$('benchOutput').textContent,'แท่งเหล็ก');
 f.$('benchBack').click();assert.equal(f.$('benchBack').hidden,true);assert.equal(f.$('benchCraftDetails').hidden,false);
 assert.equal(f.$('benchRecipe').value,'blade_25');assert.equal(f.$('benchQuantity').value,'2');
 assert.equal(panel.hidden,false);assert.equal(f.mutations().length,0);
});
test('live bag polling preserves ingredient button identity while refreshing availability',()=>{
 const f=fixture();f.choose('all','blade_25');const button=recipeIngredient(f,'mat_ingot_1');
 f.run('renderBag();renderBag()');assert.equal(recipeIngredient(f,'mat_ingot_1'),button);
 const payload=f.payload();payload.slots[0].quantity=1;f.callbacks.inventory_state(payload);
 assert.equal(recipeIngredient(f,'mat_ingot_1'),button);assert.equal(button.children[2].textContent,'มี 1 / 2');assert.equal(button.children[3].textContent,'ขาด 1');
 button.click();assert.equal(f.$('benchOutput').textContent,'แท่งเหล็ก');assert.equal(f.mutations().length,0);
});
test('used-for recipes paginate and the active craft target follows the tapped recipe',()=>{
 const f=fixture();f.choose('all','blade_25');tap(f,'benchCreatedFrom','mat_ingot_1');
 assert.equal(f.$('benchUsedFor').children.length,6);assert.equal(f.$('benchUsesPagination').hidden,false);
 f.$('benchUsesNext').click();assert.match(f.$('benchUsesCount').textContent,/หน้า 2/);
 assert.equal(f.$('benchRecipe').value,'mat_ingot_1');assert.equal(f.$('benchCraftDetails').hidden,false);
 assert.equal(f.$('benchCraft').textContent,'หลอมเหล็ก');assert.equal(f.mutations().length,0);
 f.$('benchCraft').click();assert.equal(f.mutations().length,1);assert.equal(f.mutations()[0].payload.recipeId,'mat_ingot_1');
});
test('cycles collapse history instead of recursing and repeated taps are bounded',()=>{
 const f=fixture();f.items.mat_metal_1.recipe=[{item:'mat_ingot_1',qty:1}];f.choose('all','blade_25');
 tap(f,'benchCreatedFrom','mat_ingot_1');tap(f,'benchCreatedFrom','mat_metal_1');tap(f,'benchCreatedFrom','mat_ingot_1');
 assert.equal(f.run('benchTrail.length'),1);assert.equal(f.$('benchOutput').textContent,'แท่งเหล็ก');
 for(let i=0;i<40;i++)f.run('inspectBenchItem("mat_ingot_1")');assert.equal(f.run('benchTrail.length'),1);
 f.$('benchBack').click();assert.equal(f.$('benchOutput').textContent,'ดาบคู่');assert.equal(f.mutations().length,0);
});
test('catalog refresh, manual category navigation, reconnect and reopen clear obsolete inspection',()=>{
 const f=fixture();f.choose('all','ring_25','rightRing');tap(f,'benchCreatedFrom','mat_ingot_1');
 tap(f,'benchCreatedFrom','mat_metal_1');
 f.callbacks.economy_state({gold:1});assert.equal(f.$('benchInspectTitle').textContent,'แร่เหล็ก');assert.equal(f.$('benchCraftFooter').hidden,true);
 f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
 delete f.items.mat_metal_1;f.ctx.catalogRevision++;f.run('renderBag()');assert.match(f.$('benchInspectTitle').textContent,/ไม่มีข้อมูล/);
 f.change('benchGroup','medicine');assert.equal(f.$('benchInspectBack').hidden,true);assert.equal(f.$('benchCraftDetails').hidden,false);
 f.choose('kiln','mat_charcoal_1');tap(f,'benchCreatedFrom','mat_raw_wood_1');f.run('room={...room};renderCraftingPage()');assert.equal(f.run('benchInspectTrail.length'),0);
 tap(f,'benchCreatedFrom','mat_raw_wood_1');f.run('openCraftingPage()');assert.equal(f.run('benchInspectTrail.length'),0);assert.equal(f.$('benchCraftDetails').hidden,false);
 assert.equal(f.mutations().length,0);
});
test('legacy catalyst refinement quantity follows the existing server contract; missing metadata is inert',()=>{
 const f=fixture();f.items.old_catalyst={name:'วัสดุเก่า',kind:'catalyst',refinesTo:'mat_metal_1'};f.choose('kiln','mat_ingot_1');tap(f,'benchCreatedFrom','mat_metal_1');
 assert.match(text(f.$('benchCreatedFrom')),/วัสดุเก่า.*มี 0 \/ 1.*ขาด 1.*แร่เหล็ก.*×2/);
 f.$('benchInspectRoot').click();delete f.items.mat_metal_1;f.ctx.catalogRevision++;f.run('renderBag()');
 assert.equal(nodes(f,'benchCreatedFrom').find(n=>n.dataset.item==='mat_metal_1').disabled,true);
 assert.equal(f.mutations().length,0);
});
test('recipe panel replaces the list, returns without crafting and clears on room changes',()=>{
 const f=fixture();f.run('openCraftingPage()');assert.equal(f.$('craftRecipePanel').hidden,true);
 f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
 f.$('craftRecipeGrid').children[0].click();assert.equal(f.$('craftRecipePanel').hidden,false);
 f.$('craftRecipePanelClose').click();assert.equal(f.$('craftRecipePanel').hidden,true);
 f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
 f.choose('all','blade_25');tap(f,'benchCreatedFrom','mat_ingot_1');f.$('craftRecipePanelClose').click();
 f.$('craftRecipeGrid').children.find(n=>n.dataset.recipe==='mat_ingot_1').click();assert.equal(f.$('benchInspectBack').hidden,true);
 assert.equal(f.$('benchBack').hidden,true);
 f.run('room={...room};renderCraftingPage()');assert.equal(f.$('craftRecipePanel').hidden,true);
 f.choose('all','blade_25');f.ctx.cardDrill=null;f.run('renderCraftingPage()');assert.equal(f.$('craftRecipePanel').hidden,true);
 assert.equal(f.mutations().length,0);
});
console.log(`PASS nested recipe UI: ${count} groups`);
