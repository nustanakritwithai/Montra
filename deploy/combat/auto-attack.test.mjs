import test from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
process.env.MONTRA_WORLD_EXPANSION="1";
const compiled=existsSync("build/rooms/MyRoom.js");
const load=name=>import(compiled?"./build/rooms/"+name+".js":"./src/rooms/"+name+".ts");
const {MyRoom}=await load("MyRoom"),{Player,Monster}=await load("schema/MyRoomState");
const {RULES,CommandBucket}=await load("GameRules");
const {newBladeBook}=await load("BladeRules"),{newSentinelBook}=await load("SentinelRules");

for(const [path,skill] of [["blade","piercing_edge"],["sentinel","slam"]]){
  test(path+" pauses a selected monster attack until the cast resolves, then keeps swinging",()=>{
    const room=new MyRoom(),notices=[];
    const client={sessionId:"fighter",send:(type,data)=>notices.push({type,data})};
    const player=new Player({pathId:path,x:0,y:0,z:8,alive:true,level:25,atk:12,stamina:200,maxStamina:200});
    const monster=room.state.monster;
    Object.assign(monster,{id:RULES.monsterId,x:0,y:0,z:9,mapId:player.mapId,maxHp:10000,hp:10000,alive:true});
    room.state.players.set(client.sessionId,player);
    room.persistentCharacters.set(client.sessionId,"fixture");
    room.gates.set(client.sessionId,{attack:new CommandBucket(4,4),move:new CommandBucket(4,4)});
    const book=path==="blade"?newBladeBook():newSentinelBook();
    book.learned=[skill];book.slots=[skill,null,null,null];
    (path==="blade"?room.bladeBooks:room.sentinelBooks).set(client.sessionId,book);
    room.broadcast=(type,data)=>notices.push({type,data});
    room.saveCharacter=async()=>{};
    room.messages.attack(client,{targetId:monster.id});room.updatePlayerAttacks();
    const firstHp=monster.hp;assert.ok(firstHp<monster.maxHp);
    room.simulatedMs=700;
    room.messages[path+"_skill"](client,{skillId:skill,targetId:monster.id});
    const windups=path==="blade"?room.bladeWindups:room.sentinelWindups;
    assert.ok(windups.has(client.sessionId),JSON.stringify(notices));
    assert.equal(player.targetId,monster.id);
    // An ordinary hit is now due. Neither pursuit nor damage may run during the cast.
    room.simulatedMs=1200;monster.z=11.5;room.updatePlayerMovement(.05);room.updatePlayerAttacks();
    assert.equal(player.z,8);monster.z=9;room.updatePlayerAttacks();assert.equal(monster.hp,firstHp);
    room.simulatedMs=1500;room.tick(.05);
    assert.equal(windups.has(client.sessionId),false);assert.ok(monster.hp<firstHp);
    assert.equal(room.lastAttackMs.get(client.sessionId),1500);
    const resumed=monster.hp;
    room.updatePlayerAttacks();assert.equal(monster.hp,resumed,"no extra hit within the cooldown");
    room.simulatedMs=2500;room.updatePlayerAttacks();assert.ok(monster.hp<resumed);
    room.messages.move(client,{x:-1,z:8});assert.equal(player.targetId,"");
    const stopped=monster.hp;room.simulatedMs=3500;room.updatePlayerAttacks();assert.equal(monster.hp,stopped);
    // Selecting a second monster during a cast changes only the following basic hit.
    const other=new Monster({id:"forest_shrine_keeper",mapId:player.mapId,x:1,z:8,hp:10000,maxHp:10000,alive:true});
    room.state.monsters.set(other.id,other);
    const order=()=>room.messages.attack(client,{targetId:monster.id});
    const cast=()=>{book.cooldowns[skill]=0;room.messages[path+"_skill"](client,{skillId:skill,targetId:monster.id});};
    order();cast();assert.ok(windups.has(client.sessionId));
    room.messages.attack(client,{targetId:other.id});
    assert.equal(windups.get(client.sessionId).targetId,monster.id);
    assert.equal(player.targetId,other.id);
    room.simulatedMs+=800;room.tick(.05);
    assert.ok(monster.hp<stopped);assert.ok(other.hp<10000);
    other.alive=false;room.updatePlayerAttacks();assert.equal(player.targetId,"");
    const after=other.hp;other.alive=true;room.simulatedMs+=1000;room.updatePlayerAttacks();assert.equal(other.hp,after);
    // Clearing the target while casting must not cancel the skill or re-arm the previous lock.
    order();cast();assert.ok(windups.has(client.sessionId));
    room.messages.move(client,{x:-1,z:8});assert.equal(player.targetId,"");assert.ok(windups.has(client.sessionId));
    room.simulatedMs+=800;room.tick(.05);const afterCast=monster.hp;
    room.simulatedMs+=1000;room.updatePlayerAttacks();assert.equal(monster.hp,afterCast);
  });
}

