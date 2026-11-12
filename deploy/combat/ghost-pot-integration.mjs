import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";
import {setTimeout as wait} from "node:timers/promises";
import {Client} from "@colyseus/sdk";

assert.ok(process.env.MONTRA_GHOST_WORKER && process.env.MONTRA_POCKET_CAPTURE_SOURCE);
process.env.MONTRA_CHARACTER_DIR = await mkdtemp(join(tmpdir(),"montra-ghost-pool-test-"));
process.env.MONTRA_ECONOMY_ENABLED = "1";
process.env.MONTRA_ACCOUNTS_REQUIRED = "0";
process.env.MONTRA_WORLD_EXPANSION = "1";
process.env.MONTRA_CASTLE_PILOT = "1";

const {defineServer,defineRoom} = await import("colyseus");
const {MyRoom} = await import("./src/rooms/MyRoom.ts");
const {characterStore} = await import("./src/rooms/CharacterStore.ts");
const {isGhostPool,GHOST_POOL_CAPACITY} = await import("./src/rooms/GhostPool.ts");
const {legacyCapturedGhostSource} = await import("./src/rooms/ForestEncounters.ts");
const {isPotGhost} = await import("./src/rooms/LegacyGhostPot.ts");
const {serviceNpcsFor} = await import("./src/rooms/ServiceNpcs.ts");
const {groundAt} = await import("./src/rooms/WorldMaps.ts");
const {riverNodes} = await import("./src/rooms/RiverCity.ts");

let fixture;
class GhostTestRoom extends MyRoom {
  async onJoin(client, options) {
    await super.onJoin(client,options);
    fixture = this;
  }
  updateMonsterAI(...args) {
    if (this.enableDefaultMonster) super.updateMonsterAI(...args);
  }
  prepareTarget() {
    const ghost = this.state.monster;
    Object.assign(ghost,{alive:true,hp:1,x:0,y:0,z:15});
    for (const player of this.state.players.values()) Object.assign(player,{x:0,y:0,z:14});
    return ghost.id;
  }
}

const free = createServer();
await new Promise(resolve=>free.listen(0,"127.0.0.1",resolve));
const {port} = free.address();
await new Promise((resolve,reject)=>free.close(error=>error ? reject(error) : resolve()));
const server = defineServer({rooms:{my_room:defineRoom(GhostTestRoom)}});
await server.listen(port,"127.0.0.1");

async function until(predicate, name, timeout = 5000) {
  const end = Date.now()+timeout;
  while(Date.now()<end) {
    const result=predicate();
    if(result) return result;
    await wait(35);
  }
  throw Error("Timed out: "+name);
}
const options = () => ({worldVersion:1,guestToken:"mt1_"+randomBytes(32).toString("hex")});
const client = () => new Client("http://127.0.0.1:"+port);
const ownerOptions = options(), rooms = new Set();
const legacy = {instanceId:randomUUID(),name:"เงารากไม้",level:6};
const villageSource = {monsterId:"possessed-1",mapId:"ritual_village"};
assert.ok(isPotGhost(legacy));
assert.ok(isPotGhost({...legacy,source:villageSource}));
assert.equal(isPotGhost({...legacy,source:{...villageSource,mapId:""}}),false);
assert.equal(legacyCapturedGhostSource(legacy.name,7),undefined,"two different legacy Lv.7 models have the same name");
function summonSource(npc) {
  return {monsterId:npc.sourceMonsterId,mapId:npc.sourceMapId,level:npc.sourceLevel};
}
function observe(room) {
  const info = {room,states:[],combat:[],damage:[],rejections:[]};
  rooms.add(room);
  room.onMessage("ghost_pot_state",value=>info.states.push(value));
  room.onMessage("ghost_combat_state",value=>info.combat.push(value));
  room.onMessage("ghost_damaged",value=>info.damage.push(value));
  room.onMessage("command_rejected",value=>info.rejections.push(value.reason));
  room.onMessage("*",()=>{});
  return info;
}
const last = info=>info.states.at(-1);
const send = (info,action,args={})=>info.room.send("ghost_pot",{action,...args});
async function command(info,action,args={},status) {
  const count=info.states.length;
  send(info,action,args);
  const response=await until(()=>info.states.length>count && last(info),action+" reply");
  if(status) assert.equal(response.status,status,JSON.stringify(info.rejections));
  return response;
}
async function combatCommand(info,action,args,status) {
  const count=info.combat.length;
  send(info,action,args);
  return until(()=>info.combat.slice(count).find(event=>event.status===status),status);
}
async function rejectedMessage(info,type,args,reason) {
  const count=info.rejections.length;
  info.room.send(type,args);
  await until(()=>info.rejections.slice(count).includes(reason),reason);
}
const rejected = (info,action,args,reason) => rejectedMessage(info,"ghost_pot",{action,...args},reason);

