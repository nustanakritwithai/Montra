import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

Object.assign(process.env,{
  MONTRA_WORLD_EXPANSION:"1",MONTRA_ALL_MAP_WARS:"1",MONTRA_RIDGE_TERRAIN:"1",MONTRA_CASTLE_PILOT:"1",
  MONTRA_CIVILIAN_WAR_FIELDS:"0",MONTRA_SCHEDULED_WARS:"1",MONTRA_MULTI_CITY_PRODUCTION:"1",
});
const {WORLD_MAPS,groundAt,isRestArea,isSafeWorldPoint}=await import("./WorldMaps.js");
const {getWarDefinition,warSites,WAR_DURATION,WAR_HOLD}=await import("./TerritoryWar.js");
const {FRONTIER_SIZES,FRONTIER_WAR_FIELDS}=await import("./WarMapProfiles.js");
const {GuildStore}=await import("./GuildStore.js");
const {cityProductionProfile}=await import("./CityProductionRules.js");
const {MyRoom}=await import("./MyRoom.js");

test("all 18 available maps have profiles and each new battlefield has a walkable approach from both bases",()=>{
  assert.equal(Object.keys(WORLD_MAPS).length,18);
  assert.deepEqual(Object.keys(warSites).sort(),Object.keys(WORLD_MAPS).sort());
  const room=new MyRoom() as unknown as {
    field?:{site:string;seq:number};isProtectedArea(site:string,point:{x:number;z:number}):boolean;
  };
  for(const [site,layout] of Object.entries(FRONTIER_WAR_FIELDS)){
    const {seatsPerSide,durationMs,goal,isolated}=getWarDefinition(site)!,map=WORLD_MAPS[site];
    assert.equal(seatsPerSide,null,site+" side is uncapped");
    assert.deepEqual({durationMs,goal},FRONTIER_SIZES[layout.size]);
    assert.ok(isolated);
    for(const point of [isolated.attack,isolated.defend,isolated.flag]){
      assert.equal(room.isProtectedArea(site,point),isRestArea(site,point),site+" normal world protection");
    }
    room.field={site,seq:1};
    assert.equal(room.isProtectedArea(site,isolated.flag),false,site+" objective must be contested");
    assert.equal(room.isProtectedArea(site,isolated.attack),true);
    assert.equal(room.isProtectedArea(site,isolated.defend),true);
    room.field=undefined;
    for(const point of [isolated.attack,isolated.defend,isolated.relay].filter(p=>p!==undefined)){
      const steps=Math.ceil(2*Math.hypot(point.x-isolated.flag.x,point.z-isolated.flag.z));
      for(let i=0;i<=steps;i++){
        const x=point.x+(isolated.flag.x-point.x)*i/steps,z=point.z+(isolated.flag.z-point.z)*i/steps;
        assert.ok(isSafeWorldPoint(map,{x,y:groundAt(site,x,z),z},.75),site+" walk "+x+", "+z);
      }
    }
  }
});

test("a legacy manual challenge wins and stays the only battle even if the optional calendar opens",()=>{
  const store=new GuildStore(":memory:");
  try{
    store.create("a","A","Moon Guild");store.create("b","B","Calendar Guild");
    const a=store.war.member("a")!,site="moon_pass";
    const scheduledAt=Date.UTC(2026,10,10,13),manualAt=scheduledAt-1000;
    const memberIds=[store.view("b",()=>false)!.ownId];
    store.war.register("b",{site,startsAt:scheduledAt,memberIds},scheduledAt-3600_000);
    const field=store.war.start(site,a,manualAt);
    store.war.openScheduled(site,scheduledAt);
    const state=store.war.inspect(site,scheduledAt);
    assert.equal(state.seq,field.seq);
    assert.equal(state.attackName,"Moon Guild");
    assert.equal(state.goal,WAR_HOLD);
    assert.equal(state.phaseEndsAt,manualAt+WAR_DURATION);
    for(let i=1;i<=WAR_HOLD/2;i++)store.war.advance(field,manualAt+i*1000,2,0);
    assert.equal(store.war.inspect(site,scheduledAt+30_000).ownerId,a.id);
  }finally{store.close();}
});

test("every added map is captured by the same engine and its income and building survive reload",t=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-all-maps-")),file=join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const at=Date.UTC(2026,10,15,12),sites=Object.keys(FRONTIER_WAR_FIELDS);
  store.create("a","A","Frontier Guild");
  const a=store.war.member("a")!;
  for(const site of sites){
    const field=store.war.start(site,a,at);
    const {goal,durationMs}=getWarDefinition(site)!;
    assert.equal(store.war.scheduleView(site,at,a),undefined);
    assert.equal(store.war.inspect(site,at).phaseEndsAt,at+durationMs);
    for(let i=1;i<=goal!;i++)store.war.advance(field,at+i*1000,1,0);
    assert.equal(store.war.inspect(site,at+goal!*1000).ownerId,a.id);
    const now=at+9*3600_000;
    const estate=store.war.government.view(site,a,now)!;
    assert.equal(store.war.govern("a",{site,revision:estate.revision,action:"collect"},now),480);
    const afterCollect=store.war.government.view(site,a,now)!;
    assert.equal(store.war.govern("a",{site,revision:afterCollect.revision,action:"market"},now),-240);
    assert.ok(cityProductionProfile(site).capacity>0);
  }
  store.close();store=new GuildStore(file);
  for(const site of sites){
    assert.equal(store.war.inspect(site,at+9*3600_000).ownerId,a.id);
    assert.equal(store.war.government.view(site,a,at+9*3600_000)?.market,2);
    assert.equal(store.war.government.cityOwnership(null,site).active?.guild,a.id);
  }
});
