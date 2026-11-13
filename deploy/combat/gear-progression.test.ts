import {test} from "node:test";
import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {runInNewContext} from "node:vm";
import {resourceNodes} from "./WorldResources.js";
import assert from "node:assert/strict";
import {BODY_SLOTS, personalItem, PERSONAL_ITEMS, WEAPON_LEVELS, OUTFIT_LEVELS, MATERIAL_LEVELS, equipPositions, monsterCardDrop, startingWeapon, wearsTwinSwords, wearsWraps, usesStaff, type BodyItemId, type PersonalId} from "./PersonalItems.js";
import {CATALOG_PAGES,catalogPageWithRates,STARTER_HUNT,hunts,itemCamp,practiceSite,journeyWeapon,findItemHunt,rollMonsterLoot} from "./MonsterLoot.js";
import {makeClassInventory,equipBody,equipInventoryWeapon,equippedStats,equipmentRatings,gearHealing,overflowStaminaRegen,weaponBonuses,practiceLoot,validateInventory} from "./ItemRules.js";
import {EconomyStore} from "./EconomyStore.js";
import {parseSalvage,type SalvageOrder} from "./EconomyRules.js";
import {plainForge,birthForge,rollForge,forgeStamp,rerollIngredient} from "./ForgeRules.js";
import {changeCardSocket} from "./CardSockets.js";
import {ATLAS_SPAWNS} from "./WorldAtlas.js";
import {FOREST_CAMPS,WORLD_EXPANSION,WORLD_MAPS} from "./WorldMaps.js";
import {TEMPLE_SPAWNS} from "./TempleMap.js";
import {personalGearGuides,cardHunt} from "./GearGuides.js";
import {gearMana} from "./ItemRules.js";
import {monsterExperience,addExperience,calculateDamage,calculateStats,emptyAllocations,PROGRESSION} from "./Progression.js";
import {monsterProfile} from "./MonsterProfiles.js";
import {DUAL_SWORD} from "./CharacterBuilds.js";
import {bossAccessoryReward,grantStackReward} from "./ItemRules.js";
import {BOSS_TREASURES,type CardId,type MaterialId} from "./PersonalItems.js";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";

const paths=["muay_boran","phutthaisawan","blade","sentinel","seer","mender"];
const entries=Object.entries(PERSONAL_ITEMS);
const base={maxHp:1000,atk:100,def:110,magicAtk:90,magicDef:65,maxStamina:298};

test("all four camp spawns carry every starter; ten qualifying kills guarantee only the missing first copy",()=>{
  const miss=(n:number)=>n-1;
  for(const path of paths){
    const id=startingWeapon(path),owned=new Set(entries.map(([key])=>key));owned.delete(id);
    for(const mob of STARTER_HUNT.mobs)assert.equal(rollMonsterLoot(mob,path,owned,1,0,"normal",()=>0)?.id,id);
    let bag=makeClassInventory(path);
    bag.slots=bag.slots.map(s=>s??{itemId:"health_potion",quantity:99});
    assert.equal(practiceLoot(bag,path,1,"normal",1,"forest_east_1",miss).bag.starterHuntKills,undefined);
    assert.equal(practiceLoot(bag,path,1,"normal",11,STARTER_HUNT.mobs[0],miss).bag.starterHuntKills,undefined);
    for(let kill=1;kill<=STARTER_HUNT.goal+2;kill++){
      const result=practiceLoot(bag,path,1,"normal",10,STARTER_HUNT.mobs[(kill-1)%4],miss);
      assert.equal(result.starterCopy,kill===STARTER_HUNT.goal?id:undefined);
      bag=validateInventory(JSON.parse(JSON.stringify(result.bag)));
      assert.equal(bag.starterHuntKills,Math.min(kill,STARTER_HUNT.goal));
      assert.equal(bag.forgeCopies?.[id]??0,Number(kill>=STARTER_HUNT.goal));
    }
    assert.throws(()=>validateInventory({...bag,starterHuntKills:11}),/inventory_record_invalid/);
    const early=makeClassInventory(path);early.forgeCopies={[id]:1};
    const result=practiceLoot(early,path,1,"normal",1,STARTER_HUNT.mobs[0],miss);
    assert.equal(result.bag.starterHuntKills,STARTER_HUNT.goal);assert.equal(result.starterCopy,undefined);
    assert.equal(result.bag.forgeCopies?.[id],1);
  }
});

test("class camps unlock the correct weapon, and at least 80% of hunters find it or its ingredients in twenty kills",()=>{
  for(const level of [10,20])for(const [job,path] of paths.entries()){
    const weapon=journeyWeapon(path,level)!;
    const guide=personalGearGuides(path,level)!.journey!;
    assert.equal(guide.weapon,weapon);assert.equal(PERSONAL_ITEMS[weapon].level,level);
    if(WORLD_EXPANSION)assert(guide.practice && guide.practice.level<=level && level-guide.practice.level<=4);
    const camp=itemCamp(weapon,level)!;
    assert(camp.mobs.includes(camp.id));
    for(const id of camp.mobs){
      const owned=new Set(entries.map(([key])=>key));owned.delete(weapon);
      assert.equal(rollMonsterLoot(id,path,owned,level,3,"normal",()=>0)?.id,weapon,id);
    }
    const monster=hunts.find(m=>m.id===camp.id)!;
    const tier=(monster.tier??"normal") as Parameters<typeof monsterExperience>[2];
    const recipe=PERSONAL_ITEMS[weapon].recipe!;
    let successes=0;
    for(let attempt=0;attempt<200;attempt++){
      let seed=91000+1000*job+attempt;
      const roll=(max:number)=>{
        seed=(seed+0x6D2B79F5)>>>0;
        let v=Math.imul(seed^(seed>>>15),1|seed);
        v^=v+Math.imul(v^(v>>>7),61|v);
        return Math.floor(((v^(v>>>14))>>>0)/4294967296*max);
      };
      let bag=makeClassInventory(path),xp={level,experience:0};
      const oldWeapon=bag.slots[1]!;
      oldWeapon.itemId=level===10?startingWeapon(path):journeyWeapon(path,10)!;
      oldWeapon.forge={...plainForge(),rank:3};bag.firstChestClaimed=true;
      for(let kill=1;kill<=20;kill++){
        const card=monsterCardDrop(monster.id,monster.level,()=>roll(100));
        if(card)bag=grantStackReward(bag,card)??bag;
        bag=practiceLoot(bag,path,monster.level,tier,xp.level,monster.id,roll).bag;
        xp=addExperience(xp.level,xp.experience,monsterExperience(xp.level,monster.level,tier));
        for(const [slot,piece] of bag.slots.entries()){
          if(!piece)continue;
          const item=personalItem(piece.itemId);
          const position=item && equipPositions(item.kind).find(pos=>!bag.equipment?.[pos]);
          if(position){
            const change=equipBody(bag,position,slot,piece.itemId as BodyItemId,path,xp.level,forgeStamp(piece));
            if(change.ok)bag=change.inventory;
          }
        }
        const enough=recipe.every(input=>bag.slots.reduce((n,s)=>n+(s?.itemId===input.item?s.quantity:0),0)>=input.qty);
        if(bag.slots.some(s=>s?.itemId===weapon) || enough){successes++;break;}
      }
    }
    assert(successes>=160,path+" Lv."+level+" reached the target in "+successes+"/200 hunts");
  }
});

test("early journeys farm eligible ordinary camps before moving to harder hunts",()=>{
  for(const path of paths)for(let level=1;level<=25;level++){
    const journey=personalGearGuides(path,level)!.journey!;
    const eligible=hunts.filter(m=>(m.tier??"normal")==="normal" && m.level<=level && level-m.level<=4 && practiceSite(m.id)?.open);
    assert.equal(Boolean(journey.practice),eligible.length>0,path+" Lv."+level);
    assert.equal(journey.camps.length>0,eligible.length>0);
    for(const site of [journey.practice,...journey.camps].filter(Boolean)){
      assert(site!.open && site!.level<=level && level-site!.level<=4);
      assert(eligible.some(m=>m.id===site!.id),"actual ordinary spawn, not an invented level target");
    }
  }
  const catalog=Object.assign({},...CATALOG_PAGES);
  for(const id of ["mat_hide_1","mat_fiber_1","mat_resin_1","mat_ink_1"]){
    const source=catalog[id].huntTarget,expected=itemCamp(id as PersonalId,1)!;
    assert.equal(source.level,expected.level);assert.equal(source.map,expected.map);
    assert.deepEqual(source.mobs,expected.mobs);
    assert(source.mobs.includes(source.id));
  }
});

