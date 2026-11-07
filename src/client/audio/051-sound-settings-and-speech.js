  // Taps on any game button give a soft woodblock click.
  document.addEventListener("click", event => { if (event.target.closest?.("button") && !event.target.closest("#drawerClose")) SFX("tap"); }, true);
  // Sound settings, shown at the top of the help sheet.
  const SKILL_VOICE_SHOUTS = {
    phuttha_core: "ฟันพุทธไธสวรรย์!",
    sritra_core: "ศรีตรีงาย!",
    atamat_core: "ดาบอาทมาต!",
    chumphon_core: "ยันต์ชุมพร!",
    blade_vanish: "อำพรางเงา!",
    blade_heavy: "ดาบสังหาร!",
    blade_withdraw: "ถอยตวัดฟัน!",
    blade_fury: "เพลงดาบคลั่ง!",
    chaiya: "มวยไชยา!",
    muay_chaiya: "มวยไชยา!",
    korat: "หมัดโคราช!",
    muay_korat: "หมัดโคราช!",
    lopburi: "หมัดลพบุรี!",
    muay_lopburi: "หมัดลพบุรี!",
    thasao: "เตะท่าเสา!",
    muay_thasao: "เตะท่าเสา!",
    seer_pot: "หม้อสะกดวิญญาณ!",
    seer_binding: "อาคมพันธนาการ!",
    seer_poison: "น้ำมันพราย!",
    seer_buffalo: "วัวธนูอาคม!",
    mender_core_heal: "น้ำมนต์ศักดิ์สิทธิ์!",
    mender_core_circle: "วงเวทคุ้มครอง!",
    mender_core_ward: "กำแพงแก้วเจ็ดชั้น!",
    mender_core_cleanse: "ปัดเป่าคุณไสย!",
    shock: "คลื่นกระแทก!",
    bulwark: "ปราการศิลา!",
    riposte: "ดาบสวนกลับ!",
    protect: "คุ้มกันสหาย!"
  };
  function soundSettingsHtml() {
    const a = window.MontraAudio?.settings; if (!a) return "";
    const row = (key, label) => `<label class="field sound-row">${label}<input type="range" min="0" max="100" step="5" data-sound="${key}" value="${Math.round((a[key] ?? 0.8) * 100)}"></label>`;
    return `<section class="sound-settings"><h3>เสียง</h3><label class="field sound-row"><input type="checkbox" data-sound="muted" ${a.muted ? "" : "checked"}> เปิดเสียง</label>` +
      row("master", "ความดังรวม") + row("voice", "เสียงพูดและพากย์ไทย") + `<label class="field sound-row"><input type="checkbox" id="toggleVoiceGuidance" ${isVoiceGuidanceEnabled() ? "checked" : ""}> 🎙️ เสียงพูดชี้แนะผู้เล่นใหม่ (Typhoon Voice)</label>` + `<button type="button" id="testVoiceBtn" class="secondary" style="margin:8px 0;width:100%;font-weight:600">🔊 ทดสอบเสียงพูดภาษาไทย (กดเพื่อฟัง)</button>` +
      row("sfx", "เอฟเฟกต์และการต่อสู้") + row("ambience", "บรรยากาศ") + row("music", "ดนตรี") + row("ui", "ปุ่มและการแจ้งเตือน") + `</section>`;
  }
  function lightSettingsHtml() {
    return `<section class="light-settings"><h3>ความสว่าง</h3><div class="light-choice" role="radiogroup">` +
      Object.entries(LIGHT_LEVELS).map(([id, l]) => `<button type="button" role="radio" data-light="${id}" aria-checked="${id === lightLevelId}">${l.name}</button>`).join("") + `</div></section>`;
  }
  function bindLightSettings(root) {
    for (const b of root.querySelectorAll("[data-light]")) b.addEventListener("click", () => {
      setLightLevel(b.dataset.light);
      for (const o of root.querySelectorAll("[data-light]")) o.setAttribute("aria-checked", String(o === b));
    });
  }
  function bindSoundSettings(root) {
    for (const input of root.querySelectorAll("[data-sound]")) input.addEventListener("input", () => {
      const key = input.dataset.sound;
      if (key === "muted") window.MontraAudio?.set("muted", !input.checked); else window.MontraAudio?.set(key, Number(input.value) / 100);
      if (key === "voice") window.MontraAudio?.speak?.("ทดสอบระดับเสียงพูด", { persona: "guide" });
      else if (key !== "muted") SFX(key === "ui" ? "tap" : "fist", { intensity: .6 });
    });
    const vGuideToggle = root.querySelector("#toggleVoiceGuidance");
    if (vGuideToggle) vGuideToggle.addEventListener("change", () => {
      setVoiceGuidanceEnabled(vGuideToggle.checked);
    });
    const testBtn = root.querySelector("#testVoiceBtn");
    if (testBtn) bindSpeechButton(testBtn, "สวัสดี ยินดีต้อนรับสู่อาณาจักรมนตรา ระบบเสียงพูดภาษาไทยพร้อมใช้งานแล้ว", "guide", "🔊 ทดสอบเสียงพูดภาษาไทย (กดเพื่อฟัง)");
  }
  function bindSpeechButton(button, text, persona, label) {
    let status = button.montraSpeechStatus;
    if (status) window.MontraAudio?.stopSpeech?.();
    else {
      status = button.montraSpeechStatus = document.createElement("p");
      status.className = "note";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      button.after(status);
    }
    const privacy = "หากอุปกรณ์ไม่มีเสียงไทย ข้อความจะส่งให้ Google เพื่ออ่านเสียง (ไม่เกิน 190 ตัวอักษร)";
    status.textContent = privacy;
    button.textContent = label;
    button.onclick = () => {
      if (window.MontraAudio?.isSpeaking?.()) {
        window.MontraAudio.stopSpeech();
        button.textContent = label;
        status.textContent = privacy;
        return;
      }
      button.textContent = "ยกเลิกการเตรียมเสียง";
      status.textContent = "กำลังเตรียมเสียง…";
      if (!window.MontraAudio?.speak) {
        button.textContent = label;
        status.textContent = "ระบบเสียงยังไม่พร้อม กรุณาโหลดหน้าใหม่";
        return;
      }
      window.MontraAudio.speak(text, {
        persona,
        onStart: () => { button.textContent = "⏹ หยุดเสียงพูด"; status.textContent = "กำลังเล่นเสียง"; },
        onEnd: () => { button.textContent = label; status.textContent = privacy; },
        onError: event => {
          button.textContent = label;
          status.textContent = event?.error === "muted" ? "กรุณาเปิดเสียงและเพิ่มความดังรวมกับเสียงพูด" :
            event?.error === "not-allowed" ? "เบราว์เซอร์ไม่อนุญาตให้เล่นเสียง ลองกดฟังอีกครั้งหรือตรวจสิทธิ์เสียงของเว็บไซต์" :
            "เล่นเสียงไม่ได้ ตรวจอินเทอร์เน็ตหรือเสียงภาษาไทยของอุปกรณ์ แล้วกดฟังอีกครั้ง";
        }
      });
    };
  }

