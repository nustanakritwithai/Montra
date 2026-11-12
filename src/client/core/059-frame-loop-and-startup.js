  // Live boats use the village boat mesh and the server's Pirate Fruit deck dimensions.
  const sailingMeshes = new Map();
  const boatPanel = $("boatPanel");
  let nextHelmInput = 0, requestedBoatAnchor = null, currentHelmBoat = "";
  let sailingDestination = null, sailingMarker = null;

  function sendBoatIntent(action, fields = {}) {
    if (mode !== "live" || !room?.state?.boatsAvailable) return;
    try { room.send("boat_intent", {action,...fields}); }
    catch { if (action !== "input") toast("ส่งคำสั่งเรือไม่สำเร็จ"); }
  }
  function resetHelmControls() {
    clearSailingDestination();
    requestedBoatAnchor = null;
  }
  function ownBoatState() {
    const player = ownServerCharacter();
    return player?.boatId ? room.state.boats?.get(player.boatId) : null;
  }
  function boatAtHelm() {
    const boat = ownBoatState();
    return Boolean(boat && boat.helmId === localId);
  }

  function clearSailingDestination() {
    sailingDestination = null;
    sailingMarker?.setEnabled(false);
  }
  function sailingWaterDestination(x, z, map) {
    if (!map?.boatDock || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const bounds = map.bounds;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return null;
    const waters = map.water?.length ? map.water : map.id === "ritual_village" ? [villageRiver] : [];
    const margin = map.boatDock.deck.length/2 + .1;
    let destination = null, adjustment = Infinity;
    for (const w of waters) {
      if (x < w.x || x > w.x+w.width || z < w.z || z > w.z+w.length) continue;
      const minX = Math.max(w.x,bounds.minX)+margin, maxX = Math.min(w.x+w.width,bounds.maxX)-margin;
      const minZ = Math.max(w.z,bounds.minZ)+margin, maxZ = Math.min(w.z+w.length,bounds.maxZ)-margin;
      if (minX > maxX || minZ > maxZ) continue;
      const goal = {x:Math.max(minX,Math.min(maxX,x)),z:Math.max(minZ,Math.min(maxZ,z))};
      const change = Math.hypot(goal.x-x,goal.z-z);
      if (change < adjustment) {destination=goal;adjustment=change;}
    }
    return destination;
  }
  function steerSailingAt(px, py) {
    if (!boatAtHelm()) return;
    const ray = scene.createPickingRay(px,py,B.Matrix.Identity(),camera);
    if (Math.abs(ray.direction.y) < .00001) return;
    const map = worldDefinitions?.[activeMapId];
    const waterY = map?.id === "ritual_village" ? villageWaterLevel : 0;
    const t = (waterY-ray.origin.y)/ray.direction.y;
    if (t < 0) return;
    const point = sailingWaterDestination(ray.origin.x+t*ray.direction.x,ray.origin.z+t*ray.direction.z,map);
    if (!point) return;
    cancelQuestNavigation("",false);
    const boat = ownBoatState();
    sailingDestination = {...point,progress:{x:boat.x,z:boat.z,heading:boat.heading,at:performance.now()}};
    if (!sailingMarker) {
      sailingMarker = marker.clone("sailing destination");
      sailingMarker.isPickable = false;
    }
    sailingMarker.position.set(point.x,waterY+.15,point.z);
    sailingMarker.setEnabled(true);
    requestedBoatAnchor = false;
  }
  function wrapSailingAngle(angle) {
    return Math.atan2(Math.sin(angle),Math.cos(angle));
  }
  function sailingInputForDestination(boat, now) {
    const goal = sailingDestination;
    if (!goal) return {throttle:0,steer:0};
    const dx = goal.x-boat.x, dz = goal.z-boat.z;
    const distance = Math.hypot(dx,dz);
    const progress = goal.progress;
    if (Math.hypot(boat.x-progress.x,boat.z-progress.z) >= .25 ||
        Math.abs(wrapSailingAngle(boat.heading-progress.heading)) >= .16) {
      goal.progress = {x:boat.x,z:boat.z,heading:boat.heading,at:now};
    }
    if (distance <= 1.35 || now-goal.progress.at >= 2800) {
      clearSailingDestination();
      return {throttle:0,steer:0};
    }
    const bearing = Math.atan2(dx,dz);
    const reverse = Math.abs(wrapSailingAngle(bearing-boat.heading)) > Math.PI/2;
    const headingError = wrapSailingAngle(bearing-boat.heading-(reverse ? Math.PI : 0));
    const direction = reverse ? -1 : 1;
    const momentum = Math.abs(boat.speed) > .15 ? Math.sign(boat.speed) : direction;
    const maxThrottle = reverse ? .8 : .72;
    const brakingDistance = reverse ? 4.5 : 10;
    return {
      throttle:direction*Math.min(maxThrottle,distance/brakingDistance)*Math.max(.18,Math.cos(headingError)),
      steer:-momentum*Math.max(-1,Math.min(1,headingError*2)),
    };
  }

  $("boatLaunch").onclick = () => { cancelQuestNavigation();sendBoatIntent("launch"); };
  $("boatBoard").onclick = () => {
    const id = $("boatBoard").dataset.boatId;
    if (id) {cancelQuestNavigation();sendBoatIntent("board",{boatId:id});}
  };
  $("boatHelm").onclick = () => sendBoatIntent(boatAtHelm() ? "release" : "helm");
  $("boatExit").onclick = () => sendBoatIntent("exit");
  addEventListener("blur",resetHelmControls);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)resetHelmControls();});

  function clickSailingDeck(id, point) {
    const player = ownServerCharacter();
    if (!player?.boatId) {sendBoatIntent("board",{boatId:id});return;}
    if (player.boatId !== id || !point) return;
    if (boatAtHelm()) {
      clearSailingDestination();
      requestedBoatAnchor = true;
      return;
    }
    const node = sailingMeshes.get(id);
    if (!node) return;
    const dx = point.x-node.position.x, dz = point.z-node.position.z;
    const c = Math.cos(node.rotation.y), s = Math.sin(node.rotation.y);
    sendBoatIntent("walk",{x:dx*c-dz*s,z:dx*s+dz*c});
  }

  function updateSailing(now, dt) {
    const state = mode === "live" ? room?.state : null;
    const dock = state?.boatsAvailable ? worldDefinitions?.[activeMapId]?.boatDock : null;
    const player = dock ? ownServerCharacter() : null;
    const seen = new Set();
    let nearestId = "", nearestDistance = 6.5;
    if (dock) state.boats?.forEach((boat,id)=>{
      if (boat.mapId !== activeMapId || boat.sunk) return;
      seen.add(id);
      const distance = player ? Math.hypot(player.x-boat.x,player.z-boat.z) : Infinity;
      if (distance <= nearestDistance && Math.abs(boat.speed) <= 1) {nearestDistance=distance;nearestId=id;}
      let node = sailingMeshes.get(id);
      if (!node) {
        node = longTailBoat(boat.x,boat.z,boat.heading,true);
        node.scaling.set(dock.deck.width/.95,dock.deck.y/.16,dock.deck.length/5.1);
        const pick = B.MeshBuilder.CreateBox("sailing deck pick",{
          width:.95*.82*1.08,height:.016,depth:5.1*.62*1.08,
        },scene);
        pick.parent = node;pick.position.y = .16;
        pick.visibility = .004;pick.isPickable = true;pick.metadata = {sailingBoatId:id};
        sailingMeshes.set(id,node);
      }
      const blend = 1-Math.exp(-16*dt);
      node.position.x += (boat.x-node.position.x)*blend;
      node.position.z += (boat.z-node.position.z)*blend;
      const yaw = boat.heading-node.rotation.y;
      node.rotation.y += Math.atan2(Math.sin(yaw),Math.cos(yaw))*blend;
    });
    for (const [id,node] of sailingMeshes) if (!seen.has(id)) {node.dispose();sailingMeshes.delete(id);}

    const boat = player?.alive ? ownBoatState() : null;
    const helm = Boolean(boat && boat.helmId === localId);
    if (currentHelmBoat !== (helm ? player.boatId : "")) {
      resetHelmControls();
      currentHelmBoat = helm ? player.boatId : "";
      nextHelmInput = 0;
      if (helm) {
        if (fishingSelect) clearFishing(false);
        toast("แตะน้ำเพื่อขับ · แตะดาดฟ้าเพื่อหยุด");
      }
    }
    const onLand = player?.alive && !player.boatId && !player.flying && !player.mounted;
    $("boatLaunch").hidden = !(onLand && Math.hypot(player.x-dock.x,player.z-dock.z) <= dock.range);
    $("boatBoard").hidden = !(onLand && nearestId);
    $("boatBoard").dataset.boatId = nearestId;
    $("boatHelm").hidden = !(boat && (!boat.helmId || helm));
    $("boatHelm").textContent = helm ? "ปล่อยหางเสือ" : "จับหางเสือ";
    $("boatExit").hidden = !boat;
    boatPanel.hidden = !Array.from(boatPanel.children).some(button=>!button.hidden);
    if (!helm || now < nextHelmInput) return;
    nextHelmInput = now + 100;
    const {throttle,steer} = sailingInputForDestination(boat,now);
    if (requestedBoatAnchor === boat.anchored) requestedBoatAnchor = null;
    sendBoatIntent("input",{throttle,steer,...(requestedBoatAnchor===null ? {} : {anchor:requestedBoatAnchor})});
  }

  // Cooldown labels must advance even in a quiet room with no schema patches.
  setInterval(()=>{if(mode==="live"){syncOccultUI(ownServerCharacter());syncBladeUI(ownServerCharacter());syncSentinelUI(ownServerCharacter());}if(drawerActive==="strategy")updateAtlasWarTimes();if(drawerActive==="quest")updateDirectorTimer();},1000);
  $("helpButton").onclick=openHelp;
  $("bag").onclick=openBag;
  // Pose rate by distance from the camera's focus: full rate near the hero, 15/s in the middle
  // distance, 8/s further out. The local hero always poses every frame.
  function poseInterval(local, d) {
    if (local || d < (LITE ? 16 : 26)) return 0;
    return d < (LITE ? 32 : 48) ? 1 / 15 : 1 / 8;
  }
  function syncPossessionButton() {
    const active=mode==="live" ? ownServerCharacter()?.possessionActive===true : possessed;
    heroMat.emissiveColor=B.Color3.FromHexString(active ? "#7c459b" : "#3b2916");
  }
  $("climb").onclick = requestClimb;
  $("harvestButton").onclick=()=>{
    const n=nearbyResource(ownServerCharacter());
    if(!n || !n.stock || !economyReady() || economyPending)return;
    resourceReadyAt=performance.now()+1500;playHarvestMotion(getLocalAvatar(),n);
    economySend("harvest_resource",{node:n.id,requestId:economyRequestId()},true);
  };
  $("fishButton").onclick=()=>{
    if(!economyReady() || fishingPending)return;
    if(fishSavedItem){fishingPending=true;fishingPendingUntil=performance.now()+8000;room.send("fish_claim",{});return;}
    fishingSelect=!fishingSelect;if(fishingSelect)createFishingPickers();else clearFishingPickers();
    toast(fishingSelect?"แตะตำแหน่งในน้ำเพื่อเหวี่ยงเบ็ด":"ยกเลิกเลือกจุดตกปลา");
  };
  $("fishCancel").onclick=()=>clearFishing(true);
  $("fishReel").onclick=()=>{
    if(!fishingState || fishingPending || !room)return;
    fishingPending=true;fishingPendingUntil=performance.now()+8000;room.send("fish_reel",{id:fishingState.id});
  };
  $("fly").onclick = toggleFlightCommand;

  let elapsed=0, lastMapDraw=0;
  engine.runRenderLoop(() => {
    const dt=Math.min(engine.getDeltaTime()/1000,.06);
    elapsed+=dt;
    const now = performance.now();
    updateFishing(now);
    updateSailing(now,dt);
    checkClimbApproach();
    updateQuestNavigation(now);
    for(const [id,fx] of seerBindingEffects){
      const target=monsterForSpell(id) || room?.state?.players?.get?.(id);
      if(mode!=="live" || now>=fx.until || !target?.alive || (target.mapId || "ritual_village")!==activeMapId){fx.mesh.dispose();seerBindingEffects.delete(id);continue;}
      fx.mesh.position.set(Number(target.x),Number(target.y)+.1,Number(target.z));
      fx.mesh.rotation.z+=dt;
    }
    for(const [id,fx] of priestAreaEffects){
      if(mode!=="live" || now>=fx.until || fx.mapId!==activeMapId){fx.mesh.dispose();priestAreaEffects.delete(id);}
    }
    for(let i=skillEffects.length-1;i>=0;i--){
      const fx=skillEffects[i];
      if(now>=fx.until || fx.mapId!==activeMapId || mode!=="live"){
        fx.mesh.dispose();
        skillEffects.splice(i,1);
      } else if (fx.start) {
        B.Vector3.LerpToRef(fx.start, fx.end, 1 - (fx.until - now) / 300, fx.mesh.position);
      }
    }
    if (mode === "demo") {
      if (demoRespawnAt > 0 && now >= demoRespawnAt) {
        resetDemoMonster();
      }
      if (demoAutoAttack && demoMonsterHp > 0) {
        const me = getLocalAvatar();
        if (me) {
          const dx = enemy.position.x - me.targetX;
          const dz = enemy.position.z - me.targetZ;
          const distance = Math.hypot(dx, dz);
          if (distance > 2.6) {
            const ratio = (distance - 2.4) / distance;
            demoDest = {
              x: me.targetX + dx * ratio,
              z: me.targetZ + dz * ratio
            };
          } else {
            demoDest = null;
            if (now - demoLastHitAt >= 1000) {
              demoLastHitAt = now;
              playAttack(localId, false, enemy.position.x, enemy.position.z);
              villageGhost.metadata.ghost.hurtAt = now;
              impactAt(localId, enemy.position.x, enemy.position.z, "", undefined, enemy.position.y);
              demoMonsterHp = Math.max(0, demoMonsterHp - 20);
              registerComboHit();
              floatAtMonster(MONSTER_ID, "20", "dealt");
              hitFlashRemaining = .22;
              const vgGhost = villageGhost?.metadata?.ghost;
              if (vgGhost && vgGhost.shieldActive && vgGhost.shieldHp > 0) {
                processBossShieldDamage(villageGhost, vgGhost, 20, MONSTER_ID);
              }
              if (demoMonsterHp <= 0) {
                hudKills.ritual_village = (hudKills.ritual_village || 0) + 1;
                eventFx("ghost_die", enemy, { y: 0 });
                releaseSoul(enemy.position.x, enemy.position.y + .4, enemy.position.z);
                enemy.setEnabled(false);
                demoAutoAttack = false;
                demoRespawnAt = now + 6000;
                toast("ปราบผีสำเร็จ · DEMO · เกิดใหม่ใน 6 วินาที");
              }
            }
          }
        }
      }
    }
    if (mode === "demo" && demoFlightTarget) {
      const me = getLocalAvatar();
      if (me) {
        const dy = demoFlightTarget.targetY - me.targetY;
        const step = DEMO_FLIGHT_SPEED * dt;
        if (Math.abs(dy) <= step + .00001) {
          me.targetY = demoFlightTarget.targetY;
          demoFlying = !demoFlightTarget.landing;
          demoFlightTarget = null;
          updateFlightButton();
          updateStatus();
          toast(demoFlying
            ? "บินระดับ 6 เมตรแล้ว · แตะพื้นเพื่อเคลื่อนที่"
            : me.targetY > 1
              ? "ลงบนกำแพงแล้ว · DEMO"
              : "ลงถึงพื้นแล้ว · DEMO");
        } else {
          me.targetY += Math.sign(dy) * step;
        }
      } else {
        demoFlightTarget = null;
      }
    }
    if (mode === "demo" && demoDash) {
      const me = getLocalAvatar();
      if (!me) demoDash = null;
      else {
        const distance = Math.min(demoDash.remaining, DASH_DEMO_SPEED * dt);
        let moved = 0, blocked = false;
        while (moved + 1e-8 < distance) {
          const micro = Math.min(0.1, distance - moved);
          const x = me.targetX + demoDash.dx * micro;
          const z = me.targetZ + demoDash.dz * micro;
          const wall = activeFort;
          if (Math.abs(x) > 20 || Math.abs(z) > 20 ||
              (Math.abs(x-wall.x) < wall.width/2 + .32 &&
               Math.abs(z-wall.z) < wall.length/2 + .32)) {
            blocked = true;
            break;
          }
          me.targetX = x;
          me.targetZ = z;
          moved += micro;
        }
        demoDash.remaining = Math.max(0, demoDash.remaining - moved);
        if (blocked || demoDash.remaining < 0.0001) demoDash = null;
      }
    }
    if(mode==="demo" && demoDest) {
      const me=getLocalAvatar();
      if(me) {
        const dx=demoDest.x-me.targetX, dz=demoDest.z-me.targetZ, d=Math.hypot(dx,dz);
        const baseStep=(demoFlying?4:(possessed?4.6:3));
        const mountMult=me.mounted?1.6:1;
        const step=baseStep*mountMult*dt;
        if(d<=step) { me.targetX=demoDest.x;me.targetZ=demoDest.z;demoDest=null; }
        else if(d>0){ me.targetX+=dx/d*step;me.targetZ+=dz/d*step; }
      }
    }
    for(const a of avatars.values()) {
      const beforeX = a.x, beforeZ = a.z;
      const dashing = a.dashUntil > now;
      const blend = 1 - Math.exp(-dt * (dashing ? 25 : 14));
      a.x += (a.targetX - a.x) * blend;
      a.y += (a.targetY - a.y) * blend;
      a.z += (a.targetZ - a.z) * blend;

      // Infer every character's facing from the SERVER-SYNCED position
      // change (or local demo movement). Preserve the last facing at rest.
      // This works with the existing Colyseus x/z schema, so no VPS update.
      const travelX = a.x - beforeX, travelZ = a.z - beforeZ;
      if (mode === "live" && Number.isFinite(a.serverFacing)) {
        a.desiredHeading = a.serverFacing;
      } else if (Math.hypot(travelX, travelZ) > .002 &&
                 performance.now() >= a.facingLockUntil) {
        a.desiredHeading = facingFromTravel(travelX, travelZ);
      }
      // Interpolate using the shortest circular angle: handles ±PI without
      // spinning the long way around when changing movement direction.
      const angleDelta = Math.atan2(
        Math.sin(a.desiredHeading - a.heading),
        Math.cos(a.desiredHeading - a.heading)
      );
      a.heading += angleDelta * (1 - Math.exp(-dt * 11));
      a.node.rotation.y = a.heading;
      a.node.scaling.set(dashing ? 1.07 : 1, dashing ? 0.94 : 1, dashing ? 1.07 : 1);
      const flash = (a.hitFlashUntil || 0) > now;
      a.node.scaling.set(flash ? 1.07 : 1, flash ? 1.04 : 1, flash ? 1.07 : 1);
      a.node.position.set(a.x, a.y, a.z);
      // Far characters pose (skeleton, hands, cloth) at a lower rate; their position above still moves
      // every frame, so walking stays smooth and only the limbs step at 15 or 8 poses a second.
      a.poseAcc = (a.poseAcc || 0) + dt;
      if (a.poseAcc >= poseInterval(a.local, Math.hypot(a.x - camera.target.x, a.z - camera.target.z))) {
        animateRig(a, Math.hypot(travelX, travelZ) / Math.max(dt, 1e-3), a.poseAcc, now); a.poseAcc = 0;
      }
      updateAvatarAuras(a, now, dt);
      a.flightHalo?.setEnabled(a.serverFlying || (a.y > 4.4 && !worldDefinitions?.[activeMapId]?.terrain));
    }
    // Idle breathing pose for nearby service NPCs (standing still, so speed 0).
    for (const npc of npcActors) {
      const w = npc.node.getAbsolutePosition();
      const d = Math.hypot(w.x - camera.target.x, w.z - camera.target.z);
      npc.poseAcc = (npc.poseAcc || 0) + dt;
      if (npc.node.isEnabled(true) && d < (LITE ? 35 : 70) && npc.poseAcc >= poseInterval(false, d)) { npc.x = w.x; npc.y = w.y; npc.z = w.z; animateRig(npc, 0, npc.poseAcc, now); npc.poseAcc = 0; }
    }
    for (const npc of summonAvatars.values()) {
      if (npc.demo) {
        // DEMO: hover at the hero's right shoulder and face where the hero faces.
        const hero = getLocalAvatar();
        if (hero) { const h = hero.heading || 0; npc.targetX = hero.x - Math.cos(h) * 1.6 + Math.sin(h) * .6; npc.targetZ = hero.z + Math.sin(h) * 1.6 + Math.cos(h) * .6; npc.targetY = hero.y; npc.desiredFacing = h; }
        npc.action = (hero?.action && ACTIONS[hero.action.type]?.swing && now < hero.action.end) ? "attack" : "follow";
      }
      const blend = 1 - Math.exp(-dt * 12);
      const stepX = (npc.targetX - npc.x) * blend, stepZ = (npc.targetZ - npc.z) * blend;
      npc.x += stepX;
      npc.y += (npc.targetY - npc.y) * blend;
      npc.z += stepZ;
      const rotationDelta = Math.atan2(
        Math.sin(npc.desiredFacing - npc.facing),
        Math.cos(npc.desiredFacing - npc.facing)
      );
      npc.facing += rotationDelta * (1 - Math.exp(-dt * 10));
      npc.node.rotation.y = npc.facing;
      if (npc.capturedVisual) {
        npc.node.position.set(npc.x, npc.y, npc.z);
        const model = npc.capturedVisual.metadata.ghost;
        if (model) {
          model.speed = Math.hypot(stepX, stepZ) / Math.max(dt, 1e-3);
          model.ai = npc.action;
          poseGhostModel(npc.capturedVisual, model, dt, now, npc.x, npc.z);
        }
        continue;
      }
      const bob = Math.sin(elapsed * 2.4 + npc.ownerId.length) * .09;
      npc.node.position.set(npc.x, npc.y+bob, npc.z);
      const striking = npc.action === "attack" || npc.hitUntil > now;
      const emergence = Math.min(1, 1 - (npc.emergingUntil - now) / 500);
      const scale = (striking && !npc.spirit ? 1.13 : 1) * Math.max(.12, emergence);
      npc.node.scaling.set(scale, scale, scale);
      animateSpirit(npc, now, dt);
    }
    const me=getLocalAvatar();
    const portal=activePortal(), authoritative=ownServerCharacter();
    const siege=$("siegeGateButton"),localWar=territoryState?.local,castle=activeMapId==="tri_wiang_castle";
    const riverWar=localWar?.river;
    const canUse=localWar?.site===activeMapId && localWar.inField && localWar.phase==="battle" && authoritative?.alive && Math.abs(playerLayer(authoritative))<.1;
    const gate=canUse && worldDefinitions[activeMapId].strategic?.rampart?.gates.reduce((nearest,g,i)=>{
      if(!castle && !riverWar && !localWar.gates && i!==0)return nearest;
      const distance=gate=>Math.hypot(authoritative.x-gate.box.x-gate.box.width/2,authoritative.z-gate.box.z-gate.box.length/2);
      return !nearest || distance(g)<distance(nearest)?g:nearest;
    },null);
    const nearGate=gate && authoritative.x>=gate.box.x-2.5 && authoritative.x<=gate.box.x+gate.box.width+2.5 && authoritative.z>=gate.box.z-2.5 && authoritative.z<=gate.box.z+gate.box.length+2.5;
    const status=nearGate && (riverWar?riverWar.gates[gate.id]:castle?localWar.pilot?.gates?.[gate.id]:localWar.gates?.[gate.id] ?? {closed:localWar.gateClosed,hp:localWar.gateHp});
    const inside=gate && (gate.side==="west"?authoritative.x>gate.box.x+gate.box.width/2:gate.side==="east"?authoritative.x<gate.box.x+gate.box.width/2:
      gate.side==="north"?authoritative.z>gate.box.z+gate.box.length/2:authoritative.z<gate.box.z+gate.box.length/2);
    siege.hidden=!(status?.hp && (!castle || localWar.pilot?.throne?.defended) && (!riverWar || riverWar.defended) && (localWar.side==="attack"?status.closed:inside));
    siege.dataset.gate=(castle || riverWar) && gate?gate.id:"";
    if(!siege.hidden)siege.textContent=(localWar.side==="attack"?"พังประตู":status.closed?"เปิดประตู":"ปิดประตู")+" · "+status.hp+"/120";
    const repair=$("castleRepair");
    if(repair)repair.hidden=!(castle && !siege.hidden && localWar.side==="defend" && status.hp<120 && localWar.pilot.points.find(p=>p.id===6)?.owner==="defend");
    const warpButton=$("warpButton");
    warpButton.hidden=!(mode==="live" && !localWar?.inField && room?.state?.worldMapsAvailable===true &&
      isNearPortal(authoritative,portal) && !warpPending);
    warpButton.textContent=portal?.label || ("เดินทางไป"+(worldDefinitions?.[portal?.targetMapId]?.name || "ประตูวาร์ป"));
    if(me) {
      // Follow the moving player without calling camera.setTarget(): that
      // method recomputes alpha/beta/radius and cancels manual camera rotation.
      const follow = 1 - Math.exp(-dt * 3.8);
      const target = camera.target;
      target.x += (me.x - target.x) * follow;
      target.y += (me.y + .65 - target.y) * follow;
      target.z += (me.z + 1.5 - target.z) * follow;
    }
    enemy.position.y=.9+(Number(room?.state?.monster?.y)||0)+Math.sin(elapsed*1.8)*.07;
    // Monster orientation also comes from the server's AI decision.
    if (mode === "live" && Number.isFinite(serverMonsterFacing)) {
      const turn = Math.atan2(Math.sin(serverMonsterFacing - enemy.rotation.y),
                              Math.cos(serverMonsterFacing - enemy.rotation.y));
      enemy.rotation.y += turn * (1 - Math.exp(-dt * 9));
    }
    hitFlashRemaining = Math.max(0, hitFlashRemaining - dt);
    enemy.scaling.y = hitFlashRemaining > 0 ? 1.3 : 1.1;
    if(spirit && me) { spirit.position.set(me.x-1.2,1.5+Math.sin(elapsed*3)*.2,me.z+.8); }
    marker.rotation.z+=dt*.2;

    // Maps are 2D canvases with soft shadows: ~10 redraws per second is plenty.
    if(now-lastMapDraw>(LITE?250:100)){
      lastMapDraw=now;
      drawMap(ui.minimap.getContext("2d"),ui.minimap.width,ui.minimap.height);
      if(drawerActive==="map") {
        const large=$("bigMap");if(large)drawMap(large.getContext("2d"),large.width,large.height,true);
      }
    }
    // Keep the same clear area around the hero at every pinch/wheel zoom.
    if(me && activeMapId==="forbidden_forest")fadeForestCrowns(me);
    if(me && templeCover.length)fadeTempleWalls(me);
    animateGhosts(dt, now);
    scene.fogStart = camera.radius + atmosphere.fogNear + lightLevel().fog;
    scene.fogEnd = camera.radius + atmosphere.fogFar + lightLevel().fog * 1.5;
    updateViewDistance(); updateBackdrop();
    applyCameraShake(dt);
    driftMist(elapsed, camera.target);
    followShadow(camera.target); updateLanternLights(camera.target, dt, elapsed); watchFrameRate(dt);
    if ((hudIn -= dt) <= 0) { hudIn = .25; updateHud(performance.now()); }
    updateFloatText();
    updateWorldFx(now); updateTargetRing(now); updateMonsterLabels(); updateTargetOverheadHud(now); updateComboHud(now); updatePartyTethers(now); updateWeaponAuras(now);
    { const hero = getLocalAvatar(); if (hero) window.MontraAudio?.listen(hero.x, hero.z);
      // Music state: combat for 6 s after any fight action, war in a live battle, elite when one is near.
      if ((musicSyncIn -= dt) <= 0 && hero) {
        musicSyncIn = .5;
        let elite = false;
        for (const mesh of forestMonsters.values()) { const g = mesh.metadata?.ghost; if (g?.design?.elite && mesh.isEnabled() && !g.deathAt && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 30) { elite = true; break; } }
        const war = Boolean(territoryState?.local?.inField && territoryState.local.phase === "battle");
        window.MontraAudio?.music({ map: activeMapId, combat: performance.now() - lastCombatAt < 6000, war, elite });
      } }
    driftClouds(camera.target, elapsed); updateStrikeLight(performance.now());
    keyLight.intensity = atmosphere.keyI * 1.65 * (1 - .22 * cloudCover);
    stormFlash(dt);
    if ((shadowSyncIn -= dt) <= 0) { shadowSyncIn = .5; syncShadowLists(); }
    rippleTexture.vOffset = (rippleTexture.vOffset + dt * .025) % 1;
    riverRipple.uOffset = (riverRipple.uOffset + dt * .012) % 1;
    // The horizon only enters the portrait frustum at shallow camera tilts.
    sky.setEnabled(camera.beta > 1.05);
    motes.emitter.copyFrom(camera.target);
    if (typeof updateWeather === "function") updateWeather(dt, elapsed);
    if (typeof updateBanners === "function") updateBanners(dt, elapsed);
    if (typeof updatePet === "function") updatePet(dt, elapsed);
    if (typeof updateFlight === "function") updateFlight(dt, elapsed);
    if (typeof updateThaoWessuwanBoss === "function") updateThaoWessuwanBoss(dt, elapsed);
    animatePortals(elapsed, dt);
    if (me) warm.position.set(me.x, me.y + 3.4, me.z + .6);
    scene.render();
  });
  window.addEventListener("resize",()=>{ resizeGameRenderer(); updateStatus(); positionSwordToast(); });
  window.addEventListener("pagehide",()=> { clearSyncPoll();if(room)try{room.leave();}catch(_){} });
  // Reuse the player's human model for existing NPC roles and keep their hitboxes.
  attachNpcAvatar(questRangerRoot,"quest-ranger",rangerRobes[0],[rangerBody,rangerHead,rangerHat]);
  attachNpcAvatar(defenseKeeperRoot,"defense-keeper",rangerRobes[3],[defenseBody,defenseHead]);
  attachNpcAvatar(escortRoot,"quest-escort",rangerRobes[2],[escortBody,escortHead]);
  attachNpcAvatar(quartermasterRoot,"quartermaster",rangerRobes[0],[quartermasterBody,quartermasterHead]);
  const trainerNpcRoot=new B.TransformNode("sword mentor human",scene);
  trainerNpcRoot.position.set(trainerPosition.x,0,trainerPosition.z);
  for(const old of [trainerBody,trainerHead]){const index=villageMeshes.indexOf(old);if(index>=0)villageMeshes.splice(index,1);}
  villageMeshes.push(trainerNpcRoot);
  attachNpcAvatar(trainerNpcRoot,"sword-mentor",rangerRobes[0],[trainerBody,trainerHead]);
  resetDemoMonster();
  updateStatus();
  updateFlightButton();
  ui.loading.hidden=true;
  setTimeout(()=>{warmCombatFx();warmMaterials();},1500);
  window.MontraEntry?.start((endpoint,slot,setup) => connectOnline(endpoint,slot,null,setup), async () => {
    const old = room; room = null; clearSyncPoll();
    if (old) { try { await old.leave(); } catch (_) {} }
    showDemo();
  });
