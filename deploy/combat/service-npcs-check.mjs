import assert from 'node:assert/strict';
process.env.MONTRA_WORLD_EXPANSION='1';
process.env.MONTRA_CASTLE_PILOT='1';
process.env.MONTRA_RIDGE_TERRAIN='1';
process.env.MONTRA_ORIGINAL_RELIEF='1';
process.env.MONTRA_ATLAS_RELIEF='1';
const {WORLD_MAPS,isSafeWorldPoint}=await import('./src/rooms/WorldMaps.ts');
const {objectiveRanger}=await import('./src/rooms/ForestObjectives.ts');
const {NPC_SERVICES,serviceNpcsFor,mapsWithServiceNpcs}=await import('./src/rooms/ServiceNpcs.ts');
const totals=Object.fromEntries(Object.keys(NPC_SERVICES).map(role=>[role,0]));
const wire=JSON.parse(JSON.stringify({version:1,maps:mapsWithServiceNpcs()}));
for(const map of Object.values(WORLD_MAPS)){
  const npcs=serviceNpcsFor(map.id),keeper=objectiveRanger(map.id);
  assert.deepEqual(wire.maps[map.id].serviceNpcs,JSON.parse(JSON.stringify(npcs)),`${map.id} NPCs reach the client in world data`);
  assert.equal(Object.hasOwn(map,'serviceNpcs'),false,'original gameplay geometry remains unchanged');
  assert.ok(npcs.length>=2,`${map.id} has service NPCs`);
  assert.deepEqual(serviceNpcsFor(map.id),npcs,`${map.id} placements are stable`);
  for(const npc of npcs){
    assert.ok(Object.hasOwn(NPC_SERVICES,npc.role));totals[npc.role]++;
    assert.ok(isSafeWorldPoint(map,npc),`${npc.id} is on walkable ground`);
    assert.ok(map.portals.every(portal=>Math.hypot(portal.x-npc.x,portal.z-npc.z)>=3.1),`${npc.id} does not cover a portal`);
    if(keeper)assert.ok(Math.hypot(keeper.x-npc.x,keeper.z-npc.z)>=3.5,`${npc.id} does not overlap the quest NPC`);
    for(const other of npcs)if(other!==npc)assert.ok(Math.hypot(other.x-npc.x,other.z-npc.z)>=3.2,`${npc.id} does not overlap ${other.id}`);
  }
}
for(const [role,count] of Object.entries(totals))assert.ok(count>=2,`${role} appears in multiple areas`);
for(const city of ['ritual_village','mantra_capital'])assert.equal(serviceNpcsFor(city).length,8,`${city} has all service roles`);
const mentor=serviceNpcsFor('ritual_village').find(n=>n.role==='mentor');
assert.ok(mentor && Math.hypot(mentor.x,mentor.z)<=6,'village mentor stands in the skill training area');
const forest=serviceNpcsFor('forbidden_forest');
assert.ok(forest.every(n=>Math.hypot(n.x,n.z-14)>=15),'forest services are not clustered at the entry portal');
assert.ok(Math.max(...forest.flatMap(a=>forest.map(b=>Math.hypot(a.x-b.x,a.z-b.z))))>=30,'forest services spread between hunting areas');
const firstQuest=objectiveRanger('forbidden_forest');assert.ok(firstQuest && Math.hypot(firstQuest.x,firstQuest.z-14)>=10,'quest giver stands on the trail toward the hunting area');
for(const [mapId,role,kind] of [['moon_pass','strategy','fort'],['moon_pass','market','market'],['sam_lan_estuary','smith','mine'],['tri_wiang_castle','market','market']]){
  const map=WORLD_MAPS[mapId],npc=serviceNpcsFor(mapId).find(n=>n.role===role),site=map.strategic.sites.find(s=>s.kind===kind);
  assert.ok(npc && site && Math.hypot(npc.x-site.x,npc.z-site.z)<=20,`${mapId} ${role} stands near the relevant landmark`);
}
console.log(`PASS: ${Object.keys(WORLD_MAPS).length} maps, repeated service roles, safe placement and village mentor`);
