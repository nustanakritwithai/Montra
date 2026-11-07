import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=9000){const end=Date.now()+timeout;while(Date.now()<end){const r=fn();if(r)return r;await sleep(30);}throw Error("timeout: "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex");
const cases=[
 {school:"chaiya",skills:["chaiya_cover","chaiya_return"],learned:["chaiya_elbow","chaiya_knee","chaiya_cover","chaiya_return"],x:-10,z:8,vz:6.5},
 {school:"korat",skills:["korat_pierce","korat_press"],learned:["korat_heavy","korat_swing","korat_pierce","korat_press"],x:-14,z:8,vz:6.5},
 {school:"lopburi",skills:["lopburi_reverse","lopburi_slipcounter"],learned:["lopburi_angle","lopburi_counter","lopburi_reverse","lopburi_slipcounter"],x:10,z:10,vz:8.5},
 {school:"thasao",skills:["thasao_rush","thasao_retreat"],learned:["thasao_step","thasao_flurry","thasao_rush","thasao_retreat"],x:14,z:10,vz:6.5},
];
async function seed(t,name,x,z,school="chaiya",learned=[],skillSlots=["step","punch","guard","counter"],level=25,mastery){
 const id=createHash("sha256").update(t).digest("hex"),slots=Array(12).fill(null),base=["step","punch","guard","counter"];
 slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
 const loadouts={chaiya:[...base],korat:[...base],lopburi:[...base],thasao:[...base]};loadouts[school]=[...skillSlots];
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:9999,mapId:"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook:{school,learned:[...learned,"punch","guard","counter"],training:{strikes:70,blocks:8},...(mastery?{mastery}:{}),slots:[...skillSlots],loadouts},inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
for(const c of cases){c.token=token();c.victimToken=token();await seed(c.token,"มวย"+c.school,c.x,c.z,c.school,c.learned,[...c.skills,"guard","counter"]);await seed(c.victimToken,"เป้า"+c.school,c.x,c.vz,"chaiya",[],undefined,100);}
const npcToken=token(),learnerToken=token(),edgeToken=token(),edgeVictimToken=token();
await seed(npcToken,"มวยตีผี",1,8.8,"korat",cases[1].learned,[...cases[1].skills,"guard","counter"]);
await seed(learnerToken,"ผู้เรียน",0,0,"thasao",["thasao_step","thasao_flurry"],undefined,25,{chaiya:{technique:0,sequences:0},korat:{technique:0,sequences:0},lopburi:{technique:0,sequences:0},thasao:{technique:10,sequences:3}});
await seed(edgeToken,"มวยริมพัก",0,-7.1,"thasao",cases[3].learned,[...cases[3].skills,"guard","counter"]);
await seed(edgeVictimToken,"เป้าริมพัก",0,-8.5,"chaiya",[],undefined,100);
const client=new Client(url),options=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1}),rooms=[];
const eventMap=new Map(),watch=room=>{const list=[];eventMap.set(room.sessionId,list);room.onMessage("*",(type,data)=>list.push({type,data}));return room;};
const seen=(room,type,predicate=()=>true)=>eventMap.get(room.sessionId).find(e=>e.type===type && predicate(e.data));
const damage=(attack,def,level)=>Math.max(1,Math.round(attack*(100*(1+(level-1)/15))/(100*(1+(level-1)/15)+def)));
try {
 const first=watch(await client.create("my_room",options(cases[0].token)));rooms.push(first);cases[0].actor=first;
 for(const c of cases){if(!c.actor){c.actor=watch(await client.joinById(first.roomId,options(c.token)));rooms.push(c.actor);}c.victim=watch(await client.joinById(first.roomId,options(c.victimToken)));rooms.push(c.victim);}
 const npc=watch(await client.joinById(first.roomId,options(npcToken)));rooms.push(npc);
 const player=(r,id)=>r.state?.players?.get(id);
 await until(()=>rooms.every(r=>player(r,r.sessionId)?.persistent),"players joined");
 const [chaiya,korat,lopburi,thasao]=cases;
 // Chaiya cover protects continuously and enables its mana-restoring counter.
 chaiya.actor.send("muay_skill",{skillId:"korat_pierce",targetId:chaiya.victim.sessionId});
 await until(()=>seen(chaiya.actor,"command_rejected",e=>e.reason==="muay_skill_locked"),"wrong school rejected");
 await sleep(600);
 chaiya.actor.send("muay_skill",{skillId:"chaiya_return",targetId:chaiya.victim.sessionId});
 await until(()=>seen(chaiya.actor,"command_rejected",e=>e.reason==="muay_counter_required"),"counter requires defense");
 assert.equal(JSON.parse(player(chaiya.actor,chaiya.actor.sessionId).muayData).chaiya_return,undefined);
 await sleep(350);chaiya.actor.send("muay_skill",{skillId:"chaiya_cover"});await until(()=>seen(chaiya.actor,"muay_skill_used",e=>e.skillId==="chaiya_cover"),"cover");
 const baseCover=damage((player(chaiya.actor,chaiya.victim.sessionId).atk+4)*1.1*0.75,player(chaiya.actor,chaiya.actor.sessionId).def,25);
 chaiya.victim.send("muay_skill",{skillId:"punch",targetId:chaiya.actor.sessionId});
 await until(()=>seen(chaiya.actor,"muay_guarded"),"cover guarded");
 const coverHit=await until(()=>seen(chaiya.actor,"pvp_hit",e=>e.attackerId===chaiya.victim.sessionId)?.data,"cover hit");assert.equal(coverHit.damage,Math.max(1,Math.round(baseCover*0.65)));
 const manaBefore=player(chaiya.actor,chaiya.actor.sessionId).mana;
 chaiya.actor.send("muay_skill",{skillId:"chaiya_return",targetId:chaiya.victim.sessionId});await until(()=>seen(chaiya.actor,"pvp_hit",e=>e.attackerId===chaiya.actor.sessionId),"Chaiya counter");
 await until(()=>JSON.parse(player(chaiya.actor,chaiya.actor.sessionId).muayData).chaiya_return>Date.now(),"counter state");
 const spent=manaBefore-player(chaiya.actor,chaiya.actor.sessionId).mana;assert.ok(spent>10 && spent<=14.1,"counter restores eight mana");
 // Korat pierces part of a frontal guard but still gives the defender a counter.
 korat.victim.send("move",{x:korat.x,z:korat.vz+0.3});await until(()=>player(korat.actor,korat.victim.sessionId).z>korat.vz+0.2,"victim turns");
 korat.victim.send("muay_skill",{skillId:"guard"});await until(()=>seen(korat.victim,"muay_skill_used",e=>e.skillId==="guard"),"victim guard");
 const basePierce=damage((player(korat.actor,korat.actor.sessionId).atk+4)*1.9*0.75,player(korat.actor,korat.victim.sessionId).def,100);
 korat.actor.send("muay_skill",{skillId:"korat_pierce",targetId:korat.victim.sessionId});
 await until(()=>seen(korat.victim,"muay_guarded"),"pierced guard still opens counter");
 const pierced=await until(()=>seen(korat.actor,"pvp_hit",e=>e.attackerId===korat.actor.sessionId)?.data,"piercing hit");assert.equal(pierced.damage,Math.max(1,Math.round(basePierce*0.625)));
 korat.actor.send("muay_skill",{skillId:"korat_press",targetId:korat.victim.sessionId});await until(()=>seen(korat.actor,"muay_skill_used",e=>e.skillId==="korat_press"),"Korat pressure PvP");
 // Lopburi changes sides and its moving counter requires a successful guard.
 lopburi.actor.send("muay_skill",{skillId:"lopburi_slipcounter",targetId:lopburi.victim.sessionId});await until(()=>seen(lopburi.actor,"command_rejected",e=>e.reason==="muay_counter_required"),"Lopburi requires counter");
 await sleep(350);const beforeX=player(lopburi.actor,lopburi.actor.sessionId).x;
 lopburi.actor.send("muay_skill",{skillId:"lopburi_reverse",targetId:lopburi.victim.sessionId});await until(()=>seen(lopburi.actor,"muay_skill_used",e=>e.skillId==="lopburi_reverse"),"reverse sidestep");
 await until(()=>player(lopburi.actor,lopburi.actor.sessionId).x<beforeX-0.5,"reverse side movement");
 lopburi.actor.send("muay_skill",{skillId:"guard"});await until(()=>seen(lopburi.actor,"muay_skill_used",e=>e.skillId==="guard"),"Lopburi guard");
 lopburi.victim.send("muay_skill",{skillId:"punch",targetId:lopburi.actor.sessionId});await until(()=>seen(lopburi.actor,"muay_guarded"),"Lopburi guarded");
 const beforeCounter={x:player(lopburi.actor,lopburi.actor.sessionId).x,z:player(lopburi.actor,lopburi.actor.sessionId).z};
 lopburi.actor.send("muay_skill",{skillId:"lopburi_slipcounter",targetId:lopburi.victim.sessionId});await until(()=>seen(lopburi.actor,"muay_skill_used",e=>e.skillId==="lopburi_slipcounter"),"moving counter");
 await until(()=>Math.hypot(player(lopburi.actor,lopburi.actor.sessionId).x-beforeCounter.x,player(lopburi.actor,lopburi.actor.sessionId).z-beforeCounter.z)>0.5,"counter moved");
 // Tha Sao moves in for two hits and can disengage with a separate attack.
 const beforeRush={x:player(thasao.actor,thasao.actor.sessionId).x,z:player(thasao.actor,thasao.actor.sessionId).z};
 thasao.actor.send("muay_skill",{skillId:"thasao_rush",targetId:thasao.victim.sessionId});
 await until(()=>eventMap.get(thasao.actor.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===thasao.actor.sessionId).length>=2,"two rush hits");
 await until(()=>Math.hypot(player(thasao.actor,thasao.actor.sessionId).x-beforeRush.x,player(thasao.actor,thasao.actor.sessionId).z-beforeRush.z)>1,"rush advanced");
 const beforeRetreat={x:player(thasao.actor,thasao.actor.sessionId).x,z:player(thasao.actor,thasao.actor.sessionId).z};
 thasao.actor.send("muay_skill",{skillId:"thasao_retreat",targetId:thasao.victim.sessionId});await until(()=>seen(thasao.actor,"muay_skill_used",e=>e.skillId==="thasao_retreat"),"retreat strike");
 await until(()=>Math.hypot(player(thasao.actor,thasao.actor.sessionId).x-beforeRetreat.x,player(thasao.actor,thasao.actor.sessionId).z-beforeRetreat.z)>1.1,"retreat moved");
 await thasao.actor.leave();rooms.splice(rooms.indexOf(thasao.actor),1);await sleep(300);
 const again=watch(await client.joinById(first.roomId,options(thasao.token)));rooms.push(again);await until(()=>player(again,again.sessionId)?.persistent,"rejoin");
 assert.ok(JSON.parse(player(again,again.sessionId).muayData).thasao_retreat>Date.now());assert.ok(JSON.parse(player(again,again.sessionId).muayBookData).learned.includes("thasao_rush"));
 await until(()=>Math.hypot(player(npc,npc.sessionId).x-npc.state.monster.x,player(npc,npc.sessionId).z-npc.state.monster.z)<2.5,"monster close");
 npc.send("muay_skill",{skillId:"korat_press",targetId:"possessed-1"});await until(()=>seen(npc,"muay_interrupt",e=>e.source==="korat_press" && e.result==="applied"),"monster pressure");
 const learner=watch(await client.joinById(first.roomId,options(learnerToken)));rooms.push(learner);await until(()=>player(learner,learner.sessionId)?.persistent,"learner joined");
 const book=()=>JSON.parse(player(learner,learner.sessionId).muayBookData);
 learner.send("muay_book",{action:"learn",skillId:"thasao_retreat"});await until(()=>book().learned.includes("thasao_retreat"),"learn branch");
 await sleep(500);learner.send("muay_book",{action:"equip",slot:1,skillId:"thasao_retreat"});await until(()=>book().slots[1]==="thasao_retreat","equip branch");
 await learner.leave();rooms.splice(rooms.indexOf(learner),1);await npc.leave();rooms.splice(rooms.indexOf(npc),1);
 const edge=watch(await client.joinById(first.roomId,options(edgeToken)));rooms.push(edge);
 const edgeVictim=watch(await client.joinById(first.roomId,options(edgeVictimToken)));rooms.push(edgeVictim);
 await until(()=>player(edge,edge.sessionId)?.persistent && player(edge,edgeVictim.sessionId)?.persistent,"edge players");
 const edgeMana=player(edge,edge.sessionId).mana,edgeHp=player(edge,edgeVictim.sessionId).hp;
 edge.send("muay_skill",{skillId:"thasao_retreat",targetId:edgeVictim.sessionId});await until(()=>seen(edge,"command_rejected",e=>e.reason==="muay_blocked"),"retreat cannot enter safe area");
 assert.equal(JSON.parse(player(edge,edge.sessionId).muayData).thasao_retreat,undefined);assert.ok(player(edge,edge.sessionId).mana>=edgeMana);assert.equal(player(edge,edgeVictim.sessionId).hp,edgeHp);
 console.log("PASS: eight school skills, guard, counter, penetration, movement safety, multi-hit, monster pressure, learning and persistence");
} finally {for(const r of rooms.reverse())await r.leave().catch(()=>{});}
