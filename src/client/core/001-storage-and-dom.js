  "use strict";

  const $ = (id) => document.getElementById(id);
  // Separate HTTPS origin for the Windows VPS. Caddy must proxy it to 127.0.0.1:4108.
  const MONTRA_VPS_URL = "https://montra.157-85-96-139.sslip.io";
  function currentCharacterEndpoint() {
    try { return localStorage.getItem("montra_endpoint") || MONTRA_VPS_URL; }
    catch (_) { return MONTRA_VPS_URL; }
  }
  function preferredSlotKey(endpoint) {
    return "montra_character_slot:" + new URL(endpoint).host;
  }
  function slotPreviewKey(endpoint) {
    return "montra_character_slots_preview:" + new URL(endpoint).host;
  }
  function getPreferredSlot(endpoint) {
    try {
      const slot = Number(localStorage.getItem(preferredSlotKey(endpoint)) || 1);
      return [1,2,3].includes(slot) ? slot : 1;
    } catch (_) { return 1; }
  }
  function readSlotPreviews(endpoint) {
    try {
      const parsed = JSON.parse(localStorage.getItem(slotPreviewKey(endpoint)) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  function rememberSlotPreviews(endpoint, slots) {
    if (!Array.isArray(slots) || slots.length !== 3) return;
    const cleaned = slots.map((entry, index) => ({
      slot: index + 1,
      occupied: entry?.occupied === true,
      unavailable: entry?.unavailable === true,
      name: typeof entry?.name === "string" ? entry.name.slice(0, 24) : "",
      level: Number.isSafeInteger(entry?.level) ? entry.level : 0,
    }));
    try { localStorage.setItem(slotPreviewKey(endpoint), JSON.stringify(cleaned)); }
    catch (_) { /* only local preview, server remains authoritative */ }
  }
  let activeCharacterSlot = null;
  const ui = {
    loading: $("loading"), loadingText: $("loadingText"), world: $("world"),
    modeBadge: $("modeBadge"), onlineCount: $("onlineCount"), drawer: $("drawer"),
    drawerBody: $("drawerBody"), drawerTitle: $("drawerTitle"), shade: $("shade"),
    minimap: $("minimap"), quest: $("quest"),
    pkPanel: $("pkPanel"), pkTitle: $("pkTitle"), pkText: $("pkText"),
    pkHpTrack: $("pkHpTrack"), pkHpBar: $("pkHpBar"), pkHint: $("pkHint"),
  };