test("actual Lv10 guardian recipes switch supplies across areas after leveling",()=>{
  if(!WORLD_EXPANSION)return;
  const relative="src/client/ui/041-character-hud-and-journey.js";
  const root=existsSync(resolve(relative))?process.cwd():resolve("..");
  const source=readFileSync(resolve(root,relative),"utf8");
  const start=source.indexOf("  function travelRoute("),end=source.indexOf("  function hudGuide()");
  assert(start>=0 && end>start);
  const catalog=Object.assign({},...CATALOG_PAGES) as Record<string,any>;
  assert.equal(catalog.mat_fiber_2.huntTarget.id,"temple_forecourt_3");
  assert.equal(catalog.mat_fiber_2.huntTarget.level,10);
  assert(!resourceNodes("forbidden_forest").some(n=>n.tier===2),"forest has no tier2 nodes despite Lv10–12 monsters");
  for(const path of paths){
    const bag=makeClassInventory(path);bag.slots[1]!.forge={...plainForge(),rank:3};
    const me={characterId:"recipe-"+path,pathId:path,level:1,x:0,z:0,experience:0,xpToNext:150};
    const context:any={mode:"live",ownServerCharacter:()=>me,inventoryState:bag,personalItems:catalog,
      gearGuides:personalGearGuides(path,1),activeMapId:"forbidden_forest",worldDefinitions:WORLD_MAPS,
      fieldTrainingTip:null,territoryState:null,economyReady:()=>true,MONSTER_ID:"possessed-1",drawerActive:null,
      room:{state:{monsters:new Map(hunts.map(m=>[m.id,{...m,alive:true}]))}},resources:{mapId:"forbidden_forest",nodes:[]},
      monsterForSpell:(id:string)=>context.room.state.monsters.get(id),
      currentEquippedWeaponSlot:()=>bag.equippedWeaponSlot,wornGearAt:()=>bag.slots[bag.equippedWeaponSlot!],bagMeta:(id:string)=>catalog[id],
      localStorage:{getItem:():string|null=>null,setItem(){}},toast(){}};
    const api=runInNewContext("let travelRoutes=null,journeyOwner='',journeyNotes={};\n"+source.slice(start,end)+
      "\n({goal:fieldGearGoal})",context);
    for(let level=1;level<10;level++){
      me.level=level;context.gearGuides=personalGearGuides(path,level);
      const goal=api.goal();assert(goal.levelGoal,path+" Lv."+level+" must farm before Lv10 gear");
      assert.match(goal.progress,new RegExp("Lv\\."+level+" / 10"));
      const target=goal.to;
      if(target?.level)assert(target.level<=level,"never send a lower-level player to the guardian");
    }
    me.level=10;context.gearGuides=personalGearGuides(path,10);
    context.activeMapId="bound_temple";
    context.resources={mapId:"bound_temple",nodes:resourceNodes("bound_temple").map(n=>({...n,stock:n.capacity}))};
    const weapon=context.gearGuides.journey.weapon;
    if(["blade","phutthaisawan","sentinel"].includes(path))assert.equal(context.gearGuides.journey.camp.id,"temple_forecourt_3");
    const sequence:string[]=[];
    for(let step=0;step<20;step++){
      const goal=api.goal();assert.equal(goal.recipe,weapon);
      const missing=goal.missingMaterial;
      if(!missing){assert.equal(goal.to,null);assert.match(goal.step,/วัตถุดิบครบ/);break;}
      sequence.push(missing.id);
      if(missing.craftIngredient){
        for(const part of catalog[missing.id].recipe){
          const input=bag.slots.find(s=>s?.itemId===part.item)!;assert(input.quantity>=part.qty);input.quantity-=part.qty;
        }
      }
      // A confirmed material receipt (from combat or gathering) updates only inventory.
      const held=bag.slots.find(s=>s?.itemId===missing.id);
      if(held)held.quantity=missing.need;else bag.slots.push({itemId:missing.id,quantity:missing.need});
      if(missing.id==="mat_ingot_2" && path==="blade"){
        const next=api.goal();assert.equal(next.missingMaterial.id,"mat_hide_2");
        assert.equal(next.to.targetMapId,"forbidden_forest","guardian materials lead via forest to the marsh for hides");
      }
      if(step===19)assert.fail("recipe guidance did not finish "+path);
    }
    if(["blade","phutthaisawan","sentinel"].includes(path)){
      assert(sequence.includes("mat_ingot_2") && sequence.includes("mat_charcoal_2") && sequence.includes("mat_raw_wood_2"),"kiln prerequisites are actual next goals");
    }
    bag.slots.push({itemId:weapon,quantity:1});
    const ready=api.goal();assert(ready.itemSlot>=0);bag.equippedWeaponSlot=ready.itemSlot;
    assert(api.goal().levelGoal,"equipping returns to EXP farming, rather than another completed guardian goal");
  }
});

test("training a worn +1 or +2 weapon prioritizes its next spare without consuming the useful gear guarantee",()=>{
  const path="muay_boran",id=startingWeapon(path),miss=(max:number)=>max-1;
  const regularGearRoll=()=>{let first=true;return (max:number)=>{if(max!==100)return 0;if(first){first=false;return 0;}return 99;};};
  const bag=makeClassInventory(path);bag.firstChestClaimed=true;bag.starterHuntKills=10;
  const piece=bag.slots[1]!;
  for(let rank=1;rank<=2;rank++){
    piece.forge=rollForge(piece.forge,"enhance",()=>0,personalItem(id)).forge;
    const drop=practiceLoot(bag,path,1,"normal",rank,"forest_west_3",regularGearRoll());
    assert.equal(drop.banked,true);assert.equal(drop.id,id);assert.equal(drop.bag.forgeCopies?.[id],1);
    assert.notEqual(practiceLoot({...bag,lootMisses:3},path,1,"normal",rank,"forest_west_3",regularGearRoll()).id,id);
    assert.notEqual(practiceLoot(drop.bag,path,1,"normal",rank,"forest_west_3",regularGearRoll()).id,id);
    assert.equal(personalItem(practiceLoot(bag,path,1,"normal",rank,"forest_west_3",miss).id)?.kind,"material");
  }
  piece.forge=rollForge(piece.forge,"enhance",()=>0,personalItem(id)).forge;
  assert.notEqual(practiceLoot(bag,path,1,"normal",3,"forest_west_3",regularGearRoll()).id,id);
});

test("+3 practice weapons change a real PvE combat result for all six roles",()=>{
  const monster=monsterProfile(1);
  for(const path of paths){
    const bag=makeClassInventory(path),gear=bag.slots[1]!,stats=equippedStats(calculateStats(1,emptyAllocations()),bag);
    const result=()=>{
      const bonuses=weaponBonuses(bag);
      if(path==="mender")return gearHealing(bag,60);
      if(path==="sentinel")return -calculateDamage(monster.attack,stats.def+equipmentRatings(bag).guard,1);
      if(path==="seer")return calculateDamage(stats.magicAtk+bonuses.ranged,monster.defense,1);
      return calculateDamage((stats.atk+bonuses.melee)*(path==="phutthaisawan"?DUAL_SWORD.damageMultiplier:1),monster.defense,1);
    };
    const before=result(),pvp=weaponBonuses(bag,"pvp"),def=personalItem(gear.itemId)!;
    for(let i=1;i<=3;i++)gear.forge=rollForge(gear.forge,"enhance",()=>0,def).forge;
    assert(result()>before,path);assert.deepEqual(weaponBonuses(bag,"pvp"),pvp);
    assert.equal(equipmentRatings(bag)[def.forge!.primary],def.forge!.enhanceRatings![3]);
  }
});

