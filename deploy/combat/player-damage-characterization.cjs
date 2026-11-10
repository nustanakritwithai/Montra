/* Read-only characterization, not an integration test. Run with Node 22 and the
 * verified staging copy's tsx loader; no server, disk store, or real player data. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const ts=require(path.join(root,'combat-verify/node_modules/typescript'));
const sourcePath=path.join(root,'deploy/combat/MyRoom.ts');
const copyPath=path.join(root,'combat-verify/src/rooms/MyRoom.ts');

// The whole HP write inventory is deliberate: monster/NPC/heal/reset writes are
// included so they cannot hide a new direct player damage operation. Dynamic
// computed keys, arbitrary reflective helpers, indirect setters and other source files
// are outside this supplemental inventory; it is not an exhaustive damage proof. Each entry
// records the nearest named method and normalized AST assignment, not line numbers.
const baseline=`
beginRebirth|player.hp=player.maxHp
updateForestDefenses|state.hp=Math.max(0,state.hp-Math.min(8,attackers)*2)
updateForestEscorts|npc.hp=Math.max(0,npc.hp-Math.min(6,attackers)*3)
castClassSkill|target.hp=Math.min(target.maxHp,target.hp+this.healAmount(id,member,target.maxHp*skill.effect.fraction))
castMenderCore|target.hp=Math.min(target.maxHp,target.hp+this.healAmount(id,member,target.maxHp*p.mender_core_circle.fraction))
castOccultSkill|target.hp=Math.min(target.maxHp,target.hp+amount)
updateOccultEffects|target.hp=Math.min(target.maxHp,target.hp+this.healAmount(regen.ownerId,targetId,target.maxHp*regen.fraction))
updateOccultEffects|target.hp=Math.min(target.maxHp,target.hp+this.healAmount(ownerId,member,target.maxHp*field.power))
applyStats|player.hp=Math.min(player.maxHp,player.hp/prior.hp*(player.maxHp/baseHp))
applyStats|player.hp=Math.min(player.hp,player.maxHp)
<top>|current.hp=Math.min(current.maxHp,current.hp+result.healed)
<top>|player.hp=hp
applyMonsterHit|monster.hp=Math.max(0,monster.hp-damage)
applyPlayerHit|victim.hp=Math.max(0,victim.hp-damage)
finishRescue|target.hp=Math.min(target.maxHp,target.hp+event.amount)
onCreate|this.state.monster.hp=RULES.monsterMaxHp
resolveForestMonsterHit|player.hp=Math.max(0,player.hp-damage)
updateResources|player.hp=Math.min(player.maxHp,player.hp+healed)
knockoutPlayer|victim.hp=0
resolveDefaultMonsterHit|target.hp=Math.max(0,target.hp-damage)
updateRespawns|monster.hp=monster.maxHp
updateRespawns|player.hp=player.maxHp
onJoin|player.hp=Math.min(player.maxHp,normalizedHp>0?normalizedHp*(saved?.masteryVitals?restoredScales.hp:1):player.maxHp)
`.trim().split('\n').sort();
function inventory(text) {
 const source=ts.createSourceFile('MyRoom.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS), found=[], stack=[];
 const isHp=n=>ts.isPropertyAccessExpression(n)&&n.name.text==='hp' || ts.isElementAccessExpression(n)&&ts.isStringLiteralLike(n.argumentExpression)&&n.argumentExpression.text==='hp';
 const containsHp=n=>{let hit=isHp(n); ts.forEachChild(n,child=>{if(containsHp(child))hit=true;});return hit;};
 function visit(n) {
   const method=ts.isMethodDeclaration(n);if(method)stack.push(n.name.getText(source));
   let mutation=false;
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment) mutation=containsHp(n.left);
   if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator))mutation=containsHp(n.operand);
   if(ts.isDeleteExpression(n))mutation=containsHp(n.expression);
   if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)) {
     const methodName=n.expression.getText(source);
     if((methodName==='Object.defineProperty'||methodName==='Reflect.set')&&n.arguments[1]&&ts.isStringLiteralLike(n.arguments[1])&&n.arguments[1].text==='hp')mutation=true;
     if(methodName==='Object.assign'&&n.arguments.slice(1).some(a=>ts.isObjectLiteralExpression(a)&&a.properties.some(p=>p.name&&p.name.getText(source).replace(/['"]/g,'')==='hp')))mutation=true;
   }
   if(mutation) found.push(`${stack.at(-1)||'<top>'}|${n.getText(source).replace(/\s/g,'')}`);
   ts.forEachChild(n,visit);if(method)stack.pop();
 }
 visit(source);return found.sort();
}
test('AST inventory identifies all reviewed HP mutation sites in MyRoom',()=>{
 assert.deepEqual(inventory(fs.readFileSync(sourcePath,'utf8')),baseline);
});
test('inventory catches new direct, compound, bracket and reflective HP writes',()=>{
 const sample=`class T { f(p: any) {p.hp -= 2; p['hp']++; Object.defineProperty(p,'hp',{value:0}); Reflect.set(p,'hp',1); Object.assign(p,{hp:3}); ({hp:p.hp}={hp:4});} }`;
 const found=inventory(sample);assert.equal(found.length,6);for(const item of found)assert.match(item,/^f\|/);
});

async function fixture() {
 assert.equal(fs.readFileSync(copyPath,'utf8'),fs.readFileSync(sourcePath,'utf8'),'generated MyRoom must match the source under review');
 const {MyRoom}=await import(pathToFileURL(copyPath).href);
 const {Player}=await import(pathToFileURL(path.join(root,'combat-verify/src/rooms/schema/MyRoomState.ts')).href);
 const room=new MyRoom(), player=new Player({x:-10,y:0,z:0,alive:true,hp:100,maxHp:100,level:1}), owner=new Player({x:-10,y:0,z:1,alive:true,hp:100,maxHp:100,level:1});
 room.state.players.set('victim',player);room.state.players.set('attacker',owner);
 const trace=[];
 room.broadcast=(type,data)=>trace.push({type,hp:player.hp,alive:player.alive,data:structuredClone(data)});
 room.sameCombatMap=()=>true;room.endBladeCloak=()=>{};room.swordGuardDamage=(_id,_source,damage)=>damage;
 room.saveCharacter=async()=>{};
 return {room,player,owner,trace};
}
for(const lethal of [false,true])test(`occult PvP damage commits and reports in ${lethal?'lethal':'nonlethal'} order`,async()=>{
 const {room,player,owner,trace}=await fixture();
 room.occultDamage('attacker','victim',lethal?150:25);
 assert.equal(player.hp,lethal?0:75);assert.equal(player.alive,!lethal);assert.equal(player.hitSeq,1);
 assert.deepEqual(trace.map(x=>x.type),lethal?['pvp_hit','player_down','pvp_kill']:['pvp_hit']);
 assert.equal(trace[0].hp,lethal?0:75);assert.equal(trace[0].alive,true);
 if(lethal){assert.equal(owner.pkKills,1);assert.equal(player.pkDeaths,1);assert.equal(trace[1].alive,false);}
});
for(const lethal of [false,true])test(`default monster damage commits and reports in ${lethal?'lethal':'nonlethal'} order`,async()=>{
 const {room,player,trace}=await fixture();
 room.priestProtected=()=>false;room.masteryPower=()=>0;room.swordGuardDamage=()=>lethal?150:25;
 const monster=room.state.monster;monster.x=player.x;monster.y=player.y;monster.z=player.z;monster.alive=true;
 room.simulatedMs=100000;room.monsterAttack('victim',player);
 assert.equal(player.hp,lethal?0:75);assert.equal(player.alive,!lethal);assert.equal(player.hitSeq,1);
 assert.deepEqual(trace.map(x=>x.type),lethal?['monster_hit','player_down']:['monster_hit']);
 assert.equal(trace[0].hp,lethal?0:75);assert.equal(trace[0].alive,true);
 if(lethal)assert.equal(trace[1].alive,false);
});

for(const lethal of [false,true])test(`nested Sentinel interception commits before primary PvP hit (${lethal?'lethal':'nonlethal'} interceptor)`,async()=>{
 const {room,player,owner,trace}=await fixture();
 const {Player}=await import(pathToFileURL(path.join(root,'combat-verify/src/rooms/schema/MyRoomState.ts')).href);
 const defender=new Player({x:player.x,y:player.y,z:player.z,alive:true,hp:lethal?10:100,maxHp:100,level:1,pathId:'sentinel',mapId:player.mapId});
 room.state.players.set('defender',defender);
 const invite=room.parties.invite('victim','defender',0);room.parties.accept('defender',invite.id,0);
 room.sentinelInterceptions.set('victim',{ownerId:'defender',until:1000,fraction:0.5});
 room.simulatedMs=1;room.markWarSupport=()=>{};room.touchPvp=()=>{};
 room.swordGuardDamage=Object.getPrototypeOf(room).swordGuardDamage.bind(room);
 room.occultDamage('attacker','victim',40);
 assert.equal(player.hp,80);assert.equal(defender.hp,lethal?0:80);assert.equal(defender.alive,!lethal);
 assert.deepEqual(trace.map(x=>x.type),lethal?['sentinel_intercept','player_down','pvp_kill','pvp_hit']:['sentinel_intercept','pvp_hit']);
 assert.equal(trace[0].data.hp,lethal?0:80);assert.equal(trace.at(-1).data.hp,80);
 if(lethal){assert.equal(owner.pkKills,1);assert.equal(defender.pkDeaths,1);}
});

test('every player damage notification immediately checks Deep Heal',()=>{
 const text=fs.readFileSync(sourcePath,'utf8');
 const source=ts.createSourceFile('MyRoom.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const types=new Set(['pvp_hit','monster_hit','sentinel_intercept']);
 let count=0;
 function visit(node){
  if(ts.isBlock(node))for(const [i,statement] of node.statements.entries()){
   if(!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))continue;
   const call=statement.expression;
   if(call.expression.getText(source)!=='this.broadcast' || !call.arguments.length ||
      !ts.isStringLiteral(call.arguments[0]) || !types.has(call.arguments[0].text))continue;
   count++;
   const payload=call.arguments[1];
   const value=key=>{
    const property=payload.properties.find(entry=>entry.name?.getText(source)===key);
    return property?.initializer ?? property?.name;
   };
   const recipientKey=call.arguments[0].text==='sentinel_intercept'?'playerId':'targetId';
   let args;
   if(call.arguments[0].text==='monster_hit'){
    const next=node.statements[i+1]?.expression;
    assert.equal(next?.expression.getText(source),'this.resolveRescueAfterDamage');
    args=next.arguments;
   }else{
    const publish=node.parent,commit=publish.parent;
    assert.ok(ts.isArrowFunction(publish));
    assert.ok(ts.isCallExpression(commit));
    assert.equal(commit.expression.getText(source),'this.applyPlayerHit');
    assert.equal(commit.arguments[4],publish);
    args=commit.arguments.slice(1,4);
   }
   assert.equal(args[0].getText(source),value(recipientKey).getText(source));
   assert.equal(args[1].getText(source),value('hp').expression.getText(source));
   assert.equal(args[2].getText(source),value('damage').getText(source));
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
 assert.equal(count,16);
 assert.ok(text.includes('try{publish();this.resolveRescueAfterDamage(id,victim,damage);}'));
});
