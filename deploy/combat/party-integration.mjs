/** Isolated localhost server, disposable data only. */
import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url||"") || !dir || !/^montra-party-test-/.test(path.basename(dir))) throw new Error("party test requires isolated localhost and montra-party-test-* data directory");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=8000){const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}throw new Error("timeout: "+label);}
const token=ch=>"mt1_"+ch.repeat(64), rooms=[];
function monitor(room){const events=[];for(const name of ["party_invitation","party_state","party_error","experience_gained"])room.onMessage(name,data=>events.push({name,data}));return events;}
const last=(events,name,predicate=()=>true)=>events.findLast(e=>e.name===name&&predicate(e.data))?.data;
try {
  const a=await new Client(url).create("my_room",{guestToken:token("1")});rooms.push(a);const ae=monitor(a);
  const b=await new Client(url).joinById(a.roomId,{guestToken:token("2")});rooms.push(b);const be=monitor(b);
  const outsider=await new Client(url).joinById(a.roomId,{guestToken:token("3")});rooms.push(outsider);const ce=monitor(outsider);
  await until(()=>a.state?.partyAvailable && a.state.players.size===3,"room ready");
  a.send("party_invite",{targetId:b.sessionId});
  const invite=await until(()=>last(be,"party_invitation"),"invitation");
  outsider.send("party_accept",{inviteId:invite.inviteId});
  await until(()=>last(ce,"party_error",m=>m.reason==="party_invite_expired"),"other player cannot accept invitation");
  b.send("party_accept",{inviteId:invite.inviteId});
  await until(()=>last(ae,"party_state",m=>m.members?.length===2)&&last(be,"party_state",m=>m.members?.length===2),"party formed");
  a.send("attack",{targetId:"possessed-1"});
  await until(()=>a.state.players.get(a.sessionId)?.experience===50 && b.state.players.get(b.sessionId)?.experience===50,"equal EXP",20000);
  assert.equal(outsider.state.players.get(outsider.sessionId).experience,0);
  a.send("party_leave",{});
  await until(()=>last(be,"party_state",m=>m.leaderId===b.sessionId && m.members?.length===1),"leader transferred");
  console.log("PASS: invitation, membership, equal EXP, outsider exclusion and leader transfer");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