test("level five offers a named core skill and available points for every class",()=>{
  const room=new MyRoom() as unknown as {coreTrainingAtLevel(id:string,path:string,oldLevel:number,level:number):
    {points:number;choices:{name:string;rank:number}[]}|undefined};
  for(const path of paths){
    assert.equal(room.coreTrainingAtLevel("hunter",path,3,4),undefined);
    const offer=room.coreTrainingAtLevel("hunter",path,4,5);
    assert.equal(offer?.points,1);assert(offer?.choices.length && offer.choices.every(s=>s.name && s.rank===1));
  }
});

test("level 26–50 training routes use normal camps, distinct class lessons and only level-eligible regional bosses",()=>{
  const room=new MyRoom() as unknown as {coreTrainingAtLevel(id:string,path:string,oldLevel:number,level:number):
    {points:number;choices:{name:string;rank:number}[]}|undefined};
  for(const path of paths){
    const names=new Set<string>();
    for(const lv of [26,32,34,35,39,40,45,50]){
      const journey=personalGearGuides(path,lv)!.journey!;
      assert.equal(personalItem(journey.weapon)?.level,lv<30?20:lv<40?30:lv<50?40:50);
      assert(journey.lesson?.name);names.add(journey.lesson.name);
      assert.equal(journey.lesson.level,lv<45?35:45);
      assert.deepEqual(journey.bosses.map(b=>b.level).sort((a,b)=>a-b),[32,34,35,45].filter(n=>n<=lv));
      if(WORLD_EXPANSION){
        assert(journey.practice?.open && journey.practice.level<=lv && journey.practice.level>=lv-4);
        assert.equal(hunts.find(m=>m.id===journey.practice!.id)?.tier??"normal","normal");
        for(const boss of journey.bosses)assert(boss.camp?.open && boss.respawnMinutes===20);
      }else assert.equal(journey.practice,null);
      if(lv===35 || lv===45){
        const offer=room.coreTrainingAtLevel("hunter",path,lv-1,lv)!;
        assert(offer.choices.some(s=>s.name===journey.lesson!.name),path+" missing suggested skill");
        assert.equal(offer.points,lv===35?4:5);
      }
    }
    assert.equal(names.size,2);
    const bosses=personalGearGuides(path,50)!.journey!.bosses;
    assert.equal(bosses[0].level,path==="sentinel"?34:path==="seer"||path==="mender"?45:35);
  }
});

test("upper hunting courses cover six professions and every level through 100 with optional bosses",()=>{
  const expected=[
    ["muay_boran","chaiya_advanced_counter","chaiya_master_counter","chaiya_final_counter"],
    ["phutthaisawan","open_circle","steady_guard","final_counter"],
    ["blade","rune_break","shadow_counter","sealed_finale"],
    ["sentinel","line_sweep","steadfast_counter","enduring_ward"],
    ["seer","seer_deep_curse","seer_ward_break","seer_spirit_rain"],
    ["mender","mender_shelter","mender_deep_circle","mender_spirit_rice"],
  ];
  for(const [path,early,later,final] of expected){
    for(let level=51;level<=100;level++){
      const guide=personalGearGuides(path,level)!.journey!;
      const course=guide.course!;
      const options=course.techniques.map(t=>t.id);
      assert(options.includes(level>=90?final:level>=(path==="muay_boran"?75:70)?later:early));
      if(path==="muay_boran")assert.equal(new Set(course.techniques.map(t=>t.school)).size,4);
      assert.equal(course.coreCap,level===100?8:level>=80?7:level>=60?6:5);
      assert.deepEqual(course.ranks.slice(2).map(r=>[r.level,r.practice]),[[65,16],[85,28],[95,45]]);
      if(WORLD_EXPANSION){
        assert(guide.camps.length>0);
        if(level>=80 && level<=100)assert(guide.camps.some(c=>c.mapId==="fallen_city"));
        assert(guide.camps.every(c=>c.open && level-c.level>=0 && level-c.level<=4 && hunts.find(m=>m.id===c.id)?.tier==="normal"));
        assert(guide.bosses.every(b=>b.camp?.open && b.level<=level && b.respawnMinutes===20));
        const start=level<=75?51:76;
        const expectedBosses=hunts.filter(m=>m.tier==="boss" && m.level>=start && m.level<=level && practiceSite(m.id)?.open);
        assert.deepEqual(guide.bosses.map(b=>b.camp!.id).sort(),expectedBosses.map(b=>b.id).sort());
        if(level===100){assert.equal(guide.bosses[0].camp!.id,"atlas_rift_warden");assert(guide.rebirthLimit);assert.equal(guide.practice?.level,100);}
      }else {assert.equal(guide.practice,null);assert.equal(guide.camps.length+guide.bosses.length,0);}
    }
  }
  assert.equal(personalGearGuides("sentinel",60,100)!.journey!.course!.coreCap,8);
});

test("a listed monster really drops the item, and crafted and harvested products stay off its table",()=>{
  const allOwned=new Set(entries.map(([id])=>id));
  for(const mob of hunts){
    const roll=rollMonsterLoot(mob.id,"muay_boran",allOwned,mob.level,0,mob.tier??"normal",max=>max-1);
    assert(roll && PERSONAL_ITEMS[roll.id]?.kind==="material",mob.id+" has no material reward");
  }
  for(const [id,item] of entries){
    const hint=findItemHunt(id as PersonalId,item.level!);
    if(item.sourceBoss){assert.equal(hint?.monster,hunts.find(m=>m.id===item.sourceBoss)?.name,id);continue;}
    if(!item.dropMax || !item.forge && item.kind!=="material"){assert.equal(hint,null,id);continue;}
    assert(hint,id);
    const mob=hunts.find(m=>m.name===hint.monster && m.mapId===hint.mapId && m.level===hint.level)!;
    const path=item.path==="all"?"muay_boran":item.path;
    allOwned.delete(id);
    if(item.forge)assert.equal(rollMonsterLoot(mob.id,path,allOwned,100,0,mob.tier??"normal",()=>0)?.id,id,id);
    else assert(Array.from({length:7},(_,i)=>rollMonsterLoot(mob.id,path,allOwned,100,0,"normal",max=>max===100?99:i%max)?.id).some(candidate=>candidate===id),id);
    allOwned.add(id);
  }
  const sword="wp_twins_2",wrap="wp_wrap_2";
  const roll=(mob:string,path:string,id:string)=>rollMonsterLoot(mob,path,new Set([...allOwned].filter(i=>i!==id)),15,0,"normal",()=>0)?.id;
  assert.equal(roll("temple_forecourt_3","phutthaisawan",sword),sword);
  assert.notEqual(roll("atlas_drowned_marsh_2_1","phutthaisawan",sword),sword);
  assert.equal(roll("atlas_drowned_marsh_2_1","muay_boran",wrap),wrap);
  assert.notEqual(roll("temple_forecourt_3","muay_boran",wrap),wrap);
  assert.notEqual(roll("atlas_drowned_marsh_2_1","phutthaisawan",wrap),wrap);
  assert.equal(roll("atlas_drowned_marsh_1_1","muay_boran",wrap),wrap);
  for(const level of WEAPON_LEVELS)for(const family of ["wp_wrap","wp_twins"]){
    const hint=findItemHunt((family+"_"+(WEAPON_LEVELS.indexOf(level)+1)) as PersonalId,level);
    assert(hint && hint.level<=level+2,family+" has no nearby hunt at level "+level);
  }
});

test("tracker targets match the server drop sources for equipment, materials and monster cards",()=>{
  const catalog=Object.assign({},...CATALOG_PAGES);
  for(const [id,item] of entries){
    const expected=item.kind==="card"?cardHunt(id as CardId):findItemHunt(id as PersonalId,item.level!);
    const source=catalog[id].huntTarget;
    if(!expected){assert.equal(source,undefined,id);continue;}
    assert.deepEqual(source,{...expected,...(item.kind==="card"?{}:itemCamp(id as PersonalId,item.level??1))},id);
    assert(hunts.some(m=>m.id===source.id && m.mapId===source.mapId),id);
  }
});

