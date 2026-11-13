  function getLocalAvatar() { return avatars.get(localId); }
  function pointMove(x,z,fromQuestNavigation=false) {
    if(!fromQuestNavigation)cancelQuestNavigation("",false);
    if(!Number.isFinite(x) || !Number.isFinite(z))return false;
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
    const map=worldDefinitions?.[activeMapId];
    const me=ownServerCharacter();
    if(!fromQuestNavigation || !questNavigation?.manual){
      marker.position.x = target.x; marker.position.z = target.z;
      const currentAltitude = mode === "live" ? Number(me?.y || 0) : Number(getLocalAvatar()?.targetY || 0);
      marker.position.y=(map?.terrain?walkHeight(map,target.x,target.z)+(playerLayer(me)||0):currentAltitude)+.105;
      marker.setEnabled(true);
    }
    pendingClimb = null;
    selectedPkTargetId = null;
    spellTargetId = null;
    setTargetedSkill(null);
    syncPKHud();
    demoAutoAttack = false;
    if (mode === "live" && room) {
      try {
        if(!fromQuestNavigation && !me?.boatId && !me?.flying && startGroundTapRoute(map,me,target))return;
        room.send("move", target);
      } catch (err) { toast("ส่งคำสั่งเดินไม่สำเร็จ"); return false; }
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
    const wasGhostAttack = targetedSkill === "ghostAttack";
    targetedSkill = skill;
    if (wasGhostAttack || skill === "ghostAttack") syncGhostPoolUi();
  }
  function monsterForSpell(id) {
    return id === MONSTER_ID ? villageMonsterState() : room?.state?.monsters?.get(id);
  }
  function castAtTarget(id) {
    const picked = targetedSkill; setTargetedSkill(null);
    if (id && !fieldTargetVisible(id)) return;
    const selected = {sword:selectedSwordSkill, muay:selectedMuaySkill, occult:selectedOccultSkill,
      blade:selectedBladeSkill, sentinel:selectedSentinelSkill}[picked];
    const source=document.querySelector('.learned-bar .sword-hotbar:not([hidden])');
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
      spellTargetId=id;
      if(core || !tryReplacementSkillCast(selectedBladeSkill,id))room.send(core?"blade_core_skill":"blade_skill",{skillId:selectedBladeSkill,targetId:id});
      return;
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
      if(!tryReplacementSkillCast(selectedOccultSkill,id))room.send("occult_skill",{skillId:selectedOccultSkill,targetId:id});
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
      const core=muayBookData()?.catalog?.core?.[selectedMuaySkill];
      if(core || !tryReplacementSkillCast(selectedMuaySkill,id))room.send(core?"muay_core_skill":"muay_skill",{skillId:selectedMuaySkill,targetId:id});
      return;
    }
    if (picked === "sword") {
      const monster=monsterForSpell(id),opponent=!monster && room?.state?.players?.get?.(id),target=monster || opponent;
      if(!id || id===localId || !selectedSwordSkill || !target?.alive || (target.mapId || "ritual_village")!==activeMapId){toast("เลือกเป้าหมายที่ต่อสู้ได้");return;}
      if(opponent && partyState?.members?.some(member=>member.sessionId===id)){toast("โจมตีสมาชิกปาร์ตี้ไม่ได้");return;}
      spellTargetId=id;
      selectedPkTargetId=opponent ? id : null;syncPKHud();
      const core=swordData()?.catalog?.core?.[selectedSwordSkill];
      if(core || !tryReplacementSkillCast(selectedSwordSkill,id))room.send(core?"sword_core_skill":"sword_skill",{skillId:selectedSwordSkill,targetId:id});
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
    const definition=worldDefinitions?.[activeMapId];
    const forbidden=!active && mode==="live" && (definition?.region?.noFlight===true || definition?.strategic?.kind==="territory");
    const canFly=mode==="live" && room?.state?.flightAvailable===true && (data?.pathId==="seer" || data?.pathId==="mender");
    button.hidden = mode !== "demo" && !(active || canFly);
    button.disabled = changing || forbidden || (mode === "live" && data?.alive !== true);
    const label = forbidden ? "เขตห้ามบิน" : changing ? "กำลังเปลี่ยนระดับความสูง" : active ? "ลงจอด" : "ขึ้นบิน";
    button.classList.toggle("fly-active", Boolean(active));
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(Boolean(active)));
    button.title = label + " [F]";
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
      const definition = worldDefinitions?.[activeMapId];
      if (!me.flying && (definition?.region?.noFlight === true || definition?.strategic?.kind === "territory")) {toast("เขตนี้ไม่อนุญาตให้ขึ้นบิน");return;}
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
    const isMounted = mode === "live" ? Boolean(me?.mounted) : Boolean(getLocalAvatar()?.mounted);
    const reason=mode==="live" ? (room?.state?.mountAvailable!==true ? "server" : !me?.persistent ? "guest" : "") : "";
    button.hidden=false;
    button.dataset.unavailable=reason; button.classList.toggle("mount-off",Boolean(reason));
    button.disabled=mode==="live" ? !me?.alive : getLocalAvatar()?.serverAlive === false;
    button.setAttribute("aria-pressed",String(isMounted));
    button.querySelector("i").textContent=isMounted ? "ลงจากควาย" : "เรียกควาย";
    $("menuMountLabel").textContent=button.querySelector("i").textContent;
    $("menuMount").disabled=button.disabled;
    button.title=isMounted ? "ลงจากควายเพื่อใช้วิชาต่อสู้" : "เรียกควายสำหรับเดินทาง";
    button.setAttribute("aria-label", button.querySelector("i").textContent);
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

  // Ground navigation owns only temporary client waypoints. The server still
  // validates every ordinary move/warp and remains the only LIVE position owner.
  let questNavigation = null;
  function questNavigationPoint(p) {
    return Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.z));
  }
  function questNavigationGeometry(map, fort, mounted=false, allowWading=false) {
    if (!map?.bounds || map.strategic?.rampart) return null;
    const radius = .45, bounds = map.bounds;
    const walls = [...(map.walls || [])];
    if (map.id === "ritual_village" && fort) walls.push({x:fort.x-fort.width/2,z:fort.z-fort.length/2,width:fort.width,length:fort.length});
    const deepWater=(allowWading ? [] : map.water||[]).filter(area=>!map.shallowWater?.some(shelf=>
      shelf.x===area.x && shelf.z===area.z && shelf.width===area.width && shelf.length===area.length));
    const blockers=[...walls,...deepWater];
    const circles = map.obstacles || [];
    const dismountWater=mounted && groundHasWaterExposure(map) && map.waterLevel!==undefined;
    const wetCuts=dismountWater ? (map.water??[]) : [];
    function clear(a,b) {
      if (![a,b].every(p=>questNavigationPoint(p) && p.x>=bounds.minX+radius && p.x<=bounds.maxX-radius && p.z>=bounds.minZ+radius && p.z<=bounds.maxZ-radius)) return false;
      if(!walkBridgeTransitionClear(map,a,b.x,b.z))return false;
      const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
      for (const [index,w] of blockers.entries()) {
        let lo=0,hi=1;
        for (const [value,delta,min,max] of [[a.x,dx,w.x-radius,w.x+w.width+radius],[a.z,dz,w.z-radius,w.z+w.length+radius]]) {
          if (Math.abs(delta)<1e-9) { if(value<min || value>max){lo=2;break;} }
          else {const p=(min-value)/delta,q=(max-value)/delta;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}
        }
        if(lo<=hi){
          if(index<walls.length)return false;
          const bridge=walkBridgeAt(map,a.x+dx*lo,a.z+dz*lo,radius);
          if(!bridge || walkBridgeAt(map,a.x+dx*hi,a.z+dz*hi,radius)!==bridge)return false;
        }
      }
      for (const o of circles) {
        const k=length?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.z-a.z)*dz)/length)):0;
        if(Math.hypot(o.x-a.x-k*dx,o.z-a.z-k*dz)<=o.radius+radius)return false;
      }
      const t=map.terrain;
      if(t){
        // Split at every terrain grid edge AND triangle diagonal. A thin steep
        // face must not disappear between two coarse navigation samples.
        const cuts=[0,1];
        for(const [axis,value,delta] of [[t.xs,a.x,dx],[t.zs,a.z,dz]])if(delta)for(const edge of axis){const k=(edge-value)/delta;if(k>0 && k<1)cuts.push(k);}
        for(const water of wetCuts){
          for(const [edges,value,delta] of [[[water.x,water.x+water.width],a.x,dx],[[water.z,water.z+water.length],a.z,dz]]){
            if(delta)for(const edge of edges){const k=(edge-value)/delta;if(k>0 && k<1)cuts.push(k);}
          }
        }
        cuts.sort((p,q)=>p-q);
        const faces=[...cuts];
        for(let n=1;n<cuts.length;n++){
          const low=cuts[n-1],high=cuts[n],mid=(low+high)/2,i=terrainCell(t.xs,a.x+dx*mid),j=terrainCell(t.zs,a.z+dz*mid);
          const w=t.xs[i+1]-t.xs[i],h=t.zs[j+1]-t.zs[j],delta=dx/w-dz/h;
          if(delta){const k=((a.z-t.zs[j])/h-(a.x-t.xs[i])/w)/delta;if(k>low && k<high)faces.push(k);}
        }
        faces.sort((p,q)=>p-q);
        for(let n=0;n<faces.length;n++){
          const k=n?(faces[n-1]+faces[n])/2:faces[n],x=a.x+dx*k,z=a.z+dz*k,i=terrainCell(t.xs,x),j=terrainCell(t.zs,z);
          if(walkBridgeAt(map,x,z,radius))continue;
          if(dismountWater && map.water?.some(w=>waterAreaContains(w,x,z))){
            const lo=n?faces[n-1]:k,hi=faces[n];
            if(map.waterLevel-Math.min(terrainHeight(t,a.x+dx*lo,a.z+dz*lo),terrainHeight(t,a.x+dx*hi,a.z+dz*hi))>=.45)return false;
          }
          const w=t.xs[i+1]-t.xs[i],h=t.zs[j+1]-t.zs[j],u=(x-t.xs[i])/w,v=(z-t.zs[j])/h;
          const aa=t.heights[j][i],bb=t.heights[j][i+1],cc=t.heights[j+1][i],dd=t.heights[j+1][i+1];
          if(Math.hypot((u>=v?bb-aa:dd-cc)/w,(u>=v?dd-bb:cc-aa)/h)>t.maxGrade)return false;
        }
      }
      return true;
    }
    return {clear,bounds};
  }
  function groundHasWaterExposure(map){return map.id==="drowned_marsh" || map.id==="mantra_capital";}
  function* questNavigationPlan(map, from, target, fort, mounted=false, exact=false, retry=0) {
    const dry=yield* planGroundGeometry(questNavigationGeometry(map,fort,mounted),from,target,exact,retry);
    if(dry || !map?.terrain || !map.water?.length || groundHasWaterExposure(map))return dry && {path:dry,allowWading:false};
    // Some canals divide a map with no bridge. The server permits wading here.
    const wade=yield* planGroundGeometry(questNavigationGeometry(map,fort,mounted,true),from,target,exact,retry);
    return wade && {path:wade,allowWading:true};
  }
  function* planGroundGeometry(geometry, from, target, exact, retry) {
    if(!geometry || !questNavigationPoint(from) || !questNavigationPoint(target))return null;
    const {clear,bounds}=geometry,ends=[{x:target.x,z:target.z}];
    // Stand near resources/NPCs rather than requiring their occupied center.
    for(let i=0;i<12;i++){const angle=Math.atan2(from.z-target.z,from.x-target.x)+i*Math.PI/6;ends.push({x:target.x+Math.cos(angle)*1.25,z:target.z+Math.sin(angle)*1.25});}
    const validEnds=exact && clear(ends[0],ends[0]) ? [ends[0]] :
      ends.filter(p=>clear(p,p)).sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z));
    if(!validEnds.length || !clear(from,from))return null;
    const direct=validEnds.find(p=>clear(from,p));if(direct)return [direct];
    yield;
    const rrt=yield* groundRrtRoute(geometry,from,validEnds[0],retry);
    if(rrt)return rrt;
    // The existing bounded grid search covers tight bridge approaches and other
    // routes that the sampled trees did not connect within their budget.
    const step=1.5,key=(x,z)=>x+","+z,heap=[],nodes=new Map(),closed=new Set();
    const heuristic=p=>Math.max(0,Math.hypot(p.x-target.x,p.z-target.z)-(exact && validEnds.length===1 ? 0 : 1.25));
    function push(n){heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;}
    function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length && heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
    const start={x:from.x,z:from.z,ix:0,iz:0,g:0,f:heuristic(from),parent:null};nodes.set("0,0",start);push(start);
    let finish=null,endpoint=null,sliceStarted=performance.now();
    for(let visits=0;heap.length && visits<16000;visits++){
      // Release the main thread regularly so mobile camera, cancellation and
      // incoming authoritative patches remain responsive during harder searches.
      if(visits && (visits%256===0 || performance.now()-sliceStarted>=6)){yield; sliceStarted=performance.now();}
      const node=pop(),id=key(node.ix,node.iz);if(closed.has(id))continue;closed.add(id);
      if(heuristic(node)<step*2){endpoint=validEnds.find(p=>clear(node,p));if(endpoint){finish=node;break;}}
      for(const [ix,iz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const nx=node.ix+ix,nz=node.iz+iz,id=key(nx,nz);if(closed.has(id))continue;
        const next={x:from.x+nx*step,z:from.z+nz*step,ix:nx,iz:nz};
        if(next.x<bounds.minX || next.x>bounds.maxX || next.z<bounds.minZ || next.z>bounds.maxZ || !clear(node,next))continue;
        const g=node.g+step*Math.hypot(ix,iz);if((nodes.get(id)?.g??Infinity)<=g)continue;
        Object.assign(next,{g,f:g+heuristic(next),parent:node});nodes.set(id,next);push(next);
      }
    }
    if(!finish)return null;
    const raw=[endpoint];for(let n=finish;n.parent;n=n.parent)raw.unshift({x:n.x,z:n.z});
    const result=[];let anchor=from;
    for(let i=0;i<raw.length;){let far=i;while(far+1<raw.length && clear(anchor,raw[far+1]))far++;result.push(raw[far]);anchor=raw[far];i=far+1;}
    return result;
  }
  function* groundRrtRoute({clear,bounds},start,end,retry){
    const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
    let seed=(Math.round(start.x*16)^Math.imul(Math.round(start.z*16),71)^
      Math.imul(Math.round(end.x*16),16777619)^Math.round(end.z*16)^Math.imul(retry,2654435761))||71;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
    const sampleBounds={minX:Math.max(bounds.minX,Math.min(start.x,end.x)-45),maxX:Math.min(bounds.maxX,Math.max(start.x,end.x)+45),
      minZ:Math.max(bounds.minZ,Math.min(start.z,end.z)-45),maxZ:Math.min(bounds.maxZ,Math.max(start.z,end.z)+45)};
    const step=3.2;
    function extend(tree,target){
      let nearest=tree[0], best=Infinity;
      for(const node of tree){
        const distance=(node.x-target.x)**2+(node.z-target.z)**2;
        if(distance<best){nearest=node;best=distance;}
      }
      if(best<1e-8)return nearest;
      const scale=Math.min(1,step/Math.sqrt(best));
      const point=scale===1 ? {x:target.x,z:target.z,parent:nearest} :
        {x:nearest.x+(target.x-nearest.x)*scale,z:nearest.z+(target.z-nearest.z)*scale,parent:nearest};
      if(!clear(nearest,point))return null;
      tree.push(point);
      return point;
    }
    function trace(node){const path=[];for(;node;node=node.parent)path.push({x:node.x,z:node.z});return path;}
    const fromStart=[start],fromEnd=[end];
    let sliceStarted=performance.now();
    for(let i=0;i<240 && fromStart.length+fromEnd.length<520;i++){
      if(i && (i%8===0 || performance.now()-sliceStarted>=5)){yield; sliceStarted=performance.now();}
      const forward=i%2===0,a=forward?fromStart:fromEnd,b=forward?fromEnd:fromStart;
      const target=random()<.22 ? b[0] : {x:sampleBounds.minX+random()*(sampleBounds.maxX-sampleBounds.minX),
        z:sampleBounds.minZ+random()*(sampleBounds.maxZ-sampleBounds.minZ)};
      const grown=extend(a,target);
      if(!grown)continue;
      for(let j=0;j<12 && fromStart.length+fromEnd.length<520;j++){
        if(performance.now()-sliceStarted>=5){yield; sliceStarted=performance.now();}
        const joined=extend(b,grown);
        if(!joined)break;
        if(gap(joined,grown)>1e-4)continue;
        const path=trace(forward?grown:joined).reverse().concat(trace(forward?joined:grown).slice(1));
        const route=[];
        for(let i=0;i<path.length-1;){
          let next=Math.min(i+22,path.length-1);
          while(next>i+1 && !clear(path[i],path[next])){
            if(performance.now()-sliceStarted>=5){yield; sliceStarted=performance.now();}
            next--;
          }
          route.push(path[next]);i=next;
        }
        return route;
      }
    }
    return null;
  }
  // Synchronous adapter for geometry verification; LIVE consumes the generator
  // incrementally from the existing animation loop instead.
  function planQuestNavigation(map,from,target,fort){
    const work=questNavigationPlan(map,from,target,fort);let result;
    do{result=work.next();}while(!result.done);
    return result.value?.path ?? null;
  }
  function advanceQuestNavigationPlan(nav,now){
    if(questNavigation!==nav || !nav.planner)return;
    const result=nav.planner.next();
    if(!result.done)return;
    nav.planner=null;
    if(!result.value){cancelQuestNavigation("ไม่พบทางเดินที่ปลอดภัย · เลือกจุดหมายใหม่");return;}
    nav.path=result.value.path;
    nav.allowWading=result.value.allowWading;
    nav.progressAt=now;nav.nextTick=0;syncQuestNavigationUi();
  }
  function startGroundTapRoute(map,me,target){
    if(!me?.alive || me.mapId!==activeMapId || Math.abs(playerLayer(me))>.15 || territoryState?.local?.inField ||
        ["climbing","ascending","descending","dashing"].includes(me.combatState))return false;
    const mounted=Boolean(me.mounted),geometry=questNavigationGeometry(map,activeFort,mounted);
    if(!geometry || geometry.clear(me,target))return false;
    // A deliberate water tap still uses the normal wading controls on foot.
    if(!mounted && map.water?.some(w=>waterAreaContains(w,target.x,target.z)) && !walkBridgeAt(map,target.x,target.z))return false;
    const now=performance.now();
    const nav={room,owner:localId,mapId:activeMapId,manual:true,mounted,target,path:null,waypoint:null,
      nextTick:0,nextSend:0,started:now,progressAt:now,position:{x:me.x,z:me.z},retries:0};
    if(me.combatState!=="idle")room.send("move",nav.position);
    questNavigation=nav;
    beginGroundRoutePlan(nav,map,me);
    return true;
  }
  function beginGroundRoutePlan(nav,map,me){
    nav.path=null;
    nav.waypoint=null;
    nav.position={x:me.x,z:me.z};
    nav.planner=questNavigationPlan(map,nav.position,nav.target,activeFort,nav.mounted,Boolean(nav.manual),nav.retries??0);
  }
  function retryGroundTapRoute(nav,map,me,now){
    if(!nav.manual || nav.retries>=1)return false;
    try{room.send("move",{x:me.x,z:me.z});}catch{return false;}
    nav.retries++;
    nav.nextSend=now+450;
    beginGroundRoutePlan(nav,map,me);
    return true;
  }
  function questNavigationGuideKey(guide) {
    const hunt=currentItemHunt(),active=forestObjectiveState?.active,notes=journeyNotesForPlayer();
    return JSON.stringify([guide?.title,hunt?.id,hunt?.need,active?.id,active?.progress,notes.campId,notes.boss,notes.shrine,notes.trial?.id]);
  }
  function syncQuestNavigationUi(message) {
    const active=Boolean(questNavigation && !questNavigation.manual),war=ui.quest.dataset?.warGuide==="true";
    ui.quest.setAttribute("aria-pressed",String(active));
    ui.quest.setAttribute("aria-label",war?"ดูเป้าหมายศึกบนแผนที่":active?"หยุดเดินอัตโนมัติไปภารกิจ":"เดินอัตโนมัติไปภารกิจ · ดูรายละเอียดได้ในเมนูภารกิจ");
    const label=$("questNavigationStatus");
    if(label){
      label.textContent=message || (active?"กำลังเดิน · แตะเพื่อหยุด":"");
      label.hidden=!label.textContent;
    }
  }
  function cancelQuestNavigation(message="", stop=true) {
    const previous=questNavigation;if(!previous)return;
    questNavigation=null;
    if(previous.warp && message==="หยุดเดินอัตโนมัติแล้ว")message="หยุดนำทางแล้ว · คำสั่งผ่านประตูที่ส่งไปอาจยังเสร็จสิ้น";
    if(stop && previous.room===room && mode==="live"){
      const me=ownServerCharacter();
      if(me?.alive && !me.boatId && me.mapId===previous.mapId && questNavigationPoint(me))try{room.send("move",{x:me.x,z:me.z});}catch{}
    }else if(stop && mode==="demo")demoDest=null;
    marker.setEnabled(false);syncQuestNavigationUi();
    if(message)toast(message);
  }
  function startQuestNavigation() {
    if(ui.quest.classList.contains("war-hud") || territoryState?.local?.inField || ui.quest.dataset?.warGuide==="true"){openMap();return;}
    if(questNavigation){
      const manual=questNavigation.manual;
      cancelQuestNavigation(manual?"":"หยุดเดินอัตโนมัติแล้ว");
      if(!manual)return;
    }
    const me=ownServerCharacter(),guide=hudGuide(),target=guide?.to;
    if(mode!=="live" || !room || !me){toast("เข้า LIVE เพื่อเดินอัตโนมัติไปภารกิจ");return;}
    if(!me.alive || me.boatId || me.flying || Math.abs(playerLayer(me))>.15 || ["climbing","ascending","descending","dashing"].includes(me.combatState)){toast("ยืนบนพื้นและหยุดบิน ปีน หรือพุ่งก่อนนำทาง");return;}
    if(!questNavigationPoint(target)){toast("ขั้นตอนนี้ยังไม่มีจุดให้เดินไป · ดูรายละเอียดภารกิจ");openCurrentQuest();return;}
    if(worldDefinitions?.[activeMapId]?.strategic?.rampart){toast("พื้นที่กำแพงเมืองต้องเลือกทางผ่านเอง");return;}
    const now=performance.now();
    questNavigation={room,owner:localId,mapId:activeMapId,mounted:Boolean(me.mounted),key:questNavigationGuideKey(guide),target:null,path:null,waypoint:null,nextTick:0,nextSend:0,started:now,progressAt:now,position:{x:me.x,z:me.z},hops:0};
    closeDrawer();syncQuestNavigationUi();updateQuestNavigation(now);
  }
  function updateQuestNavigation(now) {
    const nav=questNavigation;if(!nav)return;
    const me=ownServerCharacter();
    if(mode!=="live" || room!==nav.room || localId!==nav.owner || !me?.alive){cancelQuestNavigation("หยุดนำทาง · ตัวละครหรือการเชื่อมต่อเปลี่ยนแล้ว",false);return;}
    if(document.hidden || me.boatId || me.flying || Boolean(me.mounted)!==nav.mounted || Math.abs(playerLayer(me))>.15 || territoryState?.local?.inField || ["climbing","ascending","descending","dashing"].includes(me.combatState)){
      cancelQuestNavigation("หยุดนำทาง · กลับมายืนบนพื้นแล้วแตะภารกิจใหม่");return;
    }
    if(now-nav.started>600000){cancelQuestNavigation("หยุดนำทาง · ใช้เวลานานเกินไป ลองเลือกเป้าหมายใหม่");return;}
    if(nav.warp){
      if(activeMapId===nav.warp.mapId && me.mapId===activeMapId){
        nav.mapId=activeMapId;nav.warp=null;nav.path=null;nav.waypoint=null;nav.target=null;nav.progressAt=now;nav.position={x:me.x,z:me.z};nav.readyAt=now+1500;
      }else {if(now-nav.warp.at>8500)cancelQuestNavigation("เดินทางผ่านประตูไม่สำเร็จ · ลองแตะประตูอีกครั้ง",false);return;}
    }
    if(activeMapId!==nav.mapId || me.mapId!==nav.mapId){cancelQuestNavigation("หยุดนำทาง · เปลี่ยนแผนที่แล้ว",false);return;}
    if(now<nav.nextTick){advanceQuestNavigationPlan(nav,now);return;}nav.nextTick=now+150;
    if(now<(nav.readyAt||0))return;
    const guide=nav.manual ? null : hudGuide(),target=nav.manual ? nav.target : guide?.to;
    if((!nav.manual && questNavigationGuideKey(guide)!==nav.key) || !questNavigationPoint(target) || target.alive===false || target.mapId && !target.targetMapId && target.mapId!==activeMapId){
      cancelQuestNavigation("เป้าหมายภารกิจเปลี่ยนแล้ว · แตะภารกิจเพื่อเลือกเส้นทางใหม่");return;
    }
    const map=worldDefinitions?.[activeMapId],portal=(map?.portals||[]).find(p=>p.id===target.id && p.targetMapId===target.targetMapId);
    if(portal && (!room.state?.worldMapsAvailable || !worldDefinitions?.[portal.targetMapId] || worldDefinitions[portal.targetMapId].strategic?.rampart)){
      cancelQuestNavigation("เส้นทางนี้ยังเดินข้ามแผนที่อัตโนมัติไม่ได้ · เลือกประตูเอง");return;
    }
    const escort=!nav.manual && forestEscortState?.id===forestObjectiveState?.active?.id?forestEscortState:null;
    if(escort?.mapId===activeMapId && questNavigationPoint(escort)){
      const distance=Math.hypot(me.x-escort.x,me.z-escort.z);
      if(distance>10 || nav.escortWait && distance>7){
        if(!nav.escortWait){nav.escortWait=now;nav.waypoint=null;try{room.send("move",{x:me.x,z:me.z});}catch{}syncQuestNavigationUi("รอผู้เดินทางตามมา · แตะเพื่อหยุด");}
        if(now-nav.escortWait>15000)cancelQuestNavigation("ผู้เดินทางตามมาไม่ได้ · กลับไปตรวจเส้นทางคุ้มกัน");
        return;
      }
      if(nav.escortWait){nav.escortWait=0;nav.progressAt=now;syncQuestNavigationUi();}
    }
    if(nav.target && (nav.target.id || null)!==(target.id || null)){cancelQuestNavigation("เป้าหมายเปลี่ยนแล้ว · แตะภารกิจใหม่");return;}
    if(!nav.path && !nav.planner || !nav.target || Math.hypot(nav.target.x-target.x,nav.target.z-target.z)>2.5){
      if(nav.waypoint || me.combatState==="moving")try{room.send("move",{x:me.x,z:me.z});}catch{cancelQuestNavigation("ส่งคำสั่งหยุดเพื่อหาเส้นทางไม่สำเร็จ",false);return;}
      nav.target={x:target.x,z:target.z,id:target.id};
      beginGroundRoutePlan(nav,map,me);
      if(!nav.manual)syncQuestNavigationUi("กำลังหาเส้นทาง · แตะเพื่อหยุด");
      advanceQuestNavigationPlan(nav,now);
    }
    if(questNavigation!==nav || nav.planner)return;
    if(Math.hypot(nav.position.x-me.x,nav.position.z-me.z)>.2){nav.position={x:me.x,z:me.z};nav.progressAt=now;}
    if(now-nav.progressAt>5000){
      if(!retryGroundTapRoute(nav,map,me,now))cancelQuestNavigation("เดินต่อไม่ได้หรือถูกขวาง · เลือกจุดหมายใหม่");
      return;
    }
    // Wait for authoritative arrival. Do not advance from rendered/interpolated positions.
    if(nav.waypoint && Math.hypot(me.x-nav.waypoint.x,me.z-nav.waypoint.z)>.05)return;
    nav.waypoint=null;
    while(nav.path.length && Math.hypot(me.x-nav.path[0].x,me.z-nav.path[0].z)<.05)nav.path.shift();
    if(!nav.path.length){
      if(nav.manual){cancelQuestNavigation("",false);return;}
      if(Math.hypot(me.x-target.x,me.z-target.z)>1.6){nav.path=null;return;}
      if(portal && isNearPortal(me,portal)){
        if(++nav.hops>12){cancelQuestNavigation("เส้นทางผ่านประตูมากเกินไป · เลือกทางเอง");return;}
        nav.warp={mapId:portal.targetMapId,at:now};syncQuestNavigationUi("กำลังผ่านประตู · แตะเพื่อหยุด");requestPortalWarp(portal.id);
        if(!warpPending)cancelQuestNavigation("ส่งคำสั่งผ่านประตูไม่สำเร็จ",false);
      }else cancelQuestNavigation("ถึงจุดหมายแล้ว · แตะเป้าหมายเพื่อทำภารกิจ");
      return;
    }
    if(now<nav.nextSend)return;
    const end=nav.path[0],distance=Math.hypot(end.x-me.x,end.z-me.z),scale=Math.min(1,(nav.mounted?6:4)/distance);
    const waypoint={x:Math.round((me.x+(end.x-me.x)*scale)*100)/100,z:Math.round((me.z+(end.z-me.z)*scale)*100)/100};
    if(!questNavigationGeometry(map,activeFort,nav.mounted,nav.allowWading)?.clear(me,waypoint)){
      if(!retryGroundTapRoute(nav,map,me,now))cancelQuestNavigation("เส้นทางเปลี่ยนหรือมีสิ่งกีดขวาง · เลือกทางใหม่");
      return;
    }
    nav.waypoint=waypoint;nav.nextSend=now+450;
    if(pointMove(waypoint.x,waypoint.z,true)===false)cancelQuestNavigation("ส่งคำสั่งนำทางไม่สำเร็จ",false);
  }
