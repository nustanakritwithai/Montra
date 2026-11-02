/** Disposable localhost server and montra-chat-private-test-* directory only. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client } from "@colyseus/sdk";
const endpoint=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint||"") || !dir || !/^montra-chat-private-test-/.test(path.basename(dir)))throw new Error("requires isolated localhost and montra-chat-private-test- data");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=8000){const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}throw new Error("timeout: "+label);}
const rooms=[], events=[[],[],[]], tokens=Array.from({length:3},()=>"mt1_"+randomBytes(32).toString("hex"));
try {
  const a=await new Client(endpoint).create("my_room",{guestToken:tokens[0]});rooms.push(a);
  const b=await new Client(endpoint).joinById(a.roomId,{guestToken:tokens[1]});rooms.push(b);
  const c=await new Client(endpoint).joinById(a.roomId,{guestToken:tokens[2]});rooms.push(c);
  rooms.forEach((r,i)=>r.onMessage("*",(type,data)=>events[i].push({type,data})));
  const find=(i,type,fn=()=>true)=>events[i].find(e=>e.type===type && fn(e.data))?.data;
  await until(()=>a.state?.extendedChatAvailable===true && a.state.players.size===3,"players ready");
  a.send("party_invite",{targetId:b.sessionId});const invite=await until(()=>find(1,"party_invitation"),"invite");
  b.send("party_accept",{inviteId:invite.inviteId});await until(()=>find(0,"party_state",d=>d.members?.length===2),"party ready");
  a.send("chat",{channel:"party",text:"ข้อความปาร์ตี้"});
  await until(()=>find(0,"chat_message",d=>d.text==="ข้อความปาร์ตี้")&&find(1,"chat_message",d=>d.text==="ข้อความปาร์ตี้"),"party chat");await sleep(250);
  assert.ok(!find(2,"chat_message",d=>d.text==="ข้อความปาร์ตี้"));
  a.send("chat",{channel:"private",text:"ข้อความลับ",targetId:c.sessionId});
  await until(()=>find(0,"chat_message",d=>d.text==="ข้อความลับ")&&find(2,"chat_message",d=>d.text==="ข้อความลับ"),"private chat");await sleep(250);
  assert.ok(!find(1,"chat_message",d=>d.text==="ข้อความลับ"));
  assert.equal(find(2,"chat_message",d=>d.text==="ข้อความลับ").senderId,a.sessionId);
  a.send("chat",{channel:"bug",text:"ติดกำแพง 👋"});
  const result=await until(()=>find(0,"chat_report_result"),"bug acknowledgement");assert.equal(result.ok,true);
  await sleep(250);assert.ok(events.slice(1).every(list=>!list.some(e=>e.type==="chat_message" && e.data.text==="ติดกำแพง 👋")));
  const line=await readFile(path.join(dir,"bug-reports","reports.jsonl"),"utf8"), report=JSON.parse(line.trim());
  assert.equal(report.text,"ติดกำแพง 👋");assert.equal(report.id,result.reportId);assert.equal(report.name,a.state.players.get(a.sessionId).characterName);
  for(const token of tokens)assert.ok(!line.includes(token));
  await sleep(2200);a.send("chat",{channel:"bug",text:"รายงานซ้ำ"});await until(()=>find(0,"command_rejected",d=>d.reason==="chat_bug_rate_limited"),"bug rate limit");
  await sleep(2200);a.send("chat",{channel:"private",text:"forged",targetId:c.sessionId,name:"admin"});await until(()=>find(0,"command_rejected",d=>d.reason==="invalid_chat"),"forged sender rejected");
  assert.ok(events.every(list=>!list.some(e=>e.type==="chat_message" && e.data.text==="forged")));
  console.log("PASS: party and private recipient isolation, bug report persistence, rate limit and forged payload rejection");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