try {
  const spawn={x:0,y:0,z:15};
  const {character} = await characterStore.loadOrCreate(ownerOptions.guestToken,spawn);
  await characterStore.save({...character,ghostPot:legacy});

  const a = observe(await client().create("my_room",ownerOptions));
  const b = observe(await client().joinById(a.room.roomId,options()));
  await until(()=>a.room.state?.ghostPotAvailable && a.room.state.players?.size===2 && b.room.state?.players?.size===2,"joined");
  const migrated=await command(a,"read",{},"ready");
  assert.deepEqual(migrated.pool.collection,[legacy]);
  assert.deepEqual(migrated.pool.slots,[legacy.instanceId,null,null]);
  const other=await command(b,"read",{},"ready");
  assert.deepEqual(other.pool.collection,[]);
  assert.equal((await command(b,"assign",{slot:0,instanceId:legacy.instanceId,revision:0})).status,"not_owned");

  let winner;
  for(let attempt=0;attempt<5 && !winner;attempt++){
    const targetId=fixture.prepareTarget();
    const counts=[a.states.length,b.states.length];
    send(a,"capture",{targetId});send(b,"capture",{targetId});
    await wait(500);
    const results=[a,b].map((info,i)=>info.states.slice(counts[i]).filter(state=>state.status==="captured"));
    assert.ok(results[0].length+results[1].length<=1,"same wild ghost is captured by at most one player");
    winner=results[0].length ? a : results[1].length ? b : null;
    await wait(3100);
  }
  assert.ok(winner,"one player captured the contested ghost");
  assert.equal(a.room.state.monster.hp,0);
  assert.equal(b.room.state.monster.hp,0);
  for(let attempt=0;attempt<9 && last(a).pool.collection.length<4;attempt++){
    const reply=await command(a,"capture",{targetId:fixture.prepareTarget()});
    assert.ok(["captured","escaped"].includes(reply.status),reply.status);
    await wait(3300);
  }
  const pool=last(a).pool;
  assert.equal(pool.collection.length,4);
  assert.ok(isGhostPool(pool));
  assert.equal(new Set(pool.collection.map(ghost=>ghost.instanceId)).size,4);
  assert.ok(pool.slots.every(Boolean));
  const reserved=pool.collection.find(ghost=>!pool.slots.includes(ghost.instanceId));
  for (const ghost of pool.collection.filter(ghost=>ghost.instanceId!==legacy.instanceId)) {
    assert.deepEqual(ghost.source,villageSource);
  }

  const placed=await command(a,"assign",{slot:1,instanceId:reserved.instanceId,revision:pool.revision},"placed");
  assert.equal(placed.pool.slots[1],reserved.instanceId);
  assert.ok(placed.pool.collection.some(ghost=>ghost.instanceId===pool.slots[1]));
  assert.deepEqual((await command(a,"reserve",{instanceId:legacy.instanceId,revision:pool.revision},"stale")).pool,placed.pool);
  await wait(700);
  let summoned=await command(a,"summon",{},"summoned");
  assert.equal(summoned.activeInstanceId,legacy.instanceId);
  assert.deepEqual(summoned.skills.map(skill=>[skill.skillId,skill.usesLeft]),[["SK_NORMAL_01",28],["SK_NORMAL_02",16]]);
  await until(()=>b.room.state.summons.get(a.room.sessionId)?.kind==="captured_ghost","other player sees one ghost");
  assert.equal(b.room.state.summons.size,1);
  assert.deepEqual(summonSource(b.room.state.summons.get(a.room.sessionId)),
    {monsterId:"forest_east_3",mapId:"forbidden_forest",level:6});
  const skillTargetId=fixture.prepareTarget(), skillTarget=fixture.state.monster;
  skillTarget.hp=skillTarget.maxHp;
  const tackle={combatId:summoned.combatId,targetId:skillTargetId,skillId:"SK_NORMAL_01"};
  await rejected(b,"skill",tackle,"ghost_combat_inactive");
  await wait(600);
  await rejected(a,"skill",{...tackle,skillId:"SK_FIRE_01"},"ghost_skill_unlearned");
  await wait(600);
  skillTarget.z=18;
  await rejected(a,"skill",tackle,"ghost_combat_target");
  await wait(600);
  skillTarget.z=15;
  const skillHit=await combatCommand(a,"skill",tackle,"skill");
  assert.equal(skillHit.skillId,"SK_NORMAL_01");
  assert.equal(skillHit.hit,true);
  assert.ok(skillHit.damage>0 && skillHit.hp<skillTarget.maxHp);
  assert.equal(skillHit.usesLeft,27);
  assert.equal(skillHit.remainingMs,1800);
  await rejected(a,"skill",tackle,"ghost_skill_cooldown");
  await wait(600);
  const opponent=fixture.state.players.get(b.room.sessionId);
  opponent.mapId="forbidden_forest";
  const quickStrike={combatId:summoned.combatId,targetId:b.room.sessionId,skillId:"SK_NORMAL_02"};
  await rejected(a,"skill",quickStrike,"ghost_combat_target");
  await wait(600);
  opponent.mapId="ritual_village";
  const quick=await combatCommand(a,"skill",quickStrike,"skill");
  assert.equal(quick.usesLeft,15);
  assert.equal(quick.remainingMs,4000);
  assert.equal(quick.targetId,b.room.sessionId);
  assert.equal(quick.damage>0,quick.hit);
  await wait(650);
  await command(a,"recall",{},"recalled");
  await wait(650);
  const oldCombatId=summoned.combatId;
  summoned=await command(a,"summon",{},"summoned");
  assert.notEqual(summoned.combatId,oldCombatId);
  assert.ok(summoned.skills.find(skill=>skill.skillId==="SK_NORMAL_02").remainingMs>0);
  assert.equal(summoned.skills.find(skill=>skill.skillId==="SK_NORMAL_02").usesLeft,15);
  await rejected(a,"skill",quickStrike,"ghost_combat_inactive");
  await wait(700);
  const selected=await command(a,"select",{slot:1,revision:summoned.pool.revision},"selected");
  assert.equal(selected.activeInstanceId,legacy.instanceId,"selection is separate from switching");
  await wait(700);
  const targetId=fixture.prepareTarget();
  const prey=fixture.state.monster;
  prey.hp=prey.maxHp;
  await combatCommand(a,"attack",{combatId:summoned.combatId,targetId},"ordered");
  await until(()=>a.combat.some(event=>event.status==="hit" && event.combatId===summoned.combatId),"first ghost hit");
  assert.ok(prey.hp>0,"target survives to test switching while the order is active");
  const hitsBeforeSwitch=prey.hitSeq;
  const switched=await command(a,"switch",{},"switched");
  assert.equal(switched.activeInstanceId,reserved.instanceId);
  assert.equal(switched.combatRange,24);
  assert.deepEqual(switched.skills.map(skill=>skill.skillId),["SK_NORMAL_01"]);
  assert.notEqual(switched.combatId,summoned.combatId);
  const switchedActor=await until(()=>{
    const actor=b.room.state.summons.get(a.room.sessionId);
    return actor?.combatTargetId.endsWith(switched.combatId) && actor;
  },"other player sees the switched ghost");
  assert.deepEqual(summonSource(switchedActor),{...villageSource,level:1});
  assert.equal(b.room.state.summons.size,1);
  await wait(1600);
  assert.equal(prey.hitSeq,hitsBeforeSwitch,"switch cancels the old order after cooldown");
  fixture.prepareTarget();
  const order={combatId:switched.combatId,targetId};
  const victim=fixture.state.players.get(b.room.sessionId);
  await rejected(b,"attack",order,"ghost_combat_inactive");
  await wait(700);
  await rejected(a,"attack",{...order,combatId:summoned.combatId},"ghost_combat_inactive");
  await wait(700);
  assert.equal(fixture.state.monster.hp,1,"captured ghost waits for a valid order");
  const owner=fixture.state.players.get(a.room.sessionId);
  const guardian=fixture.state.summons.get(a.room.sessionId);
  prey.z=34;
  assert.equal((await combatCommand(a,"attack",order,"ordered")).targetId,targetId);
  const monsterHit=await until(()=>a.combat.find(event=>event.status==="hit" && event.targetId===targetId &&
    event.combatId===switched.combatId),"confirmed monster hit from 20m away",10000);
  assert.ok(Math.hypot(guardian.x-owner.x,guardian.z-owner.z)>7,"ghost chased beyond its old leash");
  assert.equal(monsterHit.damage,1);
  assert.equal(monsterHit.hp,0);
  await until(()=>!b.room.state.monster.alive,"PvE defeat replicated");
  await until(()=>a.combat.some(event=>event.status==="ended" && event.targetId===targetId),"defeated target cleared");

  const pvp={combatId:switched.combatId,targetId:b.room.sessionId};
  victim.mapId="forbidden_forest";
  await rejected(a,"attack",pvp,"ghost_combat_target");
  await wait(700);
  victim.mapId="ritual_village";
  Object.assign(victim,{x:0,z:39});
  await rejected(a,"attack",pvp,"ghost_combat_target");
  await wait(700);
  Object.assign(guardian,{x:0,z:14});
  Object.assign(victim,{x:0,z:30});
  await combatCommand(a,"attack",pvp,"ordered");
  const beforeLeash=a.combat.length;
  guardian.z=43;
  await until(()=>a.combat.slice(beforeLeash).some(event=>event.status==="ended" &&
    event.targetId===pvp.targetId),"ghost stops chasing past its 28m leash");
  await until(()=>guardian.action==="follow" && guardian.z<43,"ghost moves back toward owner");
  await wait(700);
  Object.assign(owner,{x:0,z:7});
  Object.assign(guardian,{x:0,z:7});
  Object.assign(victim,{x:0,z:5.9});
  const beforeSafeHitSeq=victim.hitSeq;
  await rejected(a,"attack",pvp,"ghost_combat_target");
  await wait(700);
  assert.equal(victim.hitSeq,beforeSafeHitSeq,"protected opponent takes no damage");
  Object.assign(owner,{x:0,z:14});
  Object.assign(guardian,{x:0,z:14});
  Object.assign(victim,{x:0,z:15});
  const beforePvP=victim.hp;
  await combatCommand(a,"attack",pvp,"ordered");
  const pvpHit=await until(()=>a.combat.find(event=>event.status==="hit" && event.targetId===b.room.sessionId),"confirmed player hit");
  assert.ok(pvpHit.damage>0 && pvpHit.hp<beforePvP);
  await until(()=>b.room.state.players.get(b.room.sessionId).hitSeq>0,"PvP hit replicated");
  await combatCommand(a,"follow",{combatId:switched.combatId},"following");
  await until(()=>b.room.state.summons.get(a.room.sessionId)?.targetId==="","follow clears replicated target");
  const hitsAfterFollow=victim.hitSeq;
  await wait(1600);
  assert.equal(victim.hitSeq,hitsAfterFollow,"cancelled order stays cancelled after cooldown");

  let invitation, party;
  b.room.onMessage("party_invitation",value=>invitation=value);
  a.room.onMessage("party_state",value=>party=value);
  a.room.send("party_invite",{targetId:b.room.sessionId});
  await until(()=>invitation?.inviteId,"party invitation");
  b.room.send("party_accept",{inviteId:invitation.inviteId});
  await until(()=>party?.members.length===2,"party accepted");
  await rejected(a,"attack",pvp,"ghost_combat_target");
  assert.equal(victim.hitSeq,hitsAfterFollow,"party member takes no damage");
  const attackGhost = targetId => ({targetId});
  await rejectedMessage(b,"attack",attackGhost(guardian.combatTargetId),"target_unavailable");

  const ownerHp=owner.hp;
  const ghostMaxHp=guardian.maxHp;
  assert.equal(guardian.hp,ghostMaxHp);
  Object.assign(guardian,{x:0,z:15});
  Object.assign(prey,{alive:true,hp:prey.maxHp,x:0,y:0,z:15.5,targetId:""});
  Object.assign(victim,{x:0,z:17});
  fixture.enableDefaultMonster=true;
  const npcHit=await until(()=>a.damage.find(hit=>hit.attackerId===prey.id),"wild monster strikes the ghost");
  fixture.enableDefaultMonster=false;
  prey.targetId="";
  assert.ok(npcHit.damage>0 && npcHit.hp>0 && npcHit.hp<ghostMaxHp);
  assert.equal(owner.hp,ownerHp,"monster hit belongs to the ghost");
  await until(()=>b.room.state.summons.get(a.room.sessionId)?.hp===npcHit.hp,"ghost HP replicated");

  await wait(700);
  await command(a,"reserve",{instanceId:reserved.instanceId,revision:switched.pool.revision},"active_locked");
  await wait(700);
  await command(a,"recall",{},"recalled");
  await until(()=>!b.room.state.summons.has(a.room.sessionId),"recall replicated");
  await rejected(a,"attack",pvp,"ghost_combat_inactive");
  await wait(700);
  const returned=await command(a,"summon",{},"summoned");
  assert.equal(returned.combatHealth.hp,npcHit.hp,"recalling and calling again preserves injuries");
  const nextGuardian=fixture.state.summons.get(a.room.sessionId);
  assert.notEqual(nextGuardian.combatTargetId,guardian.combatTargetId);
  b.room.send("party_leave",{});
  await until(()=>party?.members.length===1,"party member left");
  await rejectedMessage(b,"attack",attackGhost(guardian.combatTargetId),"target_unavailable");
  await wait(700);
  await rejectedMessage(a,"attack",attackGhost(nextGuardian.combatTargetId),"target_unavailable");
  await wait(700);
  Object.assign(victim,{mapId:"forbidden_forest",x:0,z:15});
  await rejectedMessage(b,"attack",attackGhost(nextGuardian.combatTargetId),"target_unavailable");
  await wait(700);
  Object.assign(victim,{mapId:"ritual_village",x:0,z:7});
  Object.assign(owner,{x:0,z:5.9});
  Object.assign(nextGuardian,{x:0,z:5.9});
  await rejectedMessage(b,"attack",attackGhost(nextGuardian.combatTargetId),"target_unavailable");
  await wait(700);
  assert.equal(nextGuardian.hp,npcHit.hp,"safe area prevents damage");
  Object.assign(owner,{x:0,z:14});
  Object.assign(nextGuardian,{x:0,z:15});
  Object.assign(victim,{x:0,z:16});
  b.room.send("attack",attackGhost(nextGuardian.combatTargetId));
  const playerHit=await until(()=>a.damage.find(hit=>hit.attackerId===b.room.sessionId),"player strikes the ghost");
  assert.ok(playerHit.damage>0 && playerHit.hp>0 && playerHit.hp<npcHit.hp);
  assert.equal(owner.pkDeaths,0);
  const defeats=a.states.length;
  nextGuardian.hp=1;
  const defeated=await until(()=>a.states.slice(defeats).find(state=>state.status==="defeated"),"ghost defeat settles");
  await until(()=>!b.room.state.summons.has(a.room.sessionId),"ghost defeat replicated");
  assert.equal(defeated.activeInstanceId,null);
  assert.deepEqual(defeated.fainted,[reserved.instanceId]);
  assert.equal(owner.pkDeaths,0,"a ghost defeat is not a player death");
  assert.equal(victim.pkKills,0,"a ghost defeat is not a player kill");
  assert.equal((await command(a,"summon",{},"fainted")).activeInstanceId,null);
  await wait(700);
  await rejected(a,"attack",{combatId:returned.combatId,targetId},"ghost_combat_inactive");

  const healer=serviceNpcsFor("ritual_village").find(npc=>npc.role==="ghostHealer");
  assert.ok(healer);
  const treatment={npcId:healer.id};
  await wait(700);
  const tooFar=await command(a,"heal",treatment,"heal_near_npc");
  assert.deepEqual(tooFar.fainted,[reserved.instanceId],"a remote request cannot revive the ghost");
  const clinic={x:healer.x,y:healer.y,z:healer.z};
  Object.assign(owner,clinic);
  await wait(700);
  const inCombat=await command(a,"heal",treatment,"heal_in_combat");
  assert.deepEqual(inCombat.fainted,[reserved.instanceId],"combat blocks treatment even at the healer");
  await wait(5100);
  await rejected(a,"heal",{...treatment,ownerId:b.room.sessionId},"invalid_ghost_pot");
  const wrongNpc=await command(a,"heal",{npcId:"ritual_village_mentor"},"heal_near_npc");
  assert.deepEqual(wrongNpc.fainted,[reserved.instanceId],"another service cannot heal the ghost");
  await wait(700);
  const revived=await command(a,"heal",treatment,"healed");
  assert.deepEqual(revived.fainted,[],"the healer revives a defeated companion");
  assert.deepEqual(revived.pool,defeated.pool,"treatment preserves roster slots and revision");
  await wait(700);
  const recovered=await command(a,"summon",{},"summoned");
  assert.equal(recovered.combatHealth.hp,ghostMaxHp);
  const healedGuardian=fixture.state.summons.get(a.room.sessionId);
  fixture.prepareTarget();
  prey.hp=prey.maxHp;
  Object.assign(healedGuardian,{x:0,y:0,z:14});
  const skillId=recovered.skills[0].skillId;
  await wait(700);
  const used=await combatCommand(a,"skill",{combatId:recovered.combatId,targetId,skillId},"skill");
  assert.equal(used.usesLeft,recovered.skills[0].usesLeft-1);
  const injured=fixture.combatGhost(healedGuardian.combatTargetId);
  assert.ok(injured);
  fixture.hitGhost(injured,prey.id,1);
  Object.assign(owner,clinic);
  await wait(5100);
  const rested=await command(a,"read",{},"ready");
  assert.equal(rested.combatHealth.hp,ghostMaxHp-1,"ordinary rest does not heal the active companion");
  const treated=await command(a,"heal",treatment,"healed");
  assert.equal(treated.combatId,recovered.combatId,"treatment keeps the same companion summoned");
  assert.deepEqual(treated.combatHealth,{hp:ghostMaxHp,maxHp:ghostMaxHp});
  assert.equal(treated.skills[0].usesLeft,recovered.skills[0].usesLeft);
  assert.equal(treated.skills[0].remainingMs,0);
  await until(()=>b.room.state.summons.get(a.room.sessionId)?.hp===ghostMaxHp,"healed HP replicated");
  await wait(700);
  await command(a,"heal",treatment,"heal_healthy");
  Object.assign(owner,{x:-10,z:-56});
  a.room.send("warp",{portalId:"village_to_forest"});
  await until(()=>owner.mapId==="forbidden_forest","owner warped through a real portal");
  await until(()=>!a.room.state.summons.has(a.room.sessionId),"warp despawns ghost");
  await rejected(a,"attack",{combatId:recovered.combatId,targetId},"ghost_combat_inactive");
  await wait(700);

  const forestCall=await command(a,"summon",{},"summoned");
  const forestGuardian=fixture.state.summons.get(a.room.sessionId);
  assert.deepEqual(summonSource(forestGuardian),{...villageSource,level:1},"summon retains its model across maps");
  const forestMonster=fixture.state.monsters.get("forest_west_1");
  assert.ok(forestMonster?.alive);
  Object.assign(forestGuardian,{x:forestMonster.x,y:forestMonster.y,z:forestMonster.z});
  Object.assign(owner,{x:forestMonster.x,y:forestMonster.y,z:forestMonster.z+1.8});
  forestMonster.targetId=forestGuardian.combatTargetId;
  await until(()=>a.damage.find(hit=>hit.attackerId===forestMonster.id && hit.combatId===forestCall.combatId),"forest AI strikes ghost");
  Object.assign(owner,{x:forestMonster.x,y:forestMonster.y,z:forestMonster.z,hp:1});
  forestMonster.targetId=a.room.sessionId;
  await until(()=>!owner.alive,"forest AI knocks out the owner");
  await until(()=>!a.room.state.summons.has(a.room.sessionId),"owner knockout removes the ghost");
  await until(()=>owner.alive,"owner respawns");
  await rejected(a,"attack",{combatId:forestCall.combatId,targetId},"ghost_combat_inactive");
  await wait(700);

  const stored=await command(a,"reserve",{instanceId:reserved.instanceId,revision:switched.pool.revision},"placed");
  assert.equal(stored.pool.slots[1],null);

  await a.room.leave();
  rooms.delete(a.room);
  const restored = observe(await client().joinById(b.room.roomId,ownerOptions));
  await until(()=>restored.room.state?.ghostPotAvailable,"rejoined");
  const durable=await command(restored,"read",{},"ready");
  assert.deepEqual(durable.pool,stored.pool);
  assert.deepEqual(durable.pool.collection.find(ghost=>ghost.instanceId===reserved.instanceId).source,villageSource);
  assert.equal(durable.activeInstanceId,null);
  await rejected(restored,"attack",{combatId:forestCall.combatId,targetId},"ghost_combat_inactive");

  const fullOptions=options();
  const fullCharacter=(await characterStore.loadOrCreate(fullOptions.guestToken,spawn)).character;
  const fullCollection=Array.from({length:GHOST_POOL_CAPACITY},()=>({instanceId:randomUUID(),name:"ผีสำรอง",level:1}));
  await characterStore.save({...fullCharacter,ghostPool:{collection:fullCollection,slots:[null,null,null],selectedSlot:0,revision:0}});
  const full=observe(await client().joinById(b.room.roomId,fullOptions));
  await until(()=>full.room.state?.ghostPotAvailable && full.room.state?.players?.has(full.room.sessionId),"full pool joined");
  const fullTarget=fixture.prepareTarget();
  const blocked=await command(full,"capture",{targetId:fullTarget},"pool_full");
  assert.equal(blocked.pool.collection.length,GHOST_POOL_CAPACITY);
  assert.equal(fixture.state.monster.alive,true);

  const fullPlayer=fixture.state.players.get(full.room.sessionId);
  const maps=JSON.parse(full.room.state.worldDefinition).maps;
  for(const mapId of ["mantra_capital","sam_lan_estuary","moon_pass","river_watch","tri_wiang_castle"]){
    const map=maps[mapId], localHealer=map.serviceNpcs.find(npc=>npc.role==="ghostHealer");
    assert.ok(localHealer,`${mapId} healer is advertised to the client`);
    const market=map.strategic.sites.find(site=>site.kind==="market");
    const approach=mapId==="sam_lan_estuary"?riverNodes.T:mapId==="tri_wiang_castle"?map.spawn:market;
    Object.assign(fullPlayer,{mapId,x:approach.x,y:groundAt(mapId,approach.x,approach.z),z:approach.z});
    fixture.ghostHealth.set(full.room.sessionId,new Map([[fullCollection[0].instanceId,0]]));
    full.room.send("move",{x:localHealer.x,z:localHealer.z});
    await until(()=>Math.hypot(fullPlayer.x-localHealer.x,fullPlayer.z-localHealer.z)<0.28,
      `walk to healer in ${mapId}`,12000);
    if(mapId==="mantra_capital"){
      const remote=await command(full,"heal",treatment,"heal_near_npc");
      assert.deepEqual(remote.fainted,[fullCollection[0].instanceId],"another city's healer ID cannot treat a local player");
      await wait(700);
    }
    const treatedInCity=await command(full,"heal",{npcId:localHealer.id},"healed");
    assert.deepEqual(treatedInCity.fainted,[],`${mapId} healer revives a reserve companion`);
    assert.deepEqual(treatedInCity.pool,blocked.pool);
    await wait(700);
  }

  delete process.env.MONTRA_GHOST_WORKER;
  const disabled=observe(await client().create("my_room",options()));
  await until(()=>disabled.room.state?.players?.size===1,"disabled room state");
  assert.equal(disabled.room.state.ghostPotAvailable,false);
  send(disabled,"read");
  await until(()=>disabled.rejections.includes("ghost_pot_unavailable"),"worker disabled");
  console.log("PASS ghost pool and combat: C# lifecycle, legacy skills, basic attacks, skill range/cooldown/uses, PvE/PvP damage, six village and city healers, warp, owner knockout, ownership, stale orders, safe areas, party, reconnect and saves");
} catch(error) {
  console.error(error);
  process.exitCode=1;
} finally {
  await Promise.allSettled([...rooms].map(room=>room.leave()));
  await server.gracefullyShutdown(false);
}
