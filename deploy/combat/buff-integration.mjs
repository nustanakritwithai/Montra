/** Only run against a disposable localhost and montra-buff-test-* character dir. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client } from "@colyseus/sdk";
const endpoint=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint||"") || !dir || !/^montra-buff-test-/.test(path.basename(dir)))throw new Error("requires isolated localhost and montra-buff-test- data");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=8000){const end=Date.now()+ms;while(Date.now()<end){const v=fn();if(v)return v;await sleep(40);}throw Error("timeout: "+label);}
const token="mt1_"+randomBytes(32).toString("hex"), rooms=[];
try {
  const client=new Client(endpoint), a=await client.create("my_room",{guestToken:token});rooms.push(a);
  const events=[];a.onMessage("*",(type,data)=>events.push({type,data}));
  const reject=reason=>events.some(e=>e.type==="command_rejected"&&e.data.reason===reason);
  const me=()=>a.state.players.get(a.sessionId);
  await until(()=>a.state?.buffsAvailable && me()?.persistent,"player ready");
  const base={atk:me().atk,def:me().def,magicAtk:me().magicAtk,magicDef:me().magicDef,maxHp:me().maxHp};
  a.send("possess",{});await until(()=>reject("possession_needs_summon"),"requires summon");
  a.send("summon",{});await until(()=>a.state.summons.has(a.sessionId),"summoned");
  a.send("possess",{});await until(()=>me().possessionActive && !a.state.summons.has(a.sessionId),"possession started");
  assert.equal(me().atk,Math.round(base.atk*1.2));assert.equal(me().def,Math.round(base.def*1.2));
  assert.equal(me().magicAtk,Math.round(base.magicAtk*1.2));assert.equal(me().magicDef,Math.round(base.magicDef*1.2));assert.equal(me().maxHp,base.maxHp);
  await sleep(650);a.send("summon",{});await until(()=>reject("possession_active"),"no concurrent summon");
  await sleep(1600);a.send("possess",{});await until(()=>!me().possessionActive && me().atk===base.atk && me().def===base.def,"cancel returns baseline");
  await sleep(1100);a.send("summon",{});await until(()=>a.state.summons.has(a.sessionId),"summon again");
  await sleep(1100);a.send("possess",{});await until(()=>reject("possession_cooldown"),"cooldown enforced");
  await a.leave();rooms.pop();await sleep(400);
  const b=await client.create("my_room",{guestToken:token});rooms.push(b);
  await until(()=>b.state?.players?.get(b.sessionId)?.persistent,"rejoin");const p=b.state.players.get(b.sessionId);
  assert.equal(p.possessionActive,false);assert.equal(p.atk,base.atk);assert.equal(p.def,base.def);
  const rejected=[];b.onMessage("command_rejected",e=>rejected.push(e.reason));
  b.send("summon",{});await until(()=>b.state.summons.has(b.sessionId),"summon after reconnect");
  b.send("possess",{});await until(()=>rejected.includes("possession_cooldown"),"cooldown survives reconnect");
  console.log("PASS: summon prerequisite, temporary stats, exclusivity, cancel and cooldown across reconnect");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
