import test from "node:test";
import assert from "node:assert/strict";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {LegacyTradeRoom} from "./trade-sessions-oracle.js";
import {characterStore} from "./CharacterStore.js";
Object.defineProperty(characterStore,"economy",{value:{getAccount:()=>({gold:1000}),trade:()=>({})}});
const tradeId="00000000-0000-4000-8000-000000000001";
function fixture(Original:boolean){
 const r:any=Original?new LegacyTradeRoom():new MyRoom(),events:any[]=[];
 r.economyAction=(c:any,fn:any)=>fn(c.sessionId);r.economyId=(c:any)=>c.sessionId;r.bladeHiddenFrom=()=>false;
 r.reject=(c:any,reason:string)=>events.push([c.sessionId,"reject",reason]);r.syncEconomy=(c:any)=>events.push([c.sessionId,"sync"]);
 for(const id of ["aaaaaa","bbbbbb","cccccc"]){r.clients.push({sessionId:id,send:(event:string,data:any)=>events.push([id,event,data])});r.state.players.set(id,new Player({alive:true,mapId:"m",x:0,y:0,z:0,characterName:id}));r.inventories.set(id,{slots:[{itemId:"metal",quantity:3}],equippedWeaponSlot:null});}
 const a=r.clients[0],b=r.clients[1],c=r.clients[2];
 r.messages.trade_request(a,{targetId:"bbbbbb"});const id=events[0][2].tradeId;events.length=0;
 return {r,events,a,b,c,id};
}
function behavior(original:boolean){
 const {r,events,a,b,c,id}=fixture(original);const trade=r.tradeFor(a,id);
 assert.equal(r.tradeFor(b,id),trade);r.simulatedMs=60000;r.tradeFor(c,id);assert.equal(r.tradeFor(a,id),null);
 assert.deepEqual(events,[["cccccc","reject","trade_unavailable"],["aaaaaa","reject","trade_expired"]]);
 r.simulatedMs=0;events.length=0;r.messages.trade_request(a,{targetId:"bbbbbb"});const next=(events[0][2] as any).tradeId;events.length=0;
 const t=r.tradeFor(a,next);t.confirmed.add("bbbbbb");
 r.messages.trade_offer(a,{tradeId:next,slot:0,amount:2,gold:0});assert.equal(r.tradeFor(a,next),t);assert.equal(t.confirmed.size,0);assert.equal(t.items.aaaaaa.quantity,2);assert.equal(r.inventories.get("aaaaaa").slots[0].quantity,3);
 r.messages.trade_offer(b,{tradeId:next,slot:null,amount:0,gold:0});
 r.messages.trade_confirm(a,{tradeId:next});assert.equal(t.confirmed.has("aaaaaa"),true);
 r.inventories.get("aaaaaa").slots[0].quantity=4;assert.throws(()=>r.messages.trade_confirm(b,{tradeId:next}),/invalid_trade/);assert.equal(t.confirmed.size,0);
 r.messages.trade_offer(a,{tradeId:next,slot:0,amount:2,gold:0});r.messages.trade_confirm(a,{tradeId:next});
 const saved=characterStore.economy.trade;characterStore.economy.trade=()=>{assert.equal(r.tradeFor(a,next),t);throw Error("disk_failure");};
 try{assert.throws(()=>r.messages.trade_confirm(b,{tradeId:next}),/disk_failure/);assert.equal(t.confirmed.size,2);assert.equal(r.tradeFor(a,next),t);}finally{characterStore.economy.trade=saved;}
 events.length=0;characterStore.economy.trade=()=>{events.push(["commit"]);return {} as any;};
 try{r.messages.trade_confirm(b,{tradeId:next});}finally{characterStore.economy.trade=saved;}
 assert.deepEqual(events.map(e=>e.slice(0,2)),[["commit"],["aaaaaa","sync"],["bbbbbb","sync"],["aaaaaa","trade_complete"],["bbbbbb","trade_complete"]]);
 assert.equal(r.tradeFor(a,next),null);
 return JSON.parse(JSON.stringify(events).replaceAll(next,tradeId));
}
test("original trade room preserves membership-before-expiry, live records, readiness invalidation and commit-before-notice",()=>{
 const get=characterStore.economy.getAccount;characterStore.economy.getAccount=()=>({gold:1000}) as any;
 try{assert.deepEqual(behavior(false),behavior(true));}finally{characterStore.economy.getAccount=get;}
});
test("original cancellation consumes before notify; send failure does not block peer",()=>{
 for(const original of [true,false]){const {r,a,b,id,events}=fixture(original);a.send=()=>{assert.equal(r.tradeFor(a,id),null);throw Error("disconnect");};r.messages.trade_cancel(b,{tradeId:id});assert.equal(events.at(-1)[0],"bbbbbb");assert.equal(events.at(-1)[1],"trade_cancelled");}
});

