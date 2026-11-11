  let mode = "demo", room = null, localId = "demo", demoDest = null, onlinePlayers = new Map();
  let economyGold = null, economyListings = [], activeTrade = null, economyPending = false;
  let economyTimer = null, economyTab = "market", tradeUnread = false;
  let centralMarketVersion=0,centralAuctions=[],centralMine=[],centralSupply=null,centralCredit=0,marketNextCursor=null,marketPageTag=0,marketPageRequest=null,marketPageTimer=null,marketPageError="";
  let marketFilters={fixed:{query:"",category:"all",ownOnly:false},auction:{query:"",category:"all",ownOnly:false}};
  function resetCentralMarket(){centralMarketVersion=0;centralAuctions=[];centralMine=[];centralSupply=null;centralCredit=0;marketNextCursor=null;marketPageTag++;marketPageRequest=null;clearTimeout(marketPageTimer);marketPageError="";marketFilters={fixed:{query:"",category:"all",ownOnly:false},auction:{query:"",category:"all",ownOnly:false}};}
  let partyState = null, partyInvitation = null, partyUnread = false;
  let guildState = null, guildInvitation = null, guildUnread = false;
  let guildDirectory = null, guildRecruitment = {pending:null,applications:[]};
  let territoryState=null,territoryReceivedAt=0;
  // Inventory is never stored in localStorage: LIVE comes from VPS each join.
  const LEGACY_INVENTORY_SLOTS = 12;
  const INVENTORY_SLOTS = 108;
  const POTION_ITEM_ID = "health_potion";
  const SHRINE_SHARD = "shrine_shard";
  const shardName = "เศษตราผู้พิทักษ์";
  const WEAPON_META = Object.freeze({
    muay_wraps: { name: "ผ้าคาดเชือก", symbol: "✊", melee:4, bonus: "ผ้าพันมือสำหรับวิชามวย · โจมตีประชิด +4" },
    shrine_glaive: { name: "ง้าวจันทร์ผู้พิทักษ์", symbol: "☾", melee:10, bonus: "หายาก · iLv 12 · ประชิด +10 เมื่อสู้มอนสเตอร์ / +8 ใน PvP" },
    ritual_dagger: { name: "มีดหมอ", symbol: "🗡️", melee:4, bonus: "โจมตีประชิด +4" },
    arcane_sword: { name: "กระบี่อาคม", symbol: "⚔️", melee:8, bonus: "โจมตีประชิด +8" },
    spirit_staff: { name: "คทาวิญญาณ", symbol: "🔱", ranged:6, bonus: "ยิงอาคม +6" },
  });
  let personalItems = Object.create(null), workbenchGold = 0, cardDrill=null, catalogRevision=0, gearGuides=null;
  let resources=null,resourceViewMap="",refineInput=2,resourceReadyAt=0,resourceChoice="",harvestFocus=null;
  let fishingSelect=false, fishingState=null, fishingPending=false, fishingPendingUntil=0, fishingFloat=null, fishingLine=null,fishSavedItem=null,fishFloatAt=0;
  const fishingPickers=[];
