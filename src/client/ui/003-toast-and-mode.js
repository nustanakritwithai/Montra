  function toast(message) {
    SFX("toast");
    positionSwordToast();
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2800);
  }
  function setModeBadge(live) {
    ui.modeBadge.textContent = live ? "LIVE" : "DEMO";
    ui.modeBadge.classList.toggle("live", live);
  }
  if (!window.BABYLON) {
    ui.loadingText.textContent = "โหลด Babylon.js ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วโหลดใหม่";
    window.MontraEntry?.worldUnavailable("ดาวน์โหลดฉากเกมไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง");
    return;
  }