test("each named encounter owns its fragment and accessory; three fragments craft the same wearable reward",()=>{
  const store=new EconomyStore(":memory:");
  try{
    for(const [i,[boss,t]] of Object.entries(BOSS_TREASURES).entries()){
      const id=i.toString(16).padStart(64,"0"),bag=makeClassInventory("muay_boran");
      const gear=PERSONAL_ITEMS[t.gear],mob=hunts.find(m=>m.id===boss)!;
      assert.equal(findItemHunt(t.fragment,t.level)?.monster,mob.name);
      assert.equal(findItemHunt(t.gear,t.level)?.mapId,mob.mapId);
      assert.equal(gear.recipe![0].item,t.fragment);assert.equal(gear.recipe![0].qty,3);
      assert.equal(rollMonsterLoot("forest_west_1","muay_boran",new Set(),100,0,"normal",()=>0)?.id===t.gear,false);
      const preview=CATALOG_PAGES.find(page=>page[t.gear])![t.gear];
      assert("dropHint" in preview && preview.dropHint);
      assert.match(preview.dropHint,/อัตราดรอปอาจเปลี่ยนตามสภาพโลก/);
      assert.doesNotMatch(preview.dropHint,/20%/);
      assert.equal(bossAccessoryReward(bag,boss,t.level-1,()=>0),null);
      assert.equal(bossAccessoryReward(bag,boss,t.level,()=>20),null);
      assert.equal(bossAccessoryReward(bag,"forest_west_1",100,()=>0),null);
      const direct=bossAccessoryReward(bag,boss,t.level,()=>19)!;
      assert(direct.granted);assert.equal(direct.id,t.gear);
      assert.equal(bossAccessoryReward(direct.bag,boss,t.level,()=>0)?.bag.forgeCopies?.[t.gear],1);
      const at=direct.bag.slots.findIndex(s=>s?.itemId===t.gear),position=equipPositions(gear.kind)[0];
      const equip=equipBody(direct.bag,position,at,t.gear,"muay_boran",t.level);
      assert(equip.ok);assert.equal(bossAccessoryReward(equip.inventory,boss,t.level,()=>0)?.bag.forgeCopies?.[t.gear],1);
      const full={...bag,slots:bag.slots.map(s=>s??{itemId:"health_potion" as const,quantity:99})};
      assert.equal(bossAccessoryReward(full,boss,t.level,()=>0)?.granted,false);
      assert.equal(grantStackReward(full,t.fragment),null);
      bag.slots[2]={itemId:gear.recipe![1].item as MaterialId,quantity:2};
      const two=grantStackReward(grantStackReward(bag,t.fragment)!,t.fragment)!;
      store.register(id,two);
      assert.throws(()=>store.craftPersonal(id,"test_boss_recipe_1",t.gear,t.level));
      const three=grantStackReward(store.getAccount(id).inventory,t.fragment)!;
      store.saveCharacter(id,{},three);
      const request="test_boss_recipe_"+boss;
      store.craftPersonal(id,request,t.gear,t.level);
      store.craftPersonal(id,request,t.gear,t.level);
      const crafted=store.getAccount(id).inventory;
      assert(!crafted.slots.some(s=>s?.itemId===t.fragment));
      assert.equal(crafted.slots.filter(s=>s?.itemId===t.gear).length,1);
    }
  }finally{store.close();}
});

test("three misses survive reload and a full bag preserves the guaranteed upgrade",()=>{
  const miss=(max:number)=>max-1;
  for(const [path,mob] of [["muay_boran","atlas_drowned_marsh_2_1"],["phutthaisawan","temple_forecourt_3"]]){
    let bag=makeClassInventory(path);
    const first=practiceLoot(bag,path,10,"normal",15,mob,miss);
    assert(first.bag.firstChestClaimed);bag=first.bag;
    for(let count=1;count<=3;count++){
      const reward=practiceLoot(bag,path,10,"normal",15,mob,miss);
      assert.equal(personalItem(reward.id)?.kind,"material");
      bag=validateInventory(JSON.parse(JSON.stringify(reward.bag)));
      assert.equal(bag.lootMisses,count);
    }
    const full={...bag,slots:bag.slots.map(s=>s??{itemId:"health_potion" as const,quantity:99})};
    const blocked=practiceLoot(full,path,10,"normal",15,mob,miss);
    assert.equal(blocked.id,null);assert.equal(blocked.bag.lootMisses,3);
    assert(blocked.blockedId && personalItem(blocked.blockedId)?.forge);assert.equal(blocked.quantity,0);assert.equal(blocked.missedQuantity,1);
    const material=path==="phutthaisawan"?"mat_metal_2":"mat_hide_2";
    const tight={...full,lootMisses:0,slots:full.slots.map(s=>s.itemId.startsWith("mat_")?{...s,quantity:99}:s)};
    tight.slots[11]={itemId:material,quantity:98};
    const stacked=practiceLoot(tight,path,10,"normal",15,mob,miss);
    assert.equal(stacked.id,material);assert.equal(stacked.quantity,1);assert.equal(stacked.bag.slots[11]?.quantity,99);
    assert.equal(stacked.blockedId,material);assert.equal(stacked.missedQuantity,1);
    const reward=practiceLoot(bag,path,10,"normal",15,mob,miss);
    assert(reward.id && personalItem(reward.id)?.recommended?.includes(path));assert.equal(reward.bag.lootMisses??0,0);
  }
});

test("ordinary rings and earrings accept a second distinct copy but never a third or a cloned instance",()=>{
  for(const id of ["acc_ring_atk_1","acc_earrings_hunter_1"] as const){
    const mob=findItemHunt(id,1)!,owned=new Map(entries.map(([key])=>[key,2]));
    owned.set(id,1);
    assert.equal(rollMonsterLoot(mob.id,"muay_boran",owned,1,0,"normal",()=>0)?.id,id);
    owned.set(id,2);
    assert.notEqual(rollMonsterLoot(mob.id,"muay_boran",owned,1,0,"normal",()=>0)?.id,id);
    const bag=makeClassInventory("muay_boran"),newCopy=birthForge(id)!;
    assert.equal(newCopy.affix,null);
    bag.slots[2]={itemId:id,quantity:1}; // One pre-update copy with no instance ID.
    bag.slots[3]={itemId:id,quantity:1,forge:newCopy};
    assert.deepEqual(validateInventory(JSON.parse(JSON.stringify(bag))),bag);
    bag.slots[4]={itemId:id,quantity:1,forge:birthForge(id)};
    assert.throws(()=>validateInventory(bag),/inventory_record_invalid/);
    bag.slots[4]=null;bag.slots[2]!.forge=newCopy;
    assert.throws(()=>validateInventory(bag),/inventory_record_invalid/);
  }
  assert.equal(PERSONAL_ITEMS.acc_rift_star.copyLimit,undefined);
});

