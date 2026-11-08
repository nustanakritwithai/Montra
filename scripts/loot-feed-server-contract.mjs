// Run after prepare:combat with the locked verification project's tsx loader.
// Exercises real server inventory/reward rules against the shipped client observer.
// No external server, player account or saved character is touched.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeClassInventory,validateInventory,grantStackReward,grantRewardPotion,bankForgeCopy,equipBody,practiceLoot} from '../combat-verify/src/rooms/ItemRules.ts';
import {personalItem,startingWeapon,firstChest} from '../combat-verify/src/rooms/PersonalItems.ts';
const source=readFileSync(new URL('../src/client/ui/030-item-art-and-comparison.js',import.meta.url),'utf8');
const ctx={$:()=>null,bagMeta:personalItem,POTION_ITEM_ID:'health_potion',SHRINE_SHARD:'shrine_shard',clearTimeout(){},Date};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  let lootInventoryCounts =')),ctx);
const history=()=>JSON.parse(vm.runInContext('JSON.stringify(lootHistory)',ctx));
const observe=bag=>{assert(bag);validateInventory(bag);ctx.observeLootInventory(bag);};
for(const path of ['blade','seer','mender','sentinel','phutthaisawan','muay_boran']){
 ctx.resetLootFeed();let bag=makeClassInventory(path);bag.slots[2]={itemId:firstChest(path),quantity:1};observe(bag);assert.equal(history().length,0);
 bag=grantStackReward(bag,'mat_raw_wood_1');observe(bag);assert.equal(history().find(x=>x.id==='mat_raw_wood_1').quantity,1);
 bag=grantRewardPotion(bag);observe(bag);assert.equal(history().find(x=>x.id==='health_potion').quantity,1);
 const weapon=startingWeapon(path);bag=bankForgeCopy(bag,weapon);observe(bag);assert.equal(history().find(x=>x.id===weapon&&x.bank).quantity,1);
 const chest=firstChest(path);let slot=bag.slots.findIndex(x=>x?.itemId===chest);assert(slot>=0);
 const before=history();const equipped=equipBody(bag,'chest',slot,chest,path,100);assert.equal(equipped.ok,true);bag=equipped.inventory;observe(bag);assert.deepEqual(history(),before);
 const unequipped=equipBody(bag,'chest',null,chest,path,100);assert.equal(unequipped.ok,true);bag=unequipped.inventory;observe(bag);assert.deepEqual(history(),before);
 const drop=practiceLoot(bag,path,1,'normal',1,'possessed-1',()=>0);observe(drop.bag);const after=history();observe(drop.bag);assert.deepEqual(history(),after,'repeated server state does not repeat a reward');
 ctx.resetLootFeed();observe(drop.bag);assert.equal(history().length,0,'reconnect is baseline only');
}
const full={version:1,equippedWeaponSlot:null,slots:Array.from({length:12},()=>({itemId:'mat_raw_wood_1',quantity:99}))};
ctx.resetLootFeed();observe(full);assert.equal(grantStackReward(full,'shrine_shard'),null);observe(full);assert.equal(history().length,0);
console.log('PASS loot feed server contract: six classes, material/potion/smith grants, equip/unequip, practice loot, full bag, repeated snapshot/reconnect');
