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
      subtitle: "โจมตีต่อเนื่องเพื่อสะสมคอมโบ · แตะสกิลเพื่อใช้วิชา",
      text: "จงโจมตีต่อเนื่องเพื่อสะสมคอมโบ และแตะใช้วิชาประจำสายบนแถบวิชาด้านล่าง"
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
    },
    territory_contested: {
      title: "สัญญาณศึกแดนศักดิ์สิทธิ์",
      subtitle: "เสาธงอาคมถูกโจมตี! นักรบกิลด์จงรุดไปสกัดกั้น",
      text: "สัญญาณศึกดังขึ้นแล้ว! เสาธงอาคมของเรากำลังถูกเข้าตี รีบไปสกัดกั้นเร็วเข้า!",
      cooldown: 25000,
      alert: true,
      icon: "🚩"
    },
    territory_captured: {
      title: "ชัยชนะแห่งสงครามกิลด์",
      subtitle: "ยึดเสาธงอาคมสำเร็จ! สถาปนาอำนาจครองแดน",
      text: "ชัยชนะเป็นของเรา! เสาธงแดนศักดิ์สิทธิ์ถูกสถาปนาขึ้นแล้ว อำนาจแห่งกิลด์จงเจริญ!",
      cooldown: 20000,
      alert: false,
      icon: "🏆"
    },
    mount_summon: {
      title: "ม้าทรงอาคม",
      subtitle: "ควบขี่ม้าทรงมนตรา ท่องแดนไสยเวทได้รวดเร็วขึ้น",
      text: "ม้าทรงอาคมพร้อมออกศึกแล้ว! ควบทะยานข้ามแดนได้อย่างรวดเร็ว",
      cooldown: 12000,
      alert: false,
      icon: "🐎"
    },
    blood_moon_rise: {
      title: "ราตรีจันทร์สีเลือด",
      subtitle: "จันทร์เพ็ญสีเลือดปรากฏ! อสูรดุร้ายขึ้น แต่พลังอาคมพรั่งพรู",
      text: "ระวังตัวให้ดี! จันทร์สีเลือดลอยเด่นเหนือฟ้า มนต์ดำครอบงำเหล่าอสูร ทว่าพลังอาคมและค่าประสบการณ์จักทวีคูณ!",
      cooldown: 30000,
      alert: true,
      icon: "🌕"
    },
    banner_planted: {
      title: "ธงชัยอาคม",
      subtitle: "ปักธงชัยอาคมพิทักษ์พันธมิตรกิลด์ เพิ่มพลังป้องกันและต้านทานอาถรรพ์",
      text: "ปักธงชัยอาคม! แนวพิทักษ์แห่งกิลด์เริ่มทำงาน เหล่าพันธมิตรจงรวมพลังในรัศมีอาคม",
      cooldown: 15000,
      alert: true,
      icon: "🚩"
    },
    banner_expired: {
      title: "ธงชัยสิ้นฤทธิ์",
      subtitle: "อาคมพิทักษ์ของธงชัยจางหายไปแล้ว",
      text: "ธงชัยอาคมสิ้นฤทธิ์มนตราแล้ว จงระวังตัวและถอยร่นเข้าสู่แนวปลอดภัย",
      cooldown: 20000,
      alert: false,
      icon: "🏳️"
    },
    familiar_summon: {
      title: "ภูติอาคมคู่หู",
      subtitle: "อัญเชิญกุมารทอง/พญาครุฑน้อยเคียงข้าง ช่วยรบและค้นหาไอเทม",
      text: "ภูติอาคมคู่หูพร้อมเคียงข้างท่านแล้ว! กุมารน้อยจะช่วยสอดส่องและคุ้มกันภัย",
      cooldown: 12000,
      alert: true,
      icon: "✨"
    },
    familiar_treasure: {
      title: "สัมผัสไอเวทสมบัติ",
      subtitle: "ภูติอาคมตรวจพบแหล่งพลังงานหรือสมบัติล้ำค่าใกล้ตัว",
      text: "ภูติอาคมตรวจพบแหล่งพลังเวทหรือสมบัติล้ำค่าในบริเวณใกล้เคียง รีบตามไปดูเร็ว!",
      cooldown: 25000,
      alert: true,
      icon: "💎"
    },
    flight_takeoff: {
      title: "สยายปีกเวหา",
      subtitle: "กางปีกเทวะมนตรา ทะยานลอยตัวขึ้นสู่ท้องฟ้า",
      text: "สยายปีกมนตราทะยานสู่เวหา! ควบคุมกระแสลมเหนือสมรภูมิ",
      cooldown: 8000,
      alert: true,
      icon: "🪽"
    },
    flight_slam: {
      title: "ธรณีสะท้านปฐพี",
      subtitle: "พุ่งดิ่งลงจากเวหาฟาดคลื่นพลังทำลายล้าง",
      text: "พุ่งกระแทกธรณีสะท้านปฐพี! คลื่นอัดกระแทกกระจายรอบทิศ",
      cooldown: 10000,
      alert: true,
      icon: "⚡"
    },
    boss_titan_spawn: {
      title: "ท้าวเวสสุวรรณเทวราช",
      subtitle: "จอมอสูรเทวะผู้พิทักษ์ทิศอุดรปรากฏกาย!",
      text: "ท้าวเวสสุวรรณเทวราชปรากฏกายแล้ว! ระวังพลังอสนีบาตจากกระบองยันต์",
      cooldown: 20000,
      alert: true,
      icon: "👹"
    },
    boss_titan_stagger: {
      title: "เกราะอสูรสะท้าน",
      subtitle: "ท้าวเวสสุวรรณสูญเสียสมดุลชั่วคราว!",
      text: "เกราะอาคมของท้าวเวสสุวรรณแตกแล้ว! ระดมโจมตีจุดอ่อนเร็วเข้า!",
      cooldown: 15000,
      alert: true,
      icon: "💥"
    }
  };

  const VOICE_PERSONAS = {
    elder: {
      id: "elder",
      name: "พราหมณ์เฒ่า",
      role: "ผู้หยั่งรู้และชี้แนะแห่งแดนมนตรา",
      icon: "🧙‍♂️",
      pitch: 0.82,
      rate: 0.88
    },
    warrior: {
      id: "warrior",
      name: "นักรบมนตรา",
      role: "ยอดนักรบเพลงยุทธ์ผู้เจนสมรภูมิ",
      icon: "⚔️",
      pitch: 0.95,
      rate: 1.08
    },
    spirit: {
      id: "spirit",
      name: "วิญญาณผู้พิทักษ์",
      role: "จิตวิญญาณศักดิ์สิทธิ์ผู้ปกปักษ์แดนลี้ลับ",
      icon: "✨",
      pitch: 1.16,
      rate: 0.92
    }
  };

  function getVoicePersona() {
    try {
      const p = localStorage.getItem("montra_voice_persona");
      return VOICE_PERSONAS[p] ? p : "elder";
    } catch (_) {
      return "elder";
    }
  }

  function setVoicePersona(id) {
    if (!VOICE_PERSONAS[id]) return false;
    try {
      localStorage.setItem("montra_voice_persona", id);
    } catch (_) {}
    const p = VOICE_PERSONAS[id];
    if (typeof floatAtPlayer === "function" && typeof localId !== "undefined") {
      floatAtPlayer(localId, `สลับเสียงผู้ชี้แนะ: ${p.name} ${p.icon}`, "status");
    }
    SFX("bell", { intensity: 1.2, pitch: p.pitch });
    triggerWhisper(`จิตวิญญาณแห่ง${p.name} สถิตเคียงข้างเจ้าแล้ว`, { persona: id });
    return true;
  }

  function triggerWhisper(text, options = {}) {
    if (!isVoiceGuidanceEnabled()) return;
    const personaId = options.persona || getVoicePersona();
    const persona = VOICE_PERSONAS[personaId] || VOICE_PERSONAS.elder;
    SFX("whisper", { intensity: options.intensity || 1.1 });
    playVoiceGuidance({ title: options.title || persona.name, subtitle: text, text, icon: persona.icon }, null,
      { persona: personaId, whisper: true });
  }

  const lastCombatCalloutTimes = new Map();
  function triggerCombatCallout(key) {
    if (!isVoiceGuidanceEnabled()) return;
    const item = TYPHOON_COMBAT_CALLOUTS[key];
    if (!item) return;
    const now = performance.now();
    const last = lastCombatCalloutTimes.get(key);
    if (last !== undefined && now - last < item.cooldown) return;
    lastCombatCalloutTimes.set(key, now);

    playVoiceGuidance(item);
  }

  let voiceGuidancePlayback = null;
  const attemptedVoiceGuidance = new Set();

  function isVoiceGuidanceEnabled() {
    try { return localStorage.getItem("montra_voice_guidance") !== "false"; }
    catch (_) { return true; }
  }
  function setVoiceGuidanceEnabled(enabled) {
    try { localStorage.setItem("montra_voice_guidance", enabled ? "true" : "false"); }
    catch (_) {}
    if (!enabled && voiceGuidancePlayback) {
      const active = voiceGuidancePlayback.active;
      voiceGuidancePlayback = null;
      if (active) window.MontraAudio?.stopSpeech?.();
    }
  }
  function playVoiceGuidance(item, playedKey = null, speechOptions = {}) {
    const personaId = speechOptions.persona || getVoicePersona();
    const persona = VOICE_PERSONAS[personaId] || VOICE_PERSONAS.elder;
    // Replace the owner before speak() cancels the old session synchronously.
    const playback = voiceGuidancePlayback = { item, playedKey, speechOptions, active: true };
    // Guidance is audio-only. Recovery remains in Sound settings (replay).
    const failed = () => {
      if (voiceGuidancePlayback !== playback) return;
      playback.active = false;
    };
    try {
      if (!window.MontraAudio?.speak) { failed(); return; }
      window.MontraAudio.speak(item.text, {
        persona: personaId,
        pitch: persona.pitch,
        rate: persona.rate,
        onStart: () => {
          if (voiceGuidancePlayback !== playback) return;
          // A rejected/autoplay-blocked attempt must not permanently consume it.
          if (playedKey) { try { localStorage.setItem(playedKey, "1"); } catch (_) {} }
        },
        onEnd: () => {
          if (voiceGuidancePlayback !== playback) return;
          voiceGuidancePlayback = null;
        },
        onError: failed
      });
    } catch (_) { failed(); }
  }
  function triggerVoiceGuidance(stepKey) {
    if (!isVoiceGuidanceEnabled() || attemptedVoiceGuidance.has(stepKey)) return;
    const item = TYPHOON_VOICE_GUIDANCE[stepKey];
    if (!item) return;
    const key = "montra_vg_played_" + stepKey;
    try { if (localStorage.getItem(key)) return; } catch (_) {}
    // Do not retry from repeated game events. Recovery is an explicit settings replay, or
    // a later page visit if playback never started.
    attemptedVoiceGuidance.add(stepKey);
    playVoiceGuidance(item, key);
  }
  function replayVoiceGuidance() {
    if (!isVoiceGuidanceEnabled()) return;
    voiceGuidancePlayback = null;
    window.MontraAudio?.stopSpeech?.();
    for (const stepKey of Object.keys(TYPHOON_VOICE_GUIDANCE)) {
      try { localStorage.removeItem("montra_vg_played_" + stepKey); } catch (_) {}
    }
    attemptedVoiceGuidance.clear();
    triggerVoiceGuidance("move");
  }

  window.MontraVoice = {
    getPersona: getVoicePersona,
    setPersona: setVoicePersona,
    getPersonas: () => Object.values(VOICE_PERSONAS),
    triggerWhisper,
    isVoiceEnabled: isVoiceGuidanceEnabled,
    setVoiceEnabled: setVoiceGuidanceEnabled
  };

  // Sound effects (audio.js). Safe no-op until audio is unlocked by the first tap.
  const SFX = (name, opts) => window.MontraAudio?.play(name, opts);