test("duplicate rings keep cards and forge identities during socketing, market purchase, retries and trade",()=>{
  const store=new EconomyStore(":memory:"),a="a".repeat(64),b="b".repeat(64),id="acc_ring_atk_1";
  try{
    const bag=makeClassInventory("blade"),buyer=makeClassInventory("blade");
    const ring=()=>({itemId:id as typeof id,quantity:1,forge:birthForge(id)!});
    const first=ring(),second=ring();
    bag.slots[2]=first;bag.slots[3]=second;bag.slots[4]={itemId:"mat_metal_1",quantity:2};
    bag.slots[5]={itemId:"card_possessed",quantity:1};buyer.slots[2]=ring();
    store.register(a,bag);store.register(b,buyer);
    const drill={requestId:"test_pair_socket_drill",target:2,gear:id,expected:"sealed",action:"drill",card:null as null} as const;
    assert.throws(()=>store.socketItem(a,drill),/socket_changed/);
    assert.throws(()=>store.socketItem(a,{...drill,stamp:forgeStamp(second)}),/socket_changed/);
    assert.deepEqual(store.getAccount(a).inventory,bag);
    store.socketItem(a,{...drill,stamp:forgeStamp(first)});
    store.socketItem(a,{...drill,requestId:"test_pair_socket_insert",action:"insert",expected:"empty",card:"card_possessed",stamp:forgeStamp(first)});
    const current=store.getAccount(a).inventory;
    assert.equal(current.slots[2]?.socket,"card_possessed");assert.equal(current.slots[3]?.socket,undefined);
    assert.equal(equipBody(current,"leftRing",2,id,"blade",1,forgeStamp(second)).ok,false);
    assert.throws(()=>store.listItem(a,"test_pair_stale_listing",2,1,10,forgeStamp(second)),/item_unavailable/);
    const listing=store.listItem(a,"test_pair_first_listing",2,1,10,forgeStamp(first));
    store.buy(b,"test_pair_buyer_request",listing.listingId);
    store.buy(b,"test_pair_buyer_request",listing.listingId);
    const purchase=store.getAccount(b).inventory,slot=purchase.slots.findIndex(s=>s?.forge?.instanceId===first.forge.instanceId);
    assert.equal(purchase.slots[slot]?.socket,"card_possessed");
    const third=store.listItem(a,"test_pair_next_listing",3,1,10,forgeStamp(second)),before=store.getAccount(b);
    assert.throws(()=>store.buy(b,"test_pair_limit_request",third.listingId),/accessory_limit/);
    assert.deepEqual(store.getAccount(b),before);
    store.cancel(a,"test_pair_cancel_listing",third.listingId);
    store.trade(b,a,"test_pair_trade_request",{slot,amount:1,gold:0},{slot:null,amount:0,gold:0});
    assert.equal(store.getAccount(a).inventory.slots.find(s=>s?.forge?.instanceId===first.forge.instanceId)?.socket,"card_possessed");
  }finally{store.close();}
});

test("a dropped pair of wraps can be equipped and its Muay strike damages a monster",()=>{
  const room=new MyRoom(),bag=makeClassInventory("muay_boran");
  const roll=rollMonsterLoot("atlas_drowned_marsh_2_1","muay_boran",new Set(entries.map(([id])=>id).filter(id=>id!=="wp_wrap_2")),15,3,"normal",()=>0);
  assert(roll?.id==="wp_wrap_2");
  bag.slots[2]={itemId:roll.id,quantity:1};
  const equipped=equipInventoryWeapon(bag,2,"muay_boran",15);assert(equipped.ok);
  const actorId="looter",m=room.state.monster;
  Object.assign(m,{x:0,z:15,y:0,hp:500,maxHp:500});
  room.state.players.set(actorId,new Player({pathId:"muay_boran",level:15,x:0,z:14,y:0,alive:true,atk:40}));
  const combat=room as unknown as {inventories:Map<string,typeof bag>;muayCoreHit(id:string,target:string,power:number):boolean;broadcast:()=>void};
  combat.broadcast=()=>{};combat.inventories.set(actorId,equipped.inventory);
  assert(combat.muayCoreHit(actorId,m.id,1));assert(m.hp<500);
  const before=m.hp;combat.inventories.set(actorId,{...bag,equippedWeaponSlot:null});
  assert.equal(combat.muayCoreHit(actorId,m.id,1),false);assert.equal(m.hp,before);
});

test("twelve suggested builds resolve to legal gear, cards and hunting grounds at all levels",()=>{
  for(const path of paths)for(let level=1;level<=100;level++){
    const guides=personalGearGuides(path,level)!;
    assert.equal(guides.builds.length,2);
    assert.notDeepEqual(guides.builds[0].slots.map(s=>s.id),guides.builds[1].slots.map(s=>s.id));
    for(const build of guides.builds){
      assert.equal(new Set(build.slots.map(s=>s.id)).size,15);
      assert.equal(new Set(build.slots.map(s=>s.position)).size,15);
      for(const piece of build.slots){
        const def=PERSONAL_ITEMS[piece.id];
        assert(def.level!<=level&&(def.path==="all"||def.path===path));
        assert(def.recommended?.includes(path),path+" workbench filters out "+piece.id);
        assert(def.forge!.pool.includes(piece.affix));
        assert(piece.hunt && piece.hunt.level>=def.level! && piece.hunt.level<=def.dropMax!,piece.id);
        if(piece.card){
          assert(PERSONAL_ITEMS[piece.card].level!<=def.level!);
          assert(piece.cardHunt && piece.cardHunt.level<=level && piece.cardHunt.monster===PERSONAL_ITEMS[piece.card].monster);
        }
        if(piece.next)assert(PERSONAL_ITEMS[piece.next].level!>level);
        else assert.equal(level,100);
      }
    }
  }
  const bag=makeClassInventory("mender");
  const mender=personalGearGuides("mender",100)!;
  assert.equal(mender.builds[1].slots.find(s=>s.position==="leftEar")?.affix,"healing");
  const sentinel=personalGearGuides("sentinel",100)!;
  assert.equal(sentinel.builds[0].slots.find(s=>s.position==="mainHand")?.affix,"melee");
  assert.equal(sentinel.builds[1].slots.find(s=>s.position==="mainHand")?.affix,"guard");
  for(const path of paths){
    const amulet=personalGearGuides(path,100)!.builds[0].slots.find(s=>s.position==="neck")!;
    assert.equal(PERSONAL_ITEMS[amulet.id].forge!.primary,path==="mender"?"healing":path==="seer"?"ranged":"melee");
  }
  bag.slots[1]={itemId:"wp_crook_6",quantity:1};
  assert(gearMana(50,bag).max>gearMana(50,undefined).max);
  bag.slots[1]={itemId:"wp_crook_10",quantity:1};
  assert.equal(gearMana(100,bag).max,320);
  assert(gearMana(100,bag).restRegen>0&&gearMana(100,bag).restRegen<=1);
  assert.equal(personalGearGuides("unknown",50),null);
});

test("shared defensive recipes retain their forge roles and enter the useful drop pool for the classes that wear them",()=>{
  const chest=PERSONAL_ITEMS.arm_heavy_chest_8;
  assert.equal(chest.forge!.primary,"guard");
  assert.deepEqual(chest.forge!.pool,["guard","melee"]);
  assert.equal(PERSONAL_ITEMS.acc_earrings_ward_8.forge!.primary,"guard");
  const mob=findItemHunt("arm_heavy_chest_8",100)!;
  // Leave all chest candidates available so only the useful pool is exercised.
  const owned=new Set(entries.filter(([,def])=>def.kind!=="chest").map(([id])=>id));
  let candidates=0;
  rollMonsterLoot(mob.id,"mender",owned,100,3,"normal",max=>{candidates=max;return 0;});
  const results=Array.from({length:candidates},(_,i)=>rollMonsterLoot(mob.id,"mender",owned,100,3,"normal",()=>i));
  assert(results.some(result=>result?.useful && result.id==="arm_heavy_chest_8"));
});

test("all six classes gain casting capacity from both hands and have a suggested unlock at every level",()=>{
  for(const [path,offHand] of [["muay_boran","off_brace_1"],["phutthaisawan","off_guard_1"],["blade","off_veil_1"],["sentinel","off_shield_1"],["seer","off_jar_1"],["mender","off_bell_1"]] as const){
    const room=new MyRoom(),bag=makeClassInventory(path),p=new Player({pathId:path,level:1,mana:30});
    const server=room as unknown as {inventories:Map<string,typeof bag>;applyStats(id:string,p:Player,a:ReturnType<typeof emptyAllocations>):void};
    server.inventories.set("wearer",bag);
    server.applyStats("wearer",p,emptyAllocations());
    assert(p.maxMana>PROGRESSION.baseMana && p.mana===30,path);
    const mainCapacity=p.maxMana;
    bag.slots[2]={itemId:offHand,quantity:1};
    const worn=equipBody(bag,"offHand",2,offHand,path,1);assert(worn.ok);
    server.inventories.set("wearer",worn.inventory);server.applyStats("wearer",p,emptyAllocations());
    assert(p.maxMana>mainCapacity && p.mana===30,path);
    let previousMana=[0,0];
    for(let level=1;level<=100;level++){
      const [attack,defend]=personalGearGuides(path,level)!.builds;
      const builds=[attack,defend];
      assert(builds.some(b=>b.slots.some(s=>PERSONAL_ITEMS[s.id].level===level)),path+" has no suggested unlock at "+level);
      assert((attack.totals.mana??0)>0 && (defend.totals.mana??0)>0,path);
      const monster=monsterProfile(level),survival:number[]=[];
      for(const [i,build] of builds.entries()){
        const outfit=makeClassInventory(path);
        for(const piece of build.slots){
          if(piece.position==="mainHand")outfit.slots[1]={itemId:piece.id,quantity:1};
          else outfit.equipment![piece.position]=piece.id as BodyItemId;
          if(piece.card)assert(piece.cardHunt?.open,path);
        }
        assert.equal(build.maxMana,gearMana(level,outfit).max);
        assert(build.maxMana>=previousMana[i],path+" maximum MP regressed at "+level);
        const stats=equippedStats(calculateStats(level,emptyAllocations()),outfit);
        survival.push(stats.maxHp/calculateDamage(monster.attack,stats.def,level));
      }
      assert(survival[1]>survival[0],path+" defensive set at "+level);
      previousMana=builds.map(b=>b.maxMana);
    }
    assert.deepEqual(previousMana,[PROGRESSION.maxMana,PROGRESSION.maxMana]);
  }
});

