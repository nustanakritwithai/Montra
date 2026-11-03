import assert from 'node:assert/strict';
process.env.MONTRA_WORLD_EXPANSION='1';
const {MyRoom}=await import('./src/rooms/MyRoom.ts');
const {Player}=await import('./src/rooms/schema/MyRoomState.ts');
const {RULES,CommandBucket}=await import('./src/rooms/GameRules.ts');
const {newBladeBook,validateBladeBook}=await import('./src/rooms/BladeRules.ts');
function fixture(ranks={}){
  const room=new MyRoom(),notices=[],client={sessionId:'blade',send:(type,data)=>notices.push({type,data})};
  const player=new Player({pathId:'blade',mapId:'forbidden_forest',x:0,z:-30,y:0,alive:true,level:100,atk:100,hp:200,maxHp:200,mana:300,maxMana:320,stamina:80});
  const monster=room.state.monster;Object.assign(monster,{id:RULES.monsterId,mapId:player.mapId,x:0,z:-28,y:0,defense:0,level:1,hp:5000,maxHp:5000,alive:true,tier:'normal'});
  room.state.players.set('blade',player);room.persistentCharacters.set('blade','fixture');room.bladeBooks.set('blade',{...newBladeBook(),coreRanks:ranks});
  room.inventories.set('blade',{slots:[],equippedWeaponSlot:null});room.gates.set('blade',{attack:new CommandBucket(100,100),move:new CommandBucket(100,100),summon:new CommandBucket(100,100),occult:new CommandBucket(100,100)});
  room.clients.push(client);room.broadcast=(type,data)=>notices.push({type,data});room.syncPlayerViews=()=>{};room.saveCharacter=async()=>{};
  return {room,client,player,monster,notices};
}
{
  const f=fixture({blade_vanish:8});f.room.lastCombatMs.set('blade',0);f.room.attackTargets.set('blade',f.monster.id);f.monster.targetId='blade';
  f.room.castBladeCore(f.client,{skillId:'blade_vanish'});
  assert.equal(f.room.bladeCloaks.get('blade'),9000,'vanish is immediate and scales to rank 8');
  assert.equal(f.room.attackTargets.has('blade'),false);assert.equal(f.monster.targetId,'');assert.equal(f.player.mana,272);
  assert.ok(f.notices.some(n=>n.type==='blade_cloak_changed' && n.data.active));
}
{
  const f=fixture({blade_heavy:8});const before=f.monster.hp;f.room.attackTargets.set('blade',f.monster.id);
  f.room.castBladeCore(f.client,{skillId:'blade_heavy',targetId:f.monster.id});
  assert.ok(f.monster.hp<before,'heavy attack damages target');assert.equal(f.room.attackTargets.get('blade'),f.monster.id,'auto attack remains selected');
  const mana=f.player.mana;f.room.castBladeCore(f.client,{skillId:'blade_heavy',targetId:f.monster.id});assert.equal(f.player.mana,mana,'cooldown enforced');
}
{
  const f=fixture();const before=f.monster.hp,z=f.player.z;f.room.castBladeCore(f.client,{skillId:'blade_withdraw',targetId:f.monster.id});
  assert.ok(f.monster.hp<before);assert.ok(f.player.z<z-2,'strike then retreat away from target');
}
{
  const f=fixture();f.room.attackTargets.set('blade',f.monster.id);f.room.castBladeCore(f.client,{skillId:'blade_withdraw',targetId:f.monster.id});
  const z=f.player.z;f.room.updatePlayerMovement(.1);assert.equal(f.player.z,z,'auto pursuit pauses briefly after retreat');
  f.room.simulatedMs=500;f.room.updatePlayerMovement(.1);assert.ok(f.player.z>z,'auto pursuit resumes after the pause');assert.equal(f.room.attackTargets.get('blade'),f.monster.id);
}
{
  const f=fixture();f.room.attackTargets.set('blade',f.monster.id);f.room.castBladeCore(f.client,{skillId:'blade_withdraw',targetId:f.monster.id});
  f.room.messages.move(f.client,{x:1,z:-35});assert.equal(f.room.bladeRetreatUntil.has('blade'),false,'manual move cancels the pause');assert.equal(f.room.attackTargets.has('blade'),false);
}
{
  const f=fixture();f.room.attackTargets.set('blade',f.monster.id);f.room.castBladeCore(f.client,{skillId:'blade_withdraw',targetId:f.monster.id});
  f.room.messages.attack(f.client,{targetId:f.monster.id});assert.equal(f.room.bladeRetreatUntil.has('blade'),false,'manual attack cancels the pause');assert.equal(f.room.attackTargets.get('blade'),f.monster.id);
}
{
  const f=fixture();f.room.canOccupy=(x,z)=>z>=-30.7;const before=f.monster.hp;
  f.room.castBladeCore(f.client,{skillId:'blade_withdraw',targetId:f.monster.id});
  assert.ok(f.monster.hp<before,'strike still hits when retreat is blocked');assert.ok(f.player.z>=-30.7,'retreat stops before obstacle');
}
{
  const damage=rank=>{const f=fixture({blade_heavy:rank});const enemy=new Player({mapId:f.player.mapId,x:0,z:-28,y:0,alive:true,level:1,hp:2000,maxHp:2000,def:10});
    f.room.state.players.set('enemy1',enemy);f.room.castBladeCore(f.client,{skillId:'blade_heavy',targetId:'enemy1'});return 2000-enemy.hp;};
  const base=damage(0),high=damage(8);assert.ok(high>base && high<=Math.ceil(base*1.2),'PvP ranks improve damage within a bounded range');
}
{
  const f=fixture();const victim=new Player({mapId:f.player.mapId,x:0,z:-28,y:0,alive:true,level:1,hp:1000,maxHp:1000,def:10});
  f.room.state.players.set('victim',victim);f.room.swordGuardDamage=()=>{f.player.alive=false;return 100;};
  f.room.castBladeCore(f.client,{skillId:'blade_withdraw',targetId:'victim'});
  assert.equal(victim.hp,1000,'a counter that defeats the attacker cancels the original hit');
  assert.equal(f.player.z,-30,'a defeated attacker cannot retreat');
}
{
  const f=fixture();const victim=new Player({mapId:f.player.mapId,x:0,z:-28,y:0,alive:true,level:1,hp:1000,maxHp:1000,def:10});
  const tank=new Player({pathId:'sentinel',mapId:f.player.mapId,x:1,z:-28,y:0,alive:true,level:1,hp:1000,maxHp:1000});
  f.room.state.players.set('victim',victim);f.room.state.players.set('tank',tank);f.room.parties.get=id=>['victim','tank'].includes(id)?{members:['victim','tank']}:undefined;
  f.room.sentinelInterceptions.set('victim',{ownerId:'tank',until:6000,fraction:.3});
  f.room.castBladeCore(f.client,{skillId:'blade_heavy',targetId:'victim'});
  assert.ok(victim.hp<1000 && tank.hp<1000,'guardian shares the attack damage');
}
{
  const f=fixture({blade_fury:8});f.room.applyStats('blade',f.player,{hp:0,atk:0,def:0,magicAtk:0,magicDef:0,stamina:0});const before=f.player.atk;
  f.room.castBladeCore(f.client,{skillId:'blade_fury'});assert.ok(f.player.atk>before,'fury increases attack');
  f.room.simulatedMs=10000;for(const id of f.room.effects.expire(f.room.simulatedMs))f.room.applyStats(id,f.room.state.players.get(id),{hp:0,atk:0,def:0,magicAtk:0,magicDef:0,stamina:0});
  assert.equal(f.player.atk,before,'buff expires');
}
{
  const book={...newBladeBook(),coreRanks:{blade_vanish:8,blade_heavy:4},cooldowns:{blade_vanish:1000}};
  assert.deepEqual(validateBladeBook(book,100).coreRanks,book.coreRanks);
  assert.throws(()=>validateBladeBook({...book,coreRanks:{blade_vanish:8,blade_heavy:5}},100));
  assert.throws(()=>validateBladeBook(book,50));
}
console.log('PASS blade vanish, heavy strike, retreat, buff and rank save');process.exit(0);
