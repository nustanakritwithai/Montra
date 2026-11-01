/** Isolated localhost server and disposable character data only. */
import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR, stage=process.env.MONTRA_ECONOMY_TEST_STAGE;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url||"") || !dir || !/^montra-economy-test-/.test(path.basename(dir)) || !["write","read"].includes(stage)) throw new Error("economy test requires isolated localhost and montra-economy-test-* directory");
const token=(ch)=>"mt1_"+ch.repeat(64), request=(n)=>"economy_test_"+String(n).padStart(16,"0");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=7000){ const end=Date.now()+ms; while(Date.now()<end){const x=fn();if(x)return x;await sleep(30);} throw new Error("timeout: "+label); }
const rooms=[];
function monitor(room){const events=[]; for(const name of ["economy_state","inventory_state","market_result","market_state","trade_update","trade_complete","economy_error","command_rejected"]) room.onMessage(name,data=>events.push({name,data})); return events;}
const last=(events,name,predicate=()=>true)=>events.findLast(e=>e.name===name&&predicate(e.data))?.data;
try {
  const a=await new Client(url).create("my_room",{guestToken:token("a")});rooms.push(a);const ae=monitor(a);
  const b=await new Client(url).joinById(a.roomId,{guestToken:token("b")});rooms.push(b);const be=monitor(b);
  await until(()=>a.state?.economyAvailable&&a.state.players.size===2,"economy room");
  a.send("get_economy",{}); b.send("get_economy",{});
  await until(()=>last(ae,"economy_state")&&last(be,"economy_state"),"balances");
  if(stage==="write") {
    assert.equal(last(ae,"economy_state").gold,1000); assert.equal(last(be,"economy_state").gold,1000);
    a.send("market_create",{requestId:request(1),slot:0,amount:1,price:200});
    const listing=await until(()=>last(ae,"market_result",m=>m.action==="create"),"listing");
    b.send("market_buy",{requestId:request(2),listingId:listing.listingId});
    await until(()=>last(be,"market_result",m=>m.action==="buy"),"purchase");
    assert.equal(last(be,"economy_state").gold,800); assert.equal(last(be,"inventory_state").slots[0].quantity,4);
    a.send("trade_request",{targetId:b.sessionId});
    const offer=await until(()=>last(ae,"trade_update"),"trade invitation");
    a.send("trade_offer",{tradeId:offer.tradeId,slot:0,amount:1,gold:0});
    b.send("trade_offer",{tradeId:offer.tradeId,slot:null,amount:0,gold:100});
    await until(()=>last(ae,"trade_update",m=>m.own&&m.other),"both offers");
    a.send("trade_confirm",{tradeId:offer.tradeId});
    await until(()=>last(be,"trade_update",m=>m.otherConfirmed),"first confirmation");
    assert.equal(last(ae,"trade_complete"),undefined,"one confirmation must not transfer assets");
    const updateCount=ae.filter(e=>e.name==="trade_update").length;
    b.send("trade_offer",{tradeId:offer.tradeId,slot:null,amount:0,gold:100});
    await until(()=>ae.filter(e=>e.name==="trade_update").length>updateCount && !last(ae,"trade_update").ownConfirmed && !last(ae,"trade_update").otherConfirmed,"changed offer resets confirmations");
    a.send("trade_confirm",{tradeId:offer.tradeId}); b.send("trade_confirm",{tradeId:offer.tradeId});
    await until(()=>last(ae,"trade_complete")&&last(be,"trade_complete"),"trade completion");
    assert.equal(last(ae,"economy_state").gold,1300); assert.equal(last(be,"economy_state").gold,700);
    assert.equal(last(ae,"inventory_state").slots[0].quantity,1); assert.equal(last(be,"inventory_state").slots[0].quantity,5);
    console.log("PASS: live market and mutually confirmed player trade commit wallet and inventory");
  } else {
    assert.equal(last(ae,"economy_state").gold,1300); assert.equal(last(be,"economy_state").gold,700);
    assert.equal(last(ae,"inventory_state").slots[0].quantity,1); assert.equal(last(be,"inventory_state").slots[0].quantity,5);
    console.log("PASS: market and trade balances and inventories survive restart");
  }
} finally { for(const room of rooms.reverse()) await room.leave().catch(()=>{}); }
