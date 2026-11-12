  // The village DEMO ghost: a corpse rig following the legacy tap target.
  function makeVillageGhostVisual() {
    const holder = makeGhostMonster({ level: 3, mapId: "ritual_village" }, "possessed-1");
    holder.isPickable = false; holder.metadata.monsterId = null;
    const g = holder.metadata.ghost; g.tall = 2; g.rig.position.y = -.88;
    return holder;
  }
  const villageGhost = makeVillageGhostVisual();
  enemy.visibility = .001; eyeA.setEnabled(false); eyeB.setEnabled(false);
  let player = ensureAvatar("demo",true,0,0);
  setAvatarWeapon(player,"ritual_dagger");
  const MONSTER_ID = "possessed-1";
  let monsterReady = false;
  let serverMonsterFacing = null;
  let demoMonsterHp = 100;
  let demoRespawnAt = 0;
  let demoLastHitAt = -Infinity;
  let demoAutoAttack = false;
  let hitFlashRemaining = 0;
  let lastMonsterHitSeq = 0;

  function resetDemoMonster() {
    demoMonsterHp = 100;
    demoRespawnAt = 0;
    demoLastHitAt = -Infinity;
    demoAutoAttack = false;
    hitFlashRemaining = 0;
    monsterReady = false;
    enemy.position.x = 1.1;
    enemy.position.z = 10.4;
    enemy.setEnabled(true);
    if (villageGhost?.metadata?.ghost) {
      const g = villageGhost.metadata.ghost;
      g.phase2 = false;
      g.enraged = false;
      g.shieldActive = false;
      g.shieldHp = 0;
      g.staggeredUntil = 0;
      if (g.minionOrbs) {
        g.minionOrbs.forEach(o => { try { o.mesh?.dispose(); } catch (_) {} });
        g.minionOrbs = null;
      }
    }
  }

  function syncMonsterState(state) {
    if (mode !== "live") return;
    if(activeMapId !== "ritual_village") {
      monsterReady=false; enemy.setEnabled(false); return;
    }
    const monster = villageMonsterState(state);
    if (!monster || !Number.isFinite(Number(monster.hp))) {
      monsterReady = false;
      enemy.setEnabled(false);
      return;
    }

    monsterReady = true;
    const maxHp = Math.max(1, Number(monster.maxHp) || 100);
    const hp = Math.max(0, Math.min(maxHp, Number(monster.hp)));
    const alive = hp > 0 && monster.alive !== false;
    const x = Number(monster.x), z = Number(monster.z);
    if (Number.isFinite(x)) enemy.position.x = x;
    if (Number.isFinite(z)) enemy.position.z = z;
    const newFacing = Number(monster.facing);
    serverMonsterFacing = Number.isFinite(newFacing) ? newFacing : null;
    enemy.setEnabled(alive);
    const seq = Number(monster.hitSeq);
    if (Number.isFinite(seq) && seq > lastMonsterHitSeq) hitFlashRemaining = .22;
    if (Number.isFinite(seq)) lastMonsterHitSeq = Math.max(lastMonsterHitSeq, seq);
  }

  function requestMonsterAttack() {
    triggerVoiceGuidance("target");
    setTargetedSkill(null);
    if(mode === "live" && activeMapId !== "ritual_village" && room?.state?.worldDefinition){
      const me=ownServerCharacter();let target=room.state.monsters?.get(selectedForestTarget);
      if(!target?.alive || target.mapId!==activeMapId || !fieldPointVisible(target)){
        target=null;
        room.state.monsters?.forEach(m=>{if(m.alive&&m.mapId===activeMapId&&me&&fieldPointVisible(m)&&(!target||Math.hypot(me.x-m.x,me.z-m.z)<Math.hypot(me.x-target.x,me.z-target.z)))target=m;});
      }
      if(target)requestForestAttack(target.id);else toast("ยังไม่มีเป้าหมายในพื้นที่");return;
    }
    selectedPkTargetId = null;
    syncPKHud();
    if (!fieldTargetVisible(MONSTER_ID)) { toast("เป้าหมายไม่อยู่ในระยะมองเห็น"); return; }
    if (mode === "live") {
      if (!room || !monsterReady) {
        toast("เซิร์ฟเวอร์ยังไม่เปิดระบบโจมตี · ติดตั้ง Combat บน VPS ก่อน");
        return;
      }
      if (!enemy.isEnabled()) { toast("มอนสเตอร์ตายแล้ว · รอเกิดใหม่"); return; }
      selectedForestTarget=MONSTER_ID;
      spellTargetId=MONSTER_ID;
      marker.setEnabled(false);
      try {
        room.send("attack", { targetId: MONSTER_ID });
        ui.monsterHint.textContent = "กำลังสั่งโจมตีผ่านเซิร์ฟเวอร์";
      } catch (err) {
        console.error("MONTRA attack request failed", err);
        toast("ส่งคำสั่งโจมตีไม่สำเร็จ");
      }
      return;
    }
    if (demoMonsterHp <= 0) { toast("ผีถูกปราบแล้ว · รอเกิดใหม่"); return; }
    selectedForestTarget=MONSTER_ID;
    marker.setEnabled(false);
    demoAutoAttack = true;
    toast("แตะผีเพื่อโจมตี · DEMO");
  }

  function updateStatus() {
    renderStatusChip();
    setModeBadge(mode === "live");
  }
  function showDemo() {
    cancelForgeAnimation(false,true);finishEconomyPending(true);closeForgePicker(false);closeItemDetailModal(false);
    if(typeof closeCraftRecipePopup==="function")closeCraftRecipePopup(false);
    clearCombatVfx();
    clearFishing(false);fishSavedItem=null;
    resetLootFeed();
    syncMountButton();
    territoryState=null;forestObjectiveState=null;forestDefenseState=null;forestEscortState=null;directorEventState=null;syncQuestRanger();syncWarQuartermaster();$("quest").classList.remove("war-hud");
    if (room) { try { room.leave(); } catch (e) { console.warn(e); } }
    room = null; mode = "demo"; localId = "demo"; activeCharacterSlot = null; sentinelChallengeUntil=0; sentinelCoreStanceUntil=0;seerBoundTarget="";seerPoisoned=false;
    resetGhostPotUi();
    possessed=false;occultBookState=null;occultRequestKey="";selectedOccultSkill="";occultCurseUntil=0;bladeBookState=null;bladeRequestKey="";selectedBladeSkill="";bladeCloakUntil=0;syncBladeUI(null);syncSentinelUI(null);syncOccultUI(null);syncPossessionButton();syncSwordTreeButton(null);syncSwordHotbar();setGrappleResponse(null);muayGrabTarget="";muayGrabUntil=0;muayFollowupSkill="";muayFollowupTarget="";muayFollowupUntil=0;muayDefenseUntil=0;syncMuayHotbar();$("muayBookButton").hidden=true;swordCombo=0; swordComboUntil=0; swordCounterUntil=0; swordStanceUntil=0; muayCounterUntil=0; muayComboCount=0; muayComboUntil=0; muayInterruptUntil=0; syncMuayComboStatus(null); syncSwordStatus(null);
    economyGold = null; economyListings = []; activeTrade = null; economyPending = false; resetCentralMarket();
    resetCombatFeatures();resetCraftQueue();resetAdvancedMarket();
    clearTimeout(economyTimer); tradeUnread = false; updateTradeBadge();
    partyState=null; partyInvitation=null; partyUnread=false;
    guildState=null; guildInvitation=null; guildUnread=false;guildDirectory=null;guildRecruitment={pending:null,applications:[]}; updatePartyBadge();
    resetCityProduction();
    clearChatHistory(true);
    switchWorld("ritual_village");
    if (typeof resetHomeClient === "function") resetHomeClient();
    syncWorldDefinition(null);syncForestMonsters(null);
    clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
    inventoryState = null; personalItems=Object.create(null);cardDrill=null;gearGuides=null;resources=null;clearResourceView();
    characterStatus = null; lastCharacterStatusRequest = 0;
    demoWeaponSlot = 1;
    itemUsePending = false;
    itemUseSequence += 1;
    selectedBagSlot = 0;
    demoPotionCount = 3;
    demoHp = 65;
    applyFortVisual(defaultFort);
    onlinePlayers.clear(); clearAvatars(); clearSummons();
    player = ensureAvatar("demo",true,0,0);
    setAvatarWeapon(player,"ritual_dagger");
    demoDest = null; demoDash = null; demoDashNextAt = 0;
    demoFlightTarget = null; demoFlying = false;
    resetDemoMonster();
    updateFlightButton();
    selectedPkTargetId = null;
    spellTargetId = null;
    pendingClimb = null;
    setTargetedSkill(null);
    ui.pkPanel.hidden = true;
    if (localHpBar) localHpBar.style.width = demoHp + "%";
    updateCharacterHud(null);
    updateStatus();
    renderParty(); renderBag();
  }