test("endgame weapons improve a blow or healing tick from each playable class in PvE",()=>{
  for(const [path,upgrade] of [["muay_boran","wp_wrap_10"],["phutthaisawan","wp_twins_10"],["blade","wp_shadow_10"],["sentinel","wp_pike_10"],["seer","wp_wand_10"],["mender","wp_crook_10"]] as const){
    const room=new MyRoom(),bag=makeClassInventory(path),target=room.state.monster;
    const server=room as unknown as {
      inventories:Map<string,typeof bag>;applyStats(id:string,p:Player,a:ReturnType<typeof emptyAllocations>):void;
      muayCoreHit(id:string,target:string,power:number):boolean;swordCoreHit(id:string,target:string,power:number):boolean;
      bladeDamage(id:string,target:string,power:number):boolean;sentinelDamage(id:string,target:string,power:number,stun:boolean):boolean;
      seerBuffaloCasts:Map<string,{targetId:string;until:number;rank:number;x:number;z:number}>;
      priestRegens:Map<string,{ownerId:string;mapId:string;until:number;nextTick:number;fraction:number}>;
      updateOccultEffects():void;broadcast:()=>void;
    };
    const id="wearer",actor=new Player({pathId:path,level:100,x:0,y:0,z:14,alive:true});
    room.state.players.set(id,actor);server.broadcast=()=>{};
    Object.assign(target,{x:0,y:0,z:15,hp:5000,maxHp:5000});
    function effect(){
      server.inventories.set(id,bag);server.applyStats(id,actor,emptyAllocations());
      const before=target.hp;
      if(path==="muay_boran")assert(server.muayCoreHit(id,target.id,1));
      if(path==="phutthaisawan")assert(server.swordCoreHit(id,target.id,1));
      if(path==="blade")assert(server.bladeDamage(id,target.id,1));
      if(path==="sentinel")assert(server.sentinelDamage(id,target.id,1,false));
      if(path==="seer"){
        server.seerBuffaloCasts.set(id,{targetId:target.id,rank:0,until:0,x:target.x,z:target.z});
        server.updateOccultEffects();
      }
      if(path==="mender"){
        actor.hp=1;
        server.priestRegens.set(id,{ownerId:id,mapId:actor.mapId,until:10000,nextTick:0,fraction:.02});
        server.updateOccultEffects();return actor.hp-1;
      }
      return before-target.hp;
    }
    const starter=effect();
    bag.slots[1]={itemId:upgrade,quantity:1};
    assert(starter>0 && effect()>starter,path);
  }
});

test("every class has a legal, craftable outfit from 1 to 100, including two distinct rings and earrings",()=>{
  for(const [id,item] of entries){
    assert(item.level!>=1&&item.level!<=100,id);
    if(item.forge)assert(item.recipe?.length,id);
    if(item.recipe){assert(Number.isInteger(item.craftGold));for(const ingredient of item.recipe){
      const input=PERSONAL_ITEMS[ingredient.item as PersonalId];
      assert(input && input.level!<=item.level! && ingredient.qty>=1,id+" -> "+ingredient.item);
    }}
  }
  for(const path of paths)for(let level=1;level<=100;level++){
    const weaponLevel=WEAPON_LEVELS.filter(n=>n<=level).pop()!,bodyLevel=OUTFIT_LEVELS.filter(n=>n<=level).pop()!;
    const weapon=entries.find(([,v])=>v.path===path&&v.kind==="mainHand"&&v.level===weaponLevel);
    assert(weapon,path+" "+level);
    if(level===100){
      if(path==="muay_boran")assert(wearsWraps(weapon[0]));
      if(path==="phutthaisawan")assert(wearsTwinSwords(weapon[0]));
      if(path==="mender"||path==="seer")assert(usesStaff(weapon[0]));
    }
    const used=new Set<string>();
    for(const slot of BODY_SLOTS){
      const piece=entries.find(([id,v])=>!used.has(id)&&v.level===bodyLevel&&(v.path==="all"||v.path===path)&&equipPositions(v.kind).includes(slot));
      assert(piece,path+"/"+level+"/"+slot);
      used.add(piece[0]);
    }
  }
  const sent=CATALOG_PAGES.flatMap(Object.keys);
  assert.deepEqual(sent,entries.map(([id])=>id),"paging preserves every item once in catalog order");
  for(const page of CATALOG_PAGES){
    assert(Object.keys(page).length<=16,"retain item-count cap");
    assert(Buffer.byteLength(JSON.stringify(page))<=15_000,"UTF-8 budget includes expanded hunt and model metadata");
    assert(Buffer.byteLength(JSON.stringify({items:catalogPageWithRates(page)}))<16_384,"live catalog message fits including envelope and rates");
  }
  for(const level of MATERIAL_LEVELS){
    const ids=new Set(hunts.filter(m=>m.level>=level && m.level<(MATERIAL_LEVELS.find(n=>n>level)??101)).flatMap(m=>
      Array.from({length:7},(_,i)=>rollMonsterLoot(m.id,"seer",new Set(),level,0,"normal",max=>max===100?99:i%max)!.id)));
    assert.equal(ids.size,7);
    for(const id of ids)assert.equal(PERSONAL_ITEMS[id].level,level);
  }
  for(const [,card] of entries.filter(([,v])=>v.sourceCamp)){
    const spawn=ATLAS_SPAWNS.find(s=>s.id===card.sourceCamp+"_1");
    assert(spawn&&spawn.name===card.monster&&spawn.level>=card.level!,card.name);
    assert.equal(PERSONAL_ITEMS[monsterCardDrop(spawn.id,spawn.level,()=>0)!].name,card.name);
  }
});

test("late monster cards unlock through real hunts and the first high-level chest rolls an affix",()=>{
  const leftEar=(level:number)=>personalGearGuides("mender",level)!.builds[0].slots.find(s=>s.position==="leftEar")!;
  assert.notEqual(leftEar(85).card,"card_light_eater");
  // In the full healer outfit MP is already capped by this socket. Prefer HP alongside magic attack.
  if(cardHunt("card_dream")?.open)assert.equal(leftEar(88).card,"card_dream");
  else assert(!leftEar(88).card || leftEar(88).cardHunt?.open);
  assert.equal(cardHunt("card_last_spirit")?.level,96);
  assert.equal(cardHunt("card_star_warden")?.level,98);
  const source=ATLAS_SPAWNS.find(s=>s.id==="atlas_spirit_rift_2_1")!;
  assert.equal(monsterCardDrop(source.id,source.level,()=>9),"card_light_eater");
  assert.equal(monsterCardDrop(source.id,source.level,()=>10),null);
  const bag=makeClassInventory("seer");
  const low=practiceLoot(bag,"seer",100,"boss",1);
  assert.equal(low.bag.slots.find(s=>s?.itemId===low.id)?.forge,undefined);
  const high=practiceLoot(bag,"seer",100,"boss",100);
  const armor=high.bag.slots.find(s=>s?.itemId===high.id);
  assert(armor?.bound && armor.forge?.affix && armor.forge.rank===0);
  bag.slots[2]={itemId:"acc_spell_6",quantity:1,socket:null};
  bag.slots[3]={itemId:"card_light_eater",quantity:1};
  const socket=changeCardSocket(bag,{target:2,gear:"acc_spell_6",action:"insert",expected:"empty",card:"card_light_eater",requestId:"light_card_85"});
  const worn=equipBody(socket.bag,"neck",2,"acc_spell_6","seer",88);
  assert(worn.ok);
  const bare=equipBody(bag,"neck",2,"acc_spell_6","seer",88);
  assert(bare.ok);
  assert.equal(gearMana(88,worn.inventory).max-gearMana(88,bare.inventory).max,4);
});

