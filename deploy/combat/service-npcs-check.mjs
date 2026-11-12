import assert from 'node:assert/strict';
process.env.MONTRA_WORLD_EXPANSION='1';
process.env.MONTRA_CASTLE_PILOT='1';
process.env.MONTRA_RIDGE_TERRAIN='1';
process.env.MONTRA_ORIGINAL_RELIEF??='1';
process.env.MONTRA_ATLAS_RELIEF??='1';
process.env.MONTRA_ALL_MAP_WARS='1';
process.env.MONTRA_CITY_PRODUCTION='1';
process.env.MONTRA_CITY_MINING='1';
process.env.MONTRA_CITY_MISSIONS='1';
process.env.MONTRA_CITY_GOVERNANCE='1';
const {WORLD_MAPS,groundAt,isRestArea,isSafeWorldPoint,isWorldSegmentClear}=await import('./src/rooms/WorldMaps.ts');
const {objectiveRanger}=await import('./src/rooms/ForestObjectives.ts');
const {NPC_SERVICES,serviceNpcsFor,mapsWithServiceNpcs}=await import('./src/rooms/ServiceNpcs.ts');
const {getWarDefinition,WAR_ENTRY_RADIUS}=await import('./src/rooms/TerritoryWar.ts');
const {RIVER_WAREHOUSE_PLOT,riverNodes}=await import('./src/rooms/RiverCity.ts');
const healerMaps=new Set(['ritual_village','mantra_capital','sam_lan_estuary','moon_pass','river_watch','tri_wiang_castle']);
const totals=Object.fromEntries(Object.keys(NPC_SERVICES).map(role=>[role,0]));
const wire=JSON.parse(JSON.stringify({version:1,maps:mapsWithServiceNpcs()}));
for(const map of Object.values(WORLD_MAPS)){
  const npcs=serviceNpcsFor(map.id),keeper=objectiveRanger(map.id);
  assert.deepEqual(wire.maps[map.id].serviceNpcs,JSON.parse(JSON.stringify(npcs)),`${map.id} NPCs reach the client in world data`);
  assert.equal(Object.hasOwn(map,'serviceNpcs'),false,'original gameplay geometry remains unchanged');
  assert.ok(npcs.length>=2,`${map.id} has service NPCs`);
  assert.deepEqual(serviceNpcsFor(map.id),npcs,`${map.id} placements are stable`);
  const rules=getWarDefinition(map.id),officer=npcs.find(npc=>npc.role==='war');
  assert.equal(Boolean(officer),Boolean(rules),`${map.id} has an officer only when a war is supported`);
  if(officer){
    assert.ok(Math.hypot(officer.x-rules.entry.x,officer.z-rules.entry.z)+officer.radius<=WAR_ENTRY_RADIUS,
      `${officer.id} can be used from inside the battle entry radius`);
    assert.ok(isWorldSegmentClear(map.id,officer,rules.entry),`${officer.id} shares walkable ground with the entry`);
  }
  const healers=npcs.filter(npc=>npc.role==='ghostHealer');
  assert.equal(healers.length,Number(healerMaps.has(map.id)),`${map.id} healer coverage`);
  if(healers.length){
    const [healer]=healers;
    for(let i=0;i<16;i++){
      const angle=i*Math.PI/8;
      assert.ok(isRestArea(map.id,{x:healer.x+healer.radius*Math.cos(angle),z:healer.z+healer.radius*Math.sin(angle)}),
        `${healer.id} interaction stays inside the rest area`);
    }
    const market=map.strategic?.sites.find(site=>site.kind==='market');
    const approach=map.id==='sam_lan_estuary'?riverNodes.T:map.id==='tri_wiang_castle'?map.spawn:market??map.spawn;
    const steps=Math.max(1,Math.ceil(Math.hypot(healer.x-approach.x,healer.z-approach.z)*2));
    for(let i=0;i<=steps;i++){
      const x=approach.x+(healer.x-approach.x)*i/steps,z=approach.z+(healer.z-approach.z)*i/steps;
      assert.ok(isSafeWorldPoint(map,{x,y:groundAt(map.id,x,z),z}),`${healer.id} has a walkable approach`);
    }
  }
  for(const npc of npcs){
    assert.ok(Object.hasOwn(NPC_SERVICES,npc.role));totals[npc.role]++;
    assert.ok(isSafeWorldPoint(map,npc),`${npc.id} is on walkable ground`);
    assert.ok(map.portals.every(portal=>Math.hypot(portal.x-npc.x,portal.z-npc.z)>=3.1),`${npc.id} does not cover a portal`);
    if(keeper)assert.ok(Math.hypot(keeper.x-npc.x,keeper.z-npc.z)>=3.5,`${npc.id} does not overlap the quest NPC`);
    for(const other of npcs)if(other!==npc)assert.ok(Math.hypot(other.x-npc.x,other.z-npc.z)>=3.2,`${npc.id} does not overlap ${other.id}`);
  }
}
for(const [role,count] of Object.entries(totals))assert.ok(count>=(role==='cityHall'?1:2),`${role} appears where supported`);
assert.equal(totals.ghostHealer,healerMaps.size,'every expected city has a healer');
for(const city of ['ritual_village','mantra_capital'])
  assert.equal(serviceNpcsFor(city).filter(npc=>!['war','ghostHealer'].includes(npc.role)).length,8,`${city} has all regional service roles`);
for(const city of ['sam_lan_estuary','moon_pass']){
  const roles=serviceNpcsFor(city).map(npc=>npc.role);
  for(const role of ['cityWarehouse','cityFactory','cityMissions','market'])assert.ok(roles.includes(role),`${city} offers ${role}`);
  assert.equal(roles.includes('cityHall'),city==='moon_pass');
}
const warehouse=serviceNpcsFor('sam_lan_estuary').find(npc=>npc.role==='cityWarehouse');
assert.ok(Math.hypot(warehouse.x-RIVER_WAREHOUSE_PLOT.x,warehouse.z-RIVER_WAREHOUSE_PLOT.z)+warehouse.radius<=
  RIVER_WAREHOUSE_PLOT.radius,'the warehouse clerk is within the construction plot');
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
console.log(`PASS: ${Object.keys(WORLD_MAPS).length} maps, ${totals.war} war officers, ${totals.ghostHealer} reachable companion healers in rest areas, city services and village mentor`);
