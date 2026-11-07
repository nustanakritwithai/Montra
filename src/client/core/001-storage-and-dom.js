  "use strict";

  const $ = (id) => document.getElementById(id);
  // Separate HTTPS origin for the Windows VPS. Caddy must proxy it to 127.0.0.1:4108.
  const MONTRA_VPS_URL = "https://montra.157-85-96-139.sslip.io";
  function currentCharacterEndpoint() {
    try { return localStorage.getItem("montra_endpoint") || MONTRA_VPS_URL; }
    catch (_) { return MONTRA_VPS_URL; }
  }
  const { preferredSlotKey, slotPreviewKey, getPreferredSlot, readSlotPreviews, rememberSlotPreviews } =
    globalThis.MontraSlotStorage.create({ getStorage: () => localStorage, URL });
  let activeCharacterSlot = null;
  const { terrainCell, terrainHeight, smoothPath } = globalThis.MontraWorldMath;
  const itemPresentation = globalThis.MontraItemPresentation.create({
    getStatNames: () => statNames,
    getBodyLabels: () => bodyLabels,
    getPreferredGearSlot: () => preferredGearSlot,
    getWeaponMeta: () => WEAPON_META,
    getPersonalItems: () => personalItems,
    getGearSymbols: () => gearSymbols,
    getPotionItemId: () => POTION_ITEM_ID,
    getShrineShard: () => SHRINE_SHARD,
    getDocument: () => document,
    getInventoryState: () => inventoryState,
    getGearGuides: () => gearGuides,
    getForgeNames: () => forgeNames,
    getElementLookup: () => $,
    getCurrentEquippedWeaponSlot: () => currentEquippedWeaponSlot,
    getOwnServerCharacter: () => ownServerCharacter,
  });
  const ui = {
    loading: $("loading"), loadingText: $("loadingText"), world: $("world"), toast: $("toast"),
    modeBadge: $("modeBadge"), onlineCount: $("onlineCount"), drawer: $("drawer"),
    drawerBody: $("drawerBody"), drawerTitle: $("drawerTitle"), shade: $("shade"),
    minimap: $("minimap"), quest: $("quest"),
    pkPanel: $("pkPanel"), pkTitle: $("pkTitle"), pkText: $("pkText"),
    pkHpTrack: $("pkHpTrack"), pkHpBar: $("pkHpBar"), pkHint: $("pkHint"),
    monsterStatus: $("monsterStatus"), monsterText: $("monsterText"),
    monsterBar: $("monsterBar"), monsterHint: $("monsterHint"),
  };
  let toastTimer;
  function positionSwordToast() {
    const anchor=document.querySelector(".field-prompts .warp-button:not([hidden]), .controls .sword-status:not([hidden]), .controls .sword-hotbar:not([hidden])");
    if (!anchor) { ui.toast.style.removeProperty("bottom"); return; }
    const game=$("game").getBoundingClientRect(), area=anchor.getBoundingClientRect();
    ui.toast.style.bottom=Math.max(0,game.bottom-area.top+8)+"px";
  }