test("a tap can pursue an exposed monster from safety, but cannot hit across the safe boundary",()=>{
  const room=new MyRoom(),client={sessionId:"runner",send(){}};
  const actor=new Player({x:0,z:5.9,alive:true,atk:10}),mob=room.state.monster;
  Object.assign(mob,{id:RULES.monsterId,mapId:actor.mapId,x:0,z:6.8,hp:100,maxHp:100,alive:true});
  room.state.players.set(client.sessionId,actor);room.gates.set(client.sessionId,{attack:new CommandBucket(4,4)});
  room.broadcast=()=>{};
  room.messages.attack(client,{targetId:mob.id});assert.equal(actor.targetId,"","legacy attack from a rest area stays rejected");
  room.restApproachClients.add(client.sessionId);
  room.messages.attack(client,{targetId:mob.id});room.updatePlayerAttacks();
  assert.equal(actor.combatState,"approaching");assert.equal(mob.hp,100);
  room.updatePlayerMovement(.05);assert.ok(actor.z>6);room.updatePlayerAttacks();assert.ok(mob.hp<100);
  mob.z=5.8;const hp=mob.hp;room.simulatedMs+=1000;room.updatePlayerAttacks();
  assert.equal(actor.targetId,"");assert.equal(mob.hp,hp);
});

function rangeFixture(path, pvp=false, distance=10) {
  const room=new MyRoom(),events=[],client={sessionId:'range_actor',send:(type,data)=>events.push({type,data})};
  const actor=new Player({pathId:path,x:0,y:0,z:8,alive:true,atk:20,magicAtk:20});
  const target=pvp?new Player({x:0,y:0,z:8+distance,alive:true,hp:10000,maxHp:10000}):room.state.monster;
  Object.assign(target,{x:0,y:0,z:8+distance,mapId:actor.mapId,hp:10000,maxHp:10000,alive:true});
  const targetId=pvp?'range_victim':RULES.monsterId;
  if(pvp)room.state.players.set(targetId,target);else target.id=targetId;
  room.state.players.set(client.sessionId,actor);
  room.gates.set(client.sessionId,{attack:new CommandBucket(4,4),move:new CommandBucket(4,4)});
  room.broadcast=(type,data)=>events.push({type,data});
  return {room,actor,target,targetId,client,events};
}
for(const path of ['seer','mender'])for(const pvp of [false,true]){
  test(`${path} ${pvp?'PvP':'PvE'} basic attack approaches from 10m and only hits within 8m`,()=>{
    const {room,actor,target,targetId,client,events}=rangeFixture(path,pvp);
    room.messages.attack(client,{targetId});
    assert.equal(actor.combatState,'approaching');
    room.updatePlayerAttacks();assert.equal(target.hp,10000,'no remote basic hit inside the old 15m range');
    assert(!events.some(e=>e.type==='ranged_hit'));
    let ticks=0;
    while(Math.hypot(target.x-actor.x,target.y-actor.y,target.z-actor.z)>8){
      const before=target.hp;room.updatePlayerAttacks();assert.equal(target.hp,before);
      room.updatePlayerMovement(.05);room.simulatedMs+=50;assert(++ticks<100,'bounded server pursuit');
    }
    room.updatePlayerAttacks();assert(target.hp<10000);const hp=target.hp;
    room.updatePlayerAttacks();assert.equal(target.hp,hp,'same cooldown cannot repeat a hit');
    room.messages.move(client,{x:actor.x+1,z:actor.z});room.simulatedMs+=1000;room.updatePlayerAttacks();
    assert.equal(target.hp,hp,'manual movement still cancels auto attack');
  });
  test(`${path} ${pvp?'PvP':'PvE'} basic range uses a 3D boundary`,()=>{
    const {room,actor,target,targetId,client}=rangeFixture(path,pvp,8);
    target.y=.1;room.messages.attack(client,{targetId});room.updatePlayerAttacks();
    assert.equal(target.hp,10000,'8m horizontal plus height is outside 8m');
    target.y=actor.y;room.updatePlayerAttacks();assert(target.hp<10000,'exact 8m is eligible');
  });
}
test('melee and blessed-rice reach remain independent of shorter ranged basics',async()=>{
  const {FORT}=await load('HeightRules');assert.equal(FORT.rangedRange,15);
  assert.equal(RULES.playerAttackRange,2.8);assert.equal(RULES.pkAttackRange,2.8);
  for(const pvp of [false,true]){
    const {room,target,targetId,client}=rangeFixture('blade',pvp,2.81);
    room.messages.attack(client,{targetId});room.updatePlayerAttacks();assert.equal(target.hp,10000);
    target.z=10.8;room.updatePlayerAttacks();assert(target.hp<10000);
  }
  const {room,target,targetId,client}=rangeFixture('seer',false,10);
  room.legacyCombatRoom=()=>true; // Existing legacy shoot protocol, independent from basic order.
  room.messages.shoot(client,{targetId});assert(target.hp<10000,'15m skill still hits beyond 8m basic reach');
});
