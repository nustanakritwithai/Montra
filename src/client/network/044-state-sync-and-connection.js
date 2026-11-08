  function setOnlinePlayer(id, x, z, facing, hp, maxHp, y = 0, weaponId = "", pathId = "") {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    onlinePlayers.set(id,{x,z});
    const a = ensureAvatar(id,id === localId,x,z);
    a.targetX = x;
    a.targetY = Number.isFinite(y) ? y : 0;
    a.targetZ = z;
    setAvatarWeapon(a,weaponId,pathId);
    const side=territoryState?.teams?.[id];
    if(side && id!==localId && !a.warRing){
      const ally=side===territoryState.local?.side;
      const ring=B.MeshBuilder.CreateTorus("battle side",{diameter:2.1,thickness:.12,tessellation:ally?24:3},scene);
      ring.parent=a.node;ring.position.y=.09;ring.isPickable=false;ring.material=ally?warAllyMat:warEnemyMat;a.warRing=ring;
    }

    // S1 server facing is authoritative. Old servers omit this field;
    // fallback to the V0.1.5 movement-derived direction in that case.
    a.serverFacing = Number.isFinite(facing) ? facing : null;
    if (id === localId && localHpBar &&
        Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0) {
      localHpBar.style.width = Math.max(0, Math.min(100, 100 * hp / maxHp)) + "%";
    }
    updateStatus();
  }
  function removeOnlinePlayer(id) {
    onlinePlayers.delete(id);
    deleteAvatar(id);
    if (selectedPkTargetId === id) selectedPkTargetId = null;
    updateStatus();
  }
  function syncSummons(state) {
    if (mode !== "live") return;
    const synced = state?.summons;
    if (!synced || typeof synced.forEach !== "function") {
      clearSummons();
      return;
    }

    const present = new Set();
    synced.forEach((npc, ownerId) => {
      if (state.players?.get?.(ownerId)?.mapId && state.players.get(ownerId).mapId !== activeMapId) return;
      const x = Number(npc.x), z = Number(npc.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      present.add(ownerId);
      let actor = summonAvatars.get(ownerId);
      if (!actor) {
        actor = createSummonAvatar(ownerId, x, z);
        summonAvatars.set(ownerId, actor);
      }
      actor.targetX = x;
      actor.targetY = Number.isFinite(Number(npc.y)) ? Number(npc.y) : 0;
      actor.targetZ = z;
      actor.action = typeof npc.action === "string" ? npc.action : "follow";
      const yaw = Number(npc.facing);
      if (Number.isFinite(yaw)) actor.desiredFacing = yaw;
    });

    for (const id of [...summonAvatars.keys()]) {
      if (!present.has(id)) deleteSummonAvatar(id);
    }
    updateStatus();
  }

  function syncState(state) {
    const mine=state?.players?.get?.(localId);
    const previousMapId=activeMapId;
    syncWorldDefinition(state,mine?.mapId || "ritual_village");
    const spellMonster=monsterForSpell(spellTargetId);
    if(spellMonster && (!spellMonster.alive || spellMonster.hp<=0 || (spellMonster.mapId || "ritual_village")!==activeMapId || !ownServerCharacter()?.alive))spellTargetId=null;
    syncMonsterState(state);
    syncSummons(state);
    syncFortification(state);
    const players = state?.players;
    if (!players || typeof players.forEach !== "function") return false;
    const seen = new Set();
    players.forEach((p,id) => {
      if ((p.mapId || "ritual_village") !== activeMapId) return;
      seen.add(id);
      setOnlinePlayer(id, Number(p.x), Number(p.z),
        Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y),
        p.equippedWeaponId, p.pathId);
      noteAvatarState(avatars.get(id), p);
    });
    const localActor=avatars.get(localId);
    const farArrival=activeMapId==="tri_wiang_castle" && mine && localActor && (Math.hypot(localActor.x-mine.x,localActor.z-mine.z)>90 || Math.hypot(camera.target.x-mine.x,camera.target.z-mine.z)>90);
    if((previousMapId !== activeMapId || farArrival) && mine) {
      const actor=avatars.get(localId);
      if(actor) {
        actor.x=actor.targetX=Number(mine.x);actor.y=actor.targetY=Number(mine.y);actor.z=actor.targetZ=Number(mine.z);
        actor.node.position.set(actor.x,actor.y,actor.z);
        camera.target.set(actor.x,actor.y+.65,actor.z+1.5);
      }
    }
    for (const id of onlinePlayers.keys()) if (!seen.has(id)) removeOnlinePlayer(id);
    updateCharacterHud(players.get(localId));
    syncPKHud();
    syncForestMonsters(state);
    syncClimbButton();
    updateFlightButton();
    syncMountButton();
    syncPossessionButton();
    syncOccultUI(mine); syncBladeUI(mine); syncSentinelUI(mine);
    syncSwordTreeButton(mine);
    syncSwordHotbar();
    syncMuayHotbar();
    syncMuayComboStatus(mine);
    $("muayBookButton").hidden=!(mode==="live" && mine?.pathId==="muay_boran" && state.muayBookCatalog);
    syncSwordStatus(mine);
    if (drawerActive === "swordTree") renderSwordTree();
    if (drawerActive === "muayBook") renderMuayBook();
    if (["bag","character","forge","crafting"].includes(drawerActive)) renderBag(); // Keep item availability, level and life state live.
    if (drawerActive === "character") renderProgressionProfile();
    if (drawerActive === "party") renderParty();
    if (drawerActive === "guild") renderGuild();
    return true;
  }
  function clearSyncPoll() { if (sessionState.syncPoll) clearInterval(sessionState.syncPoll); sessionState.syncPoll = null; }
  function stopOnline(reason) {
    closeForgePicker(false);
    clearSyncPoll();
    if (mode === "live") { showDemo(); window.MontraEntry?.open(); window.MontraEntry?.failure(reason || "การเชื่อมต่อสิ้นสุด กรุณาเข้าเกมอีกครั้ง"); }
  }
  const connectionLifecycle = MONTRA_CLIENT_MODULES.createConnectionLifecycle(() => room);
  let refreshCharacterSlotCards = null;
  async function connectOnline(endpoint, requestedSlot = getPreferredSlot(endpoint), transfer=null, characterSetup=null) {
    if (connectionLifecycle.isPending()) return;
    if (![1,2,3].includes(requestedSlot)) {
      toast("เลือกช่องเซฟ 1, 2 หรือ 3 เท่านั้น");
      return;
    }
    if (!transfer && room && mode === "live" && sessionState.activeCharacterSlot === requestedSlot &&
        currentCharacterEndpoint() === endpoint) {
      closeDrawer();
      window.MontraEntry?.success();
      toast("กำลังเล่นช่องเซฟ " + requestedSlot + " อยู่แล้ว");
      return;
    }
    if (!window.Colyseus?.Client) { toast("ไม่พบ Colyseus SDK — ตรวจการโหลดสคริปต์"); return; }
    if (!MONTRA_CLIENT_MODULES.allowedEndpoint(endpoint, location)) {
      toast("โปรดใช้ HTTPS ของ VPS (การทดสอบ Localhost ใช้ HTTP ได้เฉพาะในเครื่อง)");
      return;
    }
    if (!connectionLifecycle.begin()) return;
    ui.onlineCount.textContent = "กำลังเชื่อมต่อเซิร์ฟเวอร์...";
    const connectButton = $("connectOnline");
    if (connectButton) connectButton.disabled = true;
    let joined = null;
    try {
      // Switching slots must finish saving and release the old account lease.
      if (room && mode === "live") {
        const old = room;
        room = null;
        clearSyncPoll();
        showDemo();
        try { await old.leave(); } catch (error) { console.warn("MONTRA old room leave", error); }
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      const client = new window.Colyseus.Client(endpoint);
      const accountSession = window.MontraEntry?.session();
      if (!accountSession) throw new Error("กรุณาเข้าสู่ระบบก่อน");
      const opts=MONTRA_CLIENT_MODULES.buildJoinOptions(accountSession,requestedSlot,characterSetup);
      const admission=await MONTRA_CLIENT_MODULES.joinWorld(client,opts,transfer,error=>console.warn("MONTRA battlefield admission",error));
      joined=admission.joined;const transferFailed=admission.transferFailed;
      // The server sends guild and territory status as soon as we join, before
      // the slot check below finishes; keep those first messages and replay
      // them once their handlers exist, or the panels stay empty until a change.
      const earlyMessages=MONTRA_CLIENT_MODULES.createEarlyMessageBuffer(joined);
      await MONTRA_CLIENT_MODULES.verifyJoinedSlot(joined, requestedSlot);
      cancelForgeAnimation(false,true);finishEconomyPending(true);
      room = joined;
      clearChatHistory(true);
      economyGold=null; economyListings=[]; activeTrade=null; economyPending=false; resetCentralMarket(); tradeUnread=false; updateTradeBadge();
      partyState=null; partyInvitation=null; partyUnread=false;
    guildState=null; guildInvitation=null; guildUnread=false;guildDirectory=null;guildRecruitment={pending:null,applications:[]}; updatePartyBadge();
      inventoryState = null; personalItems=Object.create(null);cardDrill=null;gearGuides=null;resources=null;seerBoundTarget="";seerPoisoned=false;clearResourceView();
      characterStatus = null; lastCharacterStatusRequest = 0;
      forestObjectiveState=null;forestDefenseState=null;forestEscortState=null;directorEventState=null;
      itemUsePending = false;
      itemUseSequence += 1;
      selectedBagSlot = 0;
      mode = "live"; localId = joined.sessionId; sessionState.activeCharacterSlot = requestedSlot;
      clearFishing(false);fishSavedItem=null;
      clearAvatars(); clearSummons(); demoDest = null;
      pendingClimb = null;
      spellTargetId = null;
      setTargetedSkill(null);
      onlinePlayers.clear(); enemy.setEnabled(false);
      selectedPkTargetId = null;
      monsterReady = false; demoAutoAttack = false; lastMonsterHitSeq = 0;
      ui.monsterStatus.hidden = true;
      syncFortification(joined.state);
      if (summonAvatars.get(localId)?.demo) deleteSummonAvatar(localId);
      possessed = false;
      updateStatus();
      const ok = syncState(joined.state);
      console.info("MONTRA room joined", {roomId:joined.roomId, sessionId:joined.sessionId, initialStateReady:ok});
      joined.onStateChange(connectionLifecycle.guard(joined, state => syncState(state)));
      joined.onMessage("chat_message", MONTRA_CLIENT_MODULES.createChatMessageHandler({
        joined, getRoom:()=>room, getLocalId:()=>localId, getMapId:()=>activeMapId,
        state:chatState, pushChatFeed, getPending:()=>chatPending, getBox:()=>chatBox,
        getTab:()=>chatBoxTab, finishPending:finishChatPending, updateBadge:updateChatBadge
      }));
      const onTerritoryState=message=>{
        if(room!==joined)return;
        const oldDrums=territoryState?.local?.supply?.drums || [],previousOwners=territoryState?.owners;
        territoryState=message;territoryReceivedAt=performance.now();syncGateVisual();syncCastleRings();syncWarQuartermaster();
        checkTerritoryWarEvents(message.local);
        if(drawerActive==="guild" && previousOwners && guildReady() &&
           Object.keys(message.owners||{}).some(site=>previousOwners[site]!==message.owners[site]))joined.send("get_guild",{});
        const alerts=message.local?.supply?.drums?.filter(id=>!oldDrums.includes(id)) || [];
        if(alerts.length)SFX("drum",{important:true});
        if(alerts.length)toast("เสียงกลอง · กำลังชิง "+alerts.map(id=>message.local.pilot.points.find(p=>p.id===id)?.name || id).join(" · "));
        if(drawerActive==="war")renderWarPanel();
        if(drawerActive==="strategy"){updateAtlasOwner();updateAtlasWarTimes();}
        if(drawerActive==="guild")renderGuild();
        const local=message.local;
        if(local?.site===activeMapId){
          const title=ui.quest.querySelector("strong");
          const fighting=local.inField && local.phase==="battle";
          ui.quest.classList.toggle("war-hud",fighting);
          title.textContent=fighting?"⚑ "+(local.progress<0?"รับ":"บุก")+" "+Math.abs(local.progress)+"/"+local.goal+" · "+Math.floor(local.seconds/60)+":"+String(local.seconds%60).padStart(2,"0"):
            local.phase==="battle"?"⚑ ศึกยึดธง · "+warTime(local.seconds):"⚑ ด่านกิลด์ · "+warPhase(local.phase);
          if(fighting && local.pilot){
            const v=local.pilot,me=ownServerCharacter();
            const node=me?.alive && Math.abs(playerLayer(me))<.1 && worldDefinitions?.[activeMapId]?.strategic?.objectives?.find(p=>Math.hypot(p.x-me.x,p.z-me.z)<=7);
            const point=node && v.points.find(p=>p.id===node.id);
            const throne=node?.id===7 && v.throne && local.seconds<=900;
            const pct=point?Math.abs(point.progress):throne?Math.floor(v.throne.progress[local.side]/1200):0;
            const at=point || throne?" · ⚑"+node.id+" "+(point?.owner===local.side && !point.progress?"คุม":pct+"%"):"";
            title.textContent="บุก "+v.score.attack+" · รับ "+v.score.defend+" · "+Math.floor(local.seconds/60)+":"+String(local.seconds%60).padStart(2,"0")+at;
            ui.quest.style.setProperty("--war-progress",pct/100);
          }else if(fighting)ui.quest.style.setProperty("--war-progress",Math.abs(local.progress)/local.goal);
        }
      };
      joined.onMessage("territory_state",onTerritoryState);
      earlyMessages.setHandler("territory_state",onTerritoryState);
      joined.onMessage("territory_error",message=>{
        if(room!==joined)return;
        toast(activeMapId==="sam_lan_estuary" && message?.reason==="war_flag"?"เดินเข้าค่ายใต้ A เพื่อเปิดศึก":warErrors[message?.reason] || "ทำรายการที่ด่านไม่ได้ในขณะนี้");
      });
      joined.onMessage("territory_governed",message=>{
        if(room!==joined || !Number.isFinite(message?.delta))return;
        toast(message.action==="collect"?"เก็บรายได้เข้าคลังกิลด์ "+message.delta+" หน่วย":
          (message.action==="repair"?"ซ่อมคลังเสบียงแล้ว":String(message.action).startsWith("focus_")?"เปลี่ยนนโยบายเมืองแล้ว":"พัฒนาอาคารแล้ว")+" · ใช้ "+Math.abs(message.delta)+" หน่วย");
      });
      joined.onMessage("war_supply_notice",message=>{
        if(room!==joined)return;
        toast(message?.action==="pickup"?"รับเสบียงแล้ว · นำไปส่งที่จุดยุทธศาสตร์":message?.action==="delivered"?"ส่งเสบียงสำเร็จ · นับผลงานสงครามแล้ว":message?.action==="lost"?"เสบียงตกเมื่อพ่ายแพ้":"ศึกจบแล้ว เสบียงที่ยังถือถูกส่งคืน");
      });
      joined.onMessage("territory_transfer",message=>{
        if(room===joined && typeof message?.roomId==="string" && typeof message.ticket==="string")void connectOnline(endpoint,requestedSlot,message);
      });
      joined.onMessage("chat_report_result", result => {
        if(room!==joined || chatPending?.channel!=="bug") return;
        if(result?.ok === true) {
          chatHistory.bug.push({name:"ระบบ",text:"รับรายงานบัคแล้ว · ขอบคุณที่แจ้ง",own:false});pushChatFeed("bug","ระบบ","รับรายงานบัคแล้ว · ขอบคุณที่แจ้ง",false);
          if(chatDraft.bug.normalize("NFC").trim()===chatPending.text){chatDraft.bug="";if(chatBoxTab==="bug" && chatBox?.input.value.normalize("NFC").trim()===chatPending.text)chatBox.input.value="";}
          toast("ส่งรายงานบัคแล้ว");
        } else toast("บันทึกรายงานไม่สำเร็จ · ลองอีกครั้ง");
        finishChatPending();
      });
      const onGuildState=message => {
        if(room!==joined)return;
        const wasGuildMember=!!guildState;
        if(message===null)guildState=null;
        else if(typeof message?.id==="string" && typeof message.name==="string" &&
          typeof message.ownId==="string" && typeof message.leaderId==="string" &&
          Array.isArray(message.members) && message.members.length<=30)
          guildState={id:message.id,name:message.name,ownId:message.ownId,leaderId:message.leaderId,
            treasury:Number.isFinite(message.treasury)?message.treasury:0,
            members:message.members.filter(m=>m && typeof m.id==="string" && typeof m.name==="string")};
        else return;
        if(guildState){guildInvitation=null;guildUnread=false;updatePartyBadge();}
        else if(wasGuildMember && drawerActive==="guild" && guildReady()){
          guildDirectory=null;room.send("guild_search",{query:""});
        }
        renderGuild();
      };
      joined.onMessage("guild_state",onGuildState);
      earlyMessages.setHandler("guild_state",onGuildState);
      const onGuildRecruitment=message=>{
        if(room!==joined || !Array.isArray(message?.applications))return;
        const previousApplications=guildRecruitment.applications.length;
        guildRecruitment={pending:message.pending && typeof message.pending.id==="string" && typeof message.pending.name==="string"?message.pending:null,
          applications:message.applications.filter(a=>a && typeof a.id==="string" && typeof a.name==="string").slice(0,50)};
        if(guildRecruitment.applications.length>previousApplications && drawerActive!=="guild"){guildUnread=true;updatePartyBadge();}
        renderGuild();
      };
      joined.onMessage("guild_recruitment",onGuildRecruitment);earlyMessages.setHandler("guild_recruitment",onGuildRecruitment);
      joined.onMessage("guild_directory",message=>{
        if(room!==joined || !Array.isArray(message?.guilds))return;
        guildDirectory=message.guilds.filter(g=>g && typeof g.id==="string" && typeof g.name==="string").slice(0,50);renderGuild();
      });
      earlyMessages.replay();
      joined.onMessage("guild_invitation", message=>{
        if(room!==joined || typeof message?.inviteId!=="string" || typeof message.guildName!=="string" || typeof message.fromName!=="string")return;
        guildInvitation=message;guildUnread=drawerActive!=="guild";updatePartyBadge();
        if(guildUnread)toast("มีคำเชิญเข้ากิลด์ · เปิดเมนูปาร์ตี้");
        renderGuild();
      });
      joined.onMessage("guild_invitation_closed",()=>{
        if(room!==joined)return;guildInvitation=null;guildUnread=false;updatePartyBadge();renderGuild();
      });
      joined.onMessage("guild_notice", message=>{
        if(room!==joined)return;toast(({invitation_declined:"ผู้เล่นปฏิเสธคำเชิญกิลด์",invitation_sent:"ส่งคำเชิญกิลด์แล้ว",application_sent:"ส่งคำขอสมัครกิลด์แล้ว",application_cancelled:"ยกเลิกคำขอสมัครแล้ว",application_decided:"จัดการคำขอสมัครแล้ว"})[message?.reason]||"ดำเนินการกิลด์แล้ว");
      });
      joined.onMessage("guild_error", message=>{
        if(room!==joined)return;
        const reasons={guild_already_member:"ตัวละครนี้อยู่ในกิลด์แล้ว",guild_name_taken:"ชื่อกิลด์นี้ถูกใช้แล้ว",
          guild_leader_only:"เฉพาะหัวหน้ากิลด์ที่ทำรายการนี้ได้",guild_full:"กิลด์มีสมาชิกครบ 30 คนแล้ว",
          guild_not_member:"ยังไม่ได้อยู่ในกิลด์",guild_transfer_first:"ส่งต่อหัวหน้ากิลด์ก่อนออก",
          guild_officer_required:"ต้องเป็นผู้บัญชาการหรือนายทหารที่มีสิทธิ์",guild_invalid_assignment:"ตำแหน่งหรือข้อมูลไม่ถูกต้อง",
          guild_squad_required:"ต้องเลือกหน่วยก่อนแต่งตั้งหัวหน้าหน่วย",guild_squad_full:"หน่วยนี้มีสมาชิกครบ 5 คนแล้ว",
          guild_squad_leader_exists:"หน่วยนี้มีหัวหน้าอยู่แล้ว",guild_invalid_member:"ไม่พบสมาชิก",guild_invite_expired:"คำเชิญหมดอายุ",guild_invalid_target:"ไม่พบผู้เล่นที่ชวนได้",
          guild_not_found:"ไม่พบกิลด์นี้แล้ว",guild_application_exists:"คุณมีคำขอสมัครอยู่แล้ว ยกเลิกก่อนสมัครกิลด์อื่น",guild_applications_full:"คำขอสมัครของกิลด์นี้เต็มแล้ว",guild_application_missing:"คำขอนี้ไม่มีแล้ว"};
        if(message?.reason==="guild_invite_expired"){guildInvitation=null;guildUnread=false;updatePartyBadge();}
        toast(reasons[message?.reason]||"ทำรายการกิลด์ไม่สำเร็จ");guildRenderKey="";renderGuild();
      });
      joined.onMessage("party_state", MONTRA_CLIENT_MODULES.createPartyStateHandler({
        joined, getRoom:()=>room, setParty:value=>{partyState=value;},
        clearInvitation:()=>{partyInvitation=null;partyUnread=false;},
        updateBadge:updatePartyBadge, render:renderParty
      }));
      joined.onMessage("party_invitation", message => {
        if (room!==joined || typeof message?.inviteId!=="string" || typeof message?.fromName!=="string") return;
        partyInvitation=message; partyUnread=drawerActive!=="party"; updatePartyBadge();
        if (partyUnread) toast("มีคำเชิญเข้าปาร์ตี้ · เปิดเมนูปาร์ตี้");
        renderParty();
      });
      joined.onMessage("party_invitation_closed",()=>{ if(room!==joined)return;partyInvitation=null;partyUnread=false;updatePartyBadge();renderParty(); });
      joined.onMessage("party_notice",message=>{ if(room!==joined)return;toast(message?.reason==="invitation_declined" ? "ผู้เล่นปฏิเสธคำเชิญ" : "ส่งคำเชิญปาร์ตี้แล้ว"); });
      joined.onMessage("party_error",message=>{
        if(room!==joined)return;
        const reasons={party_invalid_target:"ไม่พบผู้เล่นที่ชวนได้",party_leader_only:"เฉพาะหัวหน้าปาร์ตี้ที่ชวนได้",party_full:"ปาร์ตี้เต็มแล้ว",party_target_joined:"ผู้เล่นอยู่ในปาร์ตี้แล้ว",party_invite_expired:"คำเชิญหมดอายุหรือถูกยกเลิก"};
        if(message?.reason==="party_invite_expired") partyInvitation=null;
        toast(reasons[message?.reason] || "ทำรายการปาร์ตี้ไม่สำเร็จ");renderParty();
      });
      joined.onMessage("economy_state", message => {
        if (room !== joined || !Number.isSafeInteger(message?.gold) || message.gold < 0) return;
        economyGold=message.gold; renderEconomy(); renderBag();
      });
      joined.onMessage("market_state", message => {
        if (room !== joined || centralMarketVersion || !Array.isArray(message?.listings)) return;
        economyListings=message.listings.filter(x => x && typeof x.id==="string" && /^[a-f0-9-]{36}$/.test(x.id) && typeof x.seller==="string" && /^[a-f0-9]{12}$/.test(x.seller) && x.item && (x.item.itemId===POTION_ITEM_ID || x.item.itemId===SHRINE_SHARD || bagMeta(x.item.itemId)) && Number.isSafeInteger(x.item.quantity) && x.item.quantity>0 && x.item.quantity<=99 && Number.isSafeInteger(x.price) && x.price>0 && x.price<=1_000_000_000).slice(0,120);
        renderEconomy();
      });
      joined.onMessage("market_features",message=>{
        if(room!==joined || message?.version!==1)return;
        const first=!centralMarketVersion;centralMarketVersion=1;
        if(first && drawerActive==="economy"){requestMarketOverview();requestMarketPage(true);}
        renderEconomy();
      });
      joined.onMessage("market_overview",message=>{
        if(room!==joined || !Array.isArray(message?.auctions) || !message?.supply || !Array.isArray(message.supply.items))return;
        centralMine=message.auctions.slice(0,100);centralSupply=message.supply;
        centralCredit=Number.isSafeInteger(message.credit)&&message.credit>0?message.credit:0;renderEconomy();
      });
      joined.onMessage("market_page",message=>{
        if(room!==joined || !marketPageRequest || message?.tag!==marketPageRequest.tag || message.market!==marketPageRequest.market)return;
        const rows=message.market==="fixed"?message.listings:message.auctions;
        if(!Array.isArray(rows))return;
        const valid=rows.filter(x=>x && typeof x.id==="string" && /^[a-f0-9-]{36}$/.test(x.id) && typeof x.seller==="string" && /^[a-f0-9]{12}$/.test(x.seller) && x.item && typeof x.item.itemId==="string" && Number.isSafeInteger(x.item.quantity) && x.item.quantity>0 && x.item.quantity<=99 &&
          (message.market==="fixed"?Number.isSafeInteger(x.price) && x.price>0 && x.price<=1_000_000_000:Number.isSafeInteger(x.opening) && x.opening>0 && x.opening<=1_000_000_000 && Number.isSafeInteger(x.bid) && x.bid>=0 && x.bid<=1_000_000_000 && Number.isSafeInteger(x.endsAt))).slice(0,30);
        if(message.market==="fixed")economyListings=marketPageRequest.append?economyListings.concat(valid):valid;
        else centralAuctions=marketPageRequest.append?centralAuctions.concat(valid):valid;
        marketNextCursor=Number.isSafeInteger(message.nextCursor) && message.nextCursor>0?message.nextCursor:null;clearTimeout(marketPageTimer);marketPageRequest=null;marketPageError="";renderEconomy();
      });
      joined.onMessage("craft_result", result => {
        if (room !== joined) return;
        finishEconomyPending();
        const item=bagMeta(result.itemId);
        craftResultRoom=joined;
        craftResultMessage=result.banked?"เก็บ"+(item?.name||"ของซ้ำ")+" เข้าคลังช่าง 1 ชิ้น":item?.station==="kiln"?benchAction(item)+"สำเร็จ · ได้ "+item.name+" × 1":"คราฟต์"+(item?.name || "ไอเทม")+"สำเร็จ · ใช้ "+result.spentGold+" ทอง";
        toast(craftResultMessage);
        renderBag();
      });
      joined.onMessage("card_socket_result", result => {
        if(room!==joined)return;
        finishEconomyPending();
        toast(result.action==="drill"?"เจาะรูสำเร็จ":result.action==="insert"?"ใส่"+(personalItems[result.socket]?.name||"การ์ด")+"แล้ว":"คืนการ์ดเข้ากระเป๋าแล้ว");
        renderBag();
      });
      joined.onMessage("forge_copy_claimed", result => {
        if(room!==joined)return;
        finishEconomyPending();
        const slot=inventoryState?.slots.findIndex(s=>s?.forge?.instanceId===result.instanceId)??-1;
        if(drawerActive==="bag" && slot>=0){inspectingGear=null;selectedBagSlot=slot;confirmBindKey=null;}
        if(drawerActive==="forge" && slot>=0 && !forgeAnimationBusy()){cancelForgeAnimation(false);forgePresentationResult=null;selectForgeTarget(slot);}
        toast("เบิก "+(bagMeta(result.gear)?.name||"อุปกรณ์")+" +0 แล้ว · เหลือในคลังช่าง "+result.remaining+" ชิ้น");
        renderBag();
      });
      joined.onMessage("forge_result", result => {
        receiveForgeResult(result,joined);
      });
      joined.onMessage("market_result", message => {
        if (room !== joined) return;
        finishEconomyPending(); toast(message?.action === "buy" ? "ซื้อสำเร็จ · ของเข้ากระเป๋าแล้ว" : message?.action === "cancel" ? "ยกเลิกฝากขายแล้ว" : "ฝากขายสำเร็จ");
        if(centralMarketVersion)requestMarketPage(true);else try { joined.send("market_list",{}); } catch (_) {} renderEconomy();
      });
      joined.onMessage("market_action_result",message=>{
        if(room!==joined)return;finishEconomyPending();
        const notices={auction_create:"เปิดประมูลแล้ว",auction_bid:"เสนอราคาแล้ว · เงินถูกกันไว้",auction_claim:"รับของจากประมูลแล้ว",auction_cancel:"ยกเลิกประมูลแล้ว",auction_credit:"รับเงินที่รอคืนแล้ว",starter_supply_buy:"ซื้อสินค้าสำรองแล้ว"};
        toast(notices[message?.action]||"ทำรายการตลาดสำเร็จ");requestMarketOverview();requestMarketPage(true);renderEconomy();
      });
      let resourcePage=null;
      joined.onMessage("world_resource_page",p=>{
        if(room!==joined || !Array.isArray(p?.nodes))return;
        if(p.start===0)resourcePage={mapId:p.mapId,nodes:[]};
        if(resourcePage?.mapId===p.mapId && resourcePage.nodes.length===p.start)resourcePage.nodes.push(...p.nodes);
      });
      joined.onMessage("world_resources",data=>{
        if(room!==joined)return;
        const nodes=data.nodes??(resourcePage?.mapId===data.mapId && resourcePage.nodes.length===data.nodeCount?resourcePage.nodes:null);
        resourcePage=null;if(!Array.isArray(nodes))return;
        resources={...data,nodes,received:performance.now()};renderResourceNodes();updateResourceHud(ownServerCharacter());
      });
      joined.onMessage("world_resource_delta",d=>{
        if(room!==joined || resources?.mapId!==d?.mapId || !Array.isArray(d.nodes))return;
        const changes=new Map(d.nodes.map(n=>[n.id,n])),now=performance.now();
        for(const n of resources.nodes){
          const changed=changes.get(n.id);if(changed){n.stock=changed.stock;n.readyAt=now+changed.nextIn;}
        }
        resources.available=d.available;renderResourceNodes();updateResourceHud(ownServerCharacter());
      });
      joined.onMessage("resource_result",data=>{
        if(room!==joined)return;
        finishEconomyPending();toast((data.action==="refine"?"แปรรูปได้ ":"เก็บได้ ")+(personalItems[data.item]?.name||data.item)+" × "+data.quantity);renderBag();
      });
      joined.onMessage("fish_state",data=>{
        if(room!==joined || (!fishingPending && !fishingState) || typeof data?.id!=="string" ||
          ![data.x,data.z,data.wait,data.elapsed,data.duration,data.distance,data.initialDistance,data.strength,data.line].every(Number.isFinite) || data.initialDistance<=0)return;
        const me=ownServerCharacter();if(!me)return;
        // Show the position the server should see when the next tap arrives.
        const received=performance.now(),advance=fishingPending?Math.min(800,Math.max(0,received-(fishingPendingUntil-8000))):0;
        fishingPending=false;fishingSelect=false;
        fishingState={...data,wait:Math.max(0,data.wait-advance),elapsed:data.elapsed+Math.max(0,advance-data.wait),
          distance:Math.min(18,data.distance+Math.max(0,advance-data.wait)/1000*(.12+.35*data.strength/100)),
          mapId:activeMapId,originX:fishingState?.originX??me.x,originZ:fishingState?.originZ??me.z,received};
        $("fishingPanel").hidden=false;
        const feedback={perfect:"ยอดเยี่ยม! ปลาขยับเข้ามา",good:"ดึงสำเร็จ ปลาขยับเข้ามา",miss:"พลาด! ปลาหนี เอ็นเสียหาย"};
        $("fishMessage").textContent=feedback[data.result]||"กดเมื่อเข็มอยู่ในแถบสีทอง";
        showFishingFloat(fishingState,me);updateFishing(performance.now());
      });
      joined.onMessage("fish_pending",data=>{
        if(room!==joined)return;
        fishSavedItem=typeof data?.item==="string"?data.item:null;
      });
      joined.onMessage("fish_result",data=>{
        if(room!==joined)return;
        if(data?.result==="cancelled")return;
        clearFishing(false);
        if(data?.result==="caught" && data.pending){fishSavedItem=data.item;toast("จับปลาได้แล้ว แต่กระเป๋าเต็ม · เคลียร์ช่องแล้วกดรับปลา");}
        else if(data?.result==="caught" || data?.result==="claimed"){fishSavedItem=null;toast("ตกได้ "+(personalItems[data.item]?.name||"ปลา")+" × "+(data.quantity||1));renderBag();}
        else if(data?.result==="broken")toast("สายเอ็นขาด ปลาหลุดไปแล้ว");
        else if(data?.result==="escaped")toast("ปลาหนีไปแล้ว");
        else if(data?.result==="interrupted")toast("การตกปลาถูกขัดจังหวะ");
      });
      joined.onMessage("resource_atlas",zones=>{
        const panel=$("resourceAtlasRows");
        if(room!==joined || !panel || !Array.isArray(zones))return;
        panel.replaceChildren();
        for(const zone of zones){
          const line=document.createElement("p");
          line.textContent=zone.name+" · ชั้นสูงสุด "+zone.tier+" · ไม้ "+zone.wood+" · หิน "+zone.stone+" · สมุนไพร "+zone.herb+" · "+
            (zone.available*4<=zone.capacity?"เก็บหนัก":zone.available*2<=zone.capacity?"กำลังฟื้น":"อุดมสมบูรณ์");
          panel.append(line);
        }
      });
      joined.onMessage("economy_error", message => {
        if (room !== joined) return;
        if(economyPendingRequest?.command==="forge_weapon")failForgeAnimation("คำขอถูกปฏิเสธ · ตรวจอุปกรณ์และค่าใช้จ่ายอีกครั้ง");
        finishEconomyPending(true);
        const reasons={forge_downgrade_unconfirmed:"กรุณารีเฟรชแล้วตรวจโอกาสลดขั้นก่อนยืนยัน",forge_stock_changed:"ยอดของสำรองเปลี่ยนแล้ว · ตรวจคลังช่างอีกครั้ง",forge_risk_unconfirmed:"กรุณายืนยันความเสี่ยงที่อุปกรณ์จะแตก",forge_remove_card:"ถอดการ์ดก่อนตีขั้นที่อุปกรณ์อาจแตก",forge_missing_copy:"ของรุ่นเดียวกันไม่พอ · ดูคลังช่าง",forge_donor_changed:"ชิ้นที่เลือกเปลี่ยนไป กรุณาเลือกใหม่",forge_stock_full:"คลังช่างเก็บของรุ่นนี้ครบแล้ว",accessory_limit:"มีเครื่องประดับแบบนี้ครบ 2 ชิ้นแล้ว",item_bound:"ของชิ้นนี้ผูกกับตัวละครแล้ว",craft_missing_material:"วัตถุดิบไม่ครบ",craft_missing_shard:"ต้องมีเศษตราผู้พิทักษ์ก่อนคราฟต์",forge_max_rank:"ถึงขั้นสูงสุดแล้ว",forge_item_changed:"อาวุธเปลี่ยนไป · เลือกชิ้นที่จะตีบวกอีกครั้ง",insufficient_gold:"เงินไม่พอ",inventory_full:"กระเป๋าเต็ม",duplicate_weapon:"มีอาวุธชนิดนี้อยู่แล้ว",item_equipped:"ถอดอาวุธก่อนทำรายการ",item_unavailable:"ไม่มีไอเท็มตามจำนวน",listing_unavailable:"รายการนี้ขายหรือยกเลิกแล้ว",listing_limit:"ฝากขายได้สูงสุด 20 รายการ",cannot_buy_own_listing:"ซื้อสินค้าของตัวเองไม่ได้",invalid_trade:"ข้อเสนอเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง",invalid_gold:"จำนวนเงินไม่ถูกต้อง",request_id_conflict:"คำขอซ้ำไม่ตรงรายการเดิม"};
        const socketErrors={item_level_required:"เลเวลยังไม่ถึงที่อุปกรณ์กำหนด",card_gear_level:"การ์ดนี้ต้องใช้อุปกรณ์เลเวลสูงกว่านี้",socket_changed:"อุปกรณ์หรือรูการ์ดเปลี่ยนไปแล้ว",card_unavailable:"ไม่มีการ์ดที่เลือกในกระเป๋า",drill_missing_metal:"แร่เหล็กไม่พอสำหรับเจาะรู"};
        reasons.salvage_changed="อุปกรณ์เปลี่ยนไปแล้ว โปรดเลือกชิ้นที่จะแยกอีกครั้ง";
        const gatherErrors={resource_range:"ขยับเข้าใกล้ต้นไม้หรือหินบนแผนที่นี้",resource_ground:"ลงจากม้าหรือลงสู่พื้นก่อนเก็บวัตถุดิบ",resource_empty:"จุดนี้กำลังฟื้นตัว",resource_cooldown:"รอสักครู่ก่อนเก็บครั้งถัดไป",starter_supply_limit:"สินค้าสำรองถึงจำนวนจำกัดวันนี้แล้ว",auction_limit:"เปิดประมูลได้ไม่เกิน 20 รายการ",auction_bid_limit:"มีรายการเสนอราคาค้างสูงสุด 20 รายการ",auction_unavailable:"ประมูลจบแล้วหรือรายการไม่พร้อมใช้งาน",cannot_bid_own_auction:"เสนอราคาประมูลของตัวเองไม่ได้",auction_bid_too_low:"ราคาต้องสูงกว่าราคาล่าสุด",auction_claim_unavailable:"ยังรับรายการนี้ไม่ได้",auction_cancel_unavailable:"ยกเลิกไม่ได้เมื่อมีผู้เสนอราคาแล้ว",auction_credit_unavailable:"ยังไม่มีเงินรอรับหรือเงินในตัวเต็ม",
          fish_water:"แตะจุดในน้ำเพื่อเหวี่ยงเบ็ด",fish_ground:"ลงจากม้าและยืนบนพื้นก่อนตกปลา",fish_range:"เข้าใกล้น้ำในระยะ 9 เมตร",fish_blocked:"มีสิ่งกีดขวางระหว่างคุณกับน้ำ",fish_interrupted:"การตกปลาถูกขัดจังหวะ",fish_expired:"รอบตกปลาหมดแล้ว",fish_pending:"รับปลาที่จับไว้ก่อนเริ่มตกใหม่",fish_no_pending:"ไม่มีปลารอรับ"};
        if(fishingPending){fishingPending=false;if(message?.reason!=="inventory_full")clearFishing(false);}
        toast(gatherErrors[message?.reason] || socketErrors[message?.reason] || reasons[message?.reason] || "ทำรายการไม่สำเร็จ · ลองตรวจข้อมูลอีกครั้ง"); renderEconomy();renderBag();
      });
      joined.onMessage("trade_update", message => {
        if (room !== joined || typeof message?.tradeId !== "string") return;
        const wasNew=!activeTrade || activeTrade.tradeId!==message.tradeId;
        activeTrade=message;
        if (wasNew && drawerActive!=="economy") { tradeUnread=true; updateTradeBadge(); toast("มีคำขอเทรด · เปิดเมนูตลาด"); }
        if (wasNew && drawerActive==="economy") { economyTab="trade"; toast("มีคำขอเทรด"); }
        renderEconomy();
      });
      for (const [name,notice] of [["trade_complete","เทรดสำเร็จ"],["trade_cancelled","ยกเลิกการเทรดแล้ว"]]) joined.onMessage(name, message => {
        if (room !== joined || (activeTrade && message?.tradeId!==activeTrade.tradeId)) return;
        activeTrade=null; tradeUnread=false; updateTradeBadge(); toast(notice); renderEconomy();
      });
      joined.onMessage("combat_hit", hit => {
        if (room !== joined) return;
        const forestTarget=joined.state?.monsters?.get?.(hit?.targetId);
        const struck=(forestMonsters.get(hit?.targetId)||(hit?.targetId===MONSTER_ID?villageGhost:null))?.metadata?.ghost;
        if(struck){
          struck.hurtAt=performance.now();
          if (hit.attackerId === localId) {
            const mMesh = forestMonsters.get(hit.targetId) || enemy;
            ghostVoice(struck, mMesh, "hurt", 0.95);
          }
        }
        if (typeof hit?.attackerId === "string") {
          const at = forestTarget || (hit.targetId === MONSTER_ID ? enemy.position : null);
          const mine = hit.attackerId === localId, dmg = Math.round(Number(hit.damage) || 0);
          const isCrit = dmg >= 40 || (mine && SKILL_SOURCES.has(hit.source) && dmg >= 25);
          playAttack(hit.attackerId, hit.source === "ranged", Number(at?.x), Number(at?.z));
          impactAt(hit.attackerId, Number(at?.x), Number(at?.z), hit.source, true, struck?.design?.kind, undefined, isCrit);
          if (hit.attackerId === localId) {
            registerComboHit();
            hudTarget = { id: hit.targetId, until: performance.now() + 8000 };
            if (Number(hit.hp) === 0) {
              hudKills[activeMapId] = (hudKills[activeMapId] || 0) + 1;
              shakeCamera(0.68, 420);
              SFX("bell", { intensity: 1.2 });
              sparks("gold", Number(at?.x), (Number(at?.y) || 0) + 1.2, Number(at?.z), 18, { speed: 4.5, up: 3.2, life: 550 });
              floatAtPlayer(localId, "วิชาประหารสิ้นสูญ! (EXECUTE)", "crit", { big: true, drift: 0 });
              shakeCamera(0.42, 320);
              triggerCombatCallout("execute_finisher");
            }
          }
          if (dmg > 0) floatAtMonster(hit.targetId, (isCrit ? "💥 " : "") + String(dmg), isCrit ? "crit" : (mine ? (SKILL_SOURCES.has(hit.source) ? "skill" : "dealt") : "ally"), { big: isCrit || (mine && SKILL_SOURCES.has(hit.source)) });
          if (struck && struck.shieldActive && struck.shieldHp > 0) {
            const mMesh = forestMonsters.get(hit.targetId) || enemy;
            processBossShieldDamage(mMesh, struck, dmg, hit.targetId);
          }
          if (mine && Number(hit.hp) === 0) {
            floatAtMonster(hit.targetId, "ปราบ!", "status", { delay: 180, rise: 70, drift: 0 });
            if (Number.isFinite(Number(at?.x))) auraFx({ x: Number(at.x), z: Number(at.z), y: Number(at.y) || 0 }, "kill");
          }
        }
        const talisman = hit?.source === "talisman";
        if (forestTarget) {
          if (forestTarget.mapId !== activeMapId) return;
          syncForestMonsters(joined.state);
          if (talisman) showTalisman(forestMonsters.get(hit.targetId));
          if (hit.attackerId === localId) toast((talisman ? "แปะยันต์ใส่" : "โจมตี ") + monsterName(forestTarget, hit.targetId) + " -" + hit.damage + " HP");
          return;
        }
        if(activeMapId !== "ritual_village" || hit?.targetId !== MONSTER_ID)return;
        // Players also visibly turn toward the monster while attacking,
        // even when standing still. All clients receive the same event.
        if (typeof hit.attackerId === "string") {
          faceAvatarToward(hit.attackerId, enemy.position.x, enemy.position.z);
        }
        if (talisman) showTalisman(enemy);
        hitFlashRemaining = .22;
        toast(hit.attackerId === localId
          ? (talisman ? "แปะยันต์ใส่ผี -" : "โจมตีผีสำเร็จ -") + String(hit.damage) + " HP"
          : "ผู้เล่นอื่นโจมตีผี -" + String(hit.damage) + " HP");
      });
      joined.onMessage("combat_notice", notice => {
        if (room !== joined) return;
        if (notice?.reason === "approaching") toast("กำลังเดินเข้าระยะโจมตี...");
        else if (notice?.reason === "monster_down") toast("มอนสเตอร์ถูกปราบแล้ว");
      });
      joined.onMessage("monster_respawn", notice => {
        if(activeMapId !== "ritual_village" || notice?.targetId !== MONSTER_ID) return;
        if (room === joined) toast("มอนสเตอร์ปรากฏตัวอีกครั้ง");
      });
      joined.onMessage("climb_started", notice => {
        if (room!==joined)return;
        if (notice?.playerId===localId) {
          toast(notice.direction==="up"?"กำลังปีนขึ้นกำแพง":"กำลังไต่ลงกำแพง");
          pendingClimb=null;
        }
        syncClimbButton();
      });
      joined.onMessage("mount_changed", info => {
        if(room!==joined || info?.playerId!==localId)return;
        toast(info.mounted ? "ขึ้นม้าแล้ว · ลงจากม้าก่อนต่อสู้" : info.reason==="hit" ? "ถูกโจมตี · ลงจากม้าแล้ว" : info.reason==="warp" ? "ลงจากม้าก่อนเดินทาง" : "ลงจากม้าแล้ว");
        syncMountButton();
      });
      joined.onMessage("climb_finished", notice => {
        if(room!==joined)return;
        if(notice?.playerId===localId) {
          toast(Number(notice.height)>1?"ขึ้นถึงยอดกำแพงแล้ว · เดินบนกำแพงได้":"ลงถึงพื้นแล้ว");
        }
        syncClimbButton();
        updateFlightButton();
      });
      joined.onMessage("flight_started", info => {
        if (room !== joined) return;
        { const flyer=avatars.get(info?.playerId); if(flyer) SFX("fly",{x:flyer.x,z:flyer.z}); }
        if (info?.playerId === localId) {
          pendingClimb = null;
          toast(info.direction === "up"
            ? "กำลังขึ้นบิน · สูงจากพื้น 6 เมตร"
            : "กำลังลงจอด · พื้นหรือยอดกำแพง");
        }
        updateFlightButton();
      });
      joined.onMessage("flight_finished", info => {
        if (room !== joined) return;
        if (info?.playerId === localId) {
          toast(info.flying
            ? "บินสำเร็จ · แตะพื้นเพื่อเคลื่อนที่ในอากาศ"
            : Math.abs(playerLayer(ownServerCharacter())-activeFort.height)<.15
              ? "ลงบนยอดกำแพงแล้ว · เดินต่อได้"
              : "ลงถึงพื้นแล้ว");
        }
        updateFlightButton();
        syncClimbButton();
      });
      joined.onMessage("ranged_hit", data => {
        if(room!==joined)return;
        if((joined.state?.players?.get?.(data?.attackerId)?.mapId || "ritual_village") !== activeMapId)return;
        renderMagicBolt(data);
        { const thrower=avatars.get(data?.attackerId); if(thrower) SFX("rice",{x:thrower.x,z:thrower.z}); }
        if(data?.attackerId===localId && data.skill!=="basic_magic") {
          toast("ข้าวสารปลุกเสกโดนเป้าหมาย -" + data.damage + " HP");
        }
      });
      joined.onMessage("summon_spawn", notice => {
        if (room !== joined) return;
        if(notice?.kind==="pot_spirit")recordPracticeCast({playerId:notice.ownerId,skillId:"seer_pot"});
        playAction(avatars.get(notice?.ownerId), "summon");
        if (notice?.ownerId === localId) toast("อัญเชิญวิญญาณผู้พิทักษ์สำเร็จ");
        syncSummons(joined.state);
        const spirit = joined.state.summons?.get(notice?.ownerId);
        if (notice?.kind === "pot_spirit" && spirit && summonAvatars.has(notice.ownerId)) {
          showSpiritPot(spirit);
          summonAvatars.get(notice.ownerId).emergingUntil = performance.now() + 500;
        }
        if (notice?.ownerId === localId) toast(notice.kind === "pot_spirit" ? "เสกผีจากหม้อแล้ว · ผีจะช่วยโจมตีมอนสเตอร์ใกล้ตัว" : "อัญเชิญวิญญาณผู้พิทักษ์สำเร็จ");
      });
      joined.onMessage("summon_despawn", notice => {
        if (room !== joined) return;
        { const s=summonAvatars.get(notice?.ownerId); if (s) eventFx("unsummon",{x:s.x??s.node?.position.x,z:s.z??s.node?.position.z,y:s.y||0}); }
        if (notice?.ownerId === localId && notice.reason !== "possessed") {
          toast(notice.reason === "owner_dead"
            ? "วิญญาณกลับภพเมื่อเจ้าของหมดสติ"
            : "เก็บวิญญาณผู้พิทักษ์แล้ว");
        }
        syncSummons(joined.state);
      });
      joined.onMessage("build_selected", () => {
        if (room === joined) toast("บันทึกสายอาชีพและเผ่าแล้ว");
      });
      joined.onMessage("rebirth_state", data=>{
        if(room!==joined || !data?.state || !data?.paths)return;
        rebirthState=data;if(drawerActive==="rebirth")renderRebirth();
      });
      joined.onMessage("rebirth_complete",()=>{
        if(room!==joined)return;
        toast("เกิดใหม่สำเร็จ · เริ่มต้นเลเวล 1 ในอาชีพที่เลือก");
      });
      joined.onMessage("occult_book_state", data => {
        if (room!==joined || !data?.book || !data?.lessons) return;
        occultBookState=data;occultBookRenderKey="";occultHotbarKey="";
        syncOccultUI(ownServerCharacter());
        if (drawerActive==="occultBook") renderOccultBook();
        if (drawerActive==="bag") renderGearGuide(currentBagSlots());
      });
      joined.onMessage("sentinel_book_state",data=>{
        if(room!==joined)return;
        sentinelBookState=data;sentinelBookRenderKey="";sentinelHotbarKey="";syncSentinelUI(ownServerCharacter());
        if(drawerActive==="sentinelBook")renderSentinelBook();
        if(drawerActive==="bag")renderGearGuide(currentBagSlots());
      });
      joined.onMessage("sentinel_book_changed",()=>{if(room===joined && drawerActive==="sentinelBook")renderSentinelBook();});
      joined.onMessage("sentinel_core_used",data=>{
        if(room===joined)recordPracticeCast(data);
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        const action={shock:"sweep",bulwark:"guard",riposte:"guard",protect:"rally"}[data.skillId];
        if(action)playAction(avatars.get(data.playerId),action);
        if(data?.skillId) {
          SFX(data.skillId, { x: caster.x, z: caster.z });
          playSkillVoiceShout(data.skillId, data.playerId);
          const target=monsterForSpell(spellTargetId || caster.targetId);
          triggerSkillVfx(data.skillId, caster, target);
        }
        if(data.playerId===localId && data.skillId==="riposte")sentinelCoreStanceUntil=performance.now()+Number(data.durationMs||0);
        if(data.playerId===localId)syncSentinelUI(ownServerCharacter());
      });
      joined.onMessage("sentinel_core_counter",data=>{if(room===joined){playAction(avatars.get(data?.playerId),"counter");floatAtPlayer(data?.playerId,"สวน!","status",{drift:0});}});
      joined.onMessage("sentinel_core_end",()=>{if(room===joined){sentinelCoreStanceUntil=0;syncSentinelUI(ownServerCharacter());}});
      joined.onMessage("sentinel_challenged",data=>{if(room===joined){sentinelChallengeUntil=performance.now()+Number(data?.durationMs||0);toast("ถูกผู้พิทักษ์ท้าทาย");syncSentinelUI(ownServerCharacter());}});
      joined.onMessage("sentinel_stun",data=>{if(room===joined && data?.playerId===localId)toast("ถูกสตัน · หยุดชั่วครู่");});
      joined.onMessage("sentinel_control",data=>{if(room===joined){
        if(data?.result==="applied"){sentinelCounterUntil=performance.now()+3000;toast("สกัดสำเร็จ · วิชาสวนพร้อม");}
        else toast(data?.result==="immune"?"เป้าหมายต้านสตัน":data?.result==="resisted"?"เป้าหมายกำลังต้านสตัน":"สกัดไม่สำเร็จ");
      }});
      joined.onMessage("sentinel_taunt",data=>{if(room===joined)toast("ยั่วยุสำเร็จ "+(Number(data?.applied)||0)+" ตัว");});
      joined.onMessage("sentinel_windup",data=>{
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        playAction(avatars.get(data.playerId),"cast");
        if(data.targetId===localId)toast("ผู้พิทักษ์กำลังตั้งท่ากระแทก · หลบออกห่าง");
        else if(data.playerId===localId)toast("กำลังตั้งท่ากระแทก");
      });
      joined.onMessage("sentinel_intercept",data=>{
        if(room!==joined || (data?.playerId!==localId && data?.targetId!==localId) || performance.now()-sentinelInterceptNoticeAt<1500)return;
        sentinelInterceptNoticeAt=performance.now();
        playAction(avatars.get(data.playerId),"guard");
        toast(data.playerId===localId?"รับดาเมจแทนเพื่อน -"+data.damage+" HP":"ผู้พิทักษ์รับดาเมจแทน "+data.damage+" HP");
      });
      joined.onMessage("sentinel_windup_result",data=>{if(room===joined)toast(data?.result==="interrupted"?"ถูกขัดจังหวะ":data?.result==="miss"?"เป้าหมายหลบพ้น":"กระแทกสำเร็จ");});
      joined.onMessage("sentinel_skill_used",data=>{
        if(room===joined)recordPracticeCast(data);
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        const actions={guard:"guard",step:"lunge",anchor:"guard",bash:"counter",sweep:"sweep",counter:"counter",taunt:"rally",ward:"rally",intercept:"lunge",party_ward:"rally"};
        if(actions[data.skillId])playAction(avatars.get(data.playerId),actions[data.skillId]);
        if(data.playerId===localId && data.skillId==="counter")sentinelCounterUntil=0;
      });
      joined.onMessage("blade_book_state", data => {
        if(room!==joined || !data?.book || !data?.lessons)return;
        bladeBookState=data;bladeBookRenderKey="";bladeHotbarKey="";syncBladeUI(ownServerCharacter());
        if(drawerActive==="bladeBook")renderBladeBook();
        if(drawerActive==="bag")renderGearGuide(currentBagSlots());
      });
      joined.onMessage("blade_book_changed",()=>{
        if(room!==joined)return;selectedBladeSkill="";if(targetedSkill==="blade")setTargetedSkill(null);toast("บันทึกตำราคมดาบแล้ว");
      });
      joined.onMessage("blade_cloak_changed",data=>{
        if(room===joined && data?.active && data.skillId)recordPracticeCast({playerId:localId,skillId:data.skillId});
        if(room!==joined)return;
        bladeCloakUntil=data?.active ? performance.now()+Math.max(0,Math.min(9000,Number(data.durationMs)||0)) : 0;
        if (data?.active) {
          const caster=getLocalAvatar();
          if(caster && data.skillId==="blade_vanish") {
            SFX(data.skillId, { x: caster.x, z: caster.z });
            playSkillVoiceShout(data.skillId, localId);
          }
          eventFx("cloak",caster);
        }
        syncBladeUI(ownServerCharacter());toast(data?.active ? "อำพรางตัวแล้ว" : data?.reason==="interrupted" ? "การร่ายพรางถูกขัดจังหวะ" : "การอำพรางสิ้นสุด");
      });
      joined.onMessage("blade_cloak_cast",data=>{if(room===joined){playAction(avatars.get(data?.playerId),"cast");if(data?.playerId===localId)toast("กำลังร่ายพรางกาย");}});
      joined.onMessage("blade_windup",data=>{if(room===joined)toast(data?.result==="hit"?"คมอาคมทะลวงสำเร็จ":data?.result==="interrupted"?"การตั้งท่าถูกขัดจังหวะ":"เป้าหมายหลบการโจมตี");});
      joined.onMessage("blade_mark_state",data=>{if(room===joined){bladeMarkUntil=data?.active ? performance.now()+Math.max(0,Math.min(8000,Number(data.durationMs)||0)) : 0;bladeMarkedTarget=data?.active ? String(data.targetId || "") : "";syncBladeUI(ownServerCharacter());}});
      joined.onMessage("blade_opening",data=>{if(room===joined){bladeOpeningUntil=performance.now()+Math.max(0,Math.min(4000,Number(data?.durationMs)||0));syncBladeUI(ownServerCharacter());}});
      joined.onMessage("blade_evade",data=>{if(room===joined && data?.success){bladeCounterUntil=performance.now()+3000;toast("หลบสำเร็จ · วิชาสวนพร้อม");syncBladeUI(ownServerCharacter());}});
      joined.onMessage("blade_skill_used",data=>{
        if(room===joined)recordPracticeCast(data);
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(caster && (caster.mapId || "ritual_village")===activeMapId) {
          if(data?.skillId==="blade_fury")playAction(avatars.get(data.playerId),"rally");
          else playAction(avatars.get(data.playerId),"slash");
          if(data?.skillId) {
            SFX(data.skillId, { x: caster.x, z: caster.z });
            playSkillVoiceShout(data.skillId, data.playerId);
            const target=monsterForSpell(spellTargetId || caster.targetId);
            triggerSkillVfx(data.skillId, caster, target);
          }
        }
        if(data?.playerId===localId){if(data.skillId==="counter")bladeCounterUntil=0;if(data.skillId==="killer_focus")bladeOpeningUntil=0;const name=bladeBookState?.core?.[data.skillId]?.name || bladeBookState?.lessons?.[data.skillId]?.name;if(name)toast(data.skillId==="piercing_edge"?"ตั้งท่าคมอาคมทะลวง":"ใช้ "+name);syncBladeUI(ownServerCharacter());}
      });
      joined.onMessage("occult_book_changed", () => {
        if (room!==joined) return;
        selectedOccultSkill="";if(targetedSkill==="occult")setTargetedSkill(null);
        toast("บันทึกตำราอาคมแล้ว");
      });
      joined.onMessage("occult_curse_state", data => {
        if (room!==joined) return;
        occultCurseUntil=data?.active ? performance.now()+Math.max(0,Math.min(6500,Number(data.durationMs)||0)) : 0;
        if (data?.active) { const me=getLocalAvatar(); eventFx("curse",me,{follow:me,life:Math.max(800,occultCurseUntil-performance.now())}); }
        syncOccultUI(ownServerCharacter());
        toast(data?.active ? "ติดคำสาปอาคม" : data?.reason==="cleansed" ? "ถอนคำสาปแล้ว" : "คำสาปสิ้นสุด");
      });
      joined.onMessage("occult_skill_used", data => {
        if(room===joined)recordPracticeCast(data);
        if (room!==joined) return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if (!caster || (caster.mapId || "ritual_village")!==activeMapId) return;
        if (data?.skillId && caster) SFX(data.skillId, { x: caster.x, z: caster.z });
        if (data?.playerId!==localId) return;
        const name=occultBookState?.lessons?.[data.skillId]?.name;
        if (name) toast("ใช้ "+name);
      });
      joined.onMessage("seer_binding_state",data=>{
        if(room!==joined)return;
        seerBoundTarget=data?.active?String(data.targetId || ""):"";occultHotbarKey="";syncOccultUI(ownServerCharacter());
        toast(data?.active?"สะกดมอนแล้ว · กดซ้ำเพื่อคลาย":"คลายยันต์สะกดแล้ว");
      });
      joined.onMessage("seer_core_used",data=>{
        if(room===joined)recordPracticeCast(data);
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId),target=monsterForSpell(data?.targetId) || joined.state?.players?.get?.(data?.targetId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        playAction(avatars.get(data.playerId),"cast");
        if(data?.skillId) {
          SFX(data.skillId, { x: caster.x, z: caster.z });
          playSkillVoiceShout(data.skillId, data.playerId);
          triggerSkillVfx(data.skillId, caster, target);
        }
        if(target && data.skillId!=="seer_buffalo")renderMagicBolt({skill:"blessed_rice",from:{x:caster.x,y:caster.y+1,z:caster.z},to:{x:target.x,y:target.y+1,z:target.z}});
        if(data.playerId===localId && data.skillId==="seer_buffalo")toast("กำลังร่ายควายธนู");
      });
      joined.onMessage("seer_buffalo_hit",data=>{if(room===joined)renderBuffaloBolt(data);});
      joined.onMessage("seer_buffalo_result",data=>{if(room===joined && data?.result==="miss")toast("ควายธนูไม่โดนเป้าหมาย");});
      joined.onMessage("seer_binding_visual",data=>{
        if(room!==joined || typeof data?.targetId!=="string")return;
        const previous=seerBindingEffects.get(data.targetId);if(previous){previous.mesh.dispose();seerBindingEffects.delete(data.targetId);}
        if(data.active){
          const mesh=B.MeshBuilder.CreateTorus("วงยันต์สะกด",{diameter:1.65,thickness:.07,tessellation:28},scene);
          mesh.rotation.x=Math.PI/2;mesh.material=gold;mesh.isPickable=false;
          seerBindingEffects.set(data.targetId,{mesh,until:data.durationMs?performance.now()+Number(data.durationMs):Infinity});
        }
      });
      joined.onMessage("seer_poison_visual",data=>{if(room===joined && data?.targetId===localId){seerPoisoned=Boolean(data.active);syncOccultUI(ownServerCharacter());if(data.active)toast("ติดข้าวสารพิษ · พิษไม่สังหาร");}});
      joined.onMessage("mender_core_used",data=>{
        if(room===joined)recordPracticeCast(data);
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId),target=joined.state?.players?.get?.(data?.targetId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        playAction(avatars.get(data.playerId),"cast");
        SFX(data.skillId, { x: caster.x, z: caster.z });
        playSkillVoiceShout(data.skillId, data.playerId);
        if(target)eventFx("bolt",{x:target.x,y:target.y+1,z:target.z},{color:"jade"});
        if(data.skillId==="mender_core_ward" && data.area && [data.area.x,data.area.y,data.area.z,data.area.radius,data.area.durationMs].every(Number.isFinite)){
          const previous=priestAreaEffects.get(data.playerId);if(previous)previous.mesh.dispose();
          const mesh=B.MeshBuilder.CreateTorus("อาณาเขตคุ้มภัย",{diameter:data.area.radius*2,thickness:.1,tessellation:48},scene);
          mesh.rotation.x=Math.PI/2;mesh.position.set(data.area.x,data.area.y+.1,data.area.z);mesh.material=gold;mesh.isPickable=false;
          priestAreaEffects.set(data.playerId,{mesh,mapId:activeMapId,until:performance.now()+data.area.durationMs});
        }
        if(data.playerId===localId){const name=occultBookState?.core?.[data.skillId]?.name;if(name)toast("ใช้ "+name);}
      });
      joined.onMessage("mender_sanctuary_end",data=>{if(room===joined){const effect=priestAreaEffects.get(data?.playerId);if(effect){effect.mesh.dispose();priestAreaEffects.delete(data.playerId);}}});
      joined.onMessage("muay_guarded", data => { if (room===joined) { floatAtPlayer(localId, data?.kind==="parry" ? "ปัด!" : data?.kind==="evade" ? "หลบ!" : "ป้องกัน!", "status", { drift: 0 }); muayCounterUntil=performance.now()+3000; const label=data?.kind==="parry" ? "ปัด" : data?.kind==="evade" ? "เบี่ยงหลบ" : "ป้อง"; toast(label+"สำเร็จ · วิชาสวนพร้อม 3 วินาที"); syncMuayHotbar(); } });
      joined.onMessage("muay_counter_cleared", () => { if (room===joined) { muayCounterUntil=0; syncMuayHotbar(); } });
      joined.onMessage("muay_defense", data => { if(room===joined) {
        const label=data?.kind==="parry" ? "ปัด" : data?.kind==="evade" ? "เบี่ยงหลบ" : "";
        if(!label)return;
        const message={start:"ตั้งจังหวะ"+label+"ด้านหน้า",success:label+"สำเร็จ · สวนได้",miss:label+"พลาดจังหวะ",cancelled:""}[data?.phase];
        if(message===undefined)return;
        muayDefenseMessage=message;muayDefenseUntil=performance.now()+(data.phase==="start" ? Math.min(600,Math.max(0,Number(data.durationMs)||0)) : message ? 2000 : 0);
        syncMuayComboStatus(ownServerCharacter());
      } });
      joined.onMessage("muay_combo", data => { if(room===joined) {
        muayComboCount=Number.isInteger(data?.count) ? Math.max(0,Math.min(3,data.count)) : 0;
        muayComboComplete=data?.completed===true && muayComboCount===3;
        if(muayComboCount>=2)floatAtPlayer(localId,muayComboComplete?"คอมโบ x3!":"คอมโบ x"+muayComboCount,"combo",{drift:0,big:muayComboComplete});
        muayComboNext=typeof data?.next==="string" ? data.next : "";
        muayComboBonus=Math.max(0,Math.min(100,Number(data?.bonusPercent)||0));
        muayComboUntil=performance.now()+(muayComboComplete ? 2000 : Math.min(6000,Math.max(0,Number(data?.durationMs)||0)));
        syncMuayComboStatus(ownServerCharacter());
      } });
      joined.onMessage("muay_interrupt", data => { if(room===joined) {
        const notice={applied:"ถีบหยุดจังหวะสำเร็จ",resisted:"เป้าหมายต้านการหยุดจังหวะชั่วคราว",immune:"Elite หรือบอสไม่ถูกหยุดจังหวะ",pvp_no_interrupt:"ถีบผู้เล่นสร้างดาเมจโดยไม่หยุดจังหวะ"};
        if(data?.source==="korat_finish" || data?.source==="korat_press")notice.applied="หมัดโคราชหยุดจังหวะสำเร็จ";
        if(data?.result==="applied" && selectedForestTarget)floatAtMonster(selectedForestTarget,"หยุดจังหวะ!","status",{drift:0});
        if(Object.hasOwn(notice,data?.result)){muayInterruptMessage=notice[data.result];muayInterruptUntil=performance.now()+2000;syncMuayComboStatus(ownServerCharacter());}
      } });
      joined.onMessage("muay_followup", data => { if(room===joined) {
        if(data?.active===true && typeof data.skillId==="string" && typeof data.targetId==="string") {
          muayFollowupSkill=data.skillId;muayFollowupTarget=data.targetId;muayFollowupUntil=performance.now()+Math.min(4000,Math.max(0,Number(data.durationMs)||0));
        } else {muayFollowupSkill="";muayFollowupTarget="";muayFollowupUntil=0;}
        syncMuayComboStatus(ownServerCharacter());syncMuayHotbar();
      } });
      joined.onMessage("muay_grapple", data => { if(room===joined) {
        if(data?.phase==="held" && data.role==="holder" && typeof data.targetId==="string") {
          muayGrabTarget=data.targetId;muayGrabUntil=performance.now()+Math.min(1500,Math.max(0,Number(data.durationMs)||0));
          toast("จับสำเร็จ · กดจับทุ่มอีกครั้งเพื่อทุ่ม");
        } else if(data?.phase==="held" && data.role==="victim") {
          setGrappleResponse("escape",data.durationMs,data.escapeStamina);toast("ถูกจับ · กดแก้จับก่อนถูกทุ่ม");
        } else if(data?.phase==="released") {
          releaseMuayHold(localId); if(muayGrabTarget)releaseMuayHold(muayGrabTarget);
          if(grappleResponseMode==="escape")setGrappleResponse(null);
          if(data.reason==="escaped" && muayGrabTarget)toast("เป้าหมายแก้จับหลุดแล้ว");
          muayGrabTarget="";muayGrabUntil=0;
        }
        syncMuayHotbar();
      } });
      joined.onMessage("muay_grapple_counter",data=>{if(room===joined){
        if(data?.active===true){setGrappleResponse("counter",data.durationMs,data.stamina);toast("แก้จับสำเร็จ · กดสวนผู้จับได้");}
        else if(grappleResponseMode==="counter")setGrappleResponse(null);
      }});
      joined.onMessage("muay_skill_used", result => {

        if(room===joined)recordPracticeCast(result);        if (room!==joined || typeof result?.playerId!=="string") return;
        const caster=joined.state?.players?.get?.(result.playerId);
        if (caster && (caster.mapId || "ritual_village")===activeMapId) {
          const target=result.targetId===MONSTER_ID ? joined.state.monster : joined.state.monsters?.get(result.targetId) || joined.state.players?.get(result.targetId);
          if (target && !["guard","parry","evade","chaiya_cover"].includes(result.skillId)) faceAvatarToward(result.playerId,Number(target.x),Number(target.z));
          playMuaySkill(result.playerId,result.skillId,result.targetId);
          { const name=(muayCatalogSkills[result.skillId] || muayBookData()?.catalog?.skills?.[result.skillId])?.name; if(name) floatAtPlayer(result.playerId,(result.skillId==="grapple"?"จับ!":name+"!"),"shout",{drift:0,side:0,rise:34,life:1400,lift:30}); }
        }
      });
      joined.onMessage("muay_skill_used", result => { if (room===joined && result?.playerId===localId && !["teep","grapple","parry","evade"].includes(result.skillId)) toast((muayBookData()?.catalog?.skills?.[result.skillId]?.name || "วิชามวย")+" สำเร็จ"); });
      joined.onMessage("muay_core_followup", data => {
        if(room!==joined || data?.playerId!==localId)return;
        muayCoreFollowupUntil=data.active ? performance.now()+Number(data.durationMs||0) : 0;
        muayHotbarKey="";syncMuayHotbar();
      });
      joined.onMessage("muay_core_used", data => {
        if(room===joined)recordPracticeCast(data);
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        const action={chaiya:"guard",korat:"m_basic",lopburi:"m_side",thasao:"flurry"}[data?.skillId];
        if(action)playAction(avatars.get(data?.playerId),action);
        if(caster && data?.skillId) {
          SFX(data.skillId, { x: caster.x, z: caster.z });
          playSkillVoiceShout(data.skillId, data.playerId);
          const target=monsterForSpell(spellTargetId || caster.targetId);
          triggerSkillVfx(data.skillId, caster, target);
        }
        if(data?.playerId===localId && data.skillId==="chaiya")muayCoreStanceUntil=performance.now()+Number(data.durationMs||0);
      });
      joined.onMessage("muay_book_changed", () => { if(room===joined){selectedMuaySkill="";if(targetedSkill==="muay")setTargetedSkill(null);muayBookRenderKey="";renderMuayBook();toast("บันทึกตำรามวยแล้ว");} });
      joined.onMessage("sword_core_counter", data => {
        if(room!==joined)return;
        const caster=joined.state?.players?.get?.(data?.playerId);
        if(!caster || (caster.mapId || "ritual_village")!==activeMapId)return;
        playAction(avatars.get(data.playerId),"counter");
        floatAtPlayer(data.playerId,"สวน!","status",{drift:0});
      });
      joined.onMessage("sword_stance_end", () => {if(room===joined){swordStanceUntil=0;syncSwordStatus(ownServerCharacter());}});
      joined.onMessage("sword_combo", data => { if (room===joined) {
        const count=Number.isInteger(data?.count) ? Math.max(0,Math.min(3,data.count)) : 0;
        swordCombo=count;
        swordComboUntil=performance.now()+3500;
        syncSwordStatus(ownServerCharacter());
      } });
      joined.onMessage("sword_tree_changed", result => { if (room===joined) {
        if (result?.action==="school" || result?.action==="reset") {
          selectedSwordSkill=""; swordCombo=0; swordComboUntil=0; swordCounterUntil=0;
          if (targetedSkill==="sword") setTargetedSkill(null);
          syncSwordStatus(ownServerCharacter());
        }
        swordTreeRenderKey=""; renderSwordTree(); toast("บันทึกตำราวิชาดาบแล้ว");
      } });
      joined.onMessage("sword_counter_cleared", () => { if (room===joined) {
        swordCounterUntil=0;
        syncSwordStatus(ownServerCharacter());
      } });
      joined.onMessage("sword_guarded", () => { if (room===joined) {
        floatAtPlayer(localId, "รับดาบ!", "status", { drift: 0 });
        swordCounterUntil=performance.now()+3000;
        if(ownServerCharacter()?.pathId==="sentinel"){sentinelCounterUntil=performance.now()+3000;syncSentinelUI(ownServerCharacter());}
        syncSwordStatus(ownServerCharacter());
        playAction(avatars.get(localId), "guard");
        toast("รับสำเร็จ · ใช้วิชาสวนได้ 3 วินาที");
      } });
      joined.onMessage("sword_skill_used", result => {
        if(room===joined)recordPracticeCast(result);
        if (room!==joined) return;
        const caster=joined.state?.players?.get?.(result?.playerId);
        if (!caster || (caster.mapId || "ritual_village")!==activeMapId) return;
        const target=result.targetId===MONSTER_ID ? joined.state.monster : joined.state.monsters?.get(result.targetId) || joined.state.players?.get(result.targetId);
        if (target) faceAvatarToward(result.playerId,Number(target.x),Number(target.z));
        playAction(avatars.get(result.playerId), swordSkillAction(result.skillId));
        if (result.skillId) {
          SFX(result.skillId, { x: caster.x, z: caster.z });
          playSkillVoiceShout(result.skillId, result.playerId);
          triggerSkillVfx(result.skillId, caster, target);
        }
        { const catalog=JSON.parse(joined.state?.swordTreeCatalog||"null"),node=catalog?.core?.[result.skillId] || catalog?.nodes?.[result.skillId]; if(node?.name) floatAtPlayer(result.playerId,node.name+"!","shout",{drift:0,side:0,rise:34,life:1400,lift:30}); }
        const ring=B.MeshBuilder.CreateTorus("sword skill ring",{diameter:1.3,thickness:.045,tessellation:16},scene);
        ring.position.set(caster.x,caster.y+.12,caster.z);ring.rotation.x=Math.PI/2;ring.material=gold;ring.isPickable=false;
        skillEffects.push({mesh:ring,mapId:activeMapId,until:performance.now()+450});
        if (result.playerId===localId) {
          const catalog=swordData()?.catalog,node=catalog?.core?.[result.skillId] || catalog?.nodes?.[result.skillId];
          if(result.skillId==="sritra_core"){swordStanceUntil=performance.now()+Number(result.durationMs||0);syncSwordStatus(ownServerCharacter());}
          const name=node?.name || "วิชาดาบ";
          toast(name+" สำเร็จ");
        }
      });
      joined.onMessage("class_skill_used", result => {
        if (room !== joined) return;
        toast(result.skill + " · มีผล " + result.targets + " คน");
        if (ownServerCharacter()?.pathId === "phutthaisawan") playAction(avatars.get(localId), "dance");
        if (ownServerCharacter()?.pathId === "muay_boran") playAction(avatars.get(localId), "m_wai");
        if (result?.skill) floatAtPlayer(localId, result.skill + "!", "shout", { drift: 0, side: 0, rise: 34, life: 1600 });
      });
      joined.onMessage("possession_changed", notice => {
        if(room===joined && notice?.active){ const who=avatars.get(notice.playerId); if(who) { SFX("possess",{x:who.x,z:who.z}); auraFx(who,"possess"); } floatAtPlayer(notice.playerId,"เข้าสิง!","status",{big:true,drift:0}); }
        if(room!==joined || notice?.playerId!==localId)return;
        toast(notice.active ? "วิญญาณเข้าสิง · เพิ่มโจมตีและป้องกัน 20% นาน 60 วินาที" : "สถานะเข้าสิงสิ้นสุด");
        syncPossessionButton();
      });
      joined.onMessage("summon_hit", hit => {
        if (room !== joined || !hit) return;
        const actor = summonAvatars.get(hit.ownerId);
        if (actor) { actor.hitUntil = performance.now() + 260; SFX("ghost_hit", { x: actor.x, z: actor.z, intensity: .7 }); }
        { const dmg = Math.round(Number(hit?.damage) || 0); if (dmg > 0 && hit.targetId) floatAtMonster(hit.targetId, String(dmg), hit.ownerId === localId ? "spirit" : "ally"); }
        if (hit.ownerId === localId) {
          toast("วิญญาณโจมตีผี -" + String(hit.damage) + " HP");
        }
      });
      joined.onMessage("pvp_hit", hit => {
        if (room !== joined || !hit || typeof hit.targetId !== "string") return;
        const victim = avatars.get(hit.targetId);
        const attacker = avatars.get(hit.attackerId);
        if (victim) { victim.hitFlashUntil = performance.now() + 250; playAction(victim, "hit"); }
        playAttack(hit.attackerId, hit.source === "ranged", victim?.x, victim?.z);
        if (victim) impactAt(hit.attackerId, victim.x, victim.z, hit.source, false, undefined, hit.targetId);
        { const dmg = Math.round(Number(hit.damage) || 0); if (dmg > 0) floatAtPlayer(hit.targetId, String(dmg), hit.targetId === localId ? "taken" : hit.attackerId === localId ? (SKILL_SOURCES.has(hit.source) ? "skill" : "dealt") : "ally"); }
        if (attacker && victim) {
          faceAvatarToward(hit.attackerId, victim.x, victim.z);
        }
        if (hit.targetId === localId) {
          shakeCamera(0.38, 260);
          toast("ถูก " + shortPkName(hit.attackerId) + " โจมตี -" + hit.damage + " HP");
        } else if (hit.attackerId === localId) {
          toast("โจมตี " + shortPkName(hit.targetId) + " -" + hit.damage + " HP");
        }
        syncPKHud();
      });
      joined.onMessage("pvp_kill", info => {
        if (room !== joined || !info) return;
        if ((joined.state?.players?.get?.(info.winnerId)?.mapId || "ritual_village") !== activeMapId) return;
        const winner = shortPkName(info.winnerId);
        const loser = shortPkName(info.loserId);
        toast(info.winnerId === localId
          ? "ชนะ Free PK! ปราบ " + loser
          : info.loserId === localId
            ? "แพ้ Free PK · รอเกิดใหม่"
            : winner + " ปราบ " + loser);
        syncPKHud();
      });
      joined.onMessage("monster_hit", hit => {
        if (room === joined) {
          playAction(avatars.get(hit?.targetId), "hit");
          { const v = avatars.get(hit?.targetId); if (v) hitBurst(v.x, v.z, hit.targetId === localId ? "red" : "cyan", false, v.y || 0); }
          { const dmg = Math.round(Number(hit?.damage) || 0); if (dmg > 0) floatAtPlayer(hit.targetId, String(dmg), hit.targetId === localId ? "taken" : "ally"); }
          if (hit?.targetId === localId) {
            shakeCamera(0.35, 240);
            if (!(hudTarget.until > performance.now())) hudTarget = { id: hit.attackerId, until: performance.now() + 8000 };
          }
          const gm2 = forestMonsters.get(hit?.attackerId), g = gm2?.metadata?.ghost; if (g) g.attackAt = performance.now();
          if (g && !(performance.now() - (g.criedAt || 0) < 1500)) { ghostVoice(g, gm2, "attack"); g.criedAt = performance.now(); }
          if (hit?.attackerId === MONSTER_ID) villageGhost.metadata.ghost.attackAt = performance.now();
        }
        if (room === joined && hit?.targetId === localId) {
          toast("ถูกผีโจมตี -" + Number(hit.damage || 0) + " HP");
        }
      });
      joined.onMessage("player_down", info => {
        { const fallen=avatars.get(info?.playerId); if (room === joined && fallen) { SFX("down",{x:fallen.x,z:fallen.z,important:true}); eventFx("down",fallen); } }
        if (room === joined && info?.playerId === localId) {
          toast("ตัวละครหมดสติ · รอเกิดใหม่");
        }
      });
      joined.onMessage("player_respawn", info => {
        if (room === joined && info?.playerId === localId) {
          toast("ฟื้นตัวแล้ว · กลับเข้าเกมได้");
        }
      });
      joined.onMessage("character_slots", message => {
        if (room !== joined || !Array.isArray(message?.slots)) return;
        rememberSlotPreviews(endpoint, message.slots);
        if (drawerActive === "online" && refreshCharacterSlotCards) refreshCharacterSlotCards();
      });
      joined.onMessage("character_save_error", () => {
        if (room !== joined) return;
        renderProgressionProfile();
        toast("บันทึกตัวละครไม่สำเร็จ · ตรวจสอบพื้นที่ VPS");
      });
      joined.onMessage("field_practice",data=>{
        if(room!==joined)return;
        fieldTrainingTip=data.training?.choices?.length?{...data.training,session:joined.sessionId,path:ownServerCharacter()?.pathId}:null;
        startJourneyPractice(data);
      });
      joined.onMessage("experience_gained", info => {
        if(room !== joined) return;
        if (Number(info?.amount) > 0) floatAtPlayer(localId, "+" + Math.round(info.amount) + " EXP", "exp", { delay: 250, drift: 0, rise: 60, life: 1500 });
        const prize=info?.elitePotion==="granted"?" · ได้รับยาฟื้นพลัง 1 ขวด":info?.elitePotion==="bag_full"?" · กระเป๋าเต็ม รับยาไม่ได้":"";
        const shrineGear=personalItems[personalItems[SHRINE_SHARD]?.bossGear];
        const fragmentNeed=shrineGear?.recipe?.find(r=>r.item===SHRINE_SHARD)?.qty;
        const shard = info?.shrineShard === "granted" ? " · "+shardName+" "+(fragmentNeed?itemHuntCount(SHRINE_SHARD)+"/"+fragmentNeed+" สำหรับ "+shrineGear.name:"+1") : info?.shrineShard === "bag_full" ? " · กระเป๋าเต็ม รับเศษตราไม่ได้" : "";
        const cardName=personalItems[info?.cardDrop]?.name;
        const cardNotice=cardName?(info.cardReceived?" · ได้รับ"+cardName:" · กระเป๋าเต็ม รับ"+cardName+"ไม่ได้"):"";
        const blocked=personalItems[info?.blockedItem];
        const missed=blocked?" · กระเป๋าเต็ม รับ"+blocked.name+" ×"+info.missedQuantity+" ไม่ได้":"";
        const loot=info?.personalDrop==="bag_full"?(info?.source==="war"?" · กระเป๋าเต็ม เว้นช่องเพื่อรับวัสดุค้างก่อนออกจากสนาม":missed||" · กระเป๋าเต็ม"):bagMeta(info?.personalDrop)?(info.forgeCopy?" · เข้าคลังช่าง ":" · ได้รับ")+bagMeta(info.personalDrop).name+(info.dropQuantity>1?" ×"+info.dropQuantity:"")+missed:"";
        const guarantee=info?.lootMisses===3?" · ล่าตัวที่มีอุปกรณ์อัปเกรดอีกครั้งเพื่อรับของ":"";
        const bossRewards=[[info?.bossFragment,info?.fragmentGranted],[info?.bossAccessory,info?.accessoryGranted]].map(([id,granted])=>{
          const item=personalItems[id];if(item?.bossGear && granted){const need=personalItems[item.bossGear]?.recipe?.find(r=>r.item===id)?.qty;if(need)return " · "+item.name+" "+itemHuntCount(id)+"/"+need+" สำหรับ "+personalItems[item.bossGear].name;}return item?(info.bossCopy && id===info.bossAccessory?" · เข้าคลังช่าง ":granted?" · ได้รับ":" · กระเป๋าเต็ม รับไม่ได้ ")+item.name:"";
        }).join("");
        const objectiveNotice=info?.forestObjectiveCompleted ? " · ภารกิจสำเร็จ โบนัส +"+Number(info.forestObjectiveBonus || 0)+" EXP"+(info?.directorBonus?" · เหตุการณ์ +"+Number(info.directorBonus)+" EXP":"") : "";
        const training=info?.training;
        if(training?.choices?.length){
          fieldTrainingTip={...training,session:room.sessionId,path:ownServerCharacter()?.pathId};
          if(drawerActive==="quest" && $("fieldGoalProgress"))renderFieldGoalDrawer(fieldGearGoal());
        }
        const lesson=training?.choices?.length?" · Lv."+info.level+" ฝึก "+training.choices[0].name+" ขั้น "+training.choices[0].rank+" หรือเลือกวิชาอื่นในตำรา · มี "+training.points+" แต้ม ไปศาลหมู่บ้านหลังพ้นการต่อสู้":"";
        const firstCopy=info?.starterCopy?" · ครบเป้าล่า! "+(personalItems[info.starterCopy]?.name||"อาวุธรุ่นเดียวกัน")+" เข้าคลังช่าง 1 ชิ้น":"";
        toast((info?.source==="war"?(info?.amount?"EXP จากการร่วมยึดจุด":"รางวัลร่วมยึดจุด"):info?.riftVictory?"โค่นราชันรอยแยกได้แล้ว":info?.shrineShard && !info.amount?"รางวัลศาลร้าง":!info?.amount && info?.level===100?"ผลการล่า Lv.100":"ได้รับ EXP") + (info?.amount?" +"+Number(info.amount):"") + objectiveNotice + firstCopy + lesson + prize + shard + bossRewards + loot + cardNotice + guarantee);
        recordPracticePrey(info?.fieldPrey);
        renderProgressionProfile();
      });
      joined.onMessage("forest_objective_state",payload=>{
        if(room!==joined || !payload || typeof payload.options!=="object")return;
        forestObjectiveState=payload;if(forestDefenseState && forestDefenseState.id!==payload.active?.id)forestDefenseState=null;
        if(forestEscortState && forestEscortState.id!==payload.active?.id)forestEscortState=null;
        syncQuestRanger();renderForestObjectiveHud();
        if(drawerActive==="quest")renderForestObjective();
      });
      joined.onMessage("director_event_state",payload=>{
        if(room!==joined || !payload || !Number.isFinite(payload.serverNow))return;
        const previous=directorEventState?.event?.id;directorEventState=payload;directorReceivedAt=performance.now();
        if(payload.event && payload.event.id!==previous)toast("เหตุการณ์ใหม่ที่ "+payload.event.mapName+" · คุยกับผู้มอบงานในพื้นที่");
        renderForestObjectiveHud();if(drawerActive==="quest")renderForestObjective();
      });
      joined.onMessage("npc_guide_result",payload=>{
        if(room!==joined || !npcGuidePending || payload?.requestId!==npcGuidePending.id)return;
        clearTimeout(npcGuidePending.timer);npcGuidePending=null;
        if(drawerActive!=="npcGuide")return;
        const output=$("npcGuideAnswer"),send=$("npcGuideSend");if(send)send.disabled=false;
        if(!output)return;
        const errors={near_npc:"เดินกลับไปหาผู้แนะนำก่อนถามอีกครั้ง",unavailable:"ผู้แนะนำยังไม่พร้อม ลองใหม่อีกครั้ง",cooldown:"รอสักครู่ก่อนถามคำถามถัดไป",busy:"ผู้แนะนำกำลังตอบคำถาม ลองใหม่อีกครั้ง"};
        if(payload.error){output.textContent=errors[payload.error] || "ยังตอบไม่ได้ ลองใหม่อีกครั้ง";return;}
        if(typeof payload.answer!=="string")return;
        const stamp=Number.isFinite(payload.asOf)?new Date(payload.asOf).toLocaleTimeString("th-TH",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit"}):"";
        output.textContent=payload.answer+(stamp?"\nข้อมูลเวลาไทย "+stamp+" น.":"");
        const speakBtn=$("npcGuideSpeakBtn");
        if(speakBtn && payload.answer){
          const clean=stripMarkdownForSpeech(payload.answer);
          speakBtn.hidden=false;
          bindSpeechButton(speakBtn, clean, "guide", "🔊 ฟังเสียงตอบภาษาไทย");
        }
      });
      joined.onMessage("forest_defense_state",payload=>{
        if(room!==joined || !payload)return;
        forestDefenseState=payload.hp>0 ? payload : null;
        if(payload.failed)toast("เสบียงค่ายเสียหายหมด · เริ่มป้องกันใหม่ได้ที่ค่าย");
        if(payload.ended)toast("ออกจากพื้นที่ป้องกัน · เริ่มใหม่ได้ที่ค่าย");
        renderForestObjectiveHud();if(drawerActive==="quest")renderForestObjective();
      });
      joined.onMessage("forest_escort_state",payload=>{
        if(room!==joined || !payload)return;
        const wasActive=Boolean(forestEscortState);
        forestEscortState=Number.isFinite(payload.x) && Number.isFinite(payload.z)?payload:null;
        if(payload.failed)toast("ผู้เดินทางบาดเจ็บ · กลับไปหาผู้มอบงานเพื่อเริ่มใหม่");
        if(payload.ended)toast("การคุ้มกันสิ้นสุด · กลับไปหาผู้มอบงานเพื่อเริ่มใหม่");
        syncQuestRanger();renderForestObjectiveHud();
        const status=$("escortStatus");if(status && forestEscortState)status.textContent=`ผู้เดินทาง ${payload.hp}/${payload.maxHp}${payload.waiting?" · รอให้กลับมารับ":" · เดินตามอยู่"}`;
        if(drawerActive==="quest" && wasActive!==Boolean(forestEscortState))renderForestObjective();
      });
      joined.onMessage("character_status", payload => {
        if (room !== joined || !Number.isSafeInteger(payload?.level) || typeof payload?.weaponId !== "string" ||
            !payload.base || !payload.weapon?.pve || !payload.weapon?.pvp || !Array.isArray(payload.effects) ||
            !["maxHp","maxStamina","atk","def","magicAtk","magicDef"].every(k => Number.isFinite(payload.base[k])) ||
            ![payload.weapon.pve,payload.weapon.pvp].every(b => Number.isFinite(b.melee) && Number.isFinite(b.ranged))) return;
        characterStatus = { ...payload, receivedAt: performance.now() };
        renderProgressionProfile();
      });
      joined.onMessage("item_catalog_page",payload=>{
        if(room!==joined || !payload?.items)return;
        Object.assign(personalItems,payload.items);catalogRevision++;
      });
      joined.onMessage("gear_guides",payload=>{
        if(room!==joined)return;
        gearGuides=Array.isArray(payload?.builds)?payload:null;
        if(gearGuides && "training" in gearGuides)fieldTrainingTip=gearGuides.training?.choices?.length?{...gearGuides.training,session:joined.sessionId,path:gearGuides.path}:null;
        renderBag();
      });
      joined.onMessage("material_sold",result=>{
        if(room!==joined)return;
        finishEconomyPending();toast("ขายวัสดุ ได้ "+result.receivedGold+" ทอง");renderBag();
      });
      joined.onMessage("gear_salvaged",result=>{
        if(room!==joined)return;
        finishEconomyPending();
        const name=id=>personalItems[id]?.name||id;
        toast("แยก"+name(result.gear)+" ได้"+name(result.material)+" ×"+result.quantity+(result.card?" · คืน"+name(result.card):""));
        renderBag();
      });
      joined.onMessage("inventory_state", payload => {
        if (room !== joined || payload?.version !== 1 ||
            !Array.isArray(payload.slots) ||
            payload.slots.length !== INVENTORY_SLOTS) return;
        if(payload.personalItems && typeof payload.personalItems==="object") {
          Object.assign(personalItems,payload.personalItems);catalogRevision++;
        }
        if(payload.catalogReady || payload.personalItems){
          workbenchGold=Number(payload.workbenchGold)||0;
          cardDrill=payload.cardDrill||null;
          refineInput=Number(payload.refineInput)||2;
        }
        // Only display recognized items and sane stack counts.
        const slots = payload.slots.map(stack => {
          if ((stack?.itemId === POTION_ITEM_ID || stack?.itemId === SHRINE_SHARD || ["material","catalyst","consumable","tool","card"].includes(bagMeta(stack?.itemId)?.kind)) &&
              Number.isSafeInteger(stack.quantity) &&
              stack.quantity >= 1 && stack.quantity <= 99) {
            return { itemId: stack.itemId, quantity: stack.quantity };
          }
          if ((bagMeta(stack?.itemId)?.kind==="mainHand" || wearPositions(bagMeta(stack?.itemId)?.kind).length) &&
              stack?.quantity === 1) {
            return { itemId: stack.itemId, quantity: 1, forge: stack.forge, bound:stack.bound===true, socket:stack.socket };
          }
          return null;
        });
        const selected = payload.equippedWeaponSlot;
        const equippedWeaponSlot = selected === null ? null :
          Number.isSafeInteger(selected) && selected >= 0 &&
            selected < INVENTORY_SLOTS && bagMeta(slots[selected]?.itemId)?.kind==="mainHand"
            ? selected : undefined;
        const equipment=Object.fromEntries(Object.entries(payload.equipment||{}).filter(([position,id])=>wearPositions(personalItems[id]?.kind).includes(position)));
        const equipmentSockets=Object.fromEntries(Object.entries(payload.equipmentSockets||{}).filter(([key,card])=>equipment[key] && (card===null || personalItems[card]?.kind==="card")));
        inventoryState={version:1,slots,equippedWeaponSlot,equipment,equipmentSockets,equipmentForges:payload.equipmentForges||{},forgeCopies:payload.forgeCopies||{},starterHuntKills:payload.starterHuntKills??0};
        if(drawerActive==="quest" && $("fieldGoalProgress"))renderFieldGoalDrawer(fieldGearGoal());
        itemUsePending = false;
        renderBag();
        renderEconomy();
      });
      joined.onMessage("weapon_equipped", event => {
        if (room !== joined) return;
        itemUsePending = false;
        const id = typeof event?.weaponId === "string" &&
          bagMeta(event.weaponId)?.kind==="mainHand" ? event.weaponId : "";
        setAvatarWeapon(getLocalAvatar(),id);
        renderBag();
        toast(id ? "สวมใส่ " + bagMeta(id).name + " สำเร็จ · บันทึกแล้ว"
          : "ถอดอาวุธแล้ว · บันทึกบน VPS");
      });
      joined.onMessage("item_used", event => {
        if (room !== joined) return;
        playAction(getLocalAvatar(), "drink");
        if (Number(event?.healed) > 0) { floatAtPlayer(localId, "+" + Math.round(event.healed), "heal", { big: true, drift: 0 }); auraFx(getLocalAvatar(), "heal"); }
        toast((personalItems[event?.itemId]?.name || "ใช้ยาเลือดแล้ว")+" · +"+(event?.restoredMana?Math.round(event.restoredMana)+" MP":Number(event?.healed||0)+" HP"));
        renderBag();
      });
      joined.onMessage("item_use_failed", () => {
        if (room !== joined) return;
        itemUsePending = false;
        renderBag();
        toast("การใช้ไอเท็มหรือสวมอาวุธไม่สำเร็จ · VPS บันทึกไม่ได้");
      });
      joined.onMessage("dash_started", info => {
        if (room !== joined || typeof info?.playerId !== "string") return;
        const actor = avatars.get(info.playerId);
        if (actor) { actor.dashUntil = performance.now() + 460; playAction(actor, "dash"); }
        if (info.playerId === localId) toast("พุ่ง!");
      });
      joined.onMessage("dash_finished", info => {
        if (room === joined && info?.playerId === localId && info?.blocked) {
          toast("พุ่งหยุดเพราะสิ่งกีดขวาง");
        }
      });
      joined.onMessage("command_rejected", info => {
        if (room !== joined) return;
        if(info?.reason==="director_event_unavailable" || info?.reason==="director_event_claimed"){
          toast(info.reason==="director_event_claimed"?"รับรางวัลเหตุการณ์นี้แล้ว":"เหตุการณ์นี้หมดเวลาหรือเปลี่ยนไปแล้ว");
          if(drawerActive==="quest")room?.send("get_forest_objective",{});return;
        }
        if(info?.reason==="war_supply_flight"){toast("ขณะถือเสบียงต้องเดินทางบนพื้น");return;}
        if(typeof info?.reason==="string" && info.reason.startsWith("rebirth_")){
          const reasons={rebirth_unavailable:"ระบบเกิดใหม่ยังไม่พร้อม",rebirth_near_mentor:"เดินไปหาครูวิชาและหยุดต่อสู้ก่อน",rebirth_invalid_class:"อาชีพที่เลือกไม่ถูกต้อง",rebirth_level_required:"ต้องถึงเลเวล 100 ก่อนเกิดใหม่",rebirth_maximum:"เกิดใหม่ครบจำนวนสูงสุดแล้ว",rebirth_inventory_full:"กระเป๋าเต็ม · เว้นช่องสำหรับถอดอุปกรณ์ก่อน",rebirth_inventory_invalid:"ตรวจสอบอุปกรณ์ไม่สำเร็จ",rebirth_inventory_unavailable:"ไม่พบกระเป๋า",rebirth_save_failed:"บันทึกไม่สำเร็จ กรุณาลองใหม่"};
          toast(reasons[info.reason] || "ไม่สามารถเกิดใหม่ได้ในขณะนี้");if(drawerActive==="rebirth")renderRebirth();return;
        }
        if(drawerActive==="quest" && ["character_busy","build_rate_limited","build_unavailable"].includes(info?.reason))renderForestObjective();
        if(drawerActive==="rebirth" && ["character_busy","build_rate_limited","build_unavailable"].includes(info?.reason))renderRebirth();
        if(typeof info?.reason==="string" && info.reason.startsWith("forest_objective_")){
          const reasons={forest_objective_unavailable:"ภารกิจยังไม่พร้อมในพื้นที่นี้",forest_objective_invalid:"คำสั่งภารกิจไม่ถูกต้อง",forest_objective_near_ranger:"เดินไปหาผู้มอบงานในพื้นที่ก่อน",forest_objective_active:"ยกเลิกภารกิจเดิมก่อนเลือกรายการใหม่",forest_objective_level_cap:"Lv.100 ไม่ได้รับ EXP ภารกิจนี้",forest_objective_delivery_not_ready:"รวบรวมเสบียงให้ครบก่อน",forest_objective_delivery_destination:"นำเสบียงไปส่งกับผู้มอบงานปลายทาง",forest_objective_defense_active:"กำลังป้องกันค่ายอยู่",forest_objective_defense_near:"เดินเข้าเขตค่ายก่อนเริ่มป้องกัน",forest_objective_escort_active:"ผู้เดินทางกำลังตามเจ้าอยู่",forest_objective_save_failed:"บันทึกภารกิจไม่สำเร็จ ลองใหม่"};
          toast(reasons[info.reason] || "ใช้ภารกิจไม่ได้ในขณะนี้");if(drawerActive==="quest")renderForestObjective();return;
        }
        const muayReasons={muay_inventory_full:"ช่องกระเป๋าเต็ม · เว้น 1 ช่องเพื่อรับผ้าคาดเชือก",muay_class_required:"เลือกอาชีพนักมวยก่อน",muay_wrap_required:"สวมผ้าคาดเชือกก่อนใช้วิชามวย",muay_safe_area:"ออกจากเขตพักก่อนใช้วิชามวย",muay_cooldown:"วิชามวยกำลังฟื้น",muay_counter_required:"รับการโจมตีสำเร็จก่อนสวน",muay_out_of_range:"เข้าใกล้มอนสเตอร์ก่อน",muay_blocked:"มีสิ่งกีดขวางระหว่างทาง",invalid_muay_target:"เลือกมอนสเตอร์เพื่อใช้วิชามวย",invalid_muay_skill:"คำสั่งวิชามวยไม่ถูกต้อง",invalid_muay_book:"คำสั่งตำรามวยไม่ถูกต้อง",muay_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",muay_book_level:"เลเวลยังไม่ถึง",muay_book_no_points:"แต้มวิชาไม่พอ",muay_book_training:"ฝึกชกและรับให้ครบก่อน",muay_book_prerequisite:"เรียนวิชาก่อนหน้าก่อน",muay_book_already_learned:"เรียนวิชานี้แล้ว",muay_book_empty:"ยังไม่มีแต้มที่ต้องคืน",muay_book_save_failed:"บันทึกตำรามวยไม่สำเร็จ",muay_skill_locked:"ยังไม่ได้เรียนวิชานี้หรือยังไม่ได้เลือกสำนัก",muay_wrong_school:"เลือกใช้สำนักนี้ก่อนเรียนวิชา",muay_school_selected:"เลือกสำนักนี้อยู่แล้ว"};
        Object.assign(muayReasons,{muay_controlled:"กำลังจับหรือถูกจับ · รอให้หลุดก่อน",muay_grapple_busy:"เป้าหมายกำลังถูกควบคุม",muay_grapple_resisted:"เป้าหมายต้านการจับชั่วคราว",muay_grapple_immune:"Elite และบอสไม่ถูกจับทุ่ม",muay_grapple_ended:"จังหวะจับหมดแล้ว",muay_grapple_counter_ended:"จังหวะสวนผู้จับหมดแล้ว",invalid_grapple_response:"คำสั่งแก้จับไม่ถูกต้อง",muay_throw_blocked:"พื้นที่ทุ่มมีสิ่งกีดขวางหรือเขตพัก",muay_followup_required:"ใช้วิชาเปิดจังหวะกับเป้าหมายเดิมก่อน",muay_book_mastery:"ฝึกวิชาประจำสำนักและชุดต่อเนื่องกับมอนสเตอร์ให้ครบก่อน",muay_out_of_range:"เข้าใกล้เป้าหมายก่อน"});
        if (Object.hasOwn(muayReasons,info?.reason)) { toast(muayReasons[info.reason]); return; }
        const swordReasons={invalid_sword_tree:"คำสั่งวิชาไม่ถูกต้อง",sword_class_required:"เลือกอาชีพนักดาบก่อน",sword_tree_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อน",sword_tree_level:"เลเวลยังไม่ถึง",sword_tree_no_points:"แต้มวิชาไม่พอ",sword_tree_prerequisite:"ต้องเรียนวิชาก่อนหน้า",sword_tree_wrong_school:"เลือกสำนักนี้ก่อน",sword_tree_already_learned:"เรียนวิชานี้แล้ว",sword_tree_already_selected:"เลือกสำนักนี้อยู่แล้ว",sword_tree_empty:"ยังไม่มีแต้มวิชาที่ต้องคืน",sword_tree_rate_limited:"กดถี่เกินไป รอสักครู่",sword_tree_save_failed:"บันทึกวิชาไม่สำเร็จ",sword_trial_incomplete:"ฝึกตามเงื่อนไขของครูดาบก่อน",invalid_sword_skill:"คำสั่งสกิลไม่ถูกต้อง",sword_weapon_required:"สวมดาบคู่ก่อนใช้วิชาดาบ",sword_skill_locked:"วิชายังไม่พร้อมใช้ในสำนักนี้",sword_skill_cooldown:"วิชาดาบกำลังฟื้น",sword_counter_required:"รับการโจมตีให้สำเร็จก่อนสวน",sword_combo_required:"โจมตีต่อเนื่องให้ครบ 3 จังหวะ",invalid_sword_target:"เลือกเป้าหมายที่ใช้วิชานี้ได้",sword_out_of_range:"เข้าใกล้เป้าหมายก่อนใช้วิชา",sword_blocked:"มีสิ่งกีดขวางระหว่างทาง"};
        swordReasons.sword_effect_limit="ไม่สามารถคุ้มกันได้ เพราะเป้าหมายที่อยู่ในระยะมีบัฟเต็ม";
        if (Object.hasOwn(swordReasons,info?.reason)) { toast(swordReasons[info.reason]); return; }
        const bladeReasons={invalid_blade_book:"คำสั่งตำราคมดาบไม่ถูกต้อง",invalid_blade_skill:"คำสั่งวิชาคมดาบไม่ถูกต้อง",blade_class_required:"เลือกสายคมดาบก่อน",blade_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",blade_already_learned:"เรียนวิชานี้แล้ว",blade_level:"เลเวลยังไม่ถึง",blade_no_points:"แต้มวิชาไม่พอ",blade_prerequisite:"เรียนวิชาก่อนหน้าก่อน",blade_practice:"ฝึกวิชาตามเงื่อนไขในตำราก่อน",blade_skill_locked:"เรียนและจัดวิชาในช่องลัดก่อน",blade_book_empty:"ไม่มีแต้มที่ต้องคืน",blade_book_save_failed:"บันทึกตำราไม่สำเร็จ",blade_cloak_active:"กำลังพรางตัวอยู่",blade_cloak_location:"ใช้วิชานี้บนพื้นนอกเขตพัก",blade_cloak_combat:"รอหลังการต่อสู้สักครู่ก่อนพราง",blade_cloak_action:"สิ้นสุดการพรางก่อนใช้คำสั่งนี้",blade_cooldown:"วิชากำลังฟื้น",invalid_blade_target:"เลือกเป้าหมายก่อน",blade_out_of_range:"เข้าใกล้เป้าหมายก่อน",blade_blocked:"มีสิ่งกีดขวาง",blade_cloak_required:"พรางตัวก่อนใช้วิชานี้",blade_mark_required:"ติดรอยอาคมของตนก่อน",blade_counter_required:"หลบการโจมตีสำเร็จก่อนสวน",blade_opening_required:"เปิดฉากจากการพรางก่อน",blade_effect_limit:"บัพเต็มแล้ว",blade_windup_active:"กำลังตั้งท่าโจมตี"};
        if(Object.hasOwn(bladeReasons,info?.reason)){toast(bladeReasons[info.reason]);return;}
        const sentinelReasons={invalid_sentinel_book:"คำสั่งตำราไม่ถูกต้อง",invalid_sentinel_skill:"คำสั่งวิชาไม่ถูกต้อง",sentinel_class_required:"เลือกผู้พิทักษ์ก่อน",sentinel_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",sentinel_already_learned:"เรียนวิชานี้แล้ว",sentinel_level:"เลเวลยังไม่ถึง",sentinel_no_points:"แต้มวิชาไม่พอ",sentinel_prerequisite:"เรียนวิชาก่อนหน้าก่อน",sentinel_practice:"ฝึกตามเงื่อนไขในตำราก่อน",sentinel_skill_locked:"เรียนและจัดวิชาในช่องลัดก่อน",sentinel_book_empty:"ไม่มีแต้มที่ต้องคืน",sentinel_book_save_failed:"บันทึกตำราไม่สำเร็จ",sentinel_location:"ใช้วิชาบนพื้นนอกเขตพัก",sentinel_cooldown:"วิชากำลังฟื้น",sentinel_counter_required:"ตั้งรับหรือสกัดสำเร็จก่อนสวน",sentinel_out_of_range:"เข้าใกล้เป้าหมายก่อน",sentinel_party_required:"เลือกสมาชิกปาร์ตี้",sentinel_blocked:"มีสิ่งกีดขวาง",sentinel_effect_limit:"บัพเต็มแล้ว",sentinel_stunned:"ถูกสตัน · หยุดชั่วครู่",sentinel_windup_active:"กำลังตั้งท่าโจมตี"};
        if(Object.hasOwn(sentinelReasons,info?.reason)){toast(sentinelReasons[info.reason]);return;}
        const buildReasons = {occult_class_required:"เลือกอาชีพจอมอาคมก่อนใช้วิชานี้", build_needs_shrine:"กลับไปที่ลานพักกลางหมู่บ้านและออกจากการต่อสู้ก่อน", build_save_failed:"บันทึกสายอาชีพไม่สำเร็จ", build_unavailable:"ต้องใช้ตัวละครที่มีเซฟและยังมีชีวิต", build_required:"เลือกสายอาชีพที่ลานพักก่อน", invalid_build:"สายอาชีพหรือเผ่าไม่ถูกต้อง", build_rate_limited:"รอสักครู่ก่อนกดอีกครั้ง", class_skill_cooldown:"รอให้วิชาพร้อมก่อน", class_skill_no_target:"HP ของสมาชิกที่อยู่ในระยะเต็มแล้ว"};
        Object.assign(buildReasons,{use_learned_skill:"เรียนและจัดวิชาในช่องลัดก่อน",invalid_occult_book:"คำสั่งตำราอาคมไม่ถูกต้อง",invalid_occult_skill:"คำสั่งวิชาอาคมไม่ถูกต้อง",occult_rate_limited:"กดตำราถี่เกินไป รอสักครู่",occult_book_needs_shrine:"กลับลานพักและพ้นการต่อสู้ก่อนจัดวิชา",occult_wrong_path:"เลือกสายนี้ก่อนเรียน",occult_already_learned:"เรียนวิชานี้แล้ว",occult_level:"เลเวลยังไม่ถึง",occult_no_points:"แต้มวิชาไม่พอ",occult_prerequisite:"เรียนวิชาก่อนหน้าก่อน",occult_training:"ฝึกวิชาอาคมให้ครบก่อน",occult_mastery:"ฝึกวิชาตามหมวดในตำราให้ครบก่อน",occult_skill_locked:"เรียนและจัดวิชาในช่องลัดก่อน",occult_book_empty:"ไม่มีแต้มวิชาที่ต้องคืน",occult_book_save_failed:"บันทึกตำราอาคมไม่สำเร็จ",occult_cooldown:"วิชาอาคมกำลังฟื้น",occult_out_of_range:"เข้าใกล้เป้าหมายก่อน",occult_blocked:"มีสิ่งกีดขวางระหว่างเป้าหมาย",occult_mark_required:"ติดยันต์ตีตราที่เป้าหมายก่อน",occult_curse_required:"สาปเป้าหมายก่อนใช้วิชานี้",occult_party_required:"เลือกตนเองหรือสมาชิกปาร์ตี้",occult_trance_required:"เข้าทรงก่อนใช้วิชานี้",occult_no_curse:"เป้าหมายไม่มีคำสาปที่ถอนได้",occult_effect_limit:"เป้าหมายมีบัพเต็มแล้ว"});
        Object.assign(buildReasons,{seer_binding_immune:"เป้าหมายต้านยันต์สะกด หรือถูกสะกดอยู่แล้ว",seer_poison_busy:"เป้าหมายติดพิษของนักเวทคนอื่นอยู่",seer_casting:"กำลังร่ายควายธนู"});
        if (Object.hasOwn(buildReasons, info?.reason)) { toast(buildReasons[info.reason]); return; }
        if (typeof info?.reason==="string" && info.reason.startsWith("guild_")) { const reason={guild_invalid_name:"ชื่อกิลด์ต้องมี 2–24 ตัวอักษร และใช้ตัวอักษรหรือตัวเลข",guild_rate_limited:"ทำรายการเร็วเกินไป · รอสักครู่",guild_unavailable:"เข้า LIVE ด้วยตัวละครที่บันทึกแล้ว"};toast(reason[info.reason] || "ไม่สามารถทำรายการกิลด์ได้");return; }
        if (typeof info?.reason==="string" && info.reason.startsWith("party_")) { toast(info.reason==="party_rate_limited" ? "ทำรายการเร็วเกินไป · รอสักครู่" : "ยังใช้ปาร์ตี้ไม่ได้ · ตรวจการเชื่อมต่อ"); return; }
        if (["economy_unavailable","economy_rate_limited","invalid_economy_request","invalid_trade","trade_unavailable","trade_expired","character_busy"].includes(info?.reason) && (drawerActive === "economy" || economyPending)) {
          if(economyPendingRequest?.command==="forge_weapon")failForgeAnimation("คำขอยังไม่ได้รับการยืนยัน · ตรวจอุปกรณ์ก่อนทำซ้ำ");
          finishEconomyPending(true);
          if (["trade_unavailable","trade_expired"].includes(info.reason)) activeTrade=null;
          const reason={economy_unavailable:"ต้องเข้า LIVE ที่เปิดระบบตลาด",economy_rate_limited:"ทำรายการเร็วเกินไป · รอสักครู่",character_busy:"กำลังบันทึกข้อมูล · ลองใหม่",trade_expired:"ข้อเสนอเทรดหมดอายุ",trade_unavailable:"ไม่พบข้อเสนอเทรด"};
          toast(reason[info.reason] || "คำขอไม่ถูกต้อง"); renderEconomy(); renderBag(); return;
        }
        if (info?.reason === "character_busy") { toast("กำลังบันทึกข้อมูล รอสักครู่"); return; }
        if (["invalid_chat", "chat_rate_limited", "chat_unavailable", "chat_party_unavailable", "chat_target_unavailable", "chat_bug_rate_limited"].includes(info?.reason)) {
          finishChatPending();
          const chatErrors={chat_rate_limited:"ส่งข้อความเร็วเกินไป · รอสักครู่",chat_unavailable:"ยังส่งแชทไม่ได้ขณะเดินทาง",chat_party_unavailable:"เข้าปาร์ตี้ก่อนส่งข้อความ",chat_target_unavailable:"ผู้รับไม่พร้อมใช้งานหรือออกจากห้องแล้ว",chat_bug_rate_limited:"ส่งรายงานได้ทุก 30 วินาที",invalid_chat:"ข้อความไม่ถูกต้องหรือยาวเกิน 200 ตัวอักษร"};
          toast(chatErrors[info.reason] || "ส่งข้อความไม่สำเร็จ");
          return;
        }
        if (info?.reason === "insufficient_mana") { floatAtPlayer(localId, "มานาไม่พอ", "weak", { drift: 0 }); toast("มานาไม่พอสำหรับใช้สกิล"); return; }
        if (info?.reason === "insufficient_stamina") { floatAtPlayer(localId, "กำลังไม่พอ", "weak", { drift: 0 }); toast("กำลังไม่พอสำหรับใช้สกิล"); return; }
        if(warpPending) {
          clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
          const warpReasons={portal_too_far:"อยู่ไกลจากประตูเกินไป",combat_locked:"รอให้พ้นการต่อสู้ก่อนเดินทาง",warp_cooldown:"รอคูลดาวน์ก่อนเดินทาง",movement_busy:"หยุดบิน ปีน หรือพุ่งก่อนเดินทาง",character_busy:"กำลังบันทึกข้อมูล"};
          toast(warpReasons[info?.reason] || "ยังเดินทางไม่ได้ · " + (info?.reason || ""));
        }
        if (["item_busy", "item_cooldown", "item_unavailable",
             "hp_full","mana_full", "invalid_item_use", "not_alive", "inventory_unavailable",
             "invalid_weapon_equip","item_level_required","wrong_item_class","inventory_full","equipment_changed", "equipment_busy", "equipment_cooldown",
             "not_weapon", "already_equipped", "not_consumable"]
              .includes(info?.reason)) {
          itemUsePending = false;
          renderBag();
        }
        if (info?.reason === "not_alive") toast("ยังสั่งเดินหรือโจมตีไม่ได้");
        else if (info?.reason === "attack_rate_limited") toast("สั่งโจมตีถี่เกินไป");
        else if (info?.reason === "self_attack") toast("ไม่สามารถโจมตีตัวเองได้");
        else if (info?.reason === "invalid_character_name") toast("ชื่อตัวละครต้องมี 2–20 ตัวอักษร");
        else if (info?.reason === "character_not_persistent") toast("ยังไม่ได้เปิดระบบตัวละครถาวรบนเซิร์ฟเวอร์");
        else if (info?.reason === "rename_cooldown") toast("โปรดเว้น 5 วินาทีก่อนเปลี่ยนชื่อ");
        else if(info?.reason==="world_client_update_required")toast("รีเฟรชหน้าเกมเพื่อเข้าวัดร้างพันธนาการ");
        else if (info?.reason === "target_unavailable") toast("เป้าหมายไม่อยู่ในห้องหรือไม่พร้อมต่อสู้");
        else if (info?.reason === "invalid_attack") toast("คำสั่งโจมตีไม่ถูกต้อง");
        else if (info?.reason === "possession_needs_summon") toast("เรียกวิญญาณก่อนเข้าสิง");
        else if (info?.reason === "possession_cooldown") toast("เข้าสิงยังไม่พร้อม · รอคูลดาวน์ 30 วินาทีหลังสิ้นสุด");
        else if (info?.reason === "possession_active") toast("ออกจากการเข้าสิงก่อนเรียกวิญญาณ");
        else if (info?.reason === "possession_rate_limited") toast("กดเข้าสิงถี่เกินไป");
        else if (info?.reason === "invalid_possession") toast("คำสั่งเข้าสิงไม่ถูกต้อง");
        else if (info?.reason === "summon_limit") toast("เรียกวิญญาณพร้อมกันได้สูงสุด 1 ตัว");
        else if (info?.reason === "summon_cooldown") toast("อัญเชิญเร็วเกินไป · รอคูลดาวน์");
        else if (info?.reason === "summon_rate_limited") toast("กดเรียกวิญญาณถี่เกินไป");
        else if (info?.reason === "shot_out_of_range") toast("เป้าหมายอยู่นอกระยะยิง");
        else if (info?.reason === "invalid_talisman_target") toast("เลือกมอนสเตอร์เพื่อแปะยันต์");
        else if (info?.reason === "talisman_out_of_range") toast("เข้าใกล้มอนสเตอร์ในระยะ 2.8 เมตร แล้วแตะมอนสเตอร์อีกครั้ง");
        else if (info?.reason === "talisman_blocked") toast("มีสิ่งกีดขวางระหว่างคุณกับมอนสเตอร์");
        else if (info?.reason === "talisman_cooldown") toast("ยันต์กำลังฟื้น");
        else if (info?.reason === "shot_blocked") toast("กำแพงบังแนวกระสุนอาคม");
        else if (info?.reason === "shot_cooldown") toast("ข้าวสารปลุกเสกกำลังฟื้น · รอครู่หนึ่ง");
        else if (info?.reason === "inventory_unavailable") toast("เซิร์ฟเวอร์ยังไม่รองรับกระเป๋าถาวร");
        else if (info?.reason === "invalid_item_use" || info?.reason === "invalid_inventory_request") toast("คำสั่งไอเท็มไม่ถูกต้อง");
        else if (info?.reason === "item_busy") toast("กำลังบันทึกการใช้ยา · รอสักครู่");
        else if (info?.reason === "item_cooldown") toast("รอคูลดาวน์ยาเลือด 1 วินาที");
        else if (info?.reason === "item_unavailable") toast("ไม่มีไอเท็มในช่องนี้แล้ว");
        else if (info?.reason === "invalid_weapon_equip") toast("คำสั่งสวมอุปกรณ์ไม่ถูกต้อง");
        else if(info?.reason==="item_level_required")toast("เลเวลยังไม่ถึงที่อุปกรณ์กำหนด");
        else if(info?.reason==="wrong_item_class")toast("อุปกรณ์ชิ้นนี้ใช้กับอาชีพอื่น");
        else if(info?.reason==="inventory_full")toast("กระเป๋าเต็ม · เปิดช่องว่างก่อนถอด หรือสวมชิ้นใหม่เพื่อสลับ");
        else if(info?.reason==="equipment_changed")toast("อุปกรณ์เปลี่ยนแล้ว กรุณาเลือกชิ้นอีกครั้ง");
        else if (info?.reason === "equipment_busy") toast("ต้องรอให้เคลื่อนไหวพิเศษเสร็จก่อนสวมอาวุธ");
        else if (info?.reason === "equipment_cooldown") toast("เปลี่ยนอาวุธเร็วเกินไป · รอครู่หนึ่ง");
        else if (info?.reason === "not_weapon") toast("ไอเท็มนี้ไม่ใช่อาวุธ");
        else if (info?.reason === "already_equipped") toast("อาวุธนี้สวมใส่อยู่แล้ว");
        else if (info?.reason === "not_consumable") toast("อาวุธต้องสวมใส่ ไม่ใช่ใช้เป็นยา");
        else if (info?.reason === "hp_full") toast("HP เต็ม · ไม่ใช้ยาโดยเปล่าประโยชน์");
        else if (info?.reason === "mana_full") toast("มานาเต็มแล้ว");
        else if (info?.reason === "dash_cooldown") toast("พุ่งยังไม่พร้อม · รอคูลดาวน์");
        else if (info?.reason === "dash_in_progress" || info?.reason === "dashing") toast("กำลังพุ่งอยู่");
        else if (info?.reason === "dash_rate_limited") toast("สั่งพุ่งถี่เกินไป");
        else if (info?.reason === "invalid_dash") toast("ทิศทางการพุ่งไม่ถูกต้อง");
        else if (info?.reason === "dismount_required") toast("ลงจากม้าก่อนใช้วิชาหรือต่อสู้");
        else if (info?.reason === "mount_in_combat") toast("รอให้พ้นการต่อสู้ก่อนเรียกม้า");
        else if (info?.reason === "mount_unavailable") toast("เรียกม้าได้เมื่ออยู่บนพื้นและพร้อมเดินทาง");
        else if (info?.reason === "mount_cooldown") toast("รอสักครู่ก่อนเรียกม้าอีกครั้ง");
        else if (info?.reason === "invalid_flight") toast("คำสั่งบินไม่ถูกต้อง");
        else if (info?.reason === "flight_class_required") toast("วิชาเหินเวหาเป็นของจอมอาคม");
        else if (info?.reason === "flight_in_progress") toast("กำลังขึ้นหรือลง · รอให้ถึงระดับก่อน");
        else if (info?.reason === "flight_rate_limited") toast("กดบินถี่เกินไป");
        else if (info?.reason === "flight_unavailable") toast("ตอนนี้ยังบินขึ้นไม่ได้");
        else if (info?.reason === "flight_forbidden") toast("เขตนี้ใช้การเดินหรือ Dash");
        else if (info?.reason === "landing_blocked") toast("ลงจอดตรงนี้ไม่ได้ · บินไปพ้นขอบกำแพงก่อน");
        else if (info?.reason === "flying") toast("ต้องลงจอดก่อนใช้พุ่งหรือปีน");
        else if (info?.reason === "climbing") toast("ยังโจมตีหรือเดินไม่ได้ขณะปีน");
        else if (info?.reason === "ladder_too_far") toast("เดินเข้าหาบันไดก่อนปีน");
        else if (info?.reason === "melee_height_blocked") toast("โจมตีประชิดข้ามระดับความสูงไม่ได้ · ใช้ข้าวสารปลุกเสก");
        else if (info?.reason === "must_descend") toast("ต้องลงบันไดก่อนเดินไปพื้นด้านล่าง");
        else if (info?.reason === "invalid_climb") toast("คำสั่งปีนกำแพงไม่ถูกต้อง");
        else if (info?.reason === "invalid_shoot") toast("คำสั่งซัดข้าวสารไม่ถูกต้อง");
        else if (info?.reason === "invalid_summon" || info?.reason === "invalid_unsummon") {
          toast("คำสั่งวิญญาณไม่ถูกต้อง");
        }
      });
      joined.onMessage("warp_complete", () => {
        if(room!==joined)return;
        clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
        toast("เดินทางสำเร็จ");playAction(getLocalAvatar(),"arrive");
      });
      joined.onMessage("warp_failed", () => {
        if(room!==joined)return;
        clearTimeout(warpTimer);warpPending=false;$("warpLoading").hidden=true;
        toast("บันทึกไม่สำเร็จ · ยังอยู่แผนที่เดิม");
      });
      // Colyseus 0.18 schema callbacks are the reliable way to subscribe to nested maps.
      try {
        const callbackApi = window.Colyseus.Callbacks;
        if (callbackApi?.get) {
          const cb = callbackApi.get(joined);
          cb.onAdd("players", (p, id) => {
            const applyServerPlayer = () => {
              if ((p.mapId || "ritual_village") !== activeMapId) { removeOnlinePlayer(id); return; }
              setOnlinePlayer(id, Number(p.x), Number(p.z),
                Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y), p.equippedWeaponId, p.pathId);
            };
            applyServerPlayer();
            if (typeof cb.listen === "function") {
              cb.listen(p, "x", applyServerPlayer);
              cb.listen(p, "z", applyServerPlayer);
              cb.listen(p, "facing", applyServerPlayer);
              cb.listen(p, "hp", applyServerPlayer);
              cb.listen(p, "y", applyServerPlayer);
              cb.listen(p, "maxHp", applyServerPlayer);
              cb.listen(p, "equippedWeaponId", applyServerPlayer);
              cb.listen(p, "pathId", applyServerPlayer);
              cb.listen(p, "mapId", () => syncState(joined.state));
            }
          });
          cb.onRemove("players", (_,id) => removeOnlinePlayer(id));
        }
      } catch (err) { console.warn("Callbacks fallback to state updates",err); }
      // Some SDK/room combinations expose the collection only after the first full state sync.
      clearSyncPoll(); sessionState.syncPoll = setInterval(() => { if (room === joined) syncState(joined.state); },350);
      joined.onLeave(() => {
        if (room === joined) stopOnline("เซิร์ฟเวอร์ตัดการเชื่อมต่อ กรุณาเข้าเกมอีกครั้ง");
      });
      joined.onError(connectionLifecycle.guard(joined, (code,message) => { console.error("MONTRA room error",code,message); toast("เซิร์ฟเวอร์แจ้งข้อผิดพลาด " + code); }));
      try {
        localStorage.setItem("montra_endpoint", endpoint);
        localStorage.setItem(preferredSlotKey(endpoint), String(requestedSlot));
      } catch (_) { /* optional */ }
      if(joined.state?.territoryWarAvailable)joined.send("get_territories",{});
      if(joined.state?.forestObjectivesAvailable){joined.send("get_forest_objective",{});joined.send("get_director_event",{});}
      try { joined.send("get_character_slots", {}); } catch (_) { /* old S2 server */ }
      try { joined.send("get_inventory", {}); } catch (_) { /* older VPS */ }
      closeDrawer();
      window.MontraEntry?.success();
      const active = joined.state?.players?.get?.(joined.sessionId);
      if(transferFailed)toast("เข้าห้องศึกไม่สำเร็จ · กลับมายังห้องโลกแล้ว");
      else toast(active?.persistent
        ? "เชื่อมต่อแล้ว · ตัวละครบันทึกบนเซิร์ฟเวอร์"
        : ok ? "เชื่อมต่อแล้ว · ตัวละครยังไม่บันทึกถาวร"
             : "เชื่อมต่อแล้ว กำลังรอข้อมูลตัวละคร");
    } catch (err) {
      if (joined && room !== joined) {
        try { await joined.leave(); } catch (_) { /* release rejected slot */ }
      }
      console.error("MONTRA connection failed",err);
      ui.onlineCount.textContent = "การเชื่อมต่อไม่สำเร็จ";
      window.MontraEntry?.failure("เชื่อมต่อไม่สำเร็จ: " + (err.message || String(err)).slice(0,105));
      toast("เชื่อมต่อไม่สำเร็จ: " + (err.message || String(err)).slice(0,105));
      if (connectButton) connectButton.disabled = false;
    } finally {
      connectionLifecycle.finish();
    }
  }

  let pointer = null;
