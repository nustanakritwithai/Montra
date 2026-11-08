// Exercise the real workbench functions, native-select model and existing wire guards.
const assert=require('node:assert/strict');
const {fixture}=require('./crafting-pages-ui-test.cjs');
let tests=0;const test=(name,fn)=>{fn();tests++;console.log('PASS '+name);};
test('craft kitchen shell names unsupported systems without fabricated skill or probability numbers',()=>{
  const f=fixture();f.run('openCraftingPage()');
  assert.match(f.ctx.title,/งานช่างและครัว/);assert.match(f.ctx.html,/เลือกของ → เตรียมวัสดุ → ลงมือสร้าง/);
  assert.match(f.ctx.html,/ทักษะทำอาหาร · เร็วๆ นี้/);assert.match(f.ctx.html,/โอกาสคุณภาพ.*เร็วๆ นี้/);
  assert(!f.ctx.html.includes('EXP 0/30'));assert(!f.ctx.html.includes('คิวงาน 0/3'));
  assert.equal(f.$('craftPlayerLevel').textContent,'ตัวละคร LV.25');
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
test('food/furniture coming-soon cannot craft hidden previous recipe; direct recipe routes recover',()=>{
  const f=fixture();f.choose('all','blade_25');
  for(const category of ['food','furniture']){
    f.$('ckCategory-'+category).click();assert.equal(f.$('craftComingSoon').hidden,false);
    assert.equal(f.$('craftRecipePane').hidden,true);assert.equal(f.$('craftDetailPane').hidden,true);
    assert.match(f.$('craftComingSoon').textContent,/เร็วๆ นี้/);f.$('benchCraft').onclick();
    assert.equal(f.mutations().length,0);
  }
  f.choose('kiln','mat_ingot_1');assert.equal(f.$('craftComingSoon').hidden,true);
  assert.equal(f.$('craftDetailPane').hidden,false);f.$('benchCraft').click();assert.equal(f.mutations().length,1);
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
  assert.equal(f.$('benchIngredients').children[0].children[2].getAttribute('aria-label'),'ครบ · 2 / 2');
  const payload=f.payload();payload.slots[0].quantity=1;f.callbacks.inventory_state(payload);
  assert.match(f.$('craftRequirements').children[1].textContent,/✕/);assert.equal(f.$('benchCraft').disabled,true);
  payload.slots[0].quantity=2;payload.slots[5]={itemId:'blade_25',quantity:1};f.callbacks.inventory_state(payload);
  assert.match(f.$('craftRequirements').children[1].textContent,/✓/);
  const card=f.$('craftRecipeGrid').children.find(c=>c.children[1].textContent==='ดาบคู่');assert.equal(card.children[2].textContent,'มีอยู่ 1');
  f.$('benchCraft').click();f.$('benchCraft').onclick();assert.equal(f.mutations().length,1);
});
test('empty and reconnected catalogs clear grid and material requirements safely',()=>{
  const f=fixture();f.choose('all','blade_25');for(const item of Object.values(f.items))delete item.recipe;
  f.ctx.catalogRevision++;f.run('renderBag()');assert.equal(f.$('craftRecipeGrid').children.length,0);
  assert.equal(f.$('craftRequirements').children.length,0);assert.equal(f.$('benchCraft').disabled,true);
});
console.log(`PASS craft kitchen UI: ${tests} focused groups`);
