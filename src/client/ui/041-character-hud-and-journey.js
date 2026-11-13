  // Shared with the character sheet; this is an estimate, never a server combat input.
  function characterPowerEstimate(char) {
    if (!char) return null;
    const weights = { atk: 2, magicAtk: 2, def: 1.5, magicDef: 1.5, maxHp: .5, level: 20 };
    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const value = char[key];
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      total += Math.max(0, value) * weight;
    }
    return Number.isFinite(total) ? Math.round(total) : null;
  }
  function updateCompactCharacterHud(me) {
    const path = getBuildCatalog()?.paths?.[me?.pathId];
    hudSet($("characterClass"), "class", path?.name || path?.role || "นักผจญภัย");
    $("characterProfile").setAttribute("aria-label", "ข้อมูลตัวละคร " + $("characterName").textContent + " · เลเวล " + (Number(me?.level) || 1) + " · " + $("characterClass").textContent);
  }
  function updateCharacterHud(me) {
    const name = typeof me?.characterName === "string" && me.characterName
      ? me.characterName : "นที";
    $("characterName").textContent = name;
    if (Number.isFinite(me?.level)) { if (hudLevel && me.level > hudLevel) { triggerVoiceGuidance("levelup"); SFX("levelup", { important: true }); floatAtPlayer(localId, "🌟 LEVEL UP! 🌟", "levelup", { drift: 0, rise: 85, life: 2500, big: true }); shakeCamera(0.48, 450); auraFx(getLocalAvatar(), "levelup"); } hudLevel = me.level; }
    $("characterProfile").title = me?.persistent
      ? "แตะดูตัวละครถาวรและเปลี่ยนชื่อ" : "แตะดูข้อมูลตัวละคร";
  }
  // ---- HUD (player card, target frame, guide tracker, status chip) ----
  // Rebuilt from state four times a second; each element is written only
  // when its text or width actually changes.
  const PATH_GLYPHS = { phutthaisawan: "⚔", muay_boran: "✊", blade: "🗡", sentinel: "⛨", seer: "✦", mender: "✚" };
  const pathSeal = path => ({phutthaisawan:"twin", muay_boran:"fist", blade:"atk", sentinel:"def", seer:"spirit", mender:"heal"})[path] || "status";
  // Only internal seal ids are passed here; server-provided names are written as text.
  const seal = id => '<svg class="info-seal" aria-hidden="true" focusable="false"><use href="#seal-' + id + '"></use></svg>';
  const infoIcon = id => '<img class="info-icon" src="./assets/ui/info/' + id + '.webp" alt="" width="24" height="24" draggable="false">';
  const profilePortrait = '<svg class="portrait-figure" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#hudPortraitFigure"></use></svg>';
  function updateMeterValue(el, value, max, description) {
    const attrs = {"aria-valuemin":"0","aria-valuemax":String(max),"aria-valuenow":String(Math.max(0,Math.min(max,value))),"aria-valuetext":description};
    for (const [name,v] of Object.entries(attrs)) if (el.getAttribute(name) !== v) el.setAttribute(name,v);
  }
  const hudKills = {};
  let hudTarget = { id: null, until: 0 }, hudCache = new Map(), hudIn = 0;
  const hudSet = (el, key, value, prop = "textContent") => { if (!el) return; const k = key + prop; if (hudCache.get(k) === value && (prop !== "hidden" || el.hidden === value)) return; hudCache.set(k, value); if (prop === "width") el.style.width = value; else if (prop === "hidden") el.hidden = value; else el[prop] = value; };
  const pctOf = (v, max) => Math.max(0, Math.min(100, 100 * (Number(v) || 0) / Math.max(1, Number(max) || 1))).toFixed(1) + "%";
  function hudCurrentTarget(now) {
    const hero = getLocalAvatar();
    if (mode === "live") {
      const st = room?.state, id = selectedForestTarget || (hudTarget.until > now ? hudTarget.id : null);
      if (!id || !fieldTargetVisible(id)) return null;
      if (id === MONSTER_ID && activeMapId === "ritual_village") {
        const monster = villageMonsterState(st);
        return monster && { name: "ผีเข้าสิง", level: Number(monster.level) || 1, hp: monster.hp, maxHp: monster.maxHp, alive: monster.alive !== false };
      }
      const m = st?.monsters?.get?.(id);
      if (!m || m.mapId !== activeMapId) return null;
      return { name: monsterName(m, id) || "ผี", level: Number(m.level) || 1, hp: m.hp, maxHp: m.maxHp, alive: m.alive !== false, elite: m.tier === "elite" || m.tier === "boss", boss: m.tier === "boss", x: m.x, z: m.z };
    }
    if (!fieldPointVisible(enemy.position) || (!enemy.isEnabled() && now - demoLastHitAt > 2500)) return null;
    const near = hero && Math.hypot(hero.x - enemy.position.x, hero.z - enemy.position.z) < 9;
    if (!near && now - demoLastHitAt > 8000) return null;
    return { name: "ผีเข้าสิง · ตัวทดสอบ", level: 1, hp: demoMonsterHp, maxHp: 100, alive: demoMonsterHp > 0 };
  }
  function travelRoute(maps,origin,target,links="portals"){
    if(!maps?.[origin] || !maps[target])return [];
    if(travelRoutes?.maps!==maps || travelRoutes.origin!==origin || travelRoutes.links!==links){
      const routes=new Map([[origin,[origin]]]),queue=[origin];
      for(let i=0;i<queue.length;i++)for(const gate of maps[queue[i]][links]||[]){
        const next=gate.targetMapId;
        if(maps[next] && !routes.has(next)){routes.set(next,[...routes.get(queue[i]),next]);queue.push(next);}
      }
      travelRoutes={maps,origin,links,routes};
    }
    return travelRoutes.routes.get(target)||[];
  }
  function currentItemHunt(){
    const who=mode==="live" && ownServerCharacter()?.characterId;
    const key=who?"montra_item_hunt_v1_"+who:"";
    if(itemHuntOwner!==key){
      itemHuntOwner=key;itemHunt=null;
      if(key)try{
        const saved=JSON.parse(localStorage.getItem(key));
        if(typeof saved?.id==="string" && Number.isInteger(saved.need) && saved.need>0 && saved.need<=INVENTORY_SLOTS*99)itemHunt=saved;
      }catch{}
    }
    return itemHunt;
  }
  function saveItemHunt(goal){
    currentItemHunt();
    if(!itemHuntOwner)return;
    itemHunt=goal;
    try{if(goal)localStorage.setItem(itemHuntOwner,JSON.stringify(goal));else localStorage.removeItem(itemHuntOwner);}catch{}
  }
  function itemHuntCount(id,includeCopies=false){
    const bag=inventoryState;
    if(!bag || !id)return 0;
    return bag.slots.reduce((n,s)=>n+(s?.itemId===id?s.quantity:0),0)+Object.values(bag.equipment??{}).filter(v=>v===id).length+(includeCopies?(bag.forgeCopies?.[id]??0):0);
  }
  function refinedResourceSource(id){
    const match=/^mat_(metal|wood|raw_stone|raw_wood)_([1-7])$/.exec(id||"");
    if(!match)return null;
    const kind=match[1]==="metal" || match[1]==="raw_stone"?"stone":"wood",tier=Number(match[2]);
    return {resourceKind:kind,tier,rawId:"mat_raw_"+kind+"_"+tier,open:true};
  }
  function itemHuntSource(id,guide){
    if(id && guide && gearGuides?.journey?.weapon===id)return gearGuides.journey.camp;
    if(guide)for(const build of gearGuides?.builds??[]){
      const hunt=build.slots.find(s=>s.id===id)?.hunt;
      if(hunt?.id)return hunt;
    }
    return refinedResourceSource(id) || personalItems[id]?.huntTarget;
  }
  function bindItemHuntButton(button,id,need,guide=false,includeCopies=false){
    const source=itemHuntSource(id,guide),meta=personalItems[id];
    button.hidden=!meta || !source;
    if(button.hidden){button.onclick=null;return;}
    const pinned=currentItemHunt(),same=pinned?.id===id && pinned.need===need && !!pinned.includeCopies===includeCopies;
    const owned=itemHuntCount(id,includeCopies);
    const low=meta.sourceBoss && meta.forge && ownServerCharacter()?.level<meta.level;
    button.textContent=same?"เลิกติดตาม "+meta.name:"ตามหา "+meta.name+(need>1?" · "+owned+"/"+need:"");
    button.disabled=!same && (!itemHuntOwner || !source.open || low || !inventoryState || owned>=need || need>inventoryState.slots.length*99);
    if(!same)button.textContent+=!source.open?" · พื้นที่ยังไม่เปิด":low?" · ต้อง Lv."+meta.level:owned>=need?" · มีครบแล้ว":"";
    button.onclick=()=>{
      saveItemHunt(same?null:{id,need,guide,includeCopies});
      toast(same?"เลิกติดตามแล้ว":"ติดตาม "+meta.name+" · ดูลูกศรที่ภารกิจ");
      if(same)renderBag();else closeDrawer();
    };
  }
  function itemHuntGuide(goalOverride=null){
    const goal=goalOverride || currentItemHunt();
    if(!goal || !inventoryState || territoryState?.local?.inField)return null;
    const item=personalItems[goal.id],source=itemHuntSource(goal.id,goal.guide);
    if(!item || !source)return null;
    const count=itemHuntCount(goal.id,goal.includeCopies);
    if(count>=goal.need){
      if(goalOverride)return null;
      saveItemHunt(null);
      const done="ได้ครบแล้ว · "+item.name+" ×"+goal.need;toast(done);
      if(drawerActive==="quest" && $("endItemHunt")){ui.drawerTitle.textContent=item.name;ui.drawerBody.textContent=done;}
      return null;
    }
    const guide={title:"ตามหา "+item.name,progress:count+"/"+goal.need};
    if(source.open && source.level>ownServerCharacter()?.level){
      const levelGoal=fieldLevelingGoal(ownServerCharacter(),gearGuides?.journey,source.level);
      return {...guide,...levelGoal,title:guide.title,progress:guide.progress+" · "+levelGoal.progress};
    }
    if(source.resourceKind){
      const raw=personalItems[source.rawId],rawCount=itemHuntCount(source.rawId),rawGoal=goal.id===source.rawId,needed=rawGoal?goal.need:(goal.need-count)*2;
      guide.progress=rawGoal?item.name+" "+count+"/"+goal.need:item.name+" "+count+"/"+goal.need+" · "+(raw?.name||"ของดิบ")+" "+rawCount+"/"+needed;
      if(!rawGoal && rawCount>=2)return {...guide,step:"เปิดกระเป๋า → แตะ"+(raw?.name||"ของดิบ")+" → แปรรูป 2 ชิ้น",refineId:source.rawId};
      const me=ownServerCharacter();
      if((me?.level||1)<(raw?.level||1)){
        const levelGoal=fieldLevelingGoal(me,gearGuides?.journey,raw.level);
        return {...guide,...levelGoal,title:guide.title,progress:guide.progress+" · "+levelGoal.progress};
      }
      const nodes=resources?.mapId===activeMapId?resources.nodes.filter(n=>n.kind===source.resourceKind && n.tier===source.tier):[];
      const distance=n=>me?Math.hypot(me.x-n.x,me.z-n.z):Infinity;
      nodes.sort((a,b)=>Number(!a.stock)-Number(!b.stock)||distance(a)-distance(b));
      if(nodes.length){const node=nodes[0],name=source.resourceKind==="stone"?"ก้อนหินปนแร่":"ต้นไม้";
        return {...guide,step:node.stock?"เดินไป"+name+"ชั้น "+source.tier+" แล้วกด "+(source.resourceKind==="stone"?"ขุดหิน":"ตัดไม้"):
          name+"ใกล้ตัวกำลังฟื้น · รอหรือหาอีกจุด",to:node};}
      const minLevel=raw?.level||1,maxLevel=personalItems["mat_raw_"+source.resourceKind+"_"+(source.tier+1)]?.level||101;
      // WorldResources places camp nodes at the first spawn's tier, not any
      // member's level. The forest's Lv10–12 members still have tier-one nodes.
      const candidates=Object.values(worldDefinitions||{}).filter(map=>source.tier===1 && ["ritual_village","forbidden_forest"].includes(map.id) ||
        (map.id==="bound_temple" || map.region) && (map.camps||[]).some(c=>c.levels?.[0]>=minLevel && c.levels[0]<maxLevel));
      const routes=candidates.map(map=>({map,route:travelRoute(worldDefinitions,activeMapId,map.id)})).filter(r=>r.route.length>1).sort((a,b)=>a.route.length-b.route.length);
      const route=routes[0]?.route,gate=route && worldDefinitions?.[activeMapId]?.portals.find(p=>p.targetMapId===route[1]);
      return {...guide,step:gate?"ไปประตู "+worldDefinitions[route[1]].name+" เพื่อหา"+(source.resourceKind==="stone"?"หินปนแร่":"ต้นไม้"):
        resources?.mapId!==activeMapId?"กำลังค้นหาจุดเก็บในแผนที่…":"ไม่พบจุดชั้นนี้ในพื้นที่ · เปิดแผนที่เพื่อเลือกพื้นที่ตามเลเวล",to:gate};
    }
    if(source.mobs)return {...guide,...journeyDirection(source)};
    if(!source.open)return {...guide,step:"พื้นที่ล่านี้ยังไม่เปิด"};
    if(activeMapId!==source.mapId){
      const route=travelRoute(worldDefinitions,activeMapId,source.mapId);
      const gate=worldDefinitions?.[activeMapId]?.portals.find(p=>p.targetMapId===route[1]);
      return {...guide,step:gate?"ไปประตู "+worldDefinitions[route[1]].name+" · เหลือ "+(route.length-1)+" ประตู":"ไม่มีเส้นทางจากแผนที่นี้",to:gate};
    }
    const mob=monsterForSpell(source.id);
    const map=worldDefinitions?.[activeMapId],home=[map?.boss,map?.guardian].find(b=>b?.id===source.id);
    return {...guide,step:(mob?.alive?"ล่า ":mob?"รอเกิด · ":"ค้นหา ")+source.monster,to:mob?.alive?mob:home??mob};
  }
  // The next useful step for the current map, with a point to head for.
  function fieldRecipeProgress(id){
    return (personalItems[id]?.recipe??[]).map(r=>({id:r.item,name:personalItems[r.item]?.name??r.item,need:r.qty,have:itemHuntCount(r.item)}));
  }
  // Follow crafted ingredients down to the first missing supply, reserving
  // materials needed directly by the weapon recipe.
  function fieldMissingCopySupply(inputs){
    const reserved=new Map();
    for(const input of inputs)reserved.set(input.id,(reserved.get(input.id)||0)+input.need);
    function find(id,need,seen){
      const have=itemHuntCount(id),def=personalItems[id];
      if(have>=need)return null;
      if(def?.station==="kiln" && def.recipe && !seen.has(id)){
        const next=new Set(seen);next.add(id);
        for(const part of def.recipe){
          const target=part.qty*(need-have)+(reserved.get(part.item)||0);
          const missing=find(part.item,target,next);
          if(missing)return missing;
        }
        return {id,need,have,craftIngredient:id};
      }
      return {id,need,have};
    }
    for(const input of inputs){const found=find(input.id,input.need,new Set());if(found)return found;}
    return null;
  }
  function currentFieldTraining(){
    return fieldTrainingTip?.session===room?.sessionId && fieldTrainingTip?.path===ownServerCharacter()?.pathId?fieldTrainingTip:null;
  }
  function journeyNotesForPlayer(){
    const me=ownServerCharacter(),id=me?.characterId;
    const cycle=gearGuides?.path===me?.pathId?gearGuides?.cycle:0;
    const owner=id?"montra_field_journey_"+id+(cycle?("_life_"+cycle):""):"";
    if(owner!==journeyOwner){
      journeyOwner=owner;journeyNotes={};
      if(owner)try{const saved=JSON.parse(localStorage.getItem(owner));if(saved && typeof saved==="object" && !Array.isArray(saved))journeyNotes=saved;}catch{}
    }
    if(journeyNotes.trial?.path && journeyNotes.trial.path!==ownServerCharacter()?.pathId)journeyNotes.trial=null;
    return journeyNotes;
  }
  function saveJourney(changes){
    const notes=journeyNotesForPlayer();if(!journeyOwner)return;
    Object.assign(notes,changes);try{localStorage.setItem(journeyOwner,JSON.stringify(notes));}catch{}
  }
  function refreshFieldPractice(){
    if(drawerActive==="quest" && $("fieldGoalProgress"))renderFieldGoalDrawer(fieldGearGoal());
  }
  function startJourneyPractice(data){
    if(data.reset){
      if(!!journeyNotesForPlayer().trial?.deep===!!data.deep)saveJourney({trial:null});
      refreshFieldPractice();return;
    }
    const notes=journeyNotesForPlayer(),me=ownServerCharacter();
    if(!me || me.level<13 || !data.skillId)return;
    const old=notes.prey,journey=gearGuides?.journey;
    const fallback=fieldCamp(journey,notes,false);
    const site=old?.open && old.level<=me.level && me.level-old.level<=4 && (!journey?.course || journey.camps.some(c=>c.mapId===old.mapId))?old:fallback;
    if(!site?.open)return;
    saveJourney({trial:{id:data.skillId,name:data.name,path:me.pathId,site,used:false,deep:!!data.deep,effect:data.effect}});
    toast("ฝึก "+data.name+" แล้ว · กลับไปลองที่ "+site.monster+" ใน"+site.map);refreshFieldPractice();
  }
  function recordPracticeCast(data){
    if(data?.playerId!==localId || !data.skillId)return;
    const me=ownServerCharacter(),trial=journeyNotesForPlayer().trial;
    if(!trial || trial.id!==data.skillId || trial.used || me?.mapId!==trial.site.mapId)return;
    const mob=monsterForSpell(trial.site.id);
    const targets=Array.isArray(data.targetIds)?data.targetIds:(data.targetId?[data.targetId]:[]);
    if(!targets.includes(trial.site.id)){
      const support=["intercept","ward","party_ward","support","heal","heal_area","spirit_heal","ward_area","cleanse","cleanse_area","spirit_ward","trance"].includes(trial.effect) || data.skillId==="protect";
      if(targets.length && !targets.some(id=>id===localId || (support && room.state.players?.has(id))))return;
      if(!mob || Math.hypot(me.x-mob.x,me.z-mob.z)>12)return;
    }
    // A lethal cast can be broadcast just after its kill receipt.
    if(Date.now()-(trial.killAt??0)<2000){finishJourneyPractice(trial);return;}
    saveJourney({trial:{...trial,used:true}});refreshFieldPractice();
  }
  function finishJourneyPractice(trial){
    saveJourney({trial:null});toast("ฝึกสำเร็จ · ใช้ "+trial.name+" และปราบ "+trial.site.monster);refreshFieldPractice();
  }
  function recordPracticePrey(site){
    if(!site?.open)return;
    const notes=journeyNotesForPlayer(),trial=notes.trial;
    if(notes.prey?.id!==site.id)saveJourney({prey:site});
    if(trial?.site.id!==site.id)return;
    if(trial.used)finishJourneyPractice(trial);
    else saveJourney({trial:{...trial,killAt:Date.now()}});
  }
  function journeyDirection(site){
    if(!site?.open)return {step:"พื้นที่ล่ายังไม่เปิด · ดูเส้นทางคราฟต์ได้ที่โต๊ะช่าง"};
    if(activeMapId!==site.mapId){
      const route=travelRoute(worldDefinitions,activeMapId,site.mapId);
      const gate=worldDefinitions?.[activeMapId]?.portals.find(p=>p.targetMapId===route[1]);
      return {step:gate?"ไปประตู "+worldDefinitions[route[1]].name+" เพื่อไป"+site.map:"ยังไม่มีเส้นทางไป"+site.map,to:gate};
    }
    const me=ownServerCharacter();let best=null,waiting=null,distance=Infinity;
    for(const id of site.mobs??[site.id]){
      const mob=monsterForSpell(id);
      if(!mob || mob.level>me.level)continue;
      if(!mob.alive){waiting??=mob;continue;}
      const d=Math.hypot(me.x-mob.x,me.z-mob.z);if(d<distance){distance=d;best=mob;}
    }
    return {step:(best?"ล่า ":waiting?"รอเกิด · ":"ไปยัง ")+(site.camp??site.monster)+" · "+site.map,to:best??waiting??(Number.isFinite(site.x)?site:null)};
  }
  function roleRating(piece,path,position){
    const forge=pieceForgeRatings(piece);
    if(position==="chest" || path==="sentinel")return {name:"การรับดาเมจมอน",value:pieceStat(piece,"def")+forge.guard};
    if(path==="mender")return {name:"พลังรักษา",value:pieceStat(piece,"magicAtk")*.15+forge.healing};
    if(path==="seer")return {name:"โจมตีเวท",value:pieceStat(piece,"magicAtk")+forge.ranged};
    return {name:"โจมตีประชิด",value:pieceStat(piece,"atk")+forge.melee};
  }
  function journeyEquipmentGoal(player,journey,notes){
    const slots=inventoryState.slots,worn=wornGearAt("mainHand",slots);
    if(player.level<10 && (worn?.forge?.rank??0)<3)return null;
    let entries=[{id:journey.weapon,position:"mainHand",hunt:journey.camp}];
    if(player.level>=23){
      const priority=player.pathId==="mender"?"offHand":player.pathId==="sentinel"?"chest":"mainHand";
      const build=gearGuides.builds.find(b=>b.style===(player.pathId==="sentinel"?"endurance":"pressure"));
      const shortfall=e=>(personalItems[e.id]?.level??0)-(personalItems[wornGearAt(e.position,slots)?.itemId]?.level??0);
      entries=[...entries,...(build?.slots??[]).filter(e=>e.position==="chest"||e.position==="offHand")]
        .filter(e=>shortfall(e)>0).sort((a,b)=>shortfall(b)-shortfall(a) || Number(b.position===priority)-Number(a.position===priority));
    }
    const entry=entries.find(e=>personalItems[e.id] && !notes.skipped?.includes(e.id) &&
      (bagMeta(wornGearAt(e.position,slots)?.itemId)?.level??0)<personalItems[e.id].level);
    if(!entry)return null;
    const meta=personalItems[entry.id],current=wornGearAt(entry.position,slots);
    const slot=slots.findIndex(s=>s?.itemId===entry.id),piece=slot>=0?slots[slot]:{itemId:entry.id};
    const inputs=fieldRecipeProgress(entry.id),missing=fieldMissingCopySupply(inputs),ready=!missing;
    const hunt=entry.hunt;
    // Finish a supply in its actual area, then recompute the next missing input.
    // The weapon drop camp cannot supply every ingredient in a multi-area recipe.
    const supply=slot<0 && missing && !missing.craftIngredient && itemHuntSource(missing.id,false)?.open
      ?itemHuntGuide({id:missing.id,need:missing.need}):null;
    const required=Math.max(meta.level||1,!supply && slot<0 && !ready?(hunt?.level||1):1);
    if(player.level<required)return fieldLevelingGoal(player,journey,required);
    const nav=supply??journeyDirection(hunt);
    const materialName=missing && (personalItems[missing.id]?.name||missing.id);
    return {title:"เป้า Lv."+meta.level+" · "+meta.name,step:slot>=0?"มีชิ้นนี้ในกระเป๋า · แตะดูผลเมื่อเปลี่ยน":ready?"วัตถุดิบครบ · เปิดสูตรเพื่อดูค่าคราฟต์":missing?.craftIngredient?"วัตถุดิบครบ · เปิดสูตรสร้าง "+materialName:supply?"หา "+materialName+" · "+nav.step:nav.step,
      to:slot<0 && !ready && !missing?.craftIngredient?nav.to:null,progress:supply?supply.progress:hunt?hunt.monster+" Lv."+hunt.level+" · "+hunt.map:"สร้างที่โต๊ะช่าง",
      missingMaterial:missing,refineId:supply?.refineId,craftIngredient:missing?.craftIngredient,
      recipe:entry.id,inputs,comparison:{piece,current,position:entry.position},itemSlot:slot,track:slot<0&&hunt?.open,canSkip:true};
  }
  function openFieldTraining(){
    const book={muay_boran:openMuayBook,phutthaisawan:openSwordTree,blade:openBladeBook,sentinel:openSentinelBook,seer:openOccultBook,mender:openOccultBook}[ownServerCharacter()?.pathId];
    if(book)book();
  }
  function fieldSkillKind(){
    const path=ownServerCharacter()?.pathId;
    return {muay_boran:"muay",phutthaisawan:"sword",seer:"occult",mender:"occult",sentinel:"sentinel",blade:"blade"}[path];
  }
  function fieldCamp(journey,notes,allowChallenge=true){
    const camps=journey?.camps;
    const challenge=allowChallenge && journey?.challenges?.find(c=>c.id===notes.campId);
    if(challenge)return challenge;
    return camps?.find(c=>c.id===notes.campId) ?? camps?.find(c=>c.mapId===activeMapId) ?? journey?.practice;
  }
  function fieldLevelingGoal(player,journey,targetLevel){
    if(!player)return {step:"กำลังอ่านเลเวลตัวละคร…",progress:"เป้า Lv."+targetLevel,levelGoal:true};
    const eligible=site=>site?.open && site.level<=player.level && player.level-site.level<=4;
    const camps=(journey?.camps??[]).filter(eligible),preferred=fieldCamp(journey,journeyNotesForPlayer());
    const site=eligible(preferred)?preferred:camps.find(c=>c.mapId===activeMapId)??camps[0]??(eligible(journey?.practice)?journey.practice:null);
    const nav=site?journeyDirection(site):{};
    const xp=Number.isFinite(player.xpToNext) && player.xpToNext>0?" · EXP "+(player.experience||0)+"/"+player.xpToNext:"";
    return {title:"เก็บเลเวลก่อนเดินทางต่อ",step:site?nav.step+" · เก็บถึง Lv."+targetLevel+" แล้วกลับไปเป้าหมายต่อ":
      "เก็บเลเวลถึง Lv."+targetLevel+" ก่อน · รอข้อมูลค่ายล่าที่เหมาะกับเลเวล",to:nav.to,
      progress:"Lv."+player.level+" / "+targetLevel+xp,levelGoal:true};
  }
  function fieldTechnique(course){
    const candidates=course?.techniques;
    if(!candidates?.length)return null;
    if(candidates.length===1)return candidates[0];
    return candidates.find(t=>t.school===muaySchoolOf({local:true})) ?? candidates[0];
  }
  function openFieldDeepTraining(){
    if(typeof mixedSkillData==="function" && mixedSkillData())return openUnifiedSkillBook();
    const kind=fieldSkillKind();if(mode!=="live" || !room || !kind)return;
    const trial=journeyNotesForPlayer().trial;
    const course=gearGuides?.journey?.course, suggested=fieldTechnique(course);
    if(trial?.deep || suggested)skillGraphSel[kind]=trial?.deep?trial.id:suggested.id;
    openClassBookDrawer("fieldSkills","ผังสกิล · วิชาแกนและวิชาเสริม",'<button id="fieldCoreBook" type="button" class="secondary">กลับไปวิชาแกน</button><p id="fieldRankHelp" class="note"></p><div id="fieldSkillGraph" aria-live="polite"></div>');
    $("fieldCoreBook").onclick=openClassSkillBook;
    $("fieldRankHelp").textContent="ดูวิชาเสริมได้ตั้งแต่ Lv.1 · แต้มสายแยกจากแต้มวิชาแกน · เรียนหรืออัปขั้นใช้ 1 แต้มเมื่อครบเงื่อนไขของวิชานั้น · เซิร์ฟเวอร์ที่รองรับให้เลือกวิชาแกนและวิชาเสริมรวมใน 4 ช่องเดิม";
    if(["blade","sentinel","occult"].includes(kind))room.send(kind+"_book_get",{});
    $("fieldSkillGraph").textContent="กำลังอ่านตำราของตัวละคร…";skillGraphKey="";renderSkillGraph(kind,$("fieldSkillGraph"));
  }
  function tryFieldTechnique(trial){
    const kind=fieldSkillKind(),node=skillGraphModel(kind)?.nodes.find(n=>n.id===trial.id);
    if(!node?.learned || !(node.slot>=0)){openFieldDeepTraining();toast("จัดวิชานี้ลงช่องในตำราก่อน");return;}
    const selfEffects={sword:["guard","support"],muay:["guard","parry","evade"],sentinel:["anchor","ward","intercept","party_ward"]};
    const command=kind+"_skill";
    if(kind==="sentinel" && node.effect==="intercept"){chooseOccultAlly(trial.id,node.name,command);return;}
    const offensive=kind==="occult"?["mark","rice","rice_area","detonate","interrupt","curse","curse_burst","spirit","spirit_bind","pve_rice"].includes(node.effect):
      kind==="blade"?["approach","strike","consume","windup","counter"].includes(node.effect):!selfEffects[kind]?.includes(node.effect);
    const me=ownServerCharacter(),mob=monsterForSpell(trial.site.id);
    if(me?.mapId!==trial.site.mapId || !mob?.alive)return toast("กลับไปที่ "+trial.site.monster+" ก่อนลองวิชา");
    closeDrawer();room.send(command,{skillId:trial.id,...(offensive?{targetId:trial.site.id}:{})});
  }
  function fieldBossOptions(journey){
    return (journey?.bosses?.length?journey.bosses:journey?.boss?[journey.boss]:[]).filter(b=>b.camp?.open);
  }
  function shrineDirection(journey,player){
    const shrine=journey?.shrine;
    if(!shrine || player?.level!==100 || (gearGuides?.cycle??0)>=journey.rebirthLimit)return null;
    const local=activeMapId===shrine.mapId;
    const arrived=local && player.alive && Math.abs(player.y)<=0.5 && Math.hypot(player.x-shrine.x,player.z-shrine.z)<=shrine.radius;
    const route=!local?travelRoute(worldDefinitions,activeMapId,shrine.mapId):[];
    const gate=worldDefinitions?.[activeMapId]?.portals.find(p=>p.targetMapId===route[1]);
    return {title:"ไปศาลเกิดใหม่",step:arrived?"ถึงศาลแล้ว · แตะเพื่อเลือกอาชีพ":local?"เดินไปกลางลานศาลและลงถึงพื้น":
      gate?"ไปประตู "+worldDefinitions[route[1]].name:"ยังไม่มีเส้นทางจากที่นี่",
      progress:shrine.name,to:local?shrine:gate,rebirthRoute:true,arrived};
  }
  function fieldGearGoal(){
    const player=ownServerCharacter();
    if(mode!=="live" || !player || !inventoryState || territoryState?.local?.inField)return null;
    if(!economyReady() && player.level<26)return null;
    const guide=gearGuides?.path===player.pathId?gearGuides:null;
    const camp=guide?.starterHunt,journey=guide?.level===player.level?guide.journey:null,notes=journey?journeyNotesForPlayer():{};
    if(notes.shrine){
      const destination=shrineDirection(journey,player);
      if(destination)return destination;
    }
    if(camp && player.level<=camp.maxLevel && (player.level<10 || !journey || notes.skipped?.includes(journey.weapon))){
      const meta=personalItems[camp.weapon],equipped=currentEquippedWeaponSlot();
      const slot=inventoryState.slots[equipped]?.itemId===camp.weapon?equipped:inventoryState.slots.findIndex(s=>s?.itemId===camp.weapon);
      const piece=inventoryState.slots[slot],bank=inventoryState.forgeCopies?.[camp.weapon]??0;
      const rank=piece?.forge?.rank??0;
      if(meta && piece && rank<3){
        const donors=inventoryState.slots.filter((s,i)=>s?.itemId===camp.weapon && i!==slot && i!==equipped &&
          s.socket===undefined && !s.forge?.rank && !s.forge?.misses).length;
        const copyReady=bank>0 || donors>0,inputs=fieldRecipeProgress(camp.weapon);
        const missing=fieldMissingCopySupply(inputs);
        const guide={title:copyReady?"ฝึกอาวุธ +"+(rank+1)+" · "+meta.name:"สร้าง "+meta.name+" อีก 1 ชิ้น",
          recipe:camp.weapon,slot,inputs,bank,copyReady,copyGoal:true,nextRank:rank+1,
          progress:copyReady?"อาวุธสำรอง "+(bank+donors)+" ชิ้น · พร้อมตี +"+(rank+1):
            missing?(personalItems[missing.id]?.name||missing.id)+" "+missing.have+"/"+missing.need:"วัตถุดิบครบ · สร้างชิ้นสำรอง"};
        if(copyReady)return {...guide,step:bank?"มีชิ้นสำรองในคลังช่างแล้ว · เปิดช่างตีบวก":
          "มีชิ้นสำรองในกระเป๋าแล้ว · เปิดช่างและเลือกชิ้นสำรอง"};
        if(!missing)return {...guide,step:"วัตถุดิบครบ · เปิดสูตรสร้าง "+meta.name+" อีก 1 ชิ้น"};
        const missingName=personalItems[missing.id]?.name||missing.id;
        if(missing.craftIngredient)return {...guide,step:"วัตถุดิบครบ · เปิดสูตรสร้าง "+missingName+" เพื่อทำอาวุธ",
          craftIngredient:missing.craftIngredient,missingMaterial:missing};
        const source=itemHuntSource(missing.id,false);
        const nav=source?.open?itemHuntGuide({id:missing.id,need:missing.need}):null;
        return {...guide,step:nav?"หา "+missingName+" เพื่อสร้างอาวุธ · "+nav.step:
          "หา "+missingName+" อีก "+(missing.need-missing.have)+" ชิ้น · เปิดสูตรดูวัตถุดิบ",
          to:nav?.to,refineId:nav?.refineId,missingMaterial:missing};
      }
    }
    const bosses=fieldBossOptions(journey);
    const selected=bosses.find(b=>notes.boss===b.gear || (notes.boss===true && player.level<=25 && !itemHuntCount(b.gear)));
    const boss=selected??bosses.find(b=>!notes.deferredBosses?.includes(b.gear) && !itemHuntCount(b.gear));
    if(!selected && journey && notes.trial && player.level>=13 && (!journey.course || journey.camps.length)){
      const trial=notes.trial,nav=journeyDirection(trial.site);
      return {title:"ลอง "+trial.name,step:nav.step,progress:trial.used?"ใช้วิชาแล้ว · ปราบ "+trial.site.monster:"ใช้วิชาที่เพิ่งอัปแล้วปราบ "+trial.site.monster,
        practiceOnly:true,trial,to:nav.to};
    }
    const trainingBand=journey?.course?.band ?? (player.level>=45 && player.level<=49?45:player.level>=35 && player.level<=39?35:0);
    if(!selected && ((player.level>=13 && player.level<=17) || (player.level>=23 && player.level<=25) || (trainingBand && notes.savedTraining!==trainingBand)) && currentFieldTraining()){
      return {title:"ฝึกวิชาประจำอาชีพ",step:"ใช้แต้มได้ทุกที่หลังพ้นการต่อสู้ 5 วินาที · แตะดูวิชาที่ฝึกได้",
        progress:currentFieldTraining().points+" แต้มวิชาแกน",trainingOnly:true,trainingBand};
    }
    if(selected && personalItems[boss.gear]?.recipe?.some(i=>i.item===boss.fragment)){
      const inputs=fieldRecipeProgress(boss.gear),f=inputs.find(i=>i.id===boss.fragment),nav=journeyDirection(boss.camp);
      const supply=inputs.find(i=>i.id!==boss.fragment && i.have<i.need);
      const awake=activeMapId===boss.camp.mapId && room?.state?.monsters?.get(boss.camp.id);
      const step=journey.course && awake && !awake.alive?"บอสยังไม่เกิด · กลับค่ายได้":
        f.have>=f.need?(supply?"หา"+supply.name+"อีก "+(supply.need-supply.have)+" ชิ้น":"เศษครบ · เปิดสูตรที่โต๊ะช่าง"):
        awake && !awake.alive?"บอสยังไม่เกิด · ตามหาวัตถุดิบอื่นระหว่างรอ":nav.step;
      return {title:"ล่าบอส · "+boss.camp.monster,step,progress:f.name+" "+f.have+"/"+f.need,recipe:boss.gear,inputs,to:journey.course || f.have<f.need?nav.to:null,bossChoice:true,bossGear:boss.gear,
        milestone:"อุปกรณ์ Lv."+boss.level+" · "+personalItems[boss.gear].name+" · บอสเกิดทุก "+(boss.respawnMinutes??20)+" นาที"};
    }
    if(journey && player.level>=26){
      if(notes.equipment){
        const equipment=journey.weapon && journeyEquipmentGoal(player,journey,notes);
        if(equipment)return equipment;
      }
      const site=fieldCamp(journey,notes),nav=journeyDirection(site);
      if(journey.course){
        const technique=fieldTechnique(journey.course);
        return {title:site?"ล่า "+site.monster+" Lv."+site.level:"เส้นทางล่า Lv."+player.level,step:site?nav.step:"พื้นที่ล่าช่วงนี้ยังไม่เปิด · เปิดตำราเพื่อฝึกวิชาได้",to:nav.to,
          progress:technique?"ฝึก "+technique.name+" · วิชา Lv."+technique.level:"เปิดตำราอาชีพ",
          milestone:player.level===100?"ถึง Lv.100 แล้ว · ทดลองชุดสกิลหรือเลือกท้าราชันรอยแยก":null};
      }
      return {title:"ฝึกวิชาที่ค่ายล่า Lv."+player.level,step:nav.step,to:nav.to,
        progress:journey.lesson?journey.lesson.name+" · แนะนำที่ Lv."+journey.lesson.level:(site?.monster??"เปิดตำราเพื่อเลือกวิชาต่อไป")};
    }
    const equipment=journey?.weapon && journeyEquipmentGoal(player,journey,notes);
    if(equipment && (player.level<=12 || player.level>=23))return equipment;
    // A boss fragment carries its own recipe, including any second ingredient.
    const fragments=inventoryState.slots.filter(s=>{
      const fragment=personalItems[s?.itemId];
      return fragment?.bossGear && !(player.level<=25 && notes.bossSkipped && fragment.bossGear===boss?.gear) && !notes.deferredBosses?.includes(fragment.bossGear) && !itemHuntCount(fragment.bossGear);
    });
    const inHub=activeMapId==="ritual_village" || worldDefinitions?.[activeMapId]?.strategic?.kind==="capital";
    const fragment=fragments.find(s=>personalItems[s.itemId].huntTarget?.mapId===activeMapId)??(inHub?fragments[0]:null);
    const recipe=personalItems[fragment?.itemId]?.bossGear,meta=personalItems[recipe];
    if(!meta?.recipe){
      if(equipment)return equipment;
      if(boss && !(player.level<=25 && notes.bossSkipped))
        return {title:"ทางเลือก · "+boss.camp.monster,step:"ดูเป้าบอสหรือกลับไปล่ามอนทั่วไป",progress:personalItems[boss.gear].name,bossInvite:true,bossGear:boss.gear};
      const training=currentFieldTraining();
      if(training)return {title:"ฝึกวิชาประจำอาชีพ",step:"ใช้แต้มได้ทุกที่หลังพ้นการต่อสู้ 5 วินาที · แตะดูวิชาที่ฝึกได้",progress:training.points+" แต้มวิชา",trainingOnly:true};
      return journey && player.level<=25?fieldLevelingGoal(player,journey,player.level<10?10:player.level<20?20:26):null;
    }
    const inputs=fieldRecipeProgress(recipe),f=inputs.find(i=>i.id===fragment.itemId);
    if(!f)return null;
    const missing=inputs.find(i=>i.id!==f.id && i.have<i.need);
    return {title:"สมบัติบอส · "+meta.name,recipe,inputs,step:missing?"หา"+missing.name+"อีก "+(missing.need-missing.have)+" ชิ้น":
      f.have<f.need?"กลับไปล่าบอสเพื่อเก็บ"+f.name:"วัตถุดิบครบ · เปิดสูตรที่โต๊ะช่าง",progress:f.name+" "+f.have+"/"+f.need};
  }
  function hudGuide() {
    const map = worldDefinitions?.[activeMapId], hero = getLocalAvatar(), kills = hudKills[activeMapId] || 0;
    const nearestOf = list => { let best = null, d = Infinity; for (const p of list) { const k = Math.hypot(p.x - hero.x, p.z - hero.z); if (k < d) { d = k; best = p; } } return best; };
    if (!hero) return null;
    const trade=cityTradeHudGuide();if(trade)return trade;
    if(gearGuides?.journey?.shrine && journeyNotesForPlayer().shrine && !territoryState?.local?.inField){
      const shrine=shrineDirection(gearGuides.journey,ownServerCharacter());if(shrine)return shrine;
    }
    const hunt=itemHuntGuide();if(hunt)return hunt;
    const objective=forestObjectiveHudGuide();if(objective && forestObjectiveState.active)return objective;
    const field=fieldGearGoal();if(field)return field;
    if(objective)return objective;
    if (activeMapId === "ritual_village") {
      if (mode !== "live") {
        if (enemy.isEnabled() && kills < 1) return { title: "ลองปราบผีทดสอบ", step: "เดินเข้าใกล้ผีที่ลานกลาง แล้วแตะตัวผี", progress: "ปราบ " + kills + "/1", to: { x: enemy.position.x, z: enemy.position.z } };
        return { title: "พร้อมออกเดินทาง", step: "กดปุ่ม ออนไลน์ ด้านล่าง เพื่อเข้าเล่นจริงและวาร์ปไปป่า", progress: kills ? "ปราบแล้ว " + kills : "" };
      }
      const gate = (map?.portals || []).find(p => p.targetMapId === "forbidden_forest") || { x: -10, z: -56 };
      return { title: "ออกล่าผี", step: "เดินไปประตูวาร์ป ป่าต้องห้าม", progress: "", to: gate };
    }
    if (map?.strategic?.kind === "capital") {
      const gate = nearestOf(map.portals || []);
      return { title: "นครเวียงมนตรา · เขตปลอดภัย", step: "เลือกประตูเมืองเพื่อไปเขตล่าหรือด่านสงคราม", progress: "", to: gate };
    }
    const range = map?.region?.range || null;
    const alive = []; for (const [id, mesh] of forestMonsters) { const g = mesh.metadata?.ghost; if (mesh.isEnabled() && !g?.deathAt) alive.push({ id, x: mesh.position.x, z: mesh.position.z }); }
    const prey = nearestOf(alive);
    const preyName = prey ? monsterName(room?.state?.monsters?.get?.(prey.id), prey.id) : "";
    return { title: "ล่าผี · " + (map?.name || "") + (range ? " Lv " + range.join("–") : ""),
      step: prey ? "ผีใกล้สุด: " + (preyName || "ผี") : "ไม่มีผีใกล้ ๆ · รอผีเกิดใหม่หรือสำรวจต่อ", progress: "ปราบแล้ว " + kills, to: prey };
  }
  const hudProjA = new B.Vector3(), hudProjB = new B.Vector3();
