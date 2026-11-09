/** Committed inventory -> read-only pickup UI. No rewards are inferred from clicks or EXP. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/client/ui/030-item-art-and-comparison.js'),feed=source.slice(source.indexOf('  let lootInventoryCounts ='));
const network=read('src/client/network/044-state-sync-and-connection.js');
const handler=network.slice(network.indexOf('      joined.onMessage("inventory_state"'),network.indexOf('      joined.onMessage("weapon_equipped"'));
function node(tag='div'){return {tagName:tag.toUpperCase(),hidden:false,children:[],attributes:{},textContent:'',append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},setAttribute(k,v){this.attributes[k]=v;}};}
function fixture(){
 let now=1000,timerId=0;const timers=new Map(),callbacks={},nodes=new Map(['lootFeed','lootHistoryList','lootHistoryEmpty'].map(k=>[k,node()]));
 const catalog={wood:{name:'ไม้ดิบ',kind:'material'},ore:{name:'แร่',kind:'material'},sword:{name:'ดาบ',kind:'mainHand'},ring:{name:'แหวน',kind:'ring'},card:{name:'การ์ด',kind:'card'}};
 const room={onMessage:(name,fn)=>callbacks[name]=fn};
 const ctx={document:{createElement:node},$:id=>nodes.get(id)||null,mode:'live',Date:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,at:now+ms});return timerId;},clearTimeout:id=>timers.delete(id),
  bagMeta:id=>catalog[id]||null,createItemTile:id=>{const tile=node();tile.itemId=id;return tile;},POTION_ITEM_ID:'health_potion',SHRINE_SHARD:'shrine_shard',INVENTORY_SLOTS:12,
  joined:room,room,personalItems:catalog,catalogRevision:0,drawerActive:null,workbenchGold:0,cardDrill:null,refineInput:2,inventoryState:null,itemUsePending:false,
  wearPositions:kind=>kind==='ring'?['leftRing','rightRing']:[],renderBag(){},renderEconomy(){},refreshOpenFieldQuest(){assert.notEqual(ctx.drawerActive,'quest','quest details use their dedicated receipt fixture');}};
 vm.createContext(ctx);vm.runInContext(feed+handler,ctx);
 const state=()=>JSON.parse(vm.runInContext('JSON.stringify(lootHistory)',ctx));
 const send=p=>callbacks.inventory_state(structuredClone(p));
 return {ctx,nodes,timers,state,send,catalog,run:code=>vm.runInContext(code,ctx),advance(ms){now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
function bag(items=[],extra={}){return {version:1,slots:[...items,...Array(12-items.length).fill(null)],equippedWeaponSlot:null,...extra};}
const stack=(itemId,quantity=1,extra={})=>({itemId,quantity,...extra});
let tests=0;function test(name,fn){fn();tests++;console.log('PASS '+name);}
test('login baseline, committed quantity gains, repeated snapshots and full bags',()=>{
 const f=fixture(),p=bag([stack('wood',3)]);f.send(p);assert.equal(f.state().length,0);
 p.slots[0].quantity=5;f.send(p);assert.deepEqual(f.state().map(x=>[x.id,x.quantity]),[['wood',2]]);
 f.send(p);assert.equal(f.state()[0].quantity,2);assert.equal(f.timers.size,1);
 // A rejected/full-bag pickup has no changed inventory and cannot create a row.
 f.send(p);assert.equal(f.state().length,1);
 p.slots[1]=stack('wood',4);p.slots[2]=stack('ore',2);f.send(p);
 assert.deepEqual(f.state().map(x=>[x.id,x.quantity]),[['ore',2],['wood',6]]);
 const count=f.state().length;f.send({...p,version:2});f.send({...p,slots:[]});assert.equal(f.state().length,count);
});
test('equip, unequip, slot reorder, card installation/removal and smith claims are not loot',()=>{
 const f=fixture();f.send(bag([stack('ring'),stack('card'),stack('sword')],{forgeCopies:{sword:2}}));
 f.send(bag([null,null,stack('sword')],{equipment:{leftRing:'ring'},equipmentSockets:{leftRing:'card'},forgeCopies:{sword:2}}));
 f.send(bag([stack('ring',1,{socket:'card'}),stack('sword'),stack('sword')],{forgeCopies:{sword:1}}));
 f.send(bag([stack('card'),stack('ring'),stack('sword'),stack('sword')],{forgeCopies:{sword:1}}));
 assert.equal(f.state().length,0);
});
test('bank rewards show destination, and losses followed by new gains still count',()=>{
 const f=fixture();f.send(bag([stack('wood',3)],{forgeCopies:{sword:1}}));
 f.send(bag([stack('wood',2)],{forgeCopies:{sword:2}}));assert.deepEqual(f.state().map(x=>[x.id,x.quantity,x.bank]),[['sword',1,true]]);
 f.send(bag([stack('wood',4)],{forgeCopies:{sword:2}}));assert.deepEqual(f.state().map(x=>[x.id,x.quantity]),[['wood',2],['sword',1]]);
 assert.equal(f.nodes.get('lootFeed').children[1].children[1].children[1].children[1].textContent,'เข้าคลังช่าง');
});
test('unknown catalog items never become fake gains when metadata arrives',()=>{
 const f=fixture();const p=bag([stack('late',4)]);f.send(p);f.catalog.late={name:'ข้อมูลมาทีหลัง',kind:'material'};f.send(p);assert.equal(f.state().length,0);
 p.slots[0].quantity=5;f.send(p);assert.equal(f.state()[0].quantity,1);
});
test('reconnect, character changes and stale-room messages cannot replay old possessions',()=>{
 const f=fixture();f.send(bag());f.send(bag([stack('wood')]));f.ctx.resetLootFeed();
 assert.equal(f.state().length,0);assert.equal(f.nodes.get('lootFeed').hidden,true);assert.equal(f.nodes.get('lootHistoryList').children.length,0);assert.equal(f.timers.size,0);
 f.send(bag([stack('wood',90)]));assert.equal(f.state().length,0);
 f.ctx.room={};f.send(bag([stack('wood',99)]));assert.equal(f.state().length,0);
 assert.match(network,/resetLootFeed\(\);\s*inventoryState = null/);
 assert.match(read('src/client/combat/038-demo-and-monster-state.js'),/function showDemo\(\)[\s\S]*?resetLootFeed\(\)/);
});
test('feed expires, history survives, bursts coalesce, and history is bounded',()=>{
 const f=fixture();f.send(bag());f.send(bag([stack('wood')]));f.advance(4000);f.send(bag([stack('wood',2)]));assert.equal(f.state()[0].quantity,2);
 f.advance(8000);assert.equal(f.nodes.get('lootFeed').hidden,true);assert.equal(f.nodes.get('lootHistoryList').children.length,1);
 for(let i=3;i<=26;i++){f.send(bag([stack('wood',i)]));f.advance(8001);}
 assert.equal(f.state().length,20);assert.equal(f.state()[0].quantity,1);assert.equal(f.nodes.get('lootHistoryList').children.length,20);
 f.ctx.mode='demo';f.ctx.resetLootFeed();assert.match(f.nodes.get('lootHistoryEmpty').textContent,/ออนไลน์/);
});
test('malformed counts and prototype-like IDs cannot generate notifications',()=>{
 const f=fixture();f.send(bag());f.send(bag([stack('wood',-1),stack('ore',Infinity),stack('__proto__',1),stack('sword',1.5)]));assert.equal(f.state().length,0);
});
test('malformed counts preserve the last valid baseline',()=>{
 const f=fixture();f.send(bag([stack('wood',3)]));f.send(bag([stack('wood',100)]));f.send(bag([stack('wood',3)]));assert.equal(f.state().length,0);
 f.send(bag([stack('wood',3)],{forgeCopies:{sword:100}}));f.send(bag([stack('wood',3)]));assert.equal(f.state().length,0);
});
test('notification is wired only to confirmed inventory, never EXP or resource success messages',()=>{
 assert.equal((network.match(/observeLootInventory\(payload\)/g)||[]).length,1);
 assert.match(handler,/room !== joined/);assert.match(handler,/Array\.isArray\(payload.slots\)/);
 assert.match(read('index.html'),/id="lootFeed"[^>]*aria-live="polite"[^>]*hidden/);
 assert.match(read('index.html'),/styles\.css\?v=nested-recipes-20261108-attack-button-20261108-loot-feed-20261108/,'loot styling has a distinct cache key after the attack-only release');
 assert.match(read('src/client/ui/054-forge-feedback-and-pages.js'),/id="lootHistoryList"/);
 assert(!feed.includes('room.send'));assert(!feed.includes('innerHTML'));assert(!feed.includes('localStorage'));
});
if(require.main===module)console.log(`PASS loot feed: ${tests} groups`);
module.exports={fixture,bag,stack};
