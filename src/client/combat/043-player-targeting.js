  function shortPkName(id) {
    return "ผู้เล่น-" + String(id || "").slice(0, 4);
  }

  // Server Schema is the only source of player HP and the PK scoreboard.
  function syncPKHud() {
    if (mode !== "live" || !room?.state?.players?.get) {
      ui.pkPanel.hidden = true;
      return;
    }

    const players = room.state.players;
    const me = players.get(localId);
    if (!me) {
      ui.pkPanel.hidden = true;
      return;
    }

    ui.pkPanel.hidden = !selectedPkTargetId;
    if (!Number.isFinite(me.pkKills)) {
      ui.pkTitle.textContent = "⚔ FREE PK";
      ui.pkText.textContent = "รอ Server";
      ui.pkHpTrack.hidden = true;
      ui.pkHint.textContent = "ต้องอัปเดต MONTRA Free PK บน VPS ก่อน";
      return;
    }

    const opponent = selectedPkTargetId && selectedPkTargetId !== localId
      ? players.get(selectedPkTargetId) : null;
    if (!opponent) {
      selectedPkTargetId = null;
      ui.pkPanel.hidden = true;
      ui.pkTitle.textContent = "⚔ FREE PK";
      ui.pkText.textContent = "K " + me.pkKills + " · D " + me.pkDeaths;
      ui.pkHpTrack.hidden = true;
      ui.pkHint.textContent = "แตะตัวผู้เล่นคนอื่นเพื่อโจมตีทันที";
      return;
    }

    const hp = Math.max(0, Number(opponent.hp) || 0);
    const maxHp = Math.max(1, Number(opponent.maxHp) || 100);
    ui.pkTitle.textContent = shortPkName(selectedPkTargetId);
    ui.pkText.textContent = "HP " + Math.ceil(hp) + "/" + Math.ceil(maxHp);
    ui.pkHpTrack.hidden = false;
    ui.pkHpBar.style.width = Math.max(0, Math.min(100, 100 * hp / maxHp)) + "%";
    ui.pkHint.textContent = opponent.alive === false
      ? "เป้าหมายถูกปราบแล้ว · รอเกิดใหม่"
      : "Free PK เปิด · แตะเพื่อโจมตี / แตะพื้นเพื่อยกเลิก";
  }

  function tapPlayerForPK(targetId) {
    if(territoryState?.teams?.[targetId] && territoryState.teams[targetId]===territoryState.local?.side){toast("ผู้เล่นคนนี้อยู่ฝ่ายเดียวกัน");return;}
    if (mode !== "live" || !room || !targetId || targetId === localId) return;
    const me = room.state?.players?.get?.(localId);
    const enemyPlayer = room.state?.players?.get?.(targetId);
    if (!me || !enemyPlayer) return;
    if (!Number.isFinite(me.pkKills)) {
      toast("MONTRA Server ยังไม่มีระบบ Free PK · ต้องติดตั้ง VPS ก่อน");
      return;
    }
    if (me.alive === false) { toast("ยังโจมตีไม่ได้ · รอเกิดใหม่"); return; }
    if (enemyPlayer.alive === false) { toast("เป้าหมายตายแล้ว · รอเกิดใหม่"); return; }

    selectedPkTargetId = targetId;
    spellTargetId = targetId;
    marker.setEnabled(false);
    syncPKHud();
    try {
      room.send("attack", { targetId });
    } catch (error) {
      console.error("MONTRA FreePK command failed", error);
      toast("ส่งคำสั่งโจมตีผู้เล่นไม่สำเร็จ");
    }
  }

