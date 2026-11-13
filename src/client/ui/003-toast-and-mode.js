  function toast(message) {
    const status = (!ui.drawer.hidden && $("drawerStatus")) || $("toast");
    if (status) status.textContent = message;
    window.MontraAudio?.notify?.(message);
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

