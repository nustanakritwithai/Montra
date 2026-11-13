// Exercise the real workbench functions, native-select model and existing wire guards.
const assert=require('node:assert/strict');
const {fixture,recipeIngredient}=require('./crafting-pages-ui-test.cjs');
let tests=0;const test=(name,fn)=>{fn();tests++;console.log('PASS '+name);};
test('recipe page uses one drawer heading and a compact category strip',()=>{
  const f=fixture();f.run('openCraftingPage()');
  assert.equal(f.ctx.title,'งานช่างและครัว');assert.doesNotMatch(f.ctx.html,/ck-hero|craftPlayerLevel/);
  assert.equal(f.$('craftPageStatus').hidden,true);
  assert.equal(f.$('ckCategory-all').getAttribute('aria-pressed'),'true');
});
test('six recipe cards per page, bounded pagination and native-select/card synchronization',()=>{
  const f=fixture();f.run('openCraftingPage()');f.change('benchGroup','all');
  assert.equal(f.$('craftRecipeGrid').children.length,6);assert.match(f.$('craftRecipePage').textContent,/หน้า 1\//);
  assert.equal(f.$('craftRecipePrev').disabled,true);assert.equal(f.$('craftRecipeNext').disabled,false);
  f.$('craftRecipeNext').click();assert.match(f.$('craftRecipePage').textContent,/หน้า 2\//);
  const card=f.$('craftRecipeGrid').children[0];card.click();
  assert.equal(f.$('benchOutput').textContent,card.children[1].textContent);
  assert.equal(f.$('craftRecipeGrid').children[0].getAttribute('aria-pressed'),'true');
  for(let i=0;i<20;i++)f.$('craftRecipeNext').click();
  assert.equal(f.$('craftRecipeNext').disabled,true);assert.equal(f.mutations().length,0);
  f.change('benchGroup','kiln');assert.equal(f.$('craftRecipeGrid').children.length,2);
  assert.match(f.$('craftRecipePage').textContent,/หน้า 1\/1 · 2 สูตร/);
});
test('new category buttons filter only real server recipe kinds',()=>{
  const f=fixture();f.run('openCraftingPage()');
  for(const [category,valid] of [['medicine',x=>x.kind==='consumable'],['weapons',x=>x.kind==='mainHand'],['armor',x=>['ring','earring','chest'].includes(x.kind)]]){
    f.$('ckCategory-'+category).click();assert(f.ids().length>0);
    assert(f.ids().every(id=>valid(f.items[id])));assert.equal(f.$('ckCategory-'+category).getAttribute('aria-pressed'),'true');
  }
  assert.equal(f.mutations().length,0);
});
test('food and furniture change recipes in place and check the craft location at submission',()=>{
  const f=fixture();
  const ingredients=[{item:'mat_raw_wood_1',qty:1}];
  const base={path:'all',level:1,recipe:ingredients,craftGold:0};
  f.items.fish_soup={...base,name:'ต้มปลา',kind:'consumable',food:true,cookingLevel:1};
  f.items.grilled_fish={...base,name:'ปลาย่าง',kind:'consumable',food:true,cookingLevel:2};
  f.items.wood_wall={...base,name:'ผนังไม้',kind:'material',furniture:true};
  f.player.mapId='ritual_village';
  f.choose('all','blade_25');
  const picker=f.$('benchRecipe'), grid=f.$('craftRecipeGrid'), popup=f.$('craftRecipePopup');
  assert.equal(f.$('benchLevel').value,'25');
  const pending=f.wire.length;
  for(const [category,recipes] of [['food',['fish_soup','grilled_fish']],['furniture',['wood_wall']],['medicine',['potion_1']]]){
    f.$('ckCategory-'+category).click();
    assert.equal(f.ctx.drawerActive,'crafting');assert.equal(f.$('benchRecipe'),picker);
    assert.equal(f.$('craftRecipeGrid'),grid);assert.equal(f.$('craftRecipePopup'),popup);
    assert.equal(popup.open,false);assert.deepEqual(f.ids(),recipes);assert.equal(f.$('benchLevel').value,'auto');
    assert.equal(f.$('ckCategory-'+category).getAttribute('aria-pressed'),'true');
  }
  assert.equal(f.wire.length,pending,'changing tabs does not request another page or send a mutation');
  f.$('ckCategory-food').click();
  grid.children.find(card=>card.dataset.recipe==='grilled_fish').click();
  assert.equal(popup.open,true);assert.equal(f.$('benchCraft').disabled,true);
  assert.match(f.$('craftRequirements').children.at(-1).textContent,/เตาครัว.*ระดับ 2/);
  f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
  f.$('craftRecipePopupClose').click();
  f.$('ckCategory-furniture').click();grid.children[0].click();
  assert.equal(f.$('benchCraft').disabled,true);
  assert.match(f.$('craftRequirements').children.at(-1).textContent,/ผลิตที่เรือนส่วนตัว/);
  f.player.mapId='personal_home_'+'a'.repeat(32);
  f.run('renderCraftingPage()');assert.equal(f.$('benchCraft').disabled,false);
  f.player.mapId='ritual_village';
  f.$('benchCraft').onclick();assert.equal(f.mutations().length,0,'rechecks map before sending');
  f.callbacks.economy_error({reason:'home_build_location'});
  assert.match(f.$('craftActionStatus').textContent,/ผลิตในเรือนส่วนตัว/);
  f.$('craftRecipePopupClose').click();
  f.$('ckCategory-food').click();grid.children.find(card=>card.dataset.recipe==='fish_soup').click();
  assert.equal(f.$('benchCraft').disabled,false);
  f.$('benchCraft').click();assert.equal(f.mutations().length,1);
  assert.equal(f.mutations()[0].payload.recipeId,'fish_soup');
});
test('an empty home recipe category stays in the workbench and cannot submit the prior recipe',()=>{
  const f=fixture();f.choose('all','blade_25');f.$('ckCategory-furniture').click();
  assert.equal(f.ctx.drawerActive,'crafting');assert.deepEqual(f.ids(),[]);
  assert.equal(f.$('craftRecipeEmpty').hidden,false);
  assert.equal(f.$('craftRecipePopup').open,false);
  f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
  f.choose('kiln','mat_ingot_1');assert.equal(f.$('craftRecipeEmpty').hidden,true);
  f.$('benchCraft').click();assert.equal(f.mutations().length,1);
});
test('locked recipe cards describe actual level requirement, never pretend recipe learning exists',()=>{
  const f=fixture();f.choose('all','blade_50');
  const card=f.$('craftRecipeGrid').children.find(c=>c.children[1].textContent==='ดาบสูง');
  assert(card);assert.equal(card.classList.contains('locked'),true);assert.match(card.children[3].textContent,/ต้องการ Lv.50/);
  card.click();assert.equal(f.$('benchCraft').disabled,true);assert.match(f.$('craftRequirements').children[0].textContent,/✕.*25 \/ 50/);
  f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
});
test('material checks and card stock refresh from inventory; duplicate clicks still send once',()=>{
  const f=fixture();f.choose('all','blade_25');
  assert.equal(recipeIngredient(f,'mat_ingot_1').getAttribute('aria-label'),'ดูสูตรและที่มาของ แท่งเหล็ก · มี 2 / 2 · ครบ');
  const payload=f.payload();payload.slots[0].quantity=1;f.callbacks.inventory_state(payload);
  assert.equal(recipeIngredient(f,'mat_ingot_1').children[3].textContent,'ขาด 1');assert.equal(f.$('benchCraft').disabled,true);
  payload.slots[0].quantity=2;payload.slots[5]={itemId:'blade_25',quantity:1};f.callbacks.inventory_state(payload);
  assert.equal(recipeIngredient(f,'mat_ingot_1').children[3].textContent,'ครบ');
  const card=f.$('craftRecipeGrid').children.find(c=>c.children[1].textContent==='ดาบคู่');assert.equal(card.children[2].textContent,'มีอยู่ 1');
  f.$('benchCraft').click();f.$('benchCraft').onclick();assert.equal(f.mutations().length,1);
});
test('empty and reconnected catalogs clear grid and material requirements safely',()=>{
  const f=fixture();f.choose('all','blade_25');for(const item of Object.values(f.items))delete item.recipe;
  f.ctx.catalogRevision++;f.run('renderBag()');assert.equal(f.$('craftRecipeGrid').children.length,0);
  assert.equal(f.$('craftRequirements').children.length,0);assert.equal(f.$('benchCraft').disabled,true);
});
console.log(`PASS craft kitchen UI: ${tests} focused groups`);