import {TradeSessions} from "./TradeSessions.js";
function registry(owner:TradeSessions):Map<string,any>{return (owner as any).sessions;}
test("live expiry clock reads and leave callback insertion, reentry, deletion-before-notice and exceptions",()=>{
 const o=new TradeSessions();o.issue("one","a","b",10);o.issue("two","a","c",20);let reads=0;
 o.expire(()=>++reads===1?10:20);assert.equal(reads,2);assert.equal(registry(o).size,0);
 o.issue("one","a","b",10);o.issue("two","a","c",20);const events:string[]=[];
 o.leave("a",t=>{assert.equal(registry(o).has(t.id),false);events.push(t.id);if(t.id==="one")o.issue("three","a","d",30);});
 assert.deepEqual(events,["one","two","three"]);
 o.issue("one","a","b",10);o.issue("two","a","c",20);
 assert.throws(()=>o.leave("a",()=>{throw Error("callback");}),/callback/);assert.deepEqual([...registry(o).keys()],["two"]);
 o.leave("a",()=>o.leave("a",()=>assert.fail("already deleted")));assert.equal(registry(o).size,0);
 let clockReads=0;o.lookup("wrong","absent",()=>{clockReads++;return 0;},()=>{});assert.equal(clockReads,0);
});
test("700 seeded state transitions retain session, offer, Set identities and insertion order versus old map operations",()=>{
 const o=new TradeSessions(),old=new Map<string,any>();let seed=871;let now=0;
 const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<700;i++){
  const id=String(random(12)),member=String(random(5)),op=random(10);now+=random(3);
  const x=registry(o).get(id),y=old.get(id);
  if(op===0){const b=String(random(5)),expires=now+random(20);o.issue(id,member,b,expires);old.set(id,{id,a:member,b,expires,offers:{},items:{},fingerprints:{},confirmed:new Set()});}
  if(op===1){o.expire(()=>now);for(const [k,t]of old)if(now>=t.expires)old.delete(k);}
  if(op===2){const actual:string[]=[],expected:string[]=[];const result=o.lookup(member,id,()=>now,r=>actual.push(r));let wanted=y;if(!y||(y.a!==member&&y.b!==member)){expected.push("trade_unavailable");wanted=null;}else if(now>=y.expires){old.delete(id);expected.push("trade_expired");wanted=null;}assert.deepEqual(actual,expected);assert.equal(result?.id,wanted?.id);}
  if(op===3&&x&&y){const offer={slot:null,amount:0,gold:random(10)},item=null,set=x.confirmed;o.setFingerprint(x,member,String(now));y.fingerprints[member]=String(now);o.setOffer(x,member,item,offer);y.items[member]=item;y.offers[member]=offer;y.confirmed.clear();assert.equal(x.offers[member],offer);assert.equal(x.confirmed,set);assert.equal(registry(o).get(id),x);}
  if(op===4&&x&&y){o.confirm(x,member);y.confirmed.add(member);}
  if(op===5&&x&&y){o.resetReadiness(x);y.confirmed.clear();}
  if(op===6){o.remove(id);old.delete(id);}
  if(op===7){const a:string[]=[],b:string[]=[];o.leave(member,t=>a.push(t.id));for(const t of old.values())if(t.a===member||t.b===member){old.delete(t.id);b.push(t.id);}assert.deepEqual(a,b);}
  if(op===8)assert.equal(o.hasParticipant(member,id),[...old.values()].some(t=>[t.a,t.b].includes(member)||[t.a,t.b].includes(id)));
  if(op===9&&i%31===0){o.clear();old.clear();}
  assert.deepEqual([...registry(o)],[...old]);
 }
});
test("failed snapshot and inventory accessor retain the old partial mutation and do not clear readiness",()=>{
 for(const original of [true,false]){
  const {r,a,id}=fixture(original),t=r.tradeFor(a,id);t.confirmed.add("bbbbbb");
  r.tradeSnapshot=()=>{throw Error("snapshot");};assert.throws(()=>r.messages.trade_offer(a,{tradeId:id,slot:0,amount:1,gold:0}),/snapshot/);assert.equal(t.fingerprints.aaaaaa,undefined);assert.equal(t.confirmed.size,1);
  r.tradeSnapshot=()=>"new fingerprint";r.inventories.get=()=>{throw Error("inventory");};
  assert.throws(()=>r.messages.trade_offer(a,{tradeId:id,slot:0,amount:1,gold:0}),/inventory/);assert.equal(t.fingerprints.aaaaaa,"new fingerprint");assert.equal(t.offers.aaaaaa,undefined);assert.equal(t.confirmed.size,1);
 }
});
test("post-commit sync error leaves session removed and no completion; confirm snapshot error retains readiness",()=>{
 for(const original of [true,false]){
  const {r,a,b,id,events}=fixture(original),t=r.tradeFor(a,id);
  for(const client of [a,b])r.messages.trade_offer(client,{tradeId:id,slot:null,amount:0,gold:0});
  r.messages.trade_confirm(a,{tradeId:id});r.tradeSnapshot=()=>{throw Error("snapshot_error");};
  assert.throws(()=>r.messages.trade_confirm(b,{tradeId:id}),/snapshot_error/);assert.equal(t.confirmed.size,1);
  r.tradeSnapshot=()=>"no_item";r.syncEconomy=()=>{throw Error("sync_error");};events.length=0;
  assert.throws(()=>r.messages.trade_confirm(b,{tradeId:id}),/sync_error/);assert.equal(r.tradeFor(a,id),null);assert.ok(!events.some(e=>e[1]==="trade_complete"));
 }
});
test("invalid request still prunes expired sessions silently before target validation",()=>{
 for(const original of [true,false]){
  const {r,a,id,events}=fixture(original);r.simulatedMs=60000;events.length=0;
  assert.throws(()=>r.messages.trade_request(a,{targetId:"absent"}),/invalid_trade/);assert.deepEqual(events,[]);
  r.simulatedMs=0;assert.equal(r.tradeFor(a,id),null);assert.equal(events[0][2],"trade_unavailable");
 }
});
