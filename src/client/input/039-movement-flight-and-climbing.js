  function getLocalAvatar() { return avatars.get(localId); }
  function pointMove(x,z) {
    triggerVoiceGuidance("move");
    if (mode === "demo" && demoFlightTarget) {
      toast("กำลังเปลี่ยนระดับความสูง · รอให้ถึงก่อน");
      return;
    }
    const bounds=mapBounds();
    const target = {x:Math.round(Math.max(bounds.minX,Math.min(bounds.maxX,x))*100)/100,z:Math.round(Math.max(bounds.minZ,Math.min(bounds.maxZ,z))*100)/100};
    // DEMO must retain the same wall-top edge rule as the real 20Hz server.
    const demoMe = getLocalAvatar();
    if (mode === "demo" && demoMe && !demoFlying &&
        Math.abs(demoMe.targetY - activeFort.height) < .1 &&
        (Math.abs(target.x - activeFort.x) > activeFort.width/2 - .16 ||
         Math.abs(target.z - activeFort.z) > activeFort.length/2 - .16)) {
      toast("เดินออกนอกยอดกำแพงไม่ได้ · กดบินก่อน");
      return;
    }
    demoDash = null; // a manual tap cancels a local DEMO dash
    marker.position.x = target.x; marker.position.z = target.z;
    const currentAltitude = mode === "live"
      ? Number(ownServerCharacter()?.y || 0)
      : Number(getLocalAvatar()?.targetY || 0);
    const terrain=worldDefinitions?.[activeMapId]?.terrain;
    marker.position.y=(terrain?terrainHeight(terrain,target.x,target.z)+(playerLayer(ownServerCharacter())||0):currentAltitude)+.105;
    marker.setEnabled(true);
    pendingClimb = null;
    selectedPkTargetId = null;
    spellTargetId = null;
    setTargetedSkill(null);
    syncPKHud();
    demoAutoAttack = false;
    if (!ui.monsterStatus.hidden) ui.monsterHint.textContent = "แตะผีเพื่อโจมตี";
    if (mode === "live" && room) {
      try { room.send("move", target); } catch (err) { toast("ส่งคำสั่งเดินไม่สำเร็จ"); }
    } else if (mode === "demo") {
      demoDest = target;
    }
  }
  function ownServerCharacter() {
    return mode === "live" ? room?.state?.players?.get?.(localId) : null;
  }
  function hasLiveElevation() {
    return mode === "live" && room && Number.isFinite(Number(room.state?.fortification?.height));
  }
  function setTargetedSkill(skill) {
    targetedSkill = skill;
  }
  function monsterForSpell(id) {
    return id === MONSTER_ID ? room?.state?.monster : room?.state?.monsters?.get(id);
  }
  function castAtTarget(id) {
    const picked = targetedSkill; setTargetedSkill(null);
    const selected = {sword:selectedSwordSkill, muay:selectedMuaySkill, occult:selectedOccultSkill,
      blade:selectedBladeSkill, sentinel:selectedSentinelSkill}[picked];
    const source=document.querySelector(".learned-bar .sword-hotbar:not([hidden])");
    if(!selected || !Array.from(source?.querySelectorAll("button[data-skill-id]") || []).some(b=>b.dataset.skillId===selected && !b.disabled))return;
    if(picked==="sentinel"){
      const node=sentinelBookState?.lessons?.[selectedSentinelSkill],monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id),target=monster || opponent;
      if(!node || !id || id===localId || !target?.alive || (target.mapId || "ritual_village")!==activeMapId){toast("เลือกเป้าหมายที่ใช้วิชานี้ได้");return;}
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)){toast("โจมตีสมาชิกปาร์ตี้ไม่ได้");return;}
      spellTargetId=id;room.send("sentinel_skill",{skillId:selectedSentinelSkill,targetId:id});return;
    }
    if (picked === "blade") {
      const core=bladeBookState?.core?.[selectedBladeSkill],node=core || bladeBookState?.lessons?.[selectedBladeSkill],monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id),target=monster || opponent;
      if(!node || !id || id===localId || !target?.alive || (target.mapId || "ritual_village")!==activeMapId) {toast("เลือกเป้าหมายที่ใช้วิชานี้ได้");return;}
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)){toast("โจมตีสมาชิกปาร์ตี้ไม่ได้");return;}
      spellTargetId=id;room.send(core?"blade_core_skill":"blade_skill",{skillId:selectedBladeSkill,targetId:id});return;
    }
    if (picked === "occult") {
      if(occultBookState?.path==="seer" && occultBookState?.core?.[selectedOccultSkill]){
        const monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id),target=monster || opponent;
        if(!id || id===localId || !target?.alive || (target.mapId || "ritual_village")!==activeMapId){toast("เลือกเป้าหมายที่ต่อสู้ได้");return;}
        if(opponent && partyState?.members?.some(member=>member.sessionId===id)){toast("ใช้วิชากับสมาชิกปาร์ตี้ไม่ได้");return;}
        spellTargetId=id;selectedPkTargetId=opponent?id:null;syncPKHud();
        room.send("seer_core_skill",{skillId:selectedOccultSkill,targetId:id});return;
      }
      const node=occultBookState?.lessons?.[selectedOccultSkill];
      const monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id);
      if (!node || !id || id===localId || (!monster && !(["curse","curse_burst"].includes(node.effect) && opponent))) {
        toast("เลือกเป้าหมายที่ใช้วิชานี้ได้");return;
      }
      spellTargetId=id;
      room.send("occult_skill",{skillId:selectedOccultSkill,targetId:id});
      return;
    }
    if (picked === "muay") {
      const monster=monsterForSpell(id), opponent=!monster && room?.state?.players?.get?.(id), target=monster || opponent;
      if (!id || id===localId || !target?.alive || (target.mapId || "ritual_village")!==activeMapId) { toast("เลือกมอนสเตอร์หรือผู้เล่นที่ยังต่อสู้ได้"); return; }
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)) { toast("ใช้วิชามวยกับสมาชิกปาร์ตี้ไม่ได้"); return; }
      if (!selectedMuaySkill) return;
      spellTargetId=id;
      selectedPkTargetId=opponent ? id : null;
      syncPKHud();
      room.send("muay_core_skill",{skillId:selectedMuaySkill,targetId:id});
      return;
    }
    if (picked === "sword") {
      const monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id),target=monster || opponent;
      if(!id || id===localId || !selectedSwordSkill || !target?.alive || (target.mapId || "ritual_village")!==activeMapId){toast("เลือกเป้าหมายที่ต่อสู้ได้");return;}
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)){toast("โจมตีสมาชิกปาร์ตี้ไม่ได้");return;}
      spellTargetId=id;
      selectedPkTargetId=opponent ? id : null;syncPKHud();
      room.send("sword_core_skill",{skillId:selectedSwordSkill,targetId:id});
      return;
    }
  }
  function updateFlightButton() {
    const button = $("fly");
    if (!button) return;
    const data = ownServerCharacter();
    const active = mode === "live" ? data?.flying === true : demoFlying;
    const changing = mode === "live"
      ? ["ascending", "descending"].includes(data?.combatState)
      : Boolean(demoFlightTarget);
    const label = button.querySelector("span:last-child");
    const definition=worldDefinitions?.[activeMapId];
    const forbidden=!active && mode==="live" && (definition?.region?.noFlight===true || definition?.strategic?.kind==="territory");
    const canFly=mode==="live" && room?.state?.flightAvailable===true && (data?.pathId==="seer" || data?.pathId==="mender");
    button.hidden=mode!=="live" || !(active || canFly);
    button.disabled=forbidden;
    if (label) label.textContent = forbidden ? "เขตห้ามบิน" : changing ? "กำลังบิน" : active ? "ลง" : "บิน";
    button.classList.toggle("fly-active", Boolean(active));
    button.setAttribute("aria-pressed", String(Boolean(active)));
    button.title = forbidden ? "เดินหรือพุ่งผ่านเส้นทางภาคพื้นในเขตนี้" : active ? "ลดระดับความสูงและลงจอด" : "ขึ้นบินเหนือกำแพง แล้วแตะพื้นเพื่อเคลื่อนที่";
  }

  function toggleFlight() {
    if (mode === "live") {
      if (!room || room.state?.flightAvailable !== true) {
        toast("VPS ยังไม่รองรับระบบบิน · ต้องติดตั้ง Server รุ่นใหม่");
        return;
      }
      const me = ownServerCharacter();
      if (!me || me.alive === false) {
        toast("ตัวละครยังไม่พร้อมบิน");
        return;
      }
      if (!me.flying && me.pathId!=="seer" && me.pathId!=="mender") {toast("วิชาเหินเวหาเป็นของจอมอาคม");return;}
      if (["ascending", "descending"].includes(me.combatState)) {
        toast("กำลังเปลี่ยนระดับความสูง");
        return;
      }
      pendingClimb = null;
      marker.setEnabled(false);
      try { room.send("fly", {}); }
      catch (error) { console.error("MONTRA flight failed", error); toast("ส่งคำสั่งบินไม่สำเร็จ"); }
      return;
    }
    const me = getLocalAvatar();
    if (!me || demoFlightTarget) {
      toast("กำลังเปลี่ยนระดับความสูง");
      return;
    }
    const x = me.targetX, z = me.targetZ;
    const fort = activeFort;
    const onTop = Math.abs(x - fort.x) <= fort.width / 2 - .16 &&
      Math.abs(z - fort.z) <= fort.length / 2 - .16;
    const insideSolid = Math.abs(x - fort.x) < fort.width / 2 + .32 &&
      Math.abs(z - fort.z) < fort.length / 2 + .32;
    if (demoFlying && !onTop && insideSolid) {
      toast("ลงตรงนี้ไม่ได้ · บินออกจากกำแพงก่อน");
      return;
    }
    const landing = demoFlying;
    const targetY = landing ? (onTop ? fort.height : 0) : DEMO_FLIGHT_HEIGHT;
    demoDest = null;
    demoDash = null;
    demoAutoAttack = false;
    marker.setEnabled(false);
    me.targetX = me.x;
    me.targetZ = me.z;
    demoFlightTarget = { targetY, landing };
    demoFlying = true; // remains true throughout ascent/descent
    updateFlightButton();
    toast(landing ? "กำลังลดระดับลงจอด · DEMO" : "กำลังบินขึ้น · DEMO");
  }

  function syncClimbButton() {
    const button=$("climb");
    if (!button) return;
    const player=ownServerCharacter();
    if(mode!=="live" || !player?.alive || player.flying || player.mounted || player.combatState==="climbing") {button.hidden=true;return;}
    const onWall=Math.abs(playerLayer(player)-activeFort.height)<.15;
    const rampart=worldDefinitions?.[activeMapId]?.strategic?.rampart;
    const points=rampart?.stairs?.map(s=>onWall?s.top:s.foot) || (activeMapId==="ritual_village" ? [onWall?{x:activeFort.ladderTopX,z:activeFort.ladderTopZ}:{x:activeFort.ladderFootX,z:activeFort.ladderFootZ}] : []);
    const near=points.some(p=>Math.hypot(Number(player.x)-p.x,Number(player.z)-p.z)<=(onWall?1.2:1.55));
    button.hidden=!near;
    button.disabled=false;
    const label=button.querySelector("span:last-child");
    if(label)label.textContent=onWall?"ลงกำแพง":rampart?"ขึ้นกำแพง":"ปีน";
    button.classList.toggle("climb-active", Boolean(player?.combatState==="climbing"));
  }
  function syncMountButton() {
    const button=$("mountButton"),me=ownServerCharacter();
    if(!button)return;
    // Always shown while online; greyed out with a reason when the server or character cannot ride.
    const reason=room?.state?.mountAvailable!==true ? "server" : !me?.persistent ? "guest" : "";
    button.hidden=mode!=="live";
    button.dataset.unavailable=reason; button.classList.toggle("mount-off",Boolean(reason));
    button.disabled=!me?.alive;
    button.setAttribute("aria-pressed",String(Boolean(me?.mounted)));
    button.querySelector("i").textContent=me?.mounted ? "ลงม้า" : "เรียกม้า";
    $("menuMountLabel").textContent=button.querySelector("i").textContent;
    $("menuMount").disabled=button.disabled;
    button.title=me?.mounted ? "ลงจากม้าเพื่อใช้วิชาต่อสู้" : "เรียกม้าสำหรับเดินทาง";
  }
  function requestClimb(stairId) {
    if (!hasLiveElevation()) {
      toast("ระบบปีนกำแพงต้องติดตั้งบน VPS ก่อน");
      return;
    }
    const me=ownServerCharacter();
    if (!me || me.alive===false) {toast("ตัวละครยังไม่พร้อม");return;}
    if (me.combatState==="climbing") {toast("กำลังปีนกำแพง");return;}
    if (me.flying) {toast("ลงจอดก่อนจึงใช้บันไดได้");return;}
    const onWall=Math.abs(playerLayer(me)-activeFort.height)<.15;
    const direction=onWall?"down":"up";
    const rampart=worldDefinitions?.[activeMapId]?.strategic?.rampart;
    let stairs=rampart?.stairs;
    if(onWall && rampart?.deck.length>4){
      const ring=Math.floor(rampart.deck.findIndex(b=>me.x>=b.x+.16 && me.x<=b.x+b.width-.16 && me.z>=b.z+.16 && me.z<=b.z+b.length-.16)/4);
      stairs=stairs.filter(s=>rampart.deck.slice(ring*4,ring*4+4).some(b=>s.top.x>=b.x && s.top.x<=b.x+b.width && s.top.z>=b.z && s.top.z<=b.z+b.length));
    }
    const end=s=>onWall?s.top:s.foot;
    const stair=stairs?.find(s=>s.id===stairId) || (stairs?.length?stairs.reduce((a,b)=>Math.hypot(me.x-end(a).x,me.z-end(a).z)<Math.hypot(me.x-end(b).x,me.z-end(b).z)?a:b):null);
    if(activeMapId!=="ritual_village" && !stair){toast("พื้นที่นี้ไม่มีบันไดกำแพง");return;}
    const structureId=stair?.id || activeFort.id;
    const to=stair?end(stair):onWall?{x:activeFort.ladderTopX,z:activeFort.ladderTopZ}:{x:activeFort.ladderFootX,z:activeFort.ladderFootZ};
    const distance=Math.hypot(Number(me.x)-to.x,Number(me.z)-to.z);
    if (distance > (onWall?1.2:1.55)) {
      pointMove(to.x,to.z);
      pendingClimb={direction,to,structureId};
      toast(onWall?"กำลังเดินไปจุดลงกำแพง":"กำลังเดินไปที่บันไดปีนกำแพง");
    } else {
      pendingClimb=null;
      try{room.send("climb",{structureId,direction});}
      catch(err){console.error(err);toast("ส่งคำสั่งปีนไม่สำเร็จ");}
    }
  }
  function checkClimbApproach() {
    if(!pendingClimb || !room || mode!=="live")return;
    const player=ownServerCharacter();
    if(!player)return;
    if(player.combatState==="climbing" || player.flying){
      pendingClimb=null;return;
    }
    const dist=Math.hypot(Number(player.x)-pendingClimb.to.x,
                           Number(player.z)-pendingClimb.to.z);
    if(dist>1.1)return;
    const {direction,structureId}=pendingClimb;
    pendingClimb=null;
    try {room.send("climb",{structureId,direction});}
    catch(err){console.error(err);toast("ส่งคำสั่งปีนไม่สำเร็จ");}
  }
