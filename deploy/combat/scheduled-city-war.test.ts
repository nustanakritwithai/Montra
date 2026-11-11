import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";

process.env.MONTRA_WORLD_EXPANSION="1";
process.env.MONTRA_ALL_MAP_WARS="0";
process.env.MONTRA_SCHEDULED_WARS="1";
process.env.MONTRA_CIVILIAN_WAR_FIELDS="1";
process.env.MONTRA_CASTLE_PILOT="1";
process.env.MONTRA_WAR_ROUTES="1";
const {GuildStore}=await import("./GuildStore.js");
const {getWarDefinition,warSites,WAR_DURATION}=await import("./TerritoryWar.js");
const {isRestArea,getWorldMap,groundAt,isSafeWorldPoint}=await import("./WorldMaps.js");
const {MyRoom}=await import("./MyRoom.js");
const {warWindows}=await import("./WarSchedule.js");
const {CITY_PRODUCTION_SITE,CITY_MINING_SITE}=await import("./CityProductionRules.js");
const tuesday=Date.UTC(2026,10,10,13),DAY=86_400_000;

test("weekly UTC windows preserve a fixed local start, exact lock and cutoff",()=>{
  const next=warWindows("moon_pass",tuesday-1,WAR_DURATION);
  assert.equal(next.current,null);
  assert.deepEqual(next.next,{startsAt:tuesday,locksAt:tuesday-15*60_000,endsAt:tuesday+WAR_DURATION});
  assert.deepEqual(warWindows("moon_pass",tuesday,WAR_DURATION).current,{startsAt:tuesday,endsAt:tuesday+WAR_DURATION});
  assert.equal(warWindows("moon_pass",tuesday+WAR_DURATION,WAR_DURATION).current,null);
  assert.equal(warWindows("moon_pass",tuesday,WAR_DURATION).next.startsAt,tuesday+7*DAY);
});

test("registrations persist, landless guilds are selected first and a restart earns no offline progress",t=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-scheduled-")),file=join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  t.after(()=>{
    store.close();
    assert.equal(dirname(resolve(dir)),resolve(tmpdir()));
    rmSync(dir,{recursive:true,force:true});
  });
  store.create("a","A","Owners");
  store.create("b","B","Challengers");
  store.create("c","C","Second Guild");
  store.add("b","d","Unrostered");
  store.war.government.settleVictory("river_watch",store.war.member("a")!.id,tuesday-DAY,false);
  const signup=tuesday-3600_000;
  const order=(actor:string)=>({site:"moon_pass",startsAt:tuesday,memberIds:[store.view(actor,()=>false)!.ownId]});
  assert.throws(()=>store.war.register("d",order("d"),signup),/war_officer/);
  assert.throws(()=>store.war.register("b",order("c"),signup),/war_roster_member/);
  for(const [i,actor] of ["a","b","c"].entries())store.war.register(actor,order(actor),signup+i);
  assert.throws(()=>store.war.register("b",order("b"),tuesday-15*60_000),/war_registration_locked/);
  store.war.openScheduled("moon_pass",tuesday-1);
  assert.equal(store.war.inspect("moon_pass",tuesday-1).seq,0);
  store.close();store=new GuildStore(file);
  store.war.openScheduled("moon_pass",tuesday);
  const state=store.war.inspect("moon_pass",tuesday),field={site:"moon_pass",seq:state.seq};
  assert.equal(state.attackName,"Challengers");
  assert.equal(state.defendName,"Second Guild");
  store.war.openScheduled("moon_pass",tuesday+1);
  assert.equal(store.war.inspect("moon_pass",tuesday+1).seq,field.seq);
  assert.throws(()=>store.war.side(field,store.war.member("b")!,tuesday,false,"d"),/war_roster_locked/);
  assert.equal(store.war.side(field,store.war.member("b")!,tuesday,false,"b"),"attack");
  assert.equal(store.war.side(field,store.war.member("c")!,tuesday,false,"c"),"defend");
  store.war.advance(field,tuesday+1000,1,0);
  assert.equal(store.war.inspect(field.site,tuesday+1000).progress,1);
  store.close();store=new GuildStore(file);
  store.war.openScheduled("moon_pass",tuesday+16_000);
  assert.equal(store.war.side(field,store.war.member("b")!,tuesday+16_000,false,"b"),"attack");
  store.war.resumeScheduledField(field,tuesday+16_000);
  store.war.advance(field,tuesday+16_000,1,0);
  assert.equal(store.war.inspect(field.site,tuesday+16_000).progress,1);
  for(let i=17;i<=75;i++)store.war.advance(field,tuesday+i*1000,1,0);
  assert.equal(store.war.inspect(field.site,tuesday+75_000).owner,"Challengers");
  const estate=store.war.government.view(field.site,store.war.member("b"),tuesday+75_000)!;
  assert.equal(estate.grossRate,60);
  assert.equal(estate.upkeep,10);
  assert.equal(estate.rate,50);
});