test("every class unlocks wearable equipment at every level, with field gear bounded by its adjacent tiers",()=>{
  const huntLevels=[1,...FOREST_CAMPS.flatMap(c=>c.levels),...TEMPLE_SPAWNS.map(s=>s.level),...ATLAS_SPAWNS.map(s=>s.level)];
  for(const path of paths)for(let level=1;level<=100;level++){
    const unlocked=entries.filter(([,item])=>item.forge && item.level===level && item.path===path);
    assert(unlocked.length,path+" Lv."+level);
    for(const [id,def] of unlocked.filter(([id])=>id.startsWith("arm_field_"))){
      const tier=OUTFIT_LEVELS.filter(n=>n<level).length;
      const lo=PERSONAL_ITEMS[(def.family+"_"+tier) as PersonalId];
      const hi=PERSONAL_ITEMS[(def.family+"_"+(tier+1)) as PersonalId];
      for(const stat of Object.keys({...lo.stats,...hi.stats}) as (keyof typeof lo.stats)[]){
        const value=def.stats[stat]??0, from=lo.stats[stat]??0, to=hi.stats[stat]??0;
        assert(value>=Math.min(from,to) && value<=Math.max(from,to),id+" "+stat);
      }
      assert(huntLevels.some(n=>n>=level && n<=def.dropMax!),id+" has no monster in its drop range");
      const bag=makeClassInventory(path),slot=equipPositions(def.kind)[0];
      bag.slots[2]={itemId:id as BodyItemId,quantity:1};
      assert(equipBody(bag,slot,2,id as BodyItemId,path,level).ok);
      assert(!equipBody(bag,slot,2,id as BodyItemId,path,level-1).ok);
      assert(!equipBody(bag,slot,2,id as BodyItemId,paths.find(p=>p!==path)!,level).ok);
    }
  }
});

test("level 99 class gear can drop or be crafted, enhanced, rerolled, drilled and fitted before the cap",()=>{
  const item="arm_field_mender_99",def=PERSONAL_ITEMS[item],position=equipPositions(def.kind)[0];
  const owned=new Set(entries.map(([id])=>id).filter(id=>id!==item));
  assert.equal(rollMonsterLoot("atlas_rift_warden","mender",owned,100,0,"boss",()=>0)?.id,item);
  assert.notEqual(rollMonsterLoot("atlas_rift_warden","seer",owned,100,0,"boss",()=>0)?.id,item);
  assert.notEqual(rollMonsterLoot("atlas_spirit_rift_5_1","mender",owned,98,0,"strong",()=>0)?.id,item);
  const store=new EconomyStore(":memory:"), account="f".repeat(64),bag=makeClassInventory("mender");
  try{
    let slot=2;
    for(const r of def.recipe!)bag.slots[slot++]={itemId:r.item as PersonalId,quantity:r.qty};
    bag.forgeCopies={[item]:1};
    for(const id of ["ref_seal_7","mat_metal_1","card_star_warden"] as const)bag.slots[slot++]={itemId:id,quantity:1};
    store.register(account,bag);
    store.craftPersonal(account,"field_crafting_0001",item,99);
    const crafted=store.getAccount(account).inventory,index=crafted.slots.findIndex(s=>s?.itemId===item);
    assert(crafted.slots[index]?.forge?.affix);
    const worn=equipBody(crafted,position,index,item,"mender",99);
    assert(worn.ok);store.saveCharacter(account,{inventory:worn.inventory},worn.inventory);
    const stamp=forgeStamp({itemId:item,forge:worn.inventory.equipmentForges![position]});
    const plus=store.forgeWeapon(account,"field_enhance_0001",position,stamp,"enhance",99);
    const reroll=store.forgeWeapon(account,"field_reroll_00001",position,forgeStamp({itemId:item,forge:plus.forge}),"reroll",99);
    store.socketItem(account,{requestId:"field_drilling_001",target:position,gear:item,action:"drill",expected:"sealed",card:null});
    store.socketItem(account,{requestId:"field_inserting_01",target:position,gear:item,action:"insert",expected:"empty",card:"card_star_warden"});
    const restored=store.getAccount(account).inventory;
    assert.equal(restored.equipmentForges![position]?.rank,1);
    assert.deepEqual(restored.equipmentForges![position]?.affix,reroll.forge.affix);
    assert.equal(restored.equipmentSockets![position],"card_star_warden");
  }finally{store.close();}
});

test("capstone crafting, forge materials, role options, card and sale survive inventory transactions",()=>{
  const store=new EconomyStore(":memory:"),id="c".repeat(64);
  try{
    const bag=makeClassInventory("mender");
    const robe="arm_cloth_chest_8", def=PERSONAL_ITEMS[robe];
    let slot=2;
    for(const i of def.recipe!){bag.slots[slot++]={itemId:i.item as PersonalId,quantity:i.qty};}
    bag.forgeCopies={[robe]:1};
    bag.slots[slot++]={itemId:"ref_seal_7",quantity:1};
    bag.slots[slot++]={itemId:"card_rift_warden",quantity:1};
    bag.slots[slot++]={itemId:"mat_metal_1",quantity:1};
    bag.slots[slot++]={itemId:"mat_ink_7",quantity:10};
    store.register(id,bag);
    const req=(n:number)=>"capstone_test_"+String(n).padStart(5,"0");
    assert.throws(()=>store.craftPersonal(id,req(1),robe,99),/item_level_required/);
    assert.deepEqual(store.getAccount(id).inventory,bag);
    store.craftPersonal(id,req(1),robe,100);
    const crafted=store.getAccount(id).inventory, index=crafted.slots.findIndex(s=>s?.itemId===robe);
    assert(crafted.slots[index]?.forge?.affix);
    assert.equal(equipBody(crafted,"chest",index,robe,"mender",99).ok,false);
    const worn=equipBody(crafted,"chest",index,robe,"mender",100);
    assert(worn.ok);store.saveCharacter(id,{inventory:worn.inventory},worn.inventory);
    const stamp=forgeStamp({itemId:robe,forge:worn.inventory.equipmentForges!.chest});
    const enhanced=store.forgeWeapon(id,req(2),"chest",stamp,"enhance",100);
    assert.deepEqual(store.forgeWeapon(id,req(2),"chest",stamp,"enhance",100),enhanced);
    assert.equal(enhanced.forge.rank,1);assert.equal(store.getAccount(id).inventory.forgeCopies?.[robe],undefined);
    assert.throws(()=>store.forgeWeapon(id,req(3),"chest",stamp,"reroll",100),/forge_item_changed/);
    const rolled=store.forgeWeapon(id,req(3),"chest",forgeStamp({itemId:robe,forge:enhanced.forge}),"reroll",100);
    assert(def.forge!.pool.includes(rolled.forge.affix!.stat));
    store.socketItem(id,{requestId:req(4),target:"chest",gear:robe,action:"drill",expected:"sealed",card:null});
    store.socketItem(id,{requestId:req(5),target:"chest",gear:robe,action:"insert",expected:"empty",card:"card_rift_warden"});
    const finished=store.getAccount(id).inventory;
    assert.equal(finished.equipmentForges!.chest!.rank,1);assert.equal(finished.equipmentSockets!.chest,"card_rift_warden");
    const naked=makeClassInventory("mender");
    assert(equippedStats(base,finished).magicAtk>equippedStats(base,naked).magicAtk);
    assert(weaponBonuses(finished,"pve").ranged>weaponBonuses(finished,"pvp").ranged);
    assert(gearHealing(finished,200)>0);assert(overflowStaminaRegen(base,finished)>0);
    const removed=equipBody(finished,"chest",null,robe,"mender",100);assert(removed.ok);
    const item=removed.inventory.slots.find(s=>s?.itemId===robe)!;
    assert.deepEqual(item.forge,rolled.forge);assert.equal(item.socket,"card_rift_warden");
    const saleSlot=finished.slots.findIndex(s=>s?.itemId==="mat_ink_7");
    const sale=store.sellMaterial(id,req(6),saleSlot,"mat_ink_7",2);
    assert.deepEqual(store.sellMaterial(id,req(6),saleSlot,"mat_ink_7",2),sale);
    assert.equal(sale.receivedGold,2*PERSONAL_ITEMS.mat_ink_7.sellGold!);
  }finally{store.close();}
});

