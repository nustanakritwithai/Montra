  // ---- New Player Voice Guidance with Typhoon Lore ----
  const TYPHOON_VOICE_GUIDANCE = {
    move: {
      title: "พราหมณ์เฒ่าผู้ชี้แนะ",
      subtitle: "แตะบนผืนดินเพื่อก้าวเดิน หรือลากหน้าจอเพื่อหมุนมองทิศทาง",
      text: "ยินดีต้อนรับสู่แดนมนตรา... เจ้าเพิ่งฟื้นจากพิธีสะกดวิญญาณ แตะบนผืนดินเพื่อก้าวเดิน หรือลากหน้าจอเพื่อหมุนมองทิศทาง ดินแดนลี้ลับนี้รอเจ้าอยู่"
    },
    target: {
      title: "วิชากำหนดจิตเล็งเป้า",
      subtitle: "แตะที่ศัตรูเพื่อเล็งเป้า · เข้าใกล้เพื่อโจมตีอัตโนมัติ",
      text: "นั่นคือวิญญาณหลงทิศ! แตะที่ตัวมันเพื่อกำหนดจิตล็อกเป้า สังเกตวงแหวนยันต์ทองใต้เท้า เมื่อเข้าใกล้ ตัวเจ้าจะร่ายเพลงยุทธ์ฟาดฟันโดยอัตโนมัติ"
    },
    combo: {
      title: "เพลงยุทธ์ต่อเนื่อง",
      subtitle: "สะสมคอมโบไต่ระดับยุทธ์ C/B/A/S · แตะสกิลเพื่อใช้วิชา",
      text: "เพลงยุทธ์ของเจ้าเริ่มไหลลื่น! จงโจมตีต่อเนื่องเพื่อสะสมคอมโบสู่ระดับปรมาจารย์ และอย่าลืมแตะใช้วิชาประจำสายบนแถบวิชาด้านล่าง"
    },
    execute: {
      title: "ตราราหูประหาร",
      subtitle: "ศัตรูอ่อนแรง! ปล่อยกระบวนท่าเด็ดชีพเพื่อปิดฉาก",
      text: "ศัตรูเสียหลักแล้ว! ตราราหูประหารสีชาดปรากฏขึ้น จงใช้กระบวนท่าเด็ดชีพเพื่อปลดปล่อยวิญญาณของมันให้สิ้นสูญ!"
    },
    levelup: {
      title: "การเบิกญาณวิชา",
      subtitle: "เปิดสมุดวิชา → เบิกแต้มทักษะ → ติดตั้งลงในช่องลัด",
      text: "จิตวิญญาณของเจ้าแข็งแกร่งขึ้นแล้ว! แตะที่สมุดวิชาเพื่อเปิดดูผังต้นไม้วิชา เลือกเบิกเนตรทักษะใหม่ แล้วนำมาติดตั้งลงในช่องลัด"
    },
    gear: {
      title: "ยุทโธปกรณ์อาคม",
      subtitle: "เปิดกระเป๋า → แตะยุทโธปกรณ์ → เลือก 'สวมใส่'",
      text: "เจ้าได้ยุทโธปกรณ์ชิ้นใหม่มา แตะที่ย่ามสัมภาระเพื่อเปิดดู หากเป็นอาวุธหรือเครื่องราง ให้แตะสวมใส่เพื่อเพิ่มพลังชีวิตและพลังโจมตี"
    },
    forest: {
      title: "เขตแดนป่าต้องห้าม",
      subtitle: "ระวังวงยันต์เตือนภัยสีแดงของบอส · ดีดกายหลบให้ทันท่วงที",
      text: "เบื้องหน้าคือป่าต้องห้าม... หากเจ้าเห็นวงยันต์เตือนภัยสีแดงบนพื้น จงดีดกายถอยหลบออกมาทันที มิฉะนั้นจักโดนพลังทำลายล้างมหาศาล!"
    }
  };

  // ---- Typhoon Tactical Combat Callouts ----
  const TYPHOON_COMBAT_CALLOUTS = {
    boss_telegraph: {
      title: "พราหมณ์เตือนภัย",
      subtitle: "ระวัง! ถอยออกจากวงอาคมเร็วเข้า!",
      text: "ระวัง! อสูรร้ายเริ่มร่ายวงอาคมสีเลือด ก้าวถอยออกมาเร็วเข้า!",
      cooldown: 14000,
      alert: true,
      icon: "⚠️"
    },
    low_hp: {
      title: "พราหมณ์เตือนชีพ",
      subtitle: "พลังชีวิตวิกฤต! จงดื่มน้ำมนต์หรือล่าถอย",
      text: "ชีพจรเจ้าอ่อนล้าแล้ว! จงรีบดื่มน้ำมนต์หรือถอยออกจากวงต่อสู้!",
      cooldown: 25000,
      alert: true,
      icon: "❤️‍🩹"
    },
    boss_enrage: {
      title: "อสูรคลั่งสะกดจิต",
      subtitle: "บอสเข้าสู่สภาวะโทสะคลั่ง! พลังโจมตีรุนแรงขึ้น",
      text: "ระวังตัวให้ดี! อสูรตกอยู่ในโทสะคลั่ง พลังทำลายล้างเพิ่มพูนขึ้นแล้ว!",
      cooldown: 30000,
      alert: true,
      icon: "🔥"
    },
    combo_rank_s: {
      title: "เพลงยุทธ์ปรมาจารย์",
      subtitle: "คอมโบทะลวงระดับ S! เพลงดาบมนตราไร้เทียมทาน",
      text: "ยอดเยี่ยมยิ่ง! เพลงดาบมนตราของเจ้าเข้าขั้นปรมาจารย์แล้ว!",
      cooldown: 20000,
      alert: false,
      icon: "⚔️"
    },
    execute_finisher: {
      title: "คมดาบลงทัณฑ์",
      subtitle: "ปลดปล่อยดวงวิญญาณสูญสลายสำเร็จ!",
      text: "ลงทัณฑ์เด็ดขาด! ปลดปล่อยดวงวิญญาณร้ายให้สิ้นสูญ",
      cooldown: 12000,
      alert: false,
      icon: "🗡️"
    },
    party_low_hp: {
      title: "พราหมณ์เตือนภัยปาร์ตี้",
      subtitle: "สหายร่วมรบของเจ้าบาดเจ็บหนัก! จงรุดไปช่วยเหลือ",
      text: "สหายร่วมรบของเจ้าบาดเจ็บหนัก! จงรุดไปคุ้มกันหรือร่ายมนตร์รักษา!",
      cooldown: 25000,
      alert: true,
      icon: "🛡️"
    },
    party_rally: {
      title: "สัญญาณรวมพลปาร์ตี้",
      subtitle: "รวมพลตรงนี้! ประสานพลังต่อกรอสูรร้าย",
      text: "สัญญาณรวมพลดังขึ้นแล้ว! เหล่านักรบจงรวมพลังประสานมนตราตรงนี้เร็วเข้า!",
      cooldown: 18000,
      alert: false,
      icon: "🚩"
    },
    party_help: {
      title: "ขอกำลังหนุนด่วน",
      subtitle: "สหายร่วมรบต้องการความช่วยเหลือเร่งด่วน!",
      text: "ขอกำลังหนุน! สหายร่วมรบตกอยู่ในอันตราย รีบเข้าช่วยด่วน!",
      cooldown: 18000,
      alert: true,
      icon: "🆘"
    },
    forge_success: {
      title: "พิธีกรรมเสริมอาคม",
      subtitle: "อาคมแทรกซึมสำเร็จ! พลังยุทธ์เพิ่มพูนขึ้นแล้ว",
      text: "พลังแห่งยันต์แทรกซึมเข้าสู่อาวุธ! คมดาบเปล่งประกายอาคมอันทรงพลัง",
      cooldown: 8000,
      alert: false,
      icon: "✨"
    },
    forge_fail: {
      title: "อาคมสะท้อนกลับ",
      subtitle: "ศิลาอาคมแตกสลาย! อาวุธได้รับความเสียหาย",
      text: "ศิลาอาคมแตกสลาย... จงตั้งจิตให้มั่นแล้วเริ่มพิธีหลอมใหม่อีกครา",
      cooldown: 8000,
      alert: true,
      icon: "💥"
    },
    boss_phase_2: {
      title: "วิญญาณแปรสภาพ",
      subtitle: "บอสปลดปล่อยพลังขั้นที่ 2! ระวังการโจมตีรอบทิศ",
      text: "ระวังให้ดี! อสูรปลดปล่อยดวงวิญญาณแปรสภาพเข้าสู่ขั้นที่สองแล้ว เตรียมพร้อมรับมือ!",
      cooldown: 25000,
      alert: true,
      icon: "🔮"
    },
    shield_break: {
      title: "เกราะมนตราแตกสลาย",
      subtitle: "จังหวะนี้แหละ! เกราะมันแตกแล้ว ระดมโจมตีเต็มกำลัง!",
      text: "จังหวะนี้แหละ! ม่านอาคมคุ้มกายของมันแตกกระจายแล้ว ระดมโจมตีไม่ยั้ง!",
      cooldown: 15000,
      alert: false,
      icon: "⚡"
    }
  };

  const lastCombatCalloutTimes = new Map();
  function triggerCombatCallout(key) {
    if (!isVoiceGuidanceEnabled()) return;
    const item = TYPHOON_COMBAT_CALLOUTS[key];
    if (!item) return;
    const now = performance.now();
    const last = lastCombatCalloutTimes.get(key) || 0;
    if (now - last < item.cooldown) return;
    lastCombatCalloutTimes.set(key, now);

    ensureVoiceGuidanceHud();
    voiceHudTitle.textContent = item.title;
    voiceHudText.textContent = item.subtitle;
    if (voiceGuidanceAvatar) voiceGuidanceAvatar.textContent = item.icon || "🧙‍♂️";
    voiceGuidanceHud.classList.toggle("combat-alert", Boolean(item.alert));
    voiceGuidanceHud.hidden = false;
    clearTimeout(voiceHudTimer);
    voiceHudTimer = setTimeout(() => hideVoiceGuidanceHud(), Math.max(4500, item.subtitle.length * 100));
    try {
      window.MontraAudio?.speak?.(item.text, {
        persona: "guide",
        onEnd: () => hideVoiceGuidanceHud(),
        onError: () => {}
      });
    } catch (_) {}
  }

  let voiceGuidanceHud = null, voiceHudTitle = null, voiceHudText = null, voiceHudTimer = null, voiceGuidanceAvatar = null;
  function isVoiceGuidanceEnabled() {
    try { return localStorage.getItem("montra_voice_guidance") !== "false"; }
    catch (_) { return true; }
  }
  function setVoiceGuidanceEnabled(enabled) {
    try { localStorage.setItem("montra_voice_guidance", enabled ? "true" : "false"); }
    catch (_) {}
  }
  function ensureVoiceGuidanceHud() {
    if (voiceGuidanceHud) return;
    voiceGuidanceHud = document.createElement("div");
    voiceGuidanceHud.className = "voice-guidance-hud";
    voiceGuidanceHud.hidden = true;
    voiceGuidanceAvatar = document.createElement("div");
    voiceGuidanceAvatar.className = "voice-guidance-avatar";
    voiceGuidanceAvatar.textContent = "🧙‍♂️";
    const content = document.createElement("div");
    content.className = "voice-guidance-content";
    const header = document.createElement("div");
    header.className = "voice-guidance-header";
    voiceHudTitle = document.createElement("span");
    voiceHudTitle.className = "voice-guidance-title";
    const badge = document.createElement("span");
    badge.className = "voice-guidance-badge";
    badge.textContent = "TYPHOON AI";
    header.append(voiceHudTitle, badge);
    voiceHudText = document.createElement("p");
    voiceHudText.className = "voice-guidance-text";
    content.append(header, voiceHudText);
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "voice-guidance-skip";
    skipBtn.textContent = "ข้าม ✕";
    skipBtn.onclick = () => {
      window.MontraAudio?.stopSpeech?.();
      hideVoiceGuidanceHud();
    };
    voiceGuidanceHud.append(voiceGuidanceAvatar, content, skipBtn);
    document.getElementById("game")?.append(voiceGuidanceHud);
  }
  function hideVoiceGuidanceHud() {
    if (voiceGuidanceHud) {
      voiceGuidanceHud.hidden = true;
      voiceGuidanceHud.classList.remove("combat-alert");
    }
    clearTimeout(voiceHudTimer);
  }
  function triggerVoiceGuidance(stepKey) {
    if (!isVoiceGuidanceEnabled()) return;
    const item = TYPHOON_VOICE_GUIDANCE[stepKey];
    if (!item) return;
    const key = "montra_vg_played_" + stepKey;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch (_) {}
    ensureVoiceGuidanceHud();
    voiceHudTitle.textContent = item.title;
    voiceHudText.textContent = item.subtitle;
    if (voiceGuidanceAvatar) voiceGuidanceAvatar.textContent = "🧙‍♂️";
    voiceGuidanceHud.classList.remove("combat-alert");
    voiceGuidanceHud.hidden = false;
    clearTimeout(voiceHudTimer);
    voiceHudTimer = setTimeout(() => hideVoiceGuidanceHud(), Math.max(5000, item.text.length * 110));
    try {
      window.MontraAudio?.speak?.(item.text, {
        persona: "guide",
        onEnd: () => hideVoiceGuidanceHud(),
        onError: () => {}
      });
    } catch (_) {}
  }

  // Sound effects (audio.js). Safe no-op until audio is unlocked by the first tap.
  const SFX = (name, opts) => window.MontraAudio?.play(name, opts);
