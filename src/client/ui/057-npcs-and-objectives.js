  function stripMarkdownForSpeech(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/^[ \t]*[-*•]+[ \t]+/gm, "")
      .replace(/[`#_~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function openNpcGuide(npc){
    if(npcGuidePending){clearTimeout(npcGuidePending.timer);npcGuidePending=null;}
    openDrawer("npcGuide",npc.name+" · สอบถาม",'<p class="note">ถามเรื่องสงคราม เหตุการณ์ เก็บเลเวล ภารกิจ กิลด์ หรือเสบียงได้ คำถามและตัวเลือกภารกิจที่เหมาะสมอาจส่งให้ Typhoon เพื่อช่วยทำความเข้าใจ</p><div class="party-actions"><button type="button" class="secondary" id="guideAskWar">ด่านไหนเปิดตี</button><button type="button" class="secondary" id="guideAskEvent">มีเหตุการณ์อะไร</button><button type="button" class="secondary" id="guideAskLevel">เก็บเลเวลที่ไหน</button><button type="button" class="secondary" id="guideAskQuest">แนะนำภารกิจ</button></div><label class="field" for="npcGuideQuestion">คำถาม</label><input id="npcGuideQuestion" maxlength="180" autocomplete="off" placeholder="เช่น แนะนำภารกิจคุ้มกัน"><button id="npcGuideSend" class="primary" type="button">ถามผู้แนะนำ</button><button id="npcGuideSpeakBtn" class="secondary" type="button" style="margin-top:6px" hidden>🔊 ฟังเสียงตอบภาษาไทย</button><p id="npcGuideAnswer" role="status" style="white-space:pre-line"></p>');
    const input=$("npcGuideQuestion"),output=$("npcGuideAnswer"),send=$("npcGuideSend"),speak=$("npcGuideSpeakBtn");
    const ask=()=>{
      const question=input.value.trim();if(!room || mode!=="live")return toast("เข้า LIVE เพื่อคุยกับผู้แนะนำ");
      if(Array.from(question).length<2 || Array.from(question).length>180)return toast("พิมพ์คำถาม 2–180 ตัวอักษร");
      if(npcGuidePending)return;
      npcGuideSeq=npcGuideSeq>=2_147_483_647?1:npcGuideSeq+1;const id=npcGuideSeq;
      if(!speak.hidden)window.MontraAudio?.stopSpeech?.();
      speak.hidden=true;
      speak.onclick=null;
      if(speak.montraSpeechStatus)speak.montraSpeechStatus.hidden=true;
      send.disabled=true;output.textContent="กำลังตรวจข้อมูลในเกม…";
      const timer=setTimeout(()=>{if(npcGuidePending?.id!==id)return;npcGuidePending=null;if(drawerActive==="npcGuide"){send.disabled=false;output.textContent="ผู้แนะนำตอบไม่ทัน ลองใหม่อีกครั้ง";}},9000);
      npcGuidePending={id,timer};try{room.send("ask_npc_guide",{npcId:npc.id,question,requestId:id});}catch{clearTimeout(timer);npcGuidePending=null;send.disabled=false;output.textContent="ส่งคำถามไม่สำเร็จ ลองใหม่อีกครั้ง";}
    };
    send.onclick=ask;input.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();ask();}};
    for(const [id,text] of [["guideAskWar","ด่านไหนเปิดตี"],["guideAskEvent","มีเหตุการณ์อะไร"],["guideAskLevel","เก็บเลเวลที่ไหน"],["guideAskQuest","แนะนำภารกิจ"]])$(id).onclick=()=>{input.value=text;ask();};
  }
  function openServiceNpc(npc){
    if(!Object.hasOwn(serviceNpcUi,npc.role))return;
    const service=serviceNpcUi[npc.role];
    openDrawer("npc",npc.name,'<p id="serviceNpcSpeech" class="note"></p><button id="serviceNpcSpeak" class="secondary" type="button" style="margin-bottom:8px">🔊 ฟังเสียงพูดไทย</button><button id="serviceNpcAction" class="primary" type="button"></button>');
    $("serviceNpcSpeech").textContent=npc.name+": "+service.dialogue;
    const speakBtn=$("serviceNpcSpeak");
    const persona=service.persona || "guide";
    if(speakBtn)bindSpeechButton(speakBtn, service.dialogue, persona, "🔊 ฟังเสียงพูดไทย");
    const action=$("serviceNpcAction");action.textContent=service.action;
    if(npc.role==="ghostHealer"){
      action.dataset.ghostHealer="true";
      action.disabled=Boolean(ghostPoolPending);
    }
    const marketHere=npc.role==="market" && room?.state?.cityMarketSupported===true && Object.hasOwn(citySiteNames,activeMapId);
    if(marketHere)action.textContent="เปิดตลาดประจำเมือง";
    action.onclick=()=>{
      const handlers={smith:openSmith,market:marketHere?openCityMarket:openEconomy,guild:openGuild,
        party:openParty,travel:openMap,strategy:openStrategicMap,guide:openHelp,war:openWarPanel,
        ghostHealer:()=>requestGhostTreatment(npc.id),
        cityWarehouse:()=>openCityProduction("warehouse"),cityFactory:()=>openCityProduction("factory"),
        cityMissions:openCityMission,cityHall:openCityGovernance,
        mentor:()=>{const path=ownServerCharacter()?.pathId,books={muay_boran:openMuayBook,phutthaisawan:openSwordTree,blade:openBladeBook,sentinel:openSentinelBook,seer:openOccultBook,mender:openOccultBook};
          if(books[path])books[path]();else toast("เลือกอาชีพก่อนดูวิชา");}};
      handlers[npc.role]?.();
    };
    if(marketHere){
      const worldMarket=document.createElement("button");worldMarket.type="button";worldMarket.className="secondary";
      worldMarket.textContent="เปิดตลาดโลก";worldMarket.onclick=openEconomy;ui.drawerBody.append(worldMarket);
      if(activeMapId==="moon_pass" && room.state.cityPurchaseSupported===true){
        const purchase=document.createElement("button");purchase.type="button";purchase.className="secondary";
        purchase.textContent="เปิดใบสั่งซื้อกิลด์";purchase.onclick=openCityPurchase;ui.drawerBody.append(purchase);
      }
    }
    if(npc.role==="mentor"){
      const rebirth=document.createElement("button");rebirth.type="button";rebirth.className="secondary";rebirth.textContent="เกิดใหม่และความชำนาญ";rebirth.onclick=openRebirth;ui.drawerBody.append(rebirth);
    }
    if(npc.role==="guide" || npc.role==="strategy"){
      const ask=document.createElement("button");ask.type="button";ask.className="secondary";ask.textContent="สอบถามผู้ช่วยภาษาไทย";ask.onclick=()=>openNpcGuide(npc);ui.drawerBody.append(ask);
    }
    if(npc.role==="strategy" && territoryState?.local?.site===activeMapId){
      const war=document.createElement("button");war.type="button";war.className="secondary";war.textContent="สงครามและการปกครองด่าน";war.onclick=openWarPanel;ui.drawerBody.append(war);
    }
  }
  function syncQuestRanger(){
    const keeper=forestObjectiveState?.keeper,visible=Boolean(keeper && keeper.mapId===activeMapId && mode==="live");
    questRangerRoot.setEnabled(visible);
    if(visible){questRangerRoot.position.set(keeper.x,keeper.y || 0,keeper.z);const tint=[...keeper.mapId].reduce((sum,ch)=>sum+ch.charCodeAt(0),0)%rangerRobes.length;rangerBody.material=rangerRobes[tint];}
    const active=forestObjectiveState?.active,entry=active && forestObjectiveState?.options?.[active.id],area=entry?.defense;
    const hasDefense=Boolean(mode==="live" && entry?.kind==="defense" && entry.mapId===activeMapId && area);
    defenseKeeperRoot.setEnabled(hasDefense);
    if(hasDefense){const map=worldDefinitions?.[activeMapId];defenseKeeperRoot.position.set(area.x,map?.terrain?terrainHeight(map.terrain,area.x,area.z):0,area.z);}
    const escortVisible=Boolean(mode==="live" && forestEscortState?.mapId===activeMapId && forestEscortState.id===active?.id);
    escortRoot.setEnabled(escortVisible);
    if(escortVisible)escortRoot.position.set(forestEscortState.x,forestEscortState.y || 0,forestEscortState.z);
  }
  function nearQuestRanger(){
    const keeper=forestObjectiveState?.keeper,me=ownServerCharacter();
    return Boolean(keeper && me && keeper.mapId===activeMapId && !me.flying && Math.hypot(me.x-keeper.x,me.z-keeper.z)<=keeper.radius);
  }
  function forestObjectiveNavigationTarget(definition,active,keeper){
    const delivery=definition.kind==="delivery" && active.progress>=definition.goal-1;
    const mapId=delivery?definition.destinationMapId:definition.mapId;
    if(mapId!==activeMapId){
      const route=travelRoute(worldDefinitions,activeMapId,mapId);
      return worldDefinitions?.[activeMapId]?.portals?.find(p=>p.targetMapId===route[1]);
    }
    if(delivery || definition.kind==="escort" && forestEscortState?.id!==active.id)return keeper?.mapId===mapId?keeper:null;
    if(definition.kind==="escort")return {...definition.escort,mapId};
    if(definition.kind==="defense")return {...definition.defense,mapId};
    const prefix=definition.stages?.[active.progress]?.prefix || definition.prefix;
    const me=ownServerCharacter();let nearest=null,distance=Infinity;
    for(const [id,mob] of room?.state?.monsters || []){
      if(!mob.alive || mob.mapId!==mapId || !(definition.targetId?id===definition.targetId:prefix && id.startsWith(prefix)))continue;
      const d=Math.hypot(me.x-mob.x,me.z-mob.z);if(d<distance){nearest=mob;distance=d;}
    }
    if(nearest)return nearest;
    const map=worldDefinitions?.[mapId],camp=definition.stages?.[active.progress]?.camp || definition.camp;
    const home=definition.targetId?[map?.boss,map?.guardian].find(p=>p?.id===definition.targetId):(map?.camps||[]).find(p=>p.name===camp);
    return home?{...home,mapId}:null;
  }
  function forestObjectiveHudGuide(){
    if(mode!=="live" || !room?.state?.forestObjectivesAvailable || !forestObjectiveState)return null;
    const {active,keeper,options}=forestObjectiveState,definition=active && options?.[active.id];
    if(definition)return {title:definition.name,step:objectiveStep(definition,active)+" · แตะเพื่อเดิน",progress:active.progress+"/"+definition.goal,to:forestObjectiveNavigationTarget(definition,active,keeper)};
    const event=directorEventState?.event;
    if(event && !forestObjectiveState?.eventClaimed)return {title:event.mapId===activeMapId?"เกิดเหตุการณ์ในพื้นที่":"เหตุการณ์ที่ "+event.mapName,step:"คุยกับผู้มอบงานเพื่อเข้าร่วม",progress:"",to:event.mapId===activeMapId?keeper:worldDefinitions?.[activeMapId]?.portals?.find(p=>p.targetMapId===travelRoute(worldDefinitions,activeMapId,event.mapId)[1])};
    if(keeper?.mapId===activeMapId)return {title:"พบผู้มอบงาน",step:"คุยกับ "+keeper.name+" เพื่อรับภารกิจ",progress:"",to:keeper};
    return null;
  }
  function renderForestObjectiveHud(){
    if(mode!=="live" || !room?.state?.forestObjectivesAvailable || territoryState?.local?.site===activeMapId || ui.quest.classList.contains("war-hud"))return;
    const guide=hudGuide();if(!guide)return;
    hudSet(ui.quest.querySelector("strong"),"qt",guide.title);
    hudSet(ui.quest.querySelector(".quest-content > span"),"qs",guide.step);
    hudSet($("questProgress"),"qp",guide.progress || "");
  }
  function objectiveStep(entry,active){
    if(entry.kind==="escort")return forestEscortState?.id===active.id
      ? `พาผู้เดินทางไป${entry.camp} · พลัง ${forestEscortState.hp}/${forestEscortState.maxHp}`
      : `คุยกับผู้มอบงานเพื่อเริ่มคุ้มกันไป${entry.camp}`;
    if(entry.kind==="defense")return forestDefenseState?.id===active.id
      ? `เสบียง ${forestDefenseState.hp}/${forestDefenseState.maxHp} · ปราบผี ${active.progress}/${entry.goal}`
      : `ไป${entry.camp} แล้วเริ่มป้องกัน`;
    if(entry.kind==="delivery")return active.progress>=entry.goal-1
      ? "ส่งเสบียงให้ผู้มอบงานที่ "+entry.destinationName
      : "รวบรวมเสบียงที่ "+entry.camp+" · "+active.progress+" / "+(entry.goal-1);
    return (entry.stages?.[active.progress]?.camp || entry.camp)+" · "+active.progress+" / "+entry.goal;
  }
  function renderEscortControl(body,entry,active){
    if(entry?.kind!=="escort")return;
    const note=document.createElement("p");note.className="note";note.textContent="ผู้เดินทางจะตามเมื่ออยู่ใกล้ คอยกำจัดผีที่เข้าใกล้และพาไปถึงจุดหมายบนแผนที่ หากบาดเจ็บหรือออกจากพื้นที่ให้กลับมาเริ่มใหม่";body.append(note);
    if(forestEscortState?.id===active.id){const status=document.createElement("p");status.id="escortStatus";status.textContent=`ผู้เดินทาง ${forestEscortState.hp}/${forestEscortState.maxHp} · เดินตามอยู่`;body.append(status);return;}
    if(nearQuestRanger()){const start=document.createElement("button");start.type="button";start.className="primary";start.textContent="คุยกับผู้เดินทางเพื่อเริ่มคุ้มกัน";
      start.onclick=()=>{start.disabled=true;room?.send("start_forest_escort",{});};body.append(start);}
  }
  function renderDefenseControl(body,entry,active){
    if(entry?.kind!=="defense" || !entry.defense)return;
    const note=document.createElement("p");note.className="note";
    note.textContent="ผีที่อยู่ในเขตจะสร้างความเสียหายแก่เสบียง ปราบผีในเขตให้ครบก่อนเสบียงหมด หากพลาดให้เริ่มใหม่";body.append(note);
    if(forestDefenseState?.id===active.id)return;
    const me=ownServerCharacter(),area=entry.defense,near=me && me.mapId===entry.mapId && !me.flying && Math.hypot(me.x-area.x,me.z-area.z)<=4;
    const start=document.createElement("button");start.type="button";start.className="primary";start.textContent=near?"คุยกับผู้ดูแลเพื่อเริ่มป้องกัน":"ไปหาผู้ดูแลเสบียงบนแผนที่";
    start.onclick=()=>{if(!near)return openMap();start.disabled=true;room?.send("start_forest_defense",{});};body.append(start);
  }
  function directorSeconds(event){
    const base=directorEventState?.event?.id===event?.id && Number.isFinite(directorEventState.serverNow)?directorEventState.serverNow+Math.max(0,performance.now()-directorReceivedAt):Date.now();
    return Math.max(0,Math.ceil((event.endsAt-base)/1000));
  }
  function updateDirectorTimer(){const timer=$("directorTimer"),event=forestObjectiveState?.event || directorEventState?.event;if(timer && event){const seconds=directorSeconds(event);timer.textContent="เหลือ "+Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0")+" · โบนัสเหตุการณ์รับได้ครั้งเดียว";}}
  function renderForestObjective(){
    const body=$("forestObjectiveBody");if(!body)return;body.replaceChildren();
    const state=forestObjectiveState;
    if(!state){body.textContent="กำลังโหลดภารกิจ…";return;}
    const explanation=document.createElement("p");explanation.className="note";
    explanation.textContent=(state.keeper?.name || "ผู้มอบงาน")+": เลือกงานล่า ลาดตระเวน หรือส่งเสบียงได้ ทำซ้ำได้และร่วมล่ากับปาร์ตี้ได้ งานส่งเสบียงต้องนำไปให้ผู้มอบงานปลายทาง";body.append(explanation);
    const active=state.active,entry=active && state.options?.[active.id];
    const event=state.event;
    if(event){
      const heading=document.createElement("h3");heading.textContent=event.name;body.append(heading);
      const story=document.createElement("p");story.textContent=event.story;body.append(story);
      const task=state.options?.[event.objectiveId];
      if(task){const detail=document.createElement("p");detail.textContent=objectiveStep(task,{id:event.objectiveId,progress:0})+" · โบนัส EXP เพิ่มเท่ากับมอนสเตอร์ตามระดับงาน 1 ตัว";body.append(detail);}
      const timer=document.createElement("p");timer.id="directorTimer";timer.className="note";body.append(timer);updateDirectorTimer();
      if(state.eventClaimed){const note=document.createElement("p");note.textContent="รับโบนัสเหตุการณ์นี้แล้ว";body.append(note);}
      else if(!active && nearQuestRanger()){
        const join=document.createElement("button");join.type="button";join.className="primary";join.textContent="รับภารกิจเหตุการณ์";
        join.disabled=(ownServerCharacter()?.level ?? 0)>=100 || directorSeconds(event)<=0;
        join.onclick=()=>{join.disabled=true;room?.send("set_forest_objective",{id:event.objectiveId,eventId:event.id});};body.append(join);
      }else if(!active){const note=document.createElement("p");note.textContent="ไปคุยกับผู้มอบงานในพื้นที่เพื่อเข้าร่วม";body.append(note);}
      else if(active.directorEventId===event.id){const note=document.createElement("p");note.textContent="กำลังทำภารกิจเหตุการณ์นี้";body.append(note);}
      else {const note=document.createElement("p");note.textContent="ทำภารกิจปัจจุบันให้จบหรือยกเลิกก่อนเข้าร่วม";body.append(note);}
    }else if(directorEventState?.event && directorEventState.event.mapId!==activeMapId){
      const distant=directorEventState.event,heading=document.createElement("h3");heading.textContent=distant.name+" · "+distant.mapName;body.append(heading);
      const story=document.createElement("p");story.textContent=distant.story;body.append(story);
      const timer=document.createElement("p");timer.id="directorTimer";timer.className="note";body.append(timer);updateDirectorTimer();
      const route=document.createElement("button");route.type="button";route.className="secondary";route.textContent="ดูเส้นทางไปเหตุการณ์";route.onclick=()=>openStrategicMap(distant.mapId);body.append(route);
    }
    if(entry){renderDefenseControl(body,entry,active);renderEscortControl(body,entry,active);}
    if(!nearQuestRanger()){
      if(entry){const heading=document.createElement("h3");heading.textContent=entry.name;body.append(heading);const progress=document.createElement("p");progress.textContent=objectiveStep(entry,active);body.append(progress);}
      const note=document.createElement("p");note.className="note";note.textContent=state.keeper?"เดินไปคุยกับ "+state.keeper.name+" ที่จุดสีทองบนแผนที่ เพื่อรับหรือยกเลิกงาน":"เดินทางไปแผนที่ล่า แล้วคุยกับผู้มอบงานใกล้จุดพัก";body.append(note);
      const map=document.createElement("button");map.type="button";map.className="secondary";map.textContent="ดูแผนที่";map.onclick=openMap;body.append(map);return;
    }
    if(entry){
      const heading=document.createElement("h3");heading.textContent=entry.name;body.append(heading);
      if(active.directorEventId && (!event || active.directorEventId!==event.id)){const note=document.createElement("p");note.className="note";note.textContent="เหตุการณ์หมดเวลาแล้ว งานนี้ยังทำต่อได้โดยรับรางวัลปกติ";body.append(note);}
      const progress=document.createElement("p");progress.setAttribute("role","status");progress.textContent=objectiveStep(entry,active);body.append(progress);
      if(entry.kind==="delivery" && active.progress===entry.goal-1 && activeMapId===entry.destinationMapId){
        const deliver=document.createElement("button");deliver.type="button";deliver.className="primary";deliver.textContent="ส่งเสบียงและรับรางวัล";
        deliver.onclick=()=>{deliver.disabled=true;room?.send("finish_forest_delivery",{});};body.append(deliver);
      }
      if((ownServerCharacter()?.level ?? 0)>=100){const note=document.createElement("p");note.className="note";note.textContent="ถึง Lv.100 แล้ว งานนี้จะไม่ให้ EXP จนกว่าจะได้รับ EXP ได้อีกครั้ง";body.append(note);}
      const cancel=document.createElement("button");cancel.type="button";cancel.className="secondary";cancel.textContent="ยกเลิกภารกิจนี้";
      cancel.onclick=()=>{cancel.disabled=true;room?.send("set_forest_objective",{id:null});};body.append(cancel);
    } else {
      for(const [id,definition] of Object.entries(state.options || {})){
        const button=document.createElement("button");button.type="button";button.className="secondary";
        button.textContent=definition.name+" · "+definition.camp+" "+definition.levels+" · "+(definition.kind==="delivery"?"ล่า "+(definition.goal-1)+" ตัว แล้วส่งปลายทาง":definition.kind==="defense"?"ป้องกันและปราบ "+definition.goal+" ตัว":definition.kind==="escort"?"คุ้มกัน 1 คน":definition.goal+(definition.stages?" เป้าหมาย":" ตัว"));
        button.disabled=(ownServerCharacter()?.level ?? 0)>=100;
        button.onclick=()=>{for(const b of body.querySelectorAll("button"))b.disabled=true;room?.send("set_forest_objective",{id});};body.append(button);
      }
      if((ownServerCharacter()?.level ?? 0)>=100){const note=document.createElement("p");note.className="note";note.textContent="ถึง Lv.100 แล้ว จึงไม่ได้รับ EXP จากภารกิจล่า";body.append(note);}
    }
  }
  function openForestRanger(){
    openDrawer("quest",forestObjectiveState?.keeper?.name || "ผู้มอบงาน",'<div id="forestObjectiveBody" role="region" aria-label="ภารกิจพื้นที่"></div><button type="button" class="secondary" id="rangerFieldGoal" hidden>ดูเส้นทางล่าและอุปกรณ์</button><button id="rangerAskGuide" type="button" class="secondary">สอบถามและแนะนำภารกิจ</button>');
    const journey=$("rangerFieldGoal");journey.hidden=!fieldGearGoal();journey.onclick=()=>openCurrentQuest(true);
    const keeper=forestObjectiveState?.keeper,ask=$('rangerAskGuide');ask.hidden=!keeper || mode!=="live" || !room;
    if(keeper)ask.onclick=()=>openNpcGuide({id:keeper.mapId+"_ranger",name:keeper.name});
    renderForestObjective();room?.send("get_forest_objective",{});
  }
  function renderItemHuntDrawer(hunt=itemHuntGuide()){
    // Completion may replace the drawer body while resolving the current hunt.
    if(!hunt || !$("huntStep"))return;
    ui.drawerTitle.textContent=hunt.title;
    renderItemPreview("huntItemPreview",currentItemHunt()?.id);
    $("huntStep").textContent=hunt.step+" · "+hunt.progress;
    $("huntMap").onclick=openMap;
    $("huntRefine").hidden=!hunt.refineId;
    $("huntRefine").onclick=()=>{const slot=inventoryState?.slots?.findIndex(s=>s?.itemId===hunt.refineId)??-1;openBag();if(slot>=0)$("bagSlot"+slot)?.click();};
    $("endItemHunt").onclick=()=>{saveItemHunt(null);closeDrawer();};
  }
  // Compact portrait HUD: a small quest chip opens the existing detail drawer.
  function openCurrentQuest(preferJourney=false) {
    const followingShrine=gearGuides?.journey?.shrine && journeyNotesForPlayer().shrine && !territoryState?.local?.inField;
    const hunt=followingShrine?null:itemHuntGuide();
    if(hunt && !ui.quest.classList.contains("war-hud")){
      openDrawer("quest",hunt.title,'<div id="huntItemPreview" class="item-preview"></div><p id="huntStep" class="note"></p><button id="huntMap" type="button" class="secondary">ดูตำแหน่งบนแผนที่</button><button id="huntRefine" type="button" class="primary" hidden>เปิดกระเป๋าเพื่อแปรรูป</button><button id="endItemHunt" type="button" class="secondary">เลิกติดตาม</button>');
      renderItemHuntDrawer(hunt);
      return;
    }
    if(!followingShrine && territoryState?.local?.site===activeMapId){openWarPanel();return;}
    if(!followingShrine && preferJourney!==true && forestObjectiveState?.active && room?.state?.forestObjectivesAvailable){openForestRanger();return;}
    const gearGoal=fieldGearGoal();
    if(gearGoal && !ui.quest.classList.contains("war-hud")){
      openDrawer("quest",gearGoal.title,'<div class="item-slots"><div id="fieldGoalItem" class="item-preview"></div><div id="fieldCurrentItem" class="item-preview"></div></div><p id="fieldGoalProgress" class="note"></p><div id="fieldGoalItems" class="item-slots"></div><p id="fieldGoalInputs"></p><p class="note" id="fieldGearCompare" hidden></p><button type="button" class="secondary" id="fieldGearHunt" hidden></button><button type="button" class="secondary" id="fieldEquipmentToggle" hidden></button><button type="button" class="secondary" id="fieldGearView" hidden>ดูชิ้นที่มีในกระเป๋า</button><button type="button" class="secondary" id="fieldGearSkip" hidden></button><select id="fieldCampList" aria-label="เลือกค่ายฝึก" hidden></select><button type="button" class="secondary" id="fieldBossChoice" hidden></button><select id="fieldBossList" aria-label="เลือกบอสที่ต้องการล่า" hidden></select><button type="button" class="secondary" id="fieldGoalSupply" hidden></button><button type="button" class="primary" id="fieldGoalRefine" hidden>เปิดกระเป๋าเพื่อแปรรูป</button><button type="button" class="secondary" id="fieldGoalIngredient" hidden></button><button type="button" class="secondary" id="fieldGoalRecipe">เปิดสูตรที่โต๊ะช่าง</button><button type="button" class="secondary" id="fieldGoalForge" hidden>เปิดช่างตี +1</button><button id="fieldShrine" type="button" class="primary" hidden></button><button id="fieldStopShrine" type="button" class="secondary" hidden>กลับไปค่ายล่า</button><details id="fieldCapInfo" hidden><summary>ถึง Lv.100 · ทางเลือกของตัวละคร</summary><p class="note"></p></details><p class="note" id="fieldTrainingNames" hidden></p><button type="button" class="secondary" id="fieldTrainingBook" hidden>เปิดตำราวิชาแกน</button><button type="button" class="secondary" id="fieldDeepBook" hidden>เปิดวิชาเสริม · ดูแต้มและเงื่อนไขฝึก</button><button type="button" class="secondary" id="fieldPracticeCast" hidden></button>');
      renderFieldGoalDrawer(gearGoal);return;
    }
    if(mode==="live" && room?.state?.forestObjectivesAvailable && ownServerCharacter()?.persistent){
      openForestRanger();return;
    }
    const title = ui.quest.querySelector("strong")?.textContent || "ภารกิจ";
    const description = ui.quest.querySelector(".quest-content > span")?.textContent || "";
    openDrawer("quest", title, '<p class="note"></p>');
    ui.drawerBody.querySelector("p").textContent = description;
  }
  function renderFieldGoalDrawer(goal){
    const progress=$("fieldGoalProgress");if(!progress)return;
    const recipe=$("fieldGoalRecipe"),forge=$("fieldGoalForge"),refine=$("fieldGoalRefine"),ingredient=$("fieldGoalIngredient");
    ingredient.hidden=!goal?.craftIngredient;
    if(goal?.craftIngredient){
      const meta=personalItems[goal.craftIngredient];ingredient.textContent="เปิดสูตร "+meta.name;
      ingredient.onclick=()=>selectBenchRecipe("kiln",String(meta.level||1),goal.craftIngredient);
    }
    refine.hidden=!goal?.refineId;
    refine.onclick=()=>{const slot=inventoryState?.slots?.findIndex(s=>s?.itemId===goal.refineId)??-1;openBag();if(slot>=0)$("bagSlot"+slot)?.click();};
    renderItemPreview("fieldGoalItem",goal?.comparison?.piece||goal?.recipe||goal?.bossGear,"เป้าหมาย");renderItemPreview("fieldCurrentItem",goal?.comparison?.current,"สวมอยู่");
    const inputItems=$("fieldGoalItems");if(inputItems)inputItems.replaceChildren(...(goal?.copyReady?[]:(goal?.inputs||[])).map(part=>createItemTile(part.id,{quantity:part.need})));
    const training=currentFieldTraining(),names=$("fieldTrainingNames"),book=$("fieldTrainingBook");
    const midgame=ownServerCharacter()?.level>=26;
    const journey=gearGuides?.journey, course=journey?.course;
    const equipmentToggle=$("fieldEquipmentToggle");
    if(equipmentToggle){
      equipmentToggle.hidden=!midgame || !journey?.weapon || goal?.bossChoice===true || goal?.practiceOnly===true;
      if(!equipmentToggle.hidden){
        const notes=journeyNotesForPlayer();
        equipmentToggle.textContent=notes.equipment?"กลับไปดูวิชาและค่ายล่า":"ดูอุปกรณ์ตามช่วงเลเวล";
        equipmentToggle.onclick=()=>{saveJourney({equipment:!notes.equipment});renderFieldGoalDrawer(fieldGearGoal());};
      }
    }
    const lesson=midgame && gearGuides?.journey?.lesson;
    names.hidden=!training && !lesson && !course;book.hidden=!training && !midgame;book.onclick=openFieldTraining;
    const deep=$("fieldDeepBook");deep.hidden=mode!=="live" || !fieldSkillKind();deep.onclick=openFieldDeepTraining;
    const cast=$("fieldPracticeCast");cast.hidden=!goal?.trial?.deep || goal.trial.used;
    if(!cast.hidden){cast.textContent="ลอง "+goal.trial.name;cast.onclick=()=>tryFieldTechnique(goal.trial);}

    if(training){
      names.textContent="มี "+training.points+" แต้มวิชาแกน · ใช้ 1 แต้มได้ทุกที่หลังพ้นการต่อสู้ 5 วินาที · "+training.choices.map(s=>s.name+" ขั้น "+s.rank).join(" / ");
      book.onclick=openFieldTraining;
    }else if(lesson)names.textContent="เปิดตำราเพื่อดูขั้นปัจจุบันและแต้มคงเหลือ";
    if(lesson)names.textContent+=" · แนะนำที่ Lv."+lesson.level+" "+lesson.name;
    if(course){
      const technique=fieldTechnique(course), model=skillGraphModel(fieldSkillKind());
      const node=model?.nodes.find(n=>n.id===technique?.id);
      const missing=node && !node.learned?node.checks.filter(c=>!c.ok):[];
      const need=(missing.find(c=>!c.label.startsWith("เลเวล "))??missing[0])?.label;
      const rankHint=node?.rankable && node.nextLv?" · ขั้นเสริมถัดไป "+(node.rank+1)+" ใช้ Lv."+node.nextLv+" · ผลฝึก "+node.rankDone+"/"+node.rankNeed:"";
      const focus=technique?" · "+technique.name+" Lv."+technique.level:"";
      if(!training)names.textContent="ดูแต้มที่ใช้ได้ในตำรา";
      names.textContent+=" · วิชาแกนได้ถึงขั้น "+course.coreCap+focus+(need?" · ต้องฝึก "+need:"")+rankHint;
      if(model)names.textContent+=" · เหลือ "+model.points+" แต้มสาย";
    }
    const capInfo=$("fieldCapInfo");
    capInfo.hidden=!journey?.rebirthLimit;
    if(!capInfo.hidden){
      const count=gearGuides.cycle??0;
      capInfo.querySelector("p").textContent="ล่าต่อและฝึกวิชาที่ Lv.100 ได้ · การเกิดใหม่เริ่มที่ Lv.1 และล้างการจัดแต้มสเตตัส · จำนวนเกิดใหม่ "+count+"/"+journey.rebirthLimit+(count>=journey.rebirthLimit?" · ครบจำนวนแล้ว":" · เป็นทางเลือกของผู้เล่น");
    }
    const shrineButton=$("fieldShrine"),stopShrine=$("fieldStopShrine"), me=ownServerCharacter();
    const shrine=journey?.shrine && shrineDirection(journey,me);
    shrineButton.hidden=!shrine;
    stopShrine.hidden=!goal?.rebirthRoute;
    if(shrine){
      shrineButton.textContent=shrine.arrived?"เลือกอาชีพสำหรับชีวิตใหม่":goal?.rebirthRoute?"ตามเส้นทางไปศาล":"นำทางไปศาลเกิดใหม่";
      shrineButton.onclick=()=>{
        const now=shrineDirection(journey,ownServerCharacter());
        if(!now)return;
        saveJourney({shrine:true});closeDrawer();
        if(now.arrived)window.MontraEntry?.rebirthAtShrine(ownServerCharacter(),gearGuides.cycle??0,gearGuides.rebirthPreview);
        else toast(now.step);
      };
    }
    stopShrine.onclick=()=>{saveJourney({shrine:false});renderFieldGoalDrawer(fieldGearGoal());};
    const camps=[...(journey?.camps??[]),...(journey?.challenges??[])], campList=$("fieldCampList");
    campList.hidden=!(course || goal?.levelGoal) || camps.length<2;
    if(!campList.hidden){
      campList.replaceChildren(...camps.map(c=>new Option(c.map+" · "+c.monster+" Lv."+c.level+(journey.challenges?.includes(c)?" · ท้าทาย":""),c.id)));
      campList.value=fieldCamp(journey,journeyNotesForPlayer())?.id??"";
      campList.onchange=()=>{
        const selected=camps.find(c=>c.id===campList.value);
        if(selected){
          const trial=journeyNotesForPlayer().trial;
          saveJourney({campId:selected.id,boss:null,trial:trial && !journey.challenges?.includes(selected)?{...trial,site:selected,used:false,killAt:null}:null});
          renderFieldGoalDrawer(fieldGearGoal());
        }
      };
    }
    const compare=$("fieldGearCompare"),track=$("fieldGearHunt"),view=$("fieldGearView"),skip=$("fieldGearSkip"),bossBtn=$("fieldBossChoice");
    compare.hidden=!goal?.comparison;
    if(goal?.comparison){
      const {piece,current,position}=goal.comparison,path=ownServerCharacter().pathId;
      const old=roleRating(current,path,position),next=roleRating(piece,path,position);
      const advice=!current?"ช่องนี้ยังว่าง":old.value>=next.value?"เก็บ "+bagMeta(current.itemId).name+" +"+(current.forge?.rank??0)+" ไว้ได้ · "+old.name+(old.value===next.value?" เท่ากัน":" สูงกว่า"):"ชิ้นใหม่ช่วยเพิ่ม"+next.name;
      compare.textContent=(goal.itemSlot<0?"เทียบชิ้นใหม่ +0 ตามแบบ · ":"เทียบชิ้นที่มี · ")+gearComparison(piece,current,inventoryState.slots)+" · "+advice;
    }
    track.hidden=!goal?.track;if(!track.hidden)bindItemHuntButton(track,goal.recipe,1,true);
    view.hidden=!(goal?.itemSlot>=0);
    view.onclick=()=>{openBag();$("bagSlot"+goal.itemSlot)?.click();$("bagItemName")?.scrollIntoView({block:"center"});};
    skip.hidden=!(goal?.canSkip || goal?.practiceOnly || goal?.bossInvite || goal?.trainingBand);
    skip.textContent=goal?.trainingBand?"เก็บแต้มไว้ก่อน":goal?.practiceOnly?"จบการฝึกครั้งนี้":goal?.bossInvite?"ไว้ล่าบอสภายหลัง":"ใช้ของเดิม · ข้ามเป้าชิ้นนี้";
    skip.onclick=()=>{
      if(goal.practiceOnly)saveJourney({trial:null});
      else if(goal.trainingBand)saveJourney({savedTraining:goal.trainingBand});
      else if(goal.bossInvite)saveJourney({bossSkipped:true,deferredBosses:[...new Set([...(journeyNotesForPlayer().deferredBosses??[]),goal.bossGear])]});
      else saveJourney({skipped:[...new Set([...(journeyNotesForPlayer().skipped??[]),goal.recipe])]});
      renderFieldGoalDrawer(fieldGearGoal());
    };
    const options=fieldBossOptions(gearGuides?.journey);
    const option=options.find(b=>b.gear===goal?.bossGear)??options[0],select=$("fieldBossList");
    select.hidden=!goal || options.length<2;
    if(!select.hidden){
      select.replaceChildren(new Option("เลือกบอสอื่น…",""),...options.map(b=>new Option(b.camp.monster+" Lv."+b.level,b.gear)));
      select.value=goal?.bossGear??"";
      select.onchange=()=>{if(select.value){saveJourney({boss:select.value,campId:fieldCamp(journey,journeyNotesForPlayer())?.id});renderFieldGoalDrawer(fieldGearGoal());}};
    }
    bossBtn.hidden=!goal || !option || (!midgame && itemHuntCount(option.gear)>0);
    if(!bossBtn.hidden){
      bossBtn.textContent=goal.bossChoice?"กลับไปเป้าล่าอื่น":"ดูบอสตัวเลือก · "+option.camp.monster;
      bossBtn.onclick=()=>{
        const deferred=new Set(journeyNotesForPlayer().deferredBosses??[]);
        if(goal.bossChoice)deferred.add(option.gear);else deferred.delete(option.gear);
        saveJourney({boss:goal.bossChoice?null:option.gear,bossSkipped:!!goal.bossChoice,deferredBosses:[...deferred],campId:fieldCamp(journey,journeyNotesForPlayer())?.id});
        renderFieldGoalDrawer(fieldGearGoal());
      };
    }
    if(!goal){progress.textContent="เป้าหมายนี้เสร็จแล้ว";$("fieldGoalInputs").textContent="";recipe.hidden=forge.hidden=$("fieldGoalSupply").hidden=true;return;}
    ui.drawerTitle.textContent=goal.title;
    progress.textContent=goal.step+" · "+goal.progress+(goal.milestone?" · "+goal.milestone:"");
    if(!goal.recipe){$("fieldGoalInputs").textContent="";recipe.hidden=forge.hidden=$("fieldGoalSupply").hidden=true;return;}
    $("fieldGoalInputs").textContent=goal.copyReady?"มีอาวุธชนิดเดียวกันพร้อมใช้ตีบวกแล้ว":goal.inputs.map(i=>i.name+" "+i.have+"/"+i.need).join(" · ")+" · "+personalItems[goal.recipe].craftGold+" ทอง";
    const missing=goal.missingMaterial || goal.inputs.find(i=>i.have<i.need && !personalItems[i.id]?.sourceBoss && itemHuntSource(i.id,false)?.open);
    bindItemHuntButton($("fieldGoalSupply"),goal.copyReady||goal.bank?null:missing?.id,missing?.need);
    recipe.hidden=!!goal.copyReady;
    recipe.textContent=goal.copyGoal?"เปิดสูตรสร้าง "+personalItems[goal.recipe].name+" อีก 1 ชิ้น":"เปิดสูตรที่โต๊ะช่าง";
    recipe.onclick=()=>{selectBenchRecipe(personalItems[goal.recipe].sourceBoss?"boss":"all",String(personalItems[goal.recipe].level||1),goal.recipe);};
    forge.hidden=!(goal.copyReady||goal.bank);
    if(goal.nextRank)forge.textContent="เปิดช่างตี +"+goal.nextRank;
    forge.onclick=()=>openForgePage("enhance",goal.slot);
  }
  ui.quest.addEventListener("click",startQuestNavigation);
  syncQuestNavigationUi();
  // Explicit player actions take ownership immediately; camera drags/pinches do not.
  document.addEventListener("click",event=>{
    if(questNavigation && event.target?.closest?.("button, input, select, a") && !event.target.closest("#quest"))cancelQuestNavigation();
  },true);
  document.addEventListener("keydown",event=>{
    if(event.target?.closest?.("#quest") && ["Enter"," "].includes(event.key)){if(event.repeat)event.preventDefault();return;}
    if(questNavigation && !["Shift","Control","Alt","Meta","Tab"].includes(event.key))cancelQuestNavigation();
  },true);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)cancelQuestNavigation();});
  $("characterProfile").onclick=openCharacterProfile;
  $("fieldMenuButton").onclick=openFieldMenu;
  $("drawerMenuBack").onclick=openFieldMenu;
