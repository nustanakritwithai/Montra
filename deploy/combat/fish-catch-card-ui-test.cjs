const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,'missing boundary: '+start);return source.slice(a,b);};
const cardCode=slice('  const FISH_TIERS=','  addEventListener("keydown",e=>{const card=$("fishCatchCard")');
const handler=slice('joined.onMessage("fish_result",','joined.onMessage("resource_atlas"');
let n=0;const test=(name,fn)=>{fn();n++;console.log('PASS '+name);};
function fixture(inv){
  const els=new Map(),toasts=[],cb={};const el=()=>({textContent:'',hidden:true,dataset:{},focus(){this.focused=true;}});
  for(const id of ['fishCatchCard','fishCatchName','fishCatchMeta','fishCatchPrice','fishCatchReward','fishCatchNote','fishCatchKeep'])els.set(id,el());
  const ctx={$:id=>els.get(id)||null,toasts,cb,inventoryState:inv,fishSavedItem:null,room:null,
    personalItems:{mat_fish_common:{name:'ปลาช่อน',sellGold:3},mat_fish_silver:{name:'ปลาตะเพียนเงิน',sellGold:7},mat_fish_spirit:{name:'ปลาวิญญาณ',sellGold:18}},
    toast:m=>toasts.push(m),clearFishing(){},renderBag(){}};
  vm.createContext(ctx);vm.runInContext(cardCode+'\nthis.show=showFishCatchCard;this.hide=hideFishCatchCard;',ctx);
  const joined={onMessage:(t,f)=>{cb[t]=f;}};ctx.joined=joined;ctx.room=joined;
  vm.runInContext(handler,ctx);
  return {ctx,els,toasts,fire:d=>cb.fish_result(d)};
}
test('markup keeps catch card ids and marks unsupported fields',()=>{
  for(const id of ['fishCatchCard','fishCatchKeep','fishCatchRelease','fishCatchPrice'])assert(index.includes('id="'+id+'"'));
  assert.match(index,/id="fishCatchRelease"[^>]*disabled/);assert.equal((index.match(/<b>เร็วๆ นี้<\/b>/g)||[]).length,2);
});
test('caught fish shows name, tier, real sell price and bag count',()=>{
  const f=fixture({slots:[{itemId:'mat_fish_spirit',quantity:2},null,{itemId:'mat_fish_spirit',quantity:1}]});
  f.fire({result:'caught',item:'mat_fish_spirit',quantity:1,pending:false});
  const e=f.els;assert.equal(e.get('fishCatchCard').hidden,false);assert.equal(e.get('fishCatchName').textContent,'ปลาวิญญาณ');
  assert.equal(e.get('fishCatchCard').dataset.tone,'epic');assert.match(e.get('fishCatchMeta').textContent,/ล้ำค่า · ★★★ · โอกาส 5%/);
  assert.equal(e.get('fishCatchPrice').textContent,'🪙 18');assert.equal(e.get('fishCatchReward').textContent,'+1 · มีในกระเป๋า 3');
  assert.equal(e.get('fishCatchNote').hidden,true);assert.match(f.toasts[0],/ตกได้ ปลาวิญญาณ/);
});
test('pending catch shows bag-full note without bag count',()=>{
  const f=fixture({slots:[]});f.fire({result:'caught',item:'mat_fish_common',quantity:1,pending:true});
  assert.equal(f.els.get('fishCatchNote').hidden,false);assert.equal(f.els.get('fishCatchReward').textContent,'+1');assert.equal(f.ctx.fishSavedItem,'mat_fish_common');
});
test('failed or cancelled reels do not open the card; keep hides it',()=>{
  const f=fixture({slots:[]});for(const result of ['escaped','broken','interrupted','cancelled'])f.fire({result});
  assert.equal(f.els.get('fishCatchCard').hidden,true);
  f.fire({result:'claimed',item:'mat_fish_silver',quantity:1});assert.equal(f.els.get('fishCatchCard').hidden,false);
  f.ctx.hide();assert.equal(f.els.get('fishCatchCard').hidden,true);
});
console.log('fish catch card fixture: '+n+' assertions');
