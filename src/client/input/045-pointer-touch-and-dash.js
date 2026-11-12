  // Do not attach Babylon's default camera controls: we intentionally keep
  // one-finger rotation and tap-to-walk separate from two-finger pinch zoom.
  const touchPoints = new Map();
  let pinchStart = null;
  let ignoreTapUntilTouchesLift = false;
  function touchSeparation() {
    const [a,b] = [...touchPoints.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  ui.world.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, {x:event.clientX, y:event.clientY});
      if (touchPoints.size >= 2) {
        ignoreTapUntilTouchesLift = true;
        pointer = null; // never turn a pinch into a tap-to-move
        pinchStart = touchPoints.size === 2
          ? {separation:Math.max(1,touchSeparation()), radius:camera.radius}
          : null;
        try { ui.world.setPointerCapture(event.pointerId); } catch (_) {}
        return;
      }
      if (ignoreTapUntilTouchesLift) return;
    }
    pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, alpha:camera.alpha, beta:camera.beta, moved:false };
    try { ui.world.setPointerCapture(event.pointerId); } catch (_) {}
  });
  ui.world.addEventListener("pointermove",event => {
    if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, {x:event.clientX,y:event.clientY});
      if (touchPoints.size >= 2) {
        if (touchPoints.size === 2) {
          const separation = Math.max(1, touchSeparation());
          if (!pinchStart) pinchStart = {separation,radius:camera.radius};
          // Pinching fingers together zooms out; spreading zooms in.
          setCameraZoom(pinchStart.radius * pinchStart.separation / separation);
        }
        return;
      }
      if (ignoreTapUntilTouchesLift) return;
    }
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.abs(dx)+Math.abs(dy)>9) pointer.moved=true;
    if (pointer.moved) {
      camera.alpha = pointer.alpha - dx * .006;
      camera.beta = Math.max(camera.lowerBetaLimit,
        Math.min(camera.upperBetaLimit, pointer.beta + dy * .003));
    }
  });
  ui.world.addEventListener("pointerup",event => {
    const suppressTap = event.pointerType === "touch" && ignoreTapUntilTouchesLift;
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchStart = null;
      if (touchPoints.size === 0) ignoreTapUntilTouchesLift = false;
    }
    if (suppressTap || !pointer || pointer.id !== event.pointerId) return;
    const wasMoved = pointer.moved;
    pointer = null;
    if (wasMoved) return;
    const rect = ui.world.getBoundingClientRect();
    // Babylon scene.pick() uses CSS pixels relative to the canvas, just like
    // scene.pointerX/Y. Do NOT multiply by engine render width/height here:
    // on high-DPI mobiles that shifts the destination away from the tap.
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    if(fishingSelect){
      const hit=scene.pick(px,py,mesh=>mesh.isEnabled() && mesh.metadata?.fishingWater===true),point=hit?.pickedPoint,me=ownServerCharacter();
      if(!point || !fishingWaterAt(point.x,point.z)){toast("แตะตำแหน่งในน้ำเพื่อเหวี่ยงเบ็ด");return;}
      if(!me || Math.hypot(me.x-point.x,me.z-point.z)>9){toast("เข้าใกล้น้ำในระยะ 9 เมตร");return;}
      fishingSelect=false;clearFishingPickers();fishingPending=true;fishingPendingUntil=performance.now()+8000;
      try{room.send("fish_start",{x:point.x,z:point.z});}catch(_){clearFishing(false);toast("ส่งคำสั่งตกปลาไม่สำเร็จ");}
      return;
    }
    // Depth-sorted pick includes the climbable wall, its crest, players,
    // monster and walkable ground. Fire only where the target is visible.
    const picked = scene.pick(px, py, mesh => mesh.isEnabled() && (
      mesh.metadata?.walkable === true || mesh.metadata?.sailingBoatId ||
      (!targetedSkill && boatAtHelm() && (mesh.metadata?.waterGateId || mesh.metadata?.boatPortId)) ||
      mesh.metadata?.portalId || mesh.metadata?.swordMentor || mesh.metadata?.questRanger || mesh.metadata?.questDefense || mesh.metadata?.warQuartermaster || mesh.metadata?.serviceNpc ||
      (mode === "live" && resourcePickers.get(mesh.metadata?.resourceId) === mesh) ||
      (mesh === enemy && enemy.isEnabled()) ||
      (mode === "live" && mesh.isEnabled() && forestMonsters.get(mesh.metadata?.monsterId) === mesh) ||
      (mode === "live" && !targetedSkill && mesh.metadata?.ghostCombatTargetId) ||
      (fortRoot.isEnabled() && mesh.metadata?.climbableWall) ||
      (mode === "live" && mesh.metadata?.pkPlayerId &&
       mesh.metadata.pkPlayerId !== localId)
    ));
    if (targetedSkill === "ghostAttack") {
      const mesh = picked?.hit && picked.pickedMesh;
      const targetId = mesh === enemy ? MONSTER_ID : mesh?.metadata?.monsterId || mesh?.metadata?.pkPlayerId;
      orderGhostAttack(targetId);
      return;
    }
    if (!picked?.hit) {steerSailingAt(px,py);return;}
    cancelQuestNavigation();
    const hitMesh=picked.pickedMesh;
    if(hitMesh?.metadata?.waterGateId){sailThroughGate(hitMesh.metadata.waterGateId);return;}
    if(hitMesh?.metadata?.boatPortId){sailToPort(hitMesh.metadata.boatPortId);return;}
    if (hitMesh?.metadata?.ghostCombatTargetId) {
      try { room.send("attack",{targetId:hitMesh.metadata.ghostCombatTargetId}); }
      catch (_) { toast("ส่งคำสั่งโจมตีผีไม่สำเร็จ"); }
      return;
    }
    if (hitMesh?.metadata?.sailingBoatId) {clickSailingDeck(hitMesh.metadata.sailingBoatId,picked.pickedPoint);return;}
    if(hitMesh?.metadata?.stairId){requestClimb(hitMesh.metadata.stairId);return;}
    if(hitMesh?.metadata?.resourceId){
      const node=nearbyResources(ownServerCharacter()).find(n=>n.id===hitMesh.metadata.resourceId);
      if(node)selectResource(node);
      return;
    }
    const otherId=hitMesh?.metadata?.pkPlayerId;
    if(hitMesh?.metadata?.serviceNpc){
      const me=ownServerCharacter(),npc=hitMesh.metadata.serviceNpc;
      if(!me || mode!=="live")toast("เข้า LIVE เพื่อพูดคุยกับ "+npc.name);
      else if(me.flying)toast("ลงจอดก่อนพูดคุยกับ "+npc.name);
      else if(Math.hypot(me.x-npc.x,me.z-npc.z)>npc.radius){pointMove(npc.x,npc.z);toast("เดินไปหา"+npc.name+" แล้วแตะอีกครั้ง");}
      else openServiceNpc(npc);
    } else if(hitMesh?.metadata?.warQuartermaster){
      const me=ownServerCharacter(),base=territoryState?.local?.cargo?.base;
      if(!me || !base)toast("เข้าร่วมศึกก่อนพูดคุยกับพลเสบียง");
      else if(me.flying)toast("ลงจอดก่อนพูดคุยกับพลเสบียง");
      else if(Math.hypot(me.x-base.x,me.z-base.z)>5){pointMove(base.x,base.z);toast("เดินไปหาพลเสบียง แล้วแตะอีกครั้ง");}
      else openWarPanel();
    } else if(hitMesh?.metadata?.questDefense){
      const me=ownServerCharacter(),active=forestObjectiveState?.active,entry=active && forestObjectiveState?.options?.[active.id],area=entry?.defense;
      if(!me || !area || entry.mapId!==activeMapId)toast("เข้า LIVE เพื่อพูดคุยกับผู้ดูแลเสบียง");
      else if(me.flying)toast("ลงจอดก่อนพูดคุยกับผู้ดูแลเสบียง");
      else if(Math.hypot(me.x-area.x,me.z-area.z)>4){pointMove(area.x,area.z);toast("เดินไปหาผู้ดูแลเสบียง แล้วแตะอีกครั้ง");}
      else openForestRanger();
    } else if(hitMesh?.metadata?.questRanger){
      const me=ownServerCharacter(),keeper=forestObjectiveState?.keeper;
      if(!me || !keeper || keeper.mapId!==activeMapId)toast("เข้า LIVE เพื่อพูดคุยกับผู้มอบงาน");
      else if(Math.hypot(me.x-keeper.x,me.z-keeper.z)>keeper.radius){pointMove(keeper.x,keeper.z);toast("เดินไปหาผู้มอบงาน แล้วแตะอีกครั้ง");}
      else openForestRanger();
    } else if (hitMesh?.metadata?.swordMentor) {
      const me=ownServerCharacter();
      if (!me) toast("เข้า LIVE เพื่อพูดคุยกับครูดาบ");
      else if (Math.hypot(me.x-trainerPosition.x,me.z-trainerPosition.z)>3) { pointMove(trainerPosition.x,trainerPosition.z);toast("เดินไปหาครูดาบแล้วแตะอีกครั้ง"); }
      else openSwordTree();
    } else if (hitMesh?.metadata?.portalId) {
      const portal=activePortal(hitMesh.metadata.portalId);
      if (!portal)return;
      if (mode !== "live" || !room || room.state?.worldMapsAvailable !== true ||
          isNearPortal(ownServerCharacter(),portal)) {
        requestPortalWarp(portal.id);
      } else {
        pointMove(portal.x,portal.z);
        toast("กำลังเดินไปประตู · แตะประตูอีกครั้งเมื่อถึง");
      }
    } else if (otherId && mode==="live") {
      if(targetedSkill) castAtTarget(otherId);
      else tapPlayerForPK(otherId);
    } else if (hitMesh?.metadata?.monsterId && hitMesh !== enemy) {
      requestForestAttack(hitMesh.metadata.monsterId);
    } else if (hitMesh === enemy) {
      requestMonsterAttack();
    } else if(hitMesh?.metadata?.climbableWall) {
      const flying = mode === "live" ? ownServerCharacter()?.flying : demoFlying;
      if (flying && picked.pickedPoint) {
        pointMove(picked.pickedPoint.x, picked.pickedPoint.z);
      } else {
        requestClimb();
      }
    } else if(hitMesh?.metadata?.elevatedTop && picked.pickedPoint) {
      const me=ownServerCharacter();
      if ((mode === "live" ? me?.flying : demoFlying) ||
          (me && Math.abs(playerLayer(me)-activeFort.height)<.15)) {
        pointMove(picked.pickedPoint.x,picked.pickedPoint.z);
      } else {
        requestClimb();
      }
    } else if (boatAtHelm()) {
      steerSailingAt(px,py);
    } else if(hitMesh?.metadata?.walkable && picked.pickedPoint) {
      pointMove(picked.pickedPoint.x,picked.pickedPoint.z);
    }
  });
  ui.world.addEventListener("pointercancel",event => {
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchStart = null;
      if (touchPoints.size === 0) ignoreTapUntilTouchesLift = false;
    }
    if (pointer?.id === event.pointerId) pointer = null;
  });
  ui.world.addEventListener("wheel", e => {
    e.preventDefault();
    setCameraZoom(camera.radius + Math.sign(e.deltaY) * 2);
  }, {passive:false});

  // Direction is relative to the CURRENT camera, not fixed world north.
  // At the default north-facing heading, swiping up moves toward -Z.
  function dashDirectionFromSwipe(screenDx, screenDy) {
    const distance = Math.hypot(screenDx, screenDy);
    if (!Number.isFinite(distance) || distance < 1) return null;
    const right = screenDx / distance;
    const forward = -screenDy / distance;
    const alpha = camera.alpha;
    const x = -right * Math.sin(alpha) - forward * Math.cos(alpha);
    const z = right * Math.cos(alpha) - forward * Math.sin(alpha);
    const length = Math.hypot(x, z);
    return length > 0 ? { dx: x / length, dz: z / length } : null;
  }

  function requestSwipeDash(screenDx, screenDy) {
    const direction = dashDirectionFromSwipe(screenDx, screenDy);
    if (!direction) return;
    // Manual intent takes over even if the dash is unavailable or rejected.
    // Stop the outstanding waypoint before dash so a rejection cannot resume it.
    cancelQuestNavigation();
    if (mode === "live" && room) {
      // Fail visibly against an old VPS that doesn't know the dash message.
      if (room.state?.dashAvailable !== true) {
        toast("VPS ยังไม่รองรับพุ่ง · ต้องติดตั้ง MONTRA Server รุ่นใหม่");
        return;
      }
      try { room.send("dash", direction); }
      catch (error) { console.error("MONTRA dash send failed", error); toast("ส่งคำสั่งพุ่งไม่สำเร็จ"); }
      return;
    }
    if (mode !== "demo") return;
    if (demoFlying || demoFlightTarget) {
      toast("กำลังบินอยู่ · ลงจอดก่อนจึงพุ่งได้");
      return;
    }
    if (performance.now() < demoDashNextAt) {
      toast("รอคูลดาวน์พุ่ง · DEMO");
      return;
    }
    const me = getLocalAvatar();
    if (!me) return;
    demoDest = null;
    demoAutoAttack = false;
    marker.setEnabled(false);
    me.targetX = me.x;
    me.targetZ = me.z;
    me.dashUntil = performance.now() + 460;
    playAction(me, "dash");
    demoDash = { ...direction, remaining: DASH_DEMO_DISTANCE };
    demoDashNextAt = performance.now() + DASH_DEMO_COOLDOWN_MS;
    toast("พุ่ง! · DEMO");
  }

  // The invisible gesture area extends ABOVE the existing bottom skill row
  // via CSS --dash-swipe-reach. It is intentionally not a new button.
  // Short skill taps retain their normal click; a >=50px swipe fires one dash.
  // Canvas drag/pinch still rotates or zooms wherever this region does not cover.
  const dashZone = document.querySelector(".controls");
  let dashSwipe = null;
  let suppressMenuClick = false;
  if (dashZone) {
    dashZone.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target?.closest?.(".ghost-field-actions")) {
        dashSwipe = null;
        suppressMenuClick = false;
        return;
      }
      if (event.isPrimary === false) {
        dashSwipe = null;
        suppressMenuClick = true;
        return;
      }
      suppressMenuClick = false;
      dashSwipe = {
        id: event.pointerId,
        x: event.clientX, y: event.clientY,
        startedAt: performance.now(),
      };
    }, true);
    // Cancel an in-progress menu swipe if a second finger is added.
    window.addEventListener("pointerdown", event => {
      if (dashSwipe && dashSwipe.id !== event.pointerId) {
        dashSwipe = null;
        suppressMenuClick = true;
      }
    }, true);
    window.addEventListener("pointerup", event => {
      if (!dashSwipe || dashSwipe.id !== event.pointerId) return;
      const swipe = dashSwipe;
      dashSwipe = null;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      const length = Math.hypot(dx, dy);
      const elapsedMs = performance.now() - swipe.startedAt;
      if (length < 50 || elapsedMs > 850) return;
      suppressMenuClick = true;
      requestSwipeDash(dx, dy);
    }, true);
    window.addEventListener("pointercancel", event => {
      if (dashSwipe?.id === event.pointerId) dashSwipe = null;
    }, true);
    dashZone.addEventListener("click", event => {
      if (!suppressMenuClick) return;
      suppressMenuClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  let drawerActive = null;
  let drawerOpener = null;