test("an attacker that hits the ownership cap while fighting cannot take a third city",()=>{
  const store=new GuildStore(":memory:");
  try{
    store.create("a","A","First Guild");store.create("b","B","Holding Guild");
    const a=store.war.member("a")!,b=store.war.member("b")!,government=store.war.government;
    const site="moon_pass",previous=tuesday-7*DAY;
    const register=(character:string,startsAt:number)=>store.war.register(character,
      {site,startsAt,memberIds:[store.view(character,()=>false)!.ownId]},startsAt-3600_000);
    register("b",previous);
    store.war.openScheduled(site,previous);
    const first={site,seq:store.war.inspect(site,previous).seq};
    for(let i=1;i<=30;i++)store.war.advance(first,previous+i*1000,2,0);
    assert.equal(store.war.inspect(site,previous+30_000).ownerId,b.id);

    government.settleVictory("river_watch",a.id,tuesday-DAY,false);
    register("a",tuesday);
    store.war.openScheduled(site,tuesday);
    const field={site,seq:store.war.inspect(site,tuesday).seq};
    government.settleVictory("sam_lan_estuary",a.id,tuesday+1,false);
    for(let i=1;i<=30;i++)store.war.advance(field,tuesday+i*1000,2,0);
    assert.equal(store.war.inspect(site,tuesday+30_000).ownerId,b.id);
    assert.equal(store.war.inspect(site,tuesday+30_000).phase,"protected");
    assert.equal(government.view("river_watch",a,tuesday+30_000)?.commander,true);
    assert.equal(government.cityOwnership(null,"sam_lan_estuary").active?.guild,a.id);
  }finally{store.close();}
});

test("civic battle points are walkable and capital protection is scoped to the room",()=>{
  assert.equal(Object.keys(warSites).length,6);
  const room=new MyRoom() as unknown as {
    field?:{site:string;seq:number};
    isProtectedArea(site:string,point:{x:number;z:number}):boolean;
  };
  for(const site of ["mantra_capital","ritual_village"]){
    const map=getWorldMap(site)!,rules=getWarDefinition(site)!.isolated!;
    assert.ok(isRestArea(site,map.spawn));
    assert.ok(room.isProtectedArea(site,map.spawn));
    for(const p of [rules.flag,rules.relay,rules.attack,rules.defend].filter(p=>p!==undefined)){
      assert.ok(isSafeWorldPoint(map,{...p,y:groundAt(site,p.x,p.z)}),site+" "+JSON.stringify(p));
    }
    room.field={site,seq:1};
    assert.equal(room.isProtectedArea(site,rules.flag),false);
    assert.equal(room.isProtectedArea(site,rules.attack),true);
    assert.equal(room.isProtectedArea(site,rules.defend),true);
    room.field=undefined;
  }
});

test("trade convoy uses one debit and credit and a lost city cancels delivery",()=>{
  const store=new GuildStore(":memory:");
  try{
    store.create("a","A","Port Guild");store.create("b","B","New Guild");
    const owner=store.war.member("a")!,government=store.war.government;
    government.settleVictory("river_watch",owner.id,tuesday-DAY,false);
    government.settleVictory("sam_lan_estuary",owner.id,tuesday-DAY,false);
    government.creditWarSupplies(owner.id,"river_watch",tuesday-1,2);
    const dispatch={id:"test_trade_convoy_0001",action:"dispatch" as const,destination:"sam_lan_estuary"};
    const deliver={id:dispatch.id,action:"deliver" as const};
    assert.equal(store.war.routeOrder("a","river_watch",dispatch,tuesday).status,"pending");
    assert.equal(store.war.routeOrder("a","river_watch",dispatch,tuesday+1).status,"pending");
    assert.equal(government.balance(owner.id),5);
    assert.throws(()=>store.war.routeOrder("a","sam_lan_estuary",deliver,tuesday+29_999),/war_route_delivery/);
    assert.throws(()=>store.war.routeOrder("a","river_watch",deliver,tuesday+30_000),/war_route_delivery/);
    assert.equal(store.war.routeOrder("a","sam_lan_estuary",deliver,tuesday+30_000).status,"delivered");
    assert.equal(store.war.routeOrder("a","sam_lan_estuary",deliver,tuesday+30_001).status,"delivered");
    assert.equal(government.balance(owner.id),17);
    assert.throws(()=>store.war.routeOrder("a","river_watch",{...dispatch,id:"test_trade_convoy_0002"},tuesday+31_000),/war_route_cooldown/);
    const next={...dispatch,id:"test_trade_convoy_0002"};
    store.war.routeOrder("a","river_watch",next,tuesday+DAY);
    government.settleVictory("sam_lan_estuary",store.war.member("b")!.id,tuesday+DAY+10_000,false);
    const balanceAfterHandover=government.balance(owner.id);
    assert.equal(store.war.routeOrder("a","sam_lan_estuary",{id:next.id,action:"deliver"},tuesday+DAY+30_000).status,"cancelled");
    assert.equal(government.balance(owner.id),balanceAfterHandover);
  }finally{store.close();}
});

test("legacy river tenure keeps its ID and the mining site has an independent tenure",t=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-city-tenure-")),guildPath=join(dir,"guilds.sqlite");
  const legacy=new DatabaseSync(guildPath);
  legacy.exec(`CREATE TABLE city_tenures(id INTEGER PRIMARY KEY,guild TEXT NOT NULL,ended INTEGER);
    CREATE UNIQUE INDEX city_active_tenure ON city_tenures((1)) WHERE ended IS NULL;
    INSERT INTO city_tenures(id,guild,ended) VALUES(24,'former-guild',500);`);
  legacy.close();
  const store=new GuildStore(guildPath);
  t.after(()=>{
    store.close();
    assert.equal(dirname(resolve(dir)),resolve(tmpdir()));
    rmSync(dir,{recursive:true,force:true});
  });
  const government=store.war.government;
  assert.deepEqual(government.cityOwnership(24).previous,{guild:"former-guild",ended:500});
  store.create("a","A","Factory Guild");
  const owner=store.war.member("a")!;
  government.settleVictory(CITY_PRODUCTION_SITE,owner.id,1000,false);
  government.settleVictory(CITY_MINING_SITE,owner.id,1000,false);
  const river=government.cityOwnership(null,CITY_PRODUCTION_SITE).active;
  const mine=government.cityOwnership(null,CITY_MINING_SITE).active;
  assert.equal(river?.guild,owner.id);
  assert.equal(mine?.guild,owner.id);
  assert.notEqual(river?.id,mine?.id);
});
