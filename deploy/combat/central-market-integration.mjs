/** Private localhost server and disposable test characters only. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@colyseus/sdk';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const dir=await mkdtemp(path.join(os.tmpdir(),'montra-central-market-test-')),chars=path.join(dir,'characters');await mkdir(chars);
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const base=`http://127.0.0.1:${port}`,tokens=Array.from({length:3},()=>`mt1_${randomBytes(32).toString('hex')}`);
const request=()=>`market_test_${randomBytes(16).toString('hex')}`;
const options=token=>({guestToken:token,worldVersion:1,provinceVersion:1,atlasVersion:1,templeVersion:1,castleVersion:2,warVersion:1,atlasReliefVersion:1,originalReliefVersion:1});
let server,stderr='',stdout='',rooms=[];
function start(){
  const entry=process.env.MONTRA_CENTRAL_SERVER_SOURCE==='1'?['--import','tsx','src/index.ts']:['build/index.js'];
  const child=spawn(process.execPath,entry,{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',PORT:String(port),MONTRA_CHARACTER_DIR:chars,MONTRA_ACCOUNTS_REQUIRED:'0',MONTRA_ECONOMY_ENABLED:'1',MONTRA_WORLD_EXPANSION:'1',MONTRA_HUNT_EVENTS:'0',MONTRA_DIRECTOR_ENABLED:'0',MONTRA_DYNAMIC_BALANCE_FILE:''}});
  child.stdout.on('data',data=>stdout=(stdout+data).slice(-2500));child.stderr.on('data',data=>stderr=(stderr+data).slice(-2500));return child;
}
async function until(fn,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch{}await delay(50);}throw Error('timeout_'+label);}
async function boot(){server=start();await until(async()=>(await fetch(base+'/__healthcheck',{signal:AbortSignal.timeout(2500)})).ok,'health',60000);console.log('PASS: isolated server ready');}
async function connect(index){const room=await new Client(base).create('my_room',options(tokens[index]));room.reconnection.enabled=false;const events=[];room.onMessage('*',(type,data)=>events.push({type,data}));rooms.push(room);await until(()=>room.state?.players?.get(room.sessionId),'player');return {room,events};}
async function send(actor,type,payload,event,filter=()=>true){
  const offset=actor.events.length;actor.room.send(type,payload);
  const item=await until(()=>actor.events.slice(offset).find(x=>x.type===event || x.type==='economy_error' || x.type==='command_rejected'),'response_'+type);
  if(item.type!==event)throw Error(type+':'+item.data?.reason);assert.ok(filter(item.data));await delay(250);return item.data;
}
const browse=(actor,market,query,category,tag)=>send(actor,'market_browse',{market,query,category,before:null,ownOnly:false,tag},'market_page',m=>m.tag===tag);
try{
  await boot();const seller=await connect(0),buyer=await connect(1),bidder=await connect(2);
  for(const actor of [seller,buyer,bidder])await send(actor,'get_economy',{},'economy_state',m=>m.gold===1000);
  console.log('PASS: three players joined separate rooms');
  const fixed=await send(seller,'market_create',{requestId:request(),slot:0,amount:1,price:200},'market_result');
  const page=await browse(buyer,'fixed','ยา','consumable',1);assert.ok(page.listings.some(x=>x.id===fixed.listingId));
  const buyId=request();await send(buyer,'market_buy',{requestId:buyId,listingId:fixed.listingId},'market_result');
  await send(buyer,'market_buy',{requestId:buyId,listingId:fixed.listingId},'market_result');
  await send(seller,'get_economy',{},'economy_state',m=>m.gold===1200);
  console.log('PASS: fixed sale visible across rooms');
  const auction=await send(seller,'auction_create',{requestId:request(),slot:0,amount:1,opening:100,durationHours:1},'market_action_result');
  const listings=await browse(buyer,'auction','ยา','consumable',2);assert.ok(listings.auctions.some(x=>x.id===auction.auctionId));
  await send(buyer,'auction_bid',{requestId:request(),auctionId:auction.auctionId,amount:100},'market_action_result');
  const bidId=request();await send(bidder,'auction_bid',{requestId:bidId,auctionId:auction.auctionId,amount:150},'market_action_result');
  await send(bidder,'auction_bid',{requestId:bidId,auctionId:auction.auctionId,amount:150},'market_action_result');
  await send(buyer,'get_economy',{},'economy_state',m=>m.gold===800);
  const db=new DatabaseSync(path.join(chars,'economy.sqlite'));try{db.prepare('UPDATE auctions SET ends_at=? WHERE id=?').run(Date.now()-1,auction.auctionId);}finally{db.close();}
  await send(seller,'market_overview',{},'market_overview');await send(seller,'get_economy',{},'economy_state',m=>m.gold===1350);
  const mine=await send(bidder,'market_overview',{},'market_overview');assert.ok(mine.auctions.some(x=>x.id===auction.auctionId && x.canClaim));
  const claim=request();await send(bidder,'auction_claim',{requestId:claim,auctionId:auction.auctionId},'market_action_result');
  await send(bidder,'auction_claim',{requestId:claim,auctionId:auction.auctionId},'market_action_result');
  const supply=request();await send(buyer,'starter_supply_buy',{requestId:supply,item:'mat_raw_wood_1',quantity:2},'market_action_result');
  await send(buyer,'starter_supply_buy',{requestId:supply,item:'mat_raw_wood_1',quantity:2},'market_action_result');
  const overview=await send(buyer,'market_overview',{},'market_overview');assert.equal(overview.supply.items.find(x=>x.item==='mat_raw_wood_1').personalRemaining,18);
  await send(buyer,'get_economy',{},'economy_state',m=>m.gold===780);console.log('PASS: auction and starter reserve settled');
  for(const actor of rooms.reverse())await actor.leave();rooms=[];const exited=once(server,'exit');server.kill();await exited;
  await boot();const sellerAfter=await connect(0),buyerAfter=await connect(1),bidderAfter=await connect(2);
  await send(sellerAfter,'get_economy',{},'economy_state',m=>m.gold===1350);
  await send(buyerAfter,'get_economy',{},'economy_state',m=>m.gold===780);
  await send(bidderAfter,'get_economy',{},'economy_state',m=>m.gold===850);
  const after=await send(bidderAfter,'market_overview',{},'market_overview');assert.ok(!after.auctions.some(x=>x.id===auction.auctionId && x.canClaim));
  console.log('PASS: fixed sale, auction escrow/refund/claim and limited reserve work across separate rooms, retries and process restart');
}catch(error){throw Error(error.message+'\n'+stderr+'\n'+stdout);}
finally{for(const room of rooms.reverse())await room.leave().catch(()=>{});if(server)server.kill();}
