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
process.env.MONTRA_MULTI_CITY_PRODUCTION="1";
process.env.MONTRA_WAR_ROUTES="1";
const {GuildStore}=await import("./GuildStore.js");
const {EconomyStore}=await import("./EconomyStore.js");
const {getWarDefinition,warSites,WAR_DURATION}=await import("./TerritoryWar.js");
const {isRestArea,getWorldMap,groundAt,isSafeWorldPoint}=await import("./WorldMaps.js");
const {MyRoom}=await import("./MyRoom.js");
const {warWindows}=await import("./WarSchedule.js");
const {CITY_PRODUCTION_SITE,CITY_RAW_ITEMS,CITY_PRODUCT,parseCityOrder}=await import("./CityProductionRules.js");
const {makeClassInventory}=await import("./ItemRules.js");
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
    assert.equal(government.cityOwnership(null,"river_watch").active?.guild,a.id);
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

test("legacy river tenure keeps its ID and new cities reconcile isolated stocks and sales",t=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-multi-city-")),guildPath=join(dir,"guilds.sqlite");
  const legacy=new DatabaseSync(guildPath);
  legacy.exec(`CREATE TABLE city_tenures(id INTEGER PRIMARY KEY,guild TEXT NOT NULL,ended INTEGER);
    CREATE UNIQUE INDEX city_active_tenure ON city_tenures((1)) WHERE ended IS NULL;
    INSERT INTO city_tenures(id,guild,ended) VALUES(24,'former-guild',500);`);
  legacy.close();
  const store=new GuildStore(guildPath),economy=new EconomyStore(join(dir,"economy.sqlite"));
  t.after(()=>{
    store.close();economy.close();
    assert.equal(dirname(resolve(dir)),resolve(tmpdir()));
    rmSync(dir,{recursive:true,force:true});
  });
  assert.deepEqual(store.war.government.cityOwnership(24).previous,{guild:"former-guild",ended:500});
  const a="a".repeat(64),b="b".repeat(64),buyer="c".repeat(64),[wood,stone]=CITY_RAW_ITEMS;
  store.create(a,"A","Factory Guild");store.create(b,"B","Rival Guild");
  for(const actor of [a,b,buyer]){
    const bag=makeClassInventory("seer");
    bag.slots[6]={itemId:wood,quantity:30};bag.slots[7]={itemId:stone,quantity:30};
    economy.register(actor,bag);
  }
  const owner=store.war.member(a)!,rival=store.war.member(b)!;
  const government=store.war.government,moon="moon_pass",river=CITY_PRODUCTION_SITE;
  for(const site of [moon,river])government.settleVictory(site,owner.id,1000,false);
  const sync=(site:string,now:number)=>economy.syncCity(previous=>government.cityOwnership(previous,site),now,site);
  const view=(site:string,now:number,member=owner)=>economy.viewCity(member,sync(site,now),site);
  const moonEpoch=view(moon,1000).epoch!,riverEpoch=view(river,1000).epoch!;
  assert.notEqual(moonEpoch,riverEpoch);
  let serial=0;
  const command=(site:string,fields:object,now=1000)=>{
    const order=parseCityOrder({...fields,requestId:"test_multi_city_"+ ++serial});
    assert.ok(order && order.action!=="disband" && order.action!=="claim_disband");
    return economy.cityOrder(a,owner,order,sync(site,now),now,site);
  };
  for(const [site,epoch] of [[moon,moonEpoch],[river,riverEpoch]] as const){
    command(site,{action:"deposit",epoch,item:wood,slot:6,amount:8});
    command(site,{action:"deposit",epoch,item:stone,slot:7,amount:9});
    command(site,{action:"build",epoch});
    command(site,{action:"start",epoch});
  }
  assert.equal(view(moon,91_000).stock.find(x=>x.item===CITY_PRODUCT)?.quantity,1);
  assert.ok(view(river,91_000).job);
  assert.throws(()=>command(river,{action:"reclaim",epoch:moonEpoch,item:wood,amount:1}),/city_stock_active/);
  const {listingId}=command(moon,{action:"list",epoch:moonEpoch,amount:1,price:70},91_000);
  command(moon,{action:"start",epoch:moonEpoch},92_000);
  government.settleVictory(moon,rival.id,93_000,false);
  assert.equal(view(moon,94_000,rival).level,1);
  assert.deepEqual(view(moon,94_000,rival).stock,[]);
  assert.equal(view(moon,94_000).reclaim.find(x=>x.epoch===moonEpoch && x.item===stone)?.quantity,2);
  economy.buy(buyer,"test_multi_city_buy_01",String(listingId));
  assert.equal(view(river,121_000).marketGold,70);
  assert.equal(view(river,121_000).stock.find(x=>x.item===CITY_PRODUCT)?.quantity,1);
});