test("salvage quotes only ordinary ingredients from the recipe and protects starting weapons",()=>{
  for(const [id,gear] of entries){
    if(!gear.forge || (gear.kind==="mainHand" && gear.level===1)){assert.equal(gear.salvage,undefined,id);continue;}
    const output=gear.salvage!;
    const input=gear.recipe!.find(r=>r.item===output.item);
    assert(input && !PERSONAL_ITEMS[output.item].sourceBoss,id);
    assert.equal(output.quantity,Math.max(1,Math.floor(input.qty/2)),id);
  }
  const base={requestId:"salvage_unit_0010",slot:2,gear:"wp_wrap_2",stamp:"wp_wrap_2",bound:false,socket:"sealed"};
  assert.deepEqual(parseSalvage(base),base);
  assert.ok(parseSalvage({...base,slot:107}));
  for(const bad of [{slot:108},{slot:"neck"},{bound:"true"},{socket:"mat_metal_1"},{gear:"wp_wrap_1"},{quantity:99},{stamp:""}])
    assert.equal(parseSalvage({...base,...bad}),null);
});

test("salvaging a bound weapon returns its actual card and materials once, or leaves the whole bag intact",()=>{
  const store=new EconomyStore(":memory:"),id="e".repeat(64),gear="wp_twins_10";
  const bag=makeClassInventory("phutthaisawan"),item=PERSONAL_ITEMS[gear];
  const yieldItem=item.salvage!,card="card_rift_warden";
  const forge=rollForge(undefined,"enhance",()=>0,item).forge;
  for(let i=2;i<bag.slots.length;i++)bag.slots[i]={itemId:"health_potion",quantity:99};
  bag.slots[2]={itemId:gear,quantity:1,bound:true,forge,socket:card};
  const order:SalvageOrder={requestId:"salvage_bound_unit_01",slot:2,gear,stamp:forgeStamp(bag.slots[2]!),bound:true,socket:card};
  try{
    const snapshot={...bag,equippedWeaponSlot:2};
    store.saveCharacter(id,{inventory:snapshot},snapshot);
    assert.throws(()=>store.salvageGear(id,order),/item_equipped/);
    store.saveCharacter(id,{inventory:bag},bag);
    const original=store.getAccount(id);
    assert.throws(()=>store.salvageGear(id,{...order,socket:"empty"}),/salvage_changed/);
    assert.throws(()=>store.salvageGear(id,{...order,stamp:gear}),/salvage_changed/);
    assert.throws(()=>store.salvageGear(id,{...order,bound:false}),/salvage_changed/);
    assert.throws(()=>store.salvageGear(id,order),/inventory_full/);
    assert.deepEqual(store.getAccount(id),original);
    bag.slots[3]={itemId:card,quantity:98};
    store.saveCharacter(id,{inventory:bag},bag);
    const result=store.salvageGear(id,order);
    assert.deepEqual(result,{gear,material:yieldItem.item,quantity:yieldItem.quantity,card});
    const after=store.getAccount(id);assert.equal(after.gold,original.gold);
    assert.deepEqual(after.inventory.slots[2],{itemId:yieldItem.item,quantity:yieldItem.quantity});
    assert.equal(after.inventory.slots[3]?.quantity,99);
    assert.equal(after.inventory.slots.some(s=>s?.itemId===gear),false);
    assert.deepEqual(store.salvageGear(id,order),result);
    assert.throws(()=>store.salvageGear(id,{...order,slot:3}),/request_id_conflict/);
    assert.throws(()=>store.salvageGear(id,{...order,requestId:"salvage_bound_unit_02"}),/salvage_changed/);
    assert.deepEqual(store.getAccount(id),after);
    assert.deepEqual((store.getCharacter(id) as {inventory:unknown}).inventory,after.inventory);
  }finally{store.close();}
});

test("a boxer can put the material recovered from old wraps directly into the next armor recipe",()=>{
  const store=new EconomyStore(":memory:"),id="f".repeat(64),bag=makeClassInventory("muay_boran");
  const wraps="wp_wrap_2",next="arm_hide_legs_2",output=PERSONAL_ITEMS[wraps].salvage!;
  try{
    bag.slots[2]={itemId:wraps,quantity:1,bound:true};
    assert.equal(output.item,"mat_hide_2");
    let slot=3;
    for(const r of PERSONAL_ITEMS[next].recipe!){
      const quantity=r.qty-(r.item===output.item?output.quantity:0);
      if(quantity>0)bag.slots[slot++]={itemId:r.item as MaterialId,quantity};
    }
    store.register(id,bag);
    assert.throws(()=>store.craftPersonal(id,"reuse_salvage_craft_01",next,10),/craft_missing_material/);
    const result=store.salvageGear(id,{requestId:"reuse_salvage_wraps_01",gear:wraps,stamp:wraps,slot:2,bound:true,socket:"sealed"});
    assert.equal(result.card,null);
    store.craftPersonal(id,"reuse_salvage_craft_01",next,10);
    assert(store.getAccount(id).inventory.slots.some(s=>s?.itemId===next));
  }finally{store.close();}
});

test("class restrictions, capped forge ratings and card level survive the entire upgrade curve",()=>{
  for(const [id,item] of entries.filter(([,v])=>v.forge)){
    const def=item.forge!,top=rollForge(undefined,"reroll",()=>99,item).forge;
    let improved=top;
    for(let rank=1;rank<=10;rank++){
      improved=rollForge(improved,"enhance",()=>0,item).forge;
      assert.equal(improved.rank,rank);
      assert.deepEqual(improved.affix,top.affix);
    }
    assert.throws(()=>rollForge(improved,"enhance",()=>0,item),/forge_max_rank/);
    assert(def.pool.includes(top.affix!.stat));
    assert.equal(top.affix!.tier,item.level!<25?1:item.level!<65?2:3);
    assert(rerollIngredient(item)!.item in PERSONAL_ITEMS);
    if(item.kind==="mainHand"){
      const bag=makeClassInventory(item.path);bag.slots[1]={itemId:id as PersonalId,quantity:1,forge:{...top,rank:10}};bag.equippedWeaponSlot=null;
      assert.equal(equipInventoryWeapon(bag,1,"wrong_path",100).ok,false);
      if(item.level!>1)assert.equal(equipInventoryWeapon(bag,1,item.path,item.level!-1).ok,false);
      const worn=equipInventoryWeapon(bag,1,item.path,item.level);assert(worn.ok);
      const ratings=equipmentRatings(worn.inventory);
      assert(Object.values(ratings).reduce((a,b)=>a+b,0)<=def.enhanceMax+def.affixMax+.001);
    }
  }
  const starter=makeClassInventory("blade");starter.slots[1]!.socket=null;starter.slots[3]={itemId:"card_rift_warden",quantity:1};
  assert.throws(()=>changeCardSocket(starter,{target:1,gear:"wp_shadow_1",action:"insert",expected:"empty",card:"card_rift_warden",requestId:"card_level_test_01"}),/card_gear_level/);
  assert.equal(starter.slots[3]?.quantity,1);
});
