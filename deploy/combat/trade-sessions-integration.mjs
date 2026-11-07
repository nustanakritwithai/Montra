/** Read/write only disposable local test characters. No production endpoint accepted. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {Client} from '@colyseus/sdk';
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url||'')||!/^montra-economy-test-/.test(path.basename(dir||'')))throw Error('isolated economy test directory and localhost required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<200;i++){const result=fn();if(result)return result;await sleep(40);}throw Error('timeout: '+label);}
const actors=[];
async function connect(char,roomId){const client=new Client(url),options={guestToken:'mt1_'+char.repeat(64)};
 const room=roomId?await client.joinById(roomId,options):await client.create('my_room',options);room.reconnection.enabled=false;
 const events=[];room.onMessage('*',(type,data)=>events.push({type,data}));const actor={room,events};actors.push(actor);return actor;
}
async function send(actor,type,data,event){const offset=actor.events.length;actor.room.send(type,data);const result=await until(()=>actor.events.slice(offset).find(e=>[event,'economy_error','command_rejected'].includes(e.type)),type);assert.equal(result.type,event,JSON.stringify(result));await sleep(220);return result.data;}
try{
 const a=await connect('d'),b=await connect('e',a.room.roomId),c=await connect('f',a.room.roomId);
 await until(()=>a.room.state?.players?.size===3,'three players');
 const before=[];for(const actor of [a,b,c])before.push(await send(actor,'get_economy',{},'economy_state'));
 let trade=await send(a,'trade_request',{targetId:b.room.sessionId},'trade_update');
 const offset=c.events.length;c.room.send('trade_cancel',{tradeId:trade.tradeId});await until(()=>c.events.slice(offset).some(e=>e.type==='command_rejected'&&e.data.reason==='trade_unavailable'),'non-member denied');
 await send(a,'trade_offer',{tradeId:trade.tradeId,slot:0,amount:1,gold:0},'trade_update');
 await send(b,'trade_offer',{tradeId:trade.tradeId,slot:null,amount:0,gold:100},'trade_update');
 await send(a,'trade_confirm',{tradeId:trade.tradeId},'trade_update');
 await send(b,'trade_cancel',{tradeId:trade.tradeId},'trade_cancelled');
 for(const [i,actor] of [a,b,c].entries())assert.deepEqual(await send(actor,'get_economy',{},'economy_state'),before[i]);
 assert.ok(!actors.some(x=>x.events.some(e=>e.type==='trade_complete')));
 trade=await send(a,'trade_request',{targetId:b.room.sessionId},'trade_update');
 await b.room.leave();actors.splice(actors.indexOf(b),1);await until(()=>a.events.some(e=>e.type==='trade_cancelled'&&e.data.tradeId===trade.tradeId),'disconnect cancellation');
 const next=await send(a,'trade_request',{targetId:c.room.sessionId},'trade_update');
 assert.notEqual(next.tradeId,trade.tradeId);await send(c,'trade_cancel',{tradeId:next.tradeId},'trade_cancelled');
 console.log('PASS: three-client non-member rejection, cancel after readiness, unchanged assets, disconnect and new session');
}finally{for(const actor of actors.reverse())await actor.room.leave().catch(()=>{});}
