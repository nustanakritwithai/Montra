// Local display preferences only. No authoritative character or account state.
// Classic-script module: keep Babylon/Colyseus loading unchanged.
"use strict";
globalThis.MontraSlotStorage = Object.freeze({
  create({ getStorage, URL: URLConstructor }) {
  function preferredSlotKey(endpoint) {
    return "montra_character_slot:" + new URLConstructor(endpoint).host;
  }
  function slotPreviewKey(endpoint) {
    return "montra_character_slots_preview:" + new URLConstructor(endpoint).host;
  }
  function getPreferredSlot(endpoint) {
    try {
      const slot = Number(getStorage().getItem(preferredSlotKey(endpoint)) || 1);
      return [1,2,3].includes(slot) ? slot : 1;
    } catch (_) { return 1; }
  }
  function readSlotPreviews(endpoint) {
    try {
      const parsed = JSON.parse(getStorage().getItem(slotPreviewKey(endpoint)) || "[]");
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
    try { getStorage().setItem(slotPreviewKey(endpoint), JSON.stringify(cleaned)); }
    catch (_) { /* only local preview, server remains authoritative */ }
  }
    return Object.freeze({ preferredSlotKey, slotPreviewKey, getPreferredSlot, readSlotPreviews, rememberSlotPreviews });
  },
});
