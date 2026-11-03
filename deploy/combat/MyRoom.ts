import { FORGE } from "./ForgeRules.js";
import { accounts } from "./AccountService.js";
import { Room, matchMaker, type Client, type CloseCode } from "colyseus";
import { WAR_SIDE_SIZE, WAR_HOLD, warSites, type Battlefield, type WarSide } from "./TerritoryWar.js";
import {parseGovernmentOrder} from "./TerritoryGovernment.js";
import { RIDGE_PASS } from "./GroundTerrain.js";
import {RIVER_CITY,riverNodes,riverPosts,riverSupplied} from "./RiverCity.js";
import {CASTLE_ID,CASTLE_SEATS,CAPTURE_RADIUS,castleObjectives,musterNodes,pilotSpawn,forwardCamps,castleLogistics} from "./CastlePilot.js";
import { Encoder, StateView } from "@colyseus/schema";
import { randomUUID } from "node:crypto";
import {
  CHARACTER_SAVE_INTERVAL_MS, characterStore, characterIdFromToken,
  claimCharacter, releaseCharacter, getGuestToken, parseCharacterName,
  parseCharacterSlot, CHARACTER_SLOTS,
} from "./CharacterStore.js";
import { MyRoomState, Player, SummonedGuardian, type Monster } from "./schema/MyRoomState.js";
import {
  RULES,
  CommandBucket,
  type Vec2,
  clampToMap,
  facingTo,
  parseMoveCommand,
  parseAttackCommand,
  parsePkTargetCommand,
  parseEmptyCommand,
  planarDistance,
  stepTowards,
} from "./GameRules.js";
import {
  FORT, distance3d, isOnPlatform, isOnGround, isOnTop, touchesWallBody,
  parseClimbRequest, progressClimb, step3d,
  FLIGHT, isFlightAltitude, flightLandingHeight, progressFlightHeight,
  type WorldPoint,
} from "./HeightRules.js";
import {
  MonsterRRTNavigator, isMonsterSegmentClear,
} from "./MonsterRRT.js";
import { parseDashCommand, advanceDash, type DashDirection } from "./DashRules.js";
import type { CharacterSnapshot } from "./CharacterStore.js";
import { isAtlasMap } from "./WorldAtlas.js";
import { TEMPLE_ID } from "./TempleMap.js";
import { DEFAULT_MAP_ID, getWorldMap, groundAt, surfaceLayer, meleeHeightBlocked, onMapGround, getSafeMapSpawn, isSafeWorldPoint, isRestArea, isWorldSegmentClear, VILLAGE_ARRIVALS, WORLD_ROOM_CAPACITY, WORLD_MAPS, WORLD_EXPANSION } from "./WorldMaps.js";
import { provinceShotClear, segmentIntersectsExpandedWall } from "./WorldMaps.js";
import { crestCorners, onRampart, wallRing } from "./StrategicProvinces.js";
import { checkWarp, WARP_COMBAT_LOCK_MS } from "./WarpRules.js";
import { parseChatMessage } from "./ChatRules.js";
import { saveBugReport } from "./BugReports.js";
import { BuffBook, POSSESSION_BUFF, possessionCoolingDown, rememberPossessionCooldown } from "./Buffs.js";
import { BUILD_CATALOG, DEFAULT_WARD_TALENT, DUAL_SWORD, isOccultPath, talentGroup, classSkill, parseBuild, type CharacterBuild } from "./CharacterBuilds.js";
import { BuffLedger } from "./BuffLedger.js";
import { OCCULT_LESSONS, OCCULT_MASTERY_LABELS, OCCULT_MASTERY_REQUIREMENTS, OCCULT_RANKABLE_SKILLS, newOccultBook, occultPoints, occultRankCost, validateOccultBook, type OccultBook, type OccultLesson, type OccultSkillId, type OccultPath, type OccultMastery } from "./OccultRules.js";
import { BLADE_LESSONS, BLADE_PRACTICE_LABELS, BLADE_RANKABLE_SKILLS, bladePoints, newBladeBook, validateBladeBook, type BladeBook, type BladeLesson, type BladeSkillId } from "./BladeRules.js";
import { SENTINEL_CORE, sentinelCoreProgress, SENTINEL_LESSONS, SENTINEL_PRACTICE_LABELS, SENTINEL_RANKABLE_SKILLS, SENTINEL_CONTROL, sentinelPoints, newSentinelBook, validateSentinelBook, type SentinelCoreId, type SentinelBook, type SentinelLesson, type SentinelSkillId } from "./SentinelRules.js";
import { calculateModifiedStats, STACKING_RULES } from "./StatModifiers.js";
import { POSSESSION_MODIFIER, TALISMAN, MENDER_PVE_RICE_MULTIPLIER, SWORD_CORE, swordCoreProgress, SWORD_SCHOOLS, SWORD_NODES, SWORD_RANKABLE_SKILLS, SWORD_PVP_DAMAGE_MULTIPLIER, newSwordTree, emptySwordLoadouts, swordPoints, type SwordCoreId, type SwordTree, type SwordSchool } from "./SkillCatalog.js";
import { isMuayFoundation, MUAY_CORE, MUAY_CORE_LEVELS, MUAY_CORE_POINT_LEVELS, MUAY_CORE_MANA_PER_RANK, muayCorePoints, muayCoreManaCost, muayCoreProgress, MUAY_BASE_SKILLS, MUAY_COMBOS, MUAY_COMBO_MOVES, MUAY_COMBO_MULTIPLIER, MUAY_COMBO_WINDOW_MS, MUAY_FOLLOWUPS, MUAY_FOLLOWUP_WINDOW_MS, MUAY_MASTERY_GUIDES, MUAY_MASTERY_LABELS, MUAY_MASTERY_REQUIREMENTS, MUAY_RANKABLE_SKILLS, MUAY_INTERRUPT_MS, MUAY_INTERRUPT_IMMUNITY_MS, MUAY_GRAPPLE_HOLD_MS, MUAY_GRAPPLE_ESCAPE_STAMINA, MUAY_GRAPPLE_COUNTER_STAMINA, MUAY_GRAPPLE_COUNTER_WINDOW_MS, MUAY_GRAPPLE_COUNTER_RANGE, MUAY_PVP_COMBO_MULTIPLIER, MUAY_PVP_DAMAGE_MULTIPLIER, MUAY_LESSONS, MUAY_SCHOOLS, MUAY_SKILLS, MUAY_WRAP_ID, advanceMuayCombo, countsMuayTechnique, muayPoints, newMuayBook, newMuayLoadouts, type MuayCoreId, type MuayBook, type MuaySchool, type MuayComboState, type MuayLessonId, type MuaySkillId, type MuayCooldowns } from "./MuayRules.js";
import { WORKBENCH_GOLD, personalItem, wearsWraps, wearsTwinSwords, monsterCardDrop, bossTreasure } from "./PersonalItems.js";
import { CATALOG_PAGES } from "./MonsterLoot.js";
import { parseSocketOrder, DRILL_COST } from "./CardSockets.js";
import {personalGearGuides} from "./GearGuides.js";
import {getResourceNode,harvestableFrom,REFINE_INPUT} from "./WorldResources.js";
import { parseSellMaterial, parseCraft, parseForge, parseMarketCreate, parseMarketAction, parseTradeRequest, parseTradeId, parseTradeOffer } from "./EconomyRules.js";
import type { TradeOffer } from "./EconomyStore.js";
import { guildStore, guildOnline, notifyGuilds, subscribeGuild, parseGuildName, GUILD_MAX_MEMBERS } from "./GuildStore.js";
import { PartyManager, PARTY_XP_RADIUS, type Party } from "./PartyManager.js";
import { partyMonsterShares, type PartyRewardMember } from "./PartyMonsterRewards.js";
import type { MonsterTier } from "./MonsterProfiles.js";
import { PROGRESSION, SKILL_RANK_LEVELS, SKILL_RANK_PRACTICE, skillRankCost, skillRankMultiplier, supportRankMultiplier, addExperience, calculateDamage, calculateStats, emptyAllocations,
  monsterExperience, pointsAvailable, xpForNextLevel, type Allocations } from "./Progression.js";
import {
  POTION_COOLDOWN_MS, grantRewardPotion, grantStackReward, bossAccessoryReward, SHRINE_RECIPE, SHRINE_SHARD, SHRINE_GLAIVE, parseUseItemCommand,
  useInventoryItem, parseEquipWeaponCommand, equipInventoryWeapon, equipBody, parseBodyCommand, equippedStats, equipmentRatings, gearHealing, spiritGearPower, gearMana, overflowStaminaRegen, practiceLoot,
  equippedWeaponId, weaponBonuses, type InventorySnapshot,
} from "./ItemRules.js";

import { ForestEncounters } from "./ForestEncounters.js";

const worldDefinition=WORLD_EXPANSION?JSON.stringify({version:1,maps:WORLD_MAPS}):"";
const battlefieldWorldDefinition=WORLD_EXPANSION?JSON.stringify({version:1,maps:WORLD_MAPS},
  (key,value)=>key==="boss" && value?.id?.startsWith("boss_")?undefined:value):"";
const swordTreeCatalog=JSON.stringify({core:SWORD_CORE,coreLevels:MUAY_CORE_LEVELS,corePointLevels:MUAY_CORE_POINT_LEVELS,coreManaPerRank:1,coreProgress:Array.from({length:9},(_,rank)=>swordCoreProgress(rank)),schools:SWORD_SCHOOLS,nodes:SWORD_NODES,pvpDamage:SWORD_PVP_DAMAGE_MULTIPLIER,rankLevels:SKILL_RANK_LEVELS,rankPractice:SKILL_RANK_PRACTICE,rankable:SWORD_RANKABLE_SKILLS});
const muayBookCatalog=JSON.stringify({core:MUAY_CORE,coreLevels:MUAY_CORE_LEVELS,corePointLevels:MUAY_CORE_POINT_LEVELS,coreManaPerRank:MUAY_CORE_MANA_PER_RANK,coreProgress:Array.from({length:MUAY_CORE_LEVELS.length+1},(_,rank)=>muayCoreProgress(rank)),skills:MUAY_SKILLS,lessons:MUAY_LESSONS,base:MUAY_BASE_SKILLS,schools:MUAY_SCHOOLS,combos:MUAY_COMBOS,followups:MUAY_FOLLOWUPS,masteryGuides:MUAY_MASTERY_GUIDES,masteryLabels:MUAY_MASTERY_LABELS,masteryRequirements:MUAY_MASTERY_REQUIREMENTS,pvpDamage:MUAY_PVP_DAMAGE_MULTIPLIER,pvpCombo:MUAY_PVP_COMBO_MULTIPLIER,rankLevels:SKILL_RANK_LEVELS,rankPractice:SKILL_RANK_PRACTICE,rankable:MUAY_RANKABLE_SKILLS});
// Reserve static UTF-8 catalogs separately from player/monster replication.
const encoderBlock=64*1024;
const staticBytes=Buffer.byteLength(worldDefinition)+Buffer.byteLength(swordTreeCatalog)+Buffer.byteLength(muayBookCatalog);
Encoder.BUFFER_SIZE=Math.max(Encoder.BUFFER_SIZE,Math.ceil((staticBytes+32*1024)/encoderBlock)*encoderBlock);

const warRoomKey=randomUUID();
const battleRooms=new Map<number,Promise<string>>();
const admissions=new Map<string,{roomId:string;ticket:string;guild:string;side:WarSide;point:number;expires:number}>();
async function battleRoom(field:Battlefield):Promise<string>{
  let room=battleRooms.get(field.seq);
  if(!room){
    room=matchMaker.createRoom("my_room",{warRoomKey,field}).then(r=>r.roomId);
    battleRooms.set(field.seq,room);
    try{await room;}catch(e){if(battleRooms.get(field.seq)===room)battleRooms.delete(field.seq);throw e;}
  }
  return room;
}
type Gates = {
  move: CommandBucket; attack: CommandBucket; summon: CommandBucket;
  climb: CommandBucket; dash: CommandBucket; flight: CommandBucket;
  chat: CommandBucket; bugReport: CommandBucket; possession: CommandBucket; build: CommandBucket; swordTree: CommandBucket; occult: CommandBucket; economy: CommandBucket; party: CommandBucket; guild: CommandBucket;
};

type ActiveDash = DashDirection & { remaining: number };
type TradeSession = { id:string; a:string; b:string; expires:number; offers:Record<string, TradeOffer>; items:Record<string,{itemId:string;quantity:number}|null>; fingerprints:Record<string,string>; confirmed:Set<string> };

/**
 * MONTRA S1: one 20-Hz authoritative simulation per room.
 *
 * Clients only send "move" {x,z} and "attack" {targetId}; no damage, position
 * updates, HP or timestamps are trusted. Server movements are speed-limited;
 * all combat/AI/respawn timers use the SERVER'S fixed-step simulation clock.
 *
 * Existing public contract retained:
 *   room type "my_room"; monster id "possessed-1";
 *   state.players, state.monster; "combat_hit"/"combat_notice"/"monster_respawn".
 */
export class MyRoom extends Room<{ state: MyRoomState }> {
  maxClients:number = WORLD_ROOM_CAPACITY;
  state = new MyRoomState();

  private forest = new ForestEncounters(this.state.monsters);
  private getMonster(id:string): Monster | undefined { return id === RULES.monsterId ? this.state.monster : this.state.monsters.get(id); }
  private simulatedMs = 0;
  private field?:Battlefield;
  private warSeats=new Map<string,{guild:string;side:WarSide;camp:number}>();
  private warClients=new Set<string>();
  private warSent=new Map<string,string>();
  private nextWarSample=0;
  private previousPilotSample?:number;
  private gateClosed=false;
  private closedFieldGates=new Set<string>();
  private gateActions=new Map<string,number>();
  private battleActive=false;
  private destinations = new Map<string, Vec2>();
  private crestTurns=new Map<string,Vec2[]>();
  private activeDashes = new Map<string, ActiveDash>();
  private lastDashMs = new Map<string, number>();
  private attackTargets = new Map<string, string>();
  private mountHitSequence = new Map<string, number>();
  private lastMountMs = new Map<string, number>();
  private lastAttackMs = new Map<string, number>();
  private lastCombatMs = new Map<string, number>();
  private lastPvpMs=new Map<string,number>();
  private sentItemCatalog=new Set<string>();
  private resourceView=new WeakMap<Client,{mapId:string;stock:number[]}>();
  private supportManaCombatUntil = new Map<string, number>();
  private lastWarpMs = new Map<string, number>();
  private provinceClients = new Set<string>();
  private castleClients = new Set<string>();
  private restApproachClients = new Set<string>();
  private originalReliefClients=new Set<string>();
  private reliefClients = new Set<string>();
  private terrainClients = new Set<string>();
  private riverClients = new Set<string>();
  private atlasClients = new Set<string>();
  private templeClients = new Set<string>();
  private pendingWarps = new Set<string>();
  private statAllocations = new Map<string, Allocations>();
  private pendingRewards = new Map<string, Promise<void>>();
  private extraStaminaRegen=new WeakMap<Player,number>();
  private extraRestManaRegen=new WeakMap<Player,number>();
  private hpRegenRemainder = new Map<string, number>();
  private playerRespawnAt = new Map<string, number>();
  private playerSpawn = new Map<string, Vec2>();
  private gates = new Map<string, Gates>();
  private lastRejectNoticeMs = new Map<string, number>();
  private persistentCharacters = new Map<string, string>(); // session -> selected slot digest
  private accountSessions = new Map<string, string>(); // private credentials, never replicated or logged
  private activeGuestAccounts = new Map<string, string>(); // session -> legacy account digest
  private pendingCharacterLeaves = new Map<string, Promise<void>>(); // do not release before disk save
  private guestSlotIds = new Map<string, readonly string[]>(); // 3 derived IDs, never raw token
  private lastSlotListMs = new Map<string, number>();
  private lastRenameMs = new Map<string, number>();
  private nextCharacterSaveMs = CHARACTER_SAVE_INTERVAL_MS;
  // Inventory remains private per character, never broadcasts via Room Schema.
  private inventories = new Map<string, InventorySnapshot>();
  private pendingItemUses = new Map<string, Promise<void>>();
  private itemUseReadyAt = new Map<string, number>();
  private lastInventoryReadMs = new Map<string, number>();
  private lastStatusReadMs = new Map<string, number>();
  private lastWeaponEquipMs = new Map<string, number>();
  private trades = new Map<string, TradeSession>();
  private parties = new PartyManager();
  private buffs = new BuffBook();
  private effects = new BuffLedger();
  private swordTrees = new Map<string, SwordTree>();
  private muayCooldowns = new Map<string, MuayCooldowns>();
  private muayMoveIntent = new Map<string,{x:number;z:number}>();
  private muayCoreStances = new Map<string,{until:number;rank:number;nextCounter:number}>();
  private swordCoreStances = new Map<string,{until:number;rank:number;nextCounter:number}>();
  private swordCoreSequences = new Map<string,{targetId:string;next:number;remaining:number;rank:number}>();
  private muayCoreFollowups = new Map<string,{until:number;rank:number}>();
  private muayCoreSequences = new Map<string,{targetId:string;next:number;remaining:number;interval:number;power:number;skillId:"korat"|"thasao";rank:number}>();
  private muayCombos = new Map<string,MuayComboState>();
  private muayFollowups = new Map<string,{school:MuaySchool;targetId:string;until:number}>();
  private muayDefenseWindows = new Map<string,{kind:"parry"|"evade";until:number}>();
  private muayGrapples = new Map<string,{targetId:string;until:number}>();
  private muayHeldBy = new Map<string,string>();
  private muayGrappleImmunity = new Map<string,number>();
  private muayGrappleCounters = new Map<string,{targetId:string;until:number}>();
  private muayBooks = new Map<string, MuayBook>();
  // Occult books are private; sending them on request avoids inflating world snapshots.
  private occultBooks = new Map<string, OccultBook>();
  private bladeBooks = new Map<string, BladeBook>();
  private sentinelBooks = new Map<string, SentinelBook>();
  private sentinelStuns = new Map<string, number>();
  private sentinelCoreStances = new Map<string,{until:number;rank:number;nextCounter:number}>();
  private sentinelStunResists = new Map<string, number>();
  private sentinelWindups = new Map<string, {targetId:string;until:number;power:number}>();
  private sentinelCounters = new Map<string, number>();
  private sentinelAnchors = new Map<string, number>();
  private sentinelInterceptions = new Map<string, {ownerId:string;until:number;fraction:number}>();
  private sentinelLegacyTaunt = {ownerId:"",until:0,resistUntil:0};
  private bladeCloaks = new Map<string, number>();
  private bladeCasts = new Map<string, number>();
  private bladeMarks = new Map<string,{targetId:string;until:number}>();
  private bladeOpenings = new Map<string,number>();
  private bladeEvades = new Map<string,number>();
  private bladeWindups = new Map<string,{targetId:string;until:number;power:number;ambush:boolean}>();
  private occultMarks = new Map<string,{targetId:string;until:number}>();
  private occultCurses = new Map<string,{ownerId:string;until:number;nextTick:number;damage:number}>();
  private occultSpiritOrders = new Map<string,{targetId:string;until:number;skillId:"seer_spirit"|"seer_spirit_bind"}>();
  // Base spirit practice counts at most once per summon; commanded strikes count individually.
  private occultSpiritPracticed = new Set<string>();
  private occultHealingFields = new Map<string,{mapId:string;x:number;y:number;z:number;until:number;nextTick:number;power:number;range:number}>();
  private muayWrapGranted = new Set<string>();
  private swordCombos = new Map<string, {count:number; until:number}>();
  private swordGuards = new Map<string, {until:number; factor:number; direction:boolean; counterUntil:number}>();
  private guildSubscriptions = new Map<string,()=>void>();
  private guildInvites = new Map<string,{from:string;to:string;guildId:string;expires:number}>();

  private monsterRespawnAt = 0;
  private lastMonsterAttackMs = -Infinity;
  private monsterInterruptUntil = 0;
  private monsterInterruptResistUntil = 0;
  private monsterReturning = false;
  // RRT only replaces NPC navigation. All AI intent/combat rules stay put.
  private monsterNavigator = new MonsterRRTNavigator();

  // All guardian state lives on the server; no client may select NPC stats.
  private lastSummonAt = new Map<string, number>();
  private lastSummonAttackAt = new Map<string, number>();
  private climbs = new Map<string, WorldPoint>();
  private flightTransitions = new Map<string, { targetY: number; landing: boolean }>();

  private syncPlayerViews():void {
    for(const client of this.clients) {
      if(!client.view) continue;
      const allies=this.parties.get(client.sessionId)?.members;
      for(const [id,player] of this.state.players) {
        const canSee=id===client.sessionId || !this.bladeCloaks.has(id) || Boolean(allies?.includes(id));
        const visible=client.view.has(player);
        if(canSee && !visible)client.view.add(player);
        else if(!canSee && visible)client.view.remove(player);
      }
    }
  }

  private bladeHiddenFrom(viewerId:string,targetId:string):boolean {
    return this.bladeCloaks.has(targetId) && viewerId!==targetId && !this.parties.get(viewerId)?.members.includes(targetId);
  }

  private sameCombatMap(ownerId: string, targetId: string, allowConcealed=false): boolean {
    const owner = this.state.players.get(ownerId);
    if (!owner || this.pendingWarps.has(ownerId) || this.pendingWarps.has(targetId)) return false;
    if (isRestArea(owner.mapId, owner)) return false;
    const monster = this.getMonster(targetId);
    if (monster) return owner.mapId === monster.mapId && !isRestArea(monster.mapId, monster);
    if(this.field && (!this.battleActive || this.warSeats.get(ownerId)?.side===this.warSeats.get(targetId)?.side))return false;
    if (!this.field && this.parties.get(ownerId)?.members.includes(targetId)) return false;
    const target = this.state.players.get(targetId);
    if(!allowConcealed && target && this.bladeHiddenFrom(ownerId,targetId)) return false;
    return Boolean(target && target.mapId === owner.mapId && !isRestArea(target.mapId,target));
  }

  private blockMounted(client:Client):boolean {
    if (!this.state.players.get(client.sessionId)?.mounted) return false;
    this.reject(client,"dismount_required");
    return true;
  }
  private dismount(id:string, reason:string):void {
    const player=this.state.players.get(id);
    this.mountHitSequence.delete(id);
    if(!player?.mounted)return;
    player.mounted=false;
    this.broadcast("mount_changed",{playerId:id,mounted:false,reason},{afterNextPatch:true});
  }
  private buildPlayer(client: Client, gate: "build" | "swordTree" | "occult" = "build"): Player | undefined {
    const id = client.sessionId, player = this.state.players.get(id);
    if(this.sentinelStuns.has(id)) { this.reject(client,"sentinel_stunned"); return; }
    if(this.sentinelWindups.has(id)) { this.reject(client,"sentinel_windup_active"); return; }
    if(this.muayControlled(id)) { this.reject(client,"muay_controlled"); return; }
    if (!this.gates.get(id)?.[gate].consume(this.simulatedMs)) {
      this.reject(client, gate === "swordTree" ? "sword_tree_rate_limited" : gate === "occult" ? "occult_rate_limited" : "build_rate_limited");
    } else if (!player?.alive || !this.persistentCharacters.has(id)) {
      this.reject(client, "build_unavailable");
    } else if (this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingCharacterLeaves.has(id) || this.pendingRewards.has(id)) {
      this.reject(client, "character_busy");
    } else {
      return player;
    }
  }

  private playerBuild(player: Player): CharacterBuild | null {
    const base = {path: player.pathId, ancestry: player.ancestryId};
    // Keep default talents readable by builds predating the selection.
    const group = player.pathId === "blade" || player.pathId === "sentinel" ? talentGroup(player.pathId) : undefined;
    const id = player.bladeTalentId || player.wardTalentId;
    return parseBuild(group && id && id !== group.defaultId ? {...base, [group.field]:id} : base);
  }

  private selectBuild(client: Client, build: CharacterBuild): void {
    const id = client.sessionId, player = this.buildPlayer(client);
    if (!player) return;
    if (process.env.MONTRA_ACCOUNTS_REQUIRED !== "0" && player.pathId && player.pathId !== build.path)
      return this.reject(client, "class_permanent");
    const atShrine = player.mapId === DEFAULT_MAP_ID && onMapGround(player) && Math.hypot(player.x, player.z) <= 6;
    if (!atShrine || this.simulatedMs - (this.lastCombatMs.get(id) ?? -Infinity) < PROGRESSION.combatQuietMs)
      return this.reject(client, "build_needs_shrine");
    if (player.classSkillReadyAt > Date.now()) return this.reject(client, "class_skill_cooldown");
    // An older client may send only path and ancestry when editing an existing build.
    const group = talentGroup(build.path);
    const previous = player.pathId === build.path ? this.playerBuild(player) : null;
    const talent = group ? build[group.field] ?? previous?.[group.field] ?? group.defaultId : "";
    const currentTalent = player.bladeTalentId || player.wardTalentId;
    if (player.pathId === build.path && player.ancestryId === build.ancestry && currentTalent === talent) return;
    const base = {path:build.path, ancestry:build.ancestry};
    const selection = group && talent !== group.defaultId ? {...base, [group.field]:talent} : base;
    const snapshot = this.captureCharacterSnapshot(id);
    if (!snapshot) return;
    let grantedInventory: InventorySnapshot | undefined;
    if (build.path === "muay_boran" && !this.muayWrapGranted.has(id)) {
      const inventory = this.inventories.get(id);
      if (!inventory) return this.reject(client,"build_unavailable");
      const slots = inventory.slots.slice(), existing = slots.findIndex(slot => slot?.itemId === MUAY_WRAP_ID);
      const slot = existing >= 0 ? existing : slots.findIndex(item => item === null);
      if (slot < 0) return this.reject(client,"muay_inventory_full");
      if (existing < 0) slots[slot] = {itemId:MUAY_WRAP_ID,quantity:1};
      grantedInventory = {...inventory, slots, equippedWeaponSlot:slot};
    }
    this.pendingWarps.add(id);
    const task = characterStore.save({ ...snapshot, build: selection, ...(grantedInventory ? {inventory:grantedInventory, muayWrapGranted:true} : {}) }).then(() => {
      // Change temporary ritual state only after the new build is safely saved.
      if (player.pathId !== build.path) {
        this.sentinelAnchors.delete(id);this.sentinelCounters.delete(id);this.sentinelWindups.delete(id);
        this.effects.remove(id,"sentinel_step",id);this.effects.remove(id,"sentinel_anchor",id);this.effects.remove(id,"sentinel_core_bulwark",id);this.sentinelCoreStances.delete(id);
        for(const [member,link] of this.sentinelInterceptions)if(link.ownerId===id)this.sentinelInterceptions.delete(member);
        this.endBladeCloak(id,"class_changed");
        this.clearBladeMark(id);this.bladeOpenings.delete(id);this.bladeEvades.delete(id);this.bladeWindups.delete(id);this.bladeCasts.delete(id);
        this.effects.remove(id,"blade_focus",id);this.effects.remove(id,"blade_veil_guard",id);
        this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
        this.occultMarks.delete(id);
        this.occultSpiritOrders.delete(id);
        this.occultSpiritPracticed.delete(id);
        this.occultHealingFields.delete(id);
        for (const [target,curse] of this.occultCurses) if (curse.ownerId===id) this.clearOccultCurse(target,"class_changed");
      }
      if (!isOccultPath(build.path)) {
        this.endPossession(id, "class_changed");
        this.despawnSummon(id, "class_changed");
      }
      player.pathId = build.path;
      player.ancestryId = build.ancestry;
      this.swordGuards.delete(id);
      if(this.swordCoreStances.delete(id))this.sendSwordNotice(client,"sword_stance_end",{});
      this.swordCoreSequences.delete(id);
      this.clearMuayDefense(id,"cancelled");
      this.swordCombos.delete(id);
      this.clearMuayCombo(id);
      if (grantedInventory) {
        this.muayWrapGranted.add(id);
        this.inventories.set(id,grantedInventory);
        player.equippedWeaponId=MUAY_WRAP_ID;
        try { client.send("inventory_state",grantedInventory); } catch (error) { console.warn("MONTRA inventory notice was not delivered",error); }
      }
      player.wardTalentId = build.path === "sentinel" ? talent : "";
      player.bladeTalentId = build.path === "blade" ? talent : "";
      if(build.path==="blade" && !this.bladeBooks.has(id))this.bladeBooks.set(id,newBladeBook());
      if(build.path==="sentinel" && !this.sentinelBooks.has(id))this.sentinelBooks.set(id,newSentinelBook());
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      client.send("build_selected", selection);
      if (isOccultPath(build.path)) this.sendOccultBook(client);
    }, error => {
      console.error("MONTRA build save failed", error);
      this.reject(client, "build_save_failed");
    }).finally(() => {
      this.pendingWarps.delete(id);
      this.pendingItemUses.delete(id);
    });
    this.pendingItemUses.set(id, task);
  }

  private castClassSkill(client: Client): void {
    const id = client.sessionId, player = this.buildPlayer(client);
    if (!player) return;
    const build = this.playerBuild(player);
    if (!build) return this.reject(client, "build_required");
    const skill = classSkill(build.path, build.bladeTalent ?? build.wardTalent), now = Date.now();
    if (now < player.classSkillReadyAt) return this.reject(client, "class_skill_cooldown");
    if (player.mana < skill.stamina) return this.reject(client, "insufficient_mana");
    const members = skill.targets === "party" ? this.parties.get(id)?.members ?? [id] : [id];
    const targets: [string, Player][] = [];
    for (const member of members) {
      const target = this.state.players.get(member);
      if (!target?.alive || target.mapId !== player.mapId || distance3d(player, target) > skill.radius ||
          this.pendingWarps.has(member) || this.pendingItemUses.has(member) || this.pendingCharacterLeaves.has(member)) continue;
      if (member !== id && !this.combatSegmentClear(player.mapId,player,target)) continue;
      if (skill.effect.kind !== "heal" || target.hp < target.maxHp) targets.push([member, target]);
    }
    if (!targets.length) return this.reject(client, "class_skill_no_target");
    player.mana -= skill.stamina;
    player.classSkillReadyAt = now + skill.cooldownMs;
    this.markSupportManaCombat(id, targets);
    for (const [member, target] of targets) {
      if (skill.effect.kind === "heal") {
        target.hp = Math.min(target.maxHp, target.hp + this.healAmount(id,member,target.maxHp * skill.effect.fraction));
      } else {
        this.effects.grant(member, {id: build.path, sourceId: id, group: "class_skill", bonuses: skill.effect.bonuses}, this.simulatedMs + skill.effect.durationMs);
        this.applyStats(member, target, this.statAllocations.get(member) ?? emptyAllocations());
      }
    }
    client.send("class_skill_used", {skill: skill.skill, targets: targets.length});
  }


  private changeSwordTree(client: Client, message: unknown, action: "learn" | "upgrade" | "school" | "reset" | "equip"): void {
    if (!message || typeof message !== "object" || Array.isArray(message)) return this.reject(client, "invalid_sword_tree");
    const field = action === "learn" || action === "upgrade" ? "skillId" : "school";
    const input = message as Record<string, unknown>;
    const keys=Object.keys(input);
    if (action === "equip") {
      if (keys.length!==2 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>2 ||
          (input.skillId!==null && typeof input.skillId!=="string")) return this.reject(client,"invalid_sword_tree");
    } else if (action === "reset") {
      if (keys.length!==0) return this.reject(client,"invalid_sword_tree");
    } else if (keys.length!==1 || typeof input[field]!=="string") {
      return this.reject(client,"invalid_sword_tree");
    }
    const id=client.sessionId, player=this.buildPlayer(client,"swordTree"), tree=this.swordTrees.get(id);
    if (!player || !tree) return;
    if (player.pathId !== "phutthaisawan") return this.reject(client, "sword_class_required");
    if (action !== "equip" && (player.mapId !== DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)) {
      return this.reject(client,"sword_tree_needs_shrine");
    }
    const next: SwordTree={school:tree.school,learned:[...tree.learned],cooldowns:{...tree.cooldowns},training:{...tree.training},
      loadouts:{phutthaisawan:[...tree.loadouts.phutthaisawan],sritrairat:[...tree.loadouts.sritrairat],atamat:[...tree.loadouts.atamat],chumphon:[...tree.loadouts.chumphon]},...(tree.ranks?{ranks:{...tree.ranks}}:{}),...(tree.coreRanks?{coreRanks:{...tree.coreRanks}}:{})};
    const value=action === "equip" ? input.skillId as string|null : action === "reset" ? "" : input[field] as string;
    if (action === "equip") {
      const skillId=input.skillId as string|null, slots=next.loadouts[next.school];
      if (skillId!==null && (!Object.hasOwn(SWORD_NODES,skillId) || !next.learned.includes(skillId) || SWORD_NODES[skillId].effect==="passive" || (SWORD_NODES[skillId].school!=="common" && SWORD_NODES[skillId].school!==next.school))) return this.reject(client,"sword_skill_locked");
      for (let i=0;i<slots.length;i++) if (skillId!==null && slots[i]===skillId) slots[i]=null;
      slots[input.slot as number]=skillId;
    } else if (action === "reset") {
      if (!next.learned.length) return this.reject(client,"sword_tree_empty");
      next.learned=[];
      next.loadouts=emptySwordLoadouts();
      delete next.ranks;
    } else if (action === "school") {
      if (typeof value!=="string" || !Object.hasOwn(SWORD_SCHOOLS,value)) return this.reject(client,"invalid_sword_tree");
      const school=value as SwordSchool;
      if (player.level < SWORD_SCHOOLS[school].level) return this.reject(client,"sword_tree_level");
      if (school!=="phutthaisawan" && (tree.training.strikes<10 || tree.training.blocks<1)) return this.reject(client,"sword_trial_incomplete");
      if (next.school === school) return this.reject(client,"sword_tree_already_selected");
      next.school=school;
    } else if(action==="upgrade") {
      if(typeof value!=="string" || !SWORD_RANKABLE_SKILLS.some(id=>id===value) || !next.learned.includes(value))return this.reject(client,"sword_skill_locked");
      const node=SWORD_NODES[value],rank=next.ranks?.[value] ?? 0;
      if(node.school!=="common" && node.school!==next.school)return this.reject(client,"sword_tree_wrong_school");
      if(rank>=SKILL_RANK_LEVELS.length || player.level<SKILL_RANK_LEVELS[rank])return this.reject(client,"sword_tree_level");
      if(Object.values(next.training).reduce((sum,count)=>sum+count,0)<SKILL_RANK_PRACTICE[rank])return this.reject(client,"sword_trial_incomplete");
      if(next.learned.length+skillRankCost(next.ranks)>=swordPoints(player.level))return this.reject(client,"sword_tree_no_points");
      next.ranks={...next.ranks,[value]:rank+1};
    } else {
      if (typeof value!=="string" || !Object.hasOwn(SWORD_NODES,value)) return this.reject(client,"invalid_sword_tree");
      const skill=SWORD_NODES[value];
      if (next.learned.includes(value)) return this.reject(client,"sword_tree_already_learned");
      if (player.level < skill.level) return this.reject(client,"sword_tree_level");
      if (skill.school !== "common" && skill.school !== next.school) return this.reject(client,"sword_tree_wrong_school");
      if (skill.requires.some(required=>!next.learned.includes(required))) return this.reject(client,"sword_tree_prerequisite");
      if (skill.training && tree.training[skill.training.id]<skill.training.count) return this.reject(client,"sword_trial_incomplete");
      if (next.learned.length+skillRankCost(next.ranks) >= swordPoints(player.level)) return this.reject(client,"sword_tree_no_points");
      next.learned.push(value);
    }
    const snapshot=this.captureCharacterSnapshot(id);
    if (!snapshot) return this.reject(client,"build_unavailable");
    const freezesPlayer=action!=="equip";
    if (freezesPlayer) this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,swordTree:next}).then(()=>{
      // Shortcut assignments are allowed in combat. Preserve training and
      // cooldown changes that happened while the save was in flight.
      const committed=action==="equip" ? this.swordTrees.get(id) : next;
      if (!committed) return;
      if (action==="equip") committed.loadouts=next.loadouts;
      this.swordTrees.set(id,committed);
      if (action === "school" || action === "reset") { this.swordGuards.delete(id); this.swordCombos.delete(id); }
      player.swordTreeData=JSON.stringify(committed);
      try {
        client.send("sword_tree_changed",{action,id:value});
      } catch (error) {
        // A disconnected client must not make a committed save look like a disk failure.
        console.warn("MONTRA sword tree confirmation was not delivered",error);
      }
    }).catch(error=>{
      console.error("MONTRA sword tree save failed",error);
      this.reject(client,"sword_tree_save_failed");
    }).finally(()=>{
      if (freezesPlayer) this.pendingWarps.delete(id);
      this.pendingItemUses.delete(id);
    });
    this.pendingItemUses.set(id,task);
  }


  private recordSwordTraining(id:string, field:"strikes"|"blocks"|"finishes"):void {
    const player=this.state.players.get(id),tree=this.swordTrees.get(id);
    if (!player || player.pathId!=="phutthaisawan" || !tree) return;
    tree.training[field]=Math.min(1_000_000,tree.training[field]+1);
    player.swordTreeData=JSON.stringify(tree);
  }

  private recordMuayTraining(id:string, field:"strikes"|"blocks"):void {
    const player=this.state.players.get(id), book=this.muayBooks.get(id);
    if (!player || player.pathId!=="muay_boran" || !book) return;
    book.training[field]=Math.min(1_000_000,book.training[field]+1);
    player.muayBookData=JSON.stringify(book);
  }
  private recordMuayMastery(id:string,school:MuaySchool,technique:boolean,sequence:boolean):void {
    const player=this.state.players.get(id),book=this.muayBooks.get(id);
    if(!player || player.pathId!=="muay_boran" || !book || book.school!==school || (!technique && !sequence))return;
    const mastery=book.mastery[school];
    if(technique)mastery.technique=Math.min(1_000_000,mastery.technique+1);
    if(sequence)mastery.sequences=Math.min(1_000_000,mastery.sequences+1);
    player.muayBookData=JSON.stringify(book);
  }

  private clearMuayCombo(id:string):void {
    if(this.muayCombos.delete(id))this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_combo",{count:0});
    this.clearMuayFollowup(id);
  }
  private clearMuayFollowup(id:string):void {
    if(this.muayFollowups.delete(id))this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_followup",{active:false});
  }
  private clearMuayCombosForTarget(targetId:string):void {
    for(const [id,combo] of this.muayCombos)if(combo.targetId===targetId)this.clearMuayCombo(id);
    for(const [id,opening] of this.muayFollowups)if(opening.targetId===targetId)this.clearMuayFollowup(id);
  }
  private advanceMuaySkillCombo(id:string,school:MuaySchool,targetId:string,skillId:Exclude<MuaySkillId,"guard"|"parry"|"evade"|"grapple"|"chaiya_cover">,pvp:boolean):number {
    const previous=this.muayCombos.get(id);
    const result=advanceMuayCombo(previous,school,targetId,MUAY_COMBO_MOVES[skillId],this.simulatedMs);
    if(result.state)this.muayCombos.set(id,result.state);else this.muayCombos.delete(id);
    const bonus=pvp ? MUAY_PVP_COMBO_MULTIPLIER : MUAY_COMBO_MULTIPLIER;
    if(result.count || previous)this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_combo",
      {count:result.count,completed:result.completed,next:result.next ?? "",durationMs:MUAY_COMBO_WINDOW_MS,bonusPercent:Math.round((bonus-1)*100)});
    return result.completed ? bonus : 1;
  }
  private interruptMuayTarget(target:Monster,durationMs=MUAY_INTERRUPT_MS):"applied"|"immune"|"resisted"|"unavailable" {
    if(!target.alive)return "unavailable";
    if(target.id!==RULES.monsterId)return this.forest.interrupt(target.id,this.simulatedMs,durationMs,MUAY_INTERRUPT_IMMUNITY_MS);
    if(target.tier==="elite" || target.tier==="boss")return "immune";
    if(this.simulatedMs<this.monsterInterruptResistUntil)return "resisted";
    this.monsterInterruptUntil=this.simulatedMs+durationMs;
    this.monsterInterruptResistUntil=this.simulatedMs+MUAY_INTERRUPT_IMMUNITY_MS;
    this.monsterNavigator.clear();target.aiState="stagger";
    return "applied";
  }

  private muayControlled(id:string):boolean { return this.muayGrapples.has(id) || this.muayHeldBy.has(id); }
  private sentinelInterrupt(id:string,targetId:string,monsterDuration:number=SENTINEL_CONTROL.monsterStunMs):string {
    const monster=this.getMonster(targetId);
    if(monster){
      const result=this.interruptMuayTarget(monster,monsterDuration);
      if(result==="applied"){this.recordSentinelPractice(id,"stun");this.sentinelCounters.set(id,this.simulatedMs+3000);}
      return result;
    }
    const target=this.state.players.get(targetId);
    if(!target?.alive || target.flying || !onMapGround(target) || this.climbs.has(targetId) || this.flightTransitions.has(targetId))return "unavailable";
    if(this.simulatedMs<(this.sentinelStunResists.get(targetId) ?? 0))return "resisted";
    this.releaseMuayFor(targetId,"stunned");
    this.sentinelWindups.delete(targetId);this.bladeWindups.delete(targetId);this.bladeCasts.delete(targetId);
    this.destinations.delete(targetId);this.attackTargets.delete(targetId);this.activeDashes.delete(targetId);
    target.targetId="";target.combatState="idle";target.stunned=true;
    this.sentinelStuns.set(targetId,this.simulatedMs+SENTINEL_CONTROL.playerStunMs);
    this.sentinelStunResists.set(targetId,this.simulatedMs+SENTINEL_CONTROL.immunityMs);
    this.sentinelCounters.set(id,this.simulatedMs+3000);
    this.broadcast("sentinel_stun",{playerId:targetId,durationMs:SENTINEL_CONTROL.playerStunMs},{afterNextPatch:true});
    return "applied";
  }
  private releaseMuayGrapple(holderId:string,reason:string):void {
    const hold=this.muayGrapples.get(holderId); if(!hold)return;
    this.muayGrapples.delete(holderId);this.muayHeldBy.delete(hold.targetId);
    if(hold.targetId===RULES.monsterId)this.monsterInterruptUntil=Math.min(this.monsterInterruptUntil,this.simulatedMs);
    else if(this.getMonster(hold.targetId))this.forest.endInterrupt(hold.targetId,this.simulatedMs);
    for(const id of [holderId,hold.targetId])this.sendSwordNotice(this.clients.find(c=>c.sessionId===id),"muay_grapple",{phase:"released",reason});
  }
  private releaseMuayFor(id:string,reason:string):void {
    this.releaseMuayGrapple(id,reason);
    const holder=this.muayHeldBy.get(id); if(holder)this.releaseMuayGrapple(holder,reason);
  }
  private clearGrappleCounter(id:string,reason:string):void {
    if(this.muayGrappleCounters.delete(id))this.sendSwordNotice(this.clients.find(c=>c.sessionId===id),"muay_grapple_counter",{active:false,reason});
  }
  private clearGrappleCountersFor(id:string,reason:string):void {
    this.clearGrappleCounter(id,reason);
    for(const [owner,window] of this.muayGrappleCounters)if(window.targetId===id)this.clearGrappleCounter(owner,reason);
  }
  private updateMuayGrapples():void {
    for(const [id,hold] of this.muayGrapples) {
      const actor=this.state.players.get(id), target=this.getMonster(hold.targetId) ?? this.state.players.get(hold.targetId);
      if(this.simulatedMs>=hold.until || !actor?.alive || !target?.alive || !this.sameCombatMap(id,hold.targetId) ||
        distance3d(actor,target)>2.1 || !wearsWraps(equippedWeaponId(this.inventories.get(id))) || actor.pathId!=="muay_boran")
        this.releaseMuayGrapple(id,"ended");
    }
    for(const [id,until] of this.muayGrappleImmunity)if(this.simulatedMs>=until)this.muayGrappleImmunity.delete(id);
    for(const [id,window] of this.muayGrappleCounters) {
      const owner=this.state.players.get(id), target=this.state.players.get(window.targetId);
      if(this.simulatedMs>=window.until || !owner?.alive || !target?.alive || !this.sameCombatMap(id,window.targetId))this.clearGrappleCounter(id,"ended");
    }
  }

  private startMuayGrapple(client:Client,player:Player,target:Monster|Player,monster:Monster|undefined,targetId:string):boolean {
    const id=client.sessionId;
    if(this.muayControlled(targetId) || this.muayHeldBy.has(targetId)) { this.reject(client,"muay_grapple_busy"); return false; }
    if(!monster && ((target as Player).flying || !onMapGround(target as Player) || this.activeDashes.has(targetId) || this.climbs.has(targetId) || this.flightTransitions.has(targetId))) {
      this.reject(client,"target_unavailable");return false;
    }
    if(monster) {
      const result=this.interruptMuayTarget(monster,MUAY_GRAPPLE_HOLD_MS);
      if(result!=="applied") {this.reject(client,result==="immune" ? "muay_grapple_immune" : "muay_grapple_resisted");return false;}
    } else {
      const immunityKey=this.persistentCharacters.get(targetId) ?? targetId;
      if(this.simulatedMs<(this.muayGrappleImmunity.get(immunityKey) ?? 0)) {this.reject(client,"muay_grapple_resisted");return false;}
      this.muayGrappleImmunity.set(immunityKey,this.simulatedMs+MUAY_INTERRUPT_IMMUNITY_MS);
      if(this.muayDefenseWindows.has(targetId)){this.swordGuards.delete(targetId);this.clearMuayDefense(targetId,"cancelled");}
      this.destinations.delete(targetId);this.attackTargets.delete(targetId);
      target.targetId="";(target as Player).combatState="idle";
    }
    if(this.muayDefenseWindows.has(id)){this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");}
    this.startSkillAction(id,player,"idle");
    this.clearMuayCombo(id);this.clearGrappleCounter(id,"new_hold");this.clearGrappleCounter(targetId,"new_hold");this.recordCombat(id,targetId);
    this.muayGrapples.set(id,{targetId,until:this.simulatedMs+MUAY_GRAPPLE_HOLD_MS});this.muayHeldBy.set(targetId,id);
    this.sendSwordNotice(client,"muay_grapple",{phase:"held",role:"holder",targetId,durationMs:MUAY_GRAPPLE_HOLD_MS});
    this.sendSwordNotice(this.clients.find(c=>c.sessionId===targetId),"muay_grapple",{phase:"held",role:"victim",durationMs:MUAY_GRAPPLE_HOLD_MS,escapeStamina:MUAY_GRAPPLE_ESCAPE_STAMINA});
    return true;
  }
  private escapeMuayGrapple(client:Client,message:unknown):void {
    if(!parseEmptyCommand(message))return this.reject(client,"invalid_grapple_response");
    const id=client.sessionId,holderId=this.muayHeldBy.get(id),hold=holderId ? this.muayGrapples.get(holderId) : undefined;
    const player=this.state.players.get(id),holder=holderId ? this.state.players.get(holderId) : undefined;
    if(!holderId || !hold || hold.targetId!==id || this.simulatedMs>=hold.until || !player?.alive || !holder?.alive) {
      if(holderId)this.releaseMuayGrapple(holderId,"ended");return this.reject(client,"muay_grapple_ended");
    }
    if(!this.sameCombatMap(holderId,id) || distance3d(holder,player)>2.1 || holder.pathId!=="muay_boran" || !wearsWraps(equippedWeaponId(this.inventories.get(holderId)))) {
      this.releaseMuayGrapple(holderId,"ended");return this.reject(client,"muay_grapple_ended");
    }
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
      this.pendingItemUses.has(holderId) || this.pendingRewards.has(holderId) || this.pendingCharacterLeaves.has(holderId))return this.reject(client,"character_busy");
    if(!this.gates.get(id)?.attack.consume(this.simulatedMs))return this.reject(client,"attack_rate_limited");
    if(player.mana<MUAY_GRAPPLE_ESCAPE_STAMINA)return this.reject(client,"insufficient_mana");
    player.mana-=MUAY_GRAPPLE_ESCAPE_STAMINA;
    this.releaseMuayGrapple(holderId,"escaped");
    this.clearGrappleCounter(id,"replaced");
    this.muayGrappleCounters.set(id,{targetId:holderId,until:this.simulatedMs+MUAY_GRAPPLE_COUNTER_WINDOW_MS});
    this.sendSwordNotice(client,"muay_grapple_counter",{active:true,durationMs:MUAY_GRAPPLE_COUNTER_WINDOW_MS,stamina:MUAY_GRAPPLE_COUNTER_STAMINA});
    void this.saveCharacter(id);
  }
  private counterMuayGrapple(client:Client,message:unknown):void {
    if(!parseEmptyCommand(message))return this.reject(client,"invalid_grapple_response");
    const id=client.sessionId,window=this.muayGrappleCounters.get(id);
    if(!window || this.simulatedMs>=window.until) {this.clearGrappleCounter(id,"ended");return this.reject(client,"muay_grapple_counter_ended");}
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const player=this.spellCaster(client),opponent=this.state.players.get(window.targetId);
    if(!player)return;
    if(!opponent?.alive || !this.sameCombatMap(id,window.targetId) || this.pendingItemUses.has(window.targetId) ||
      this.pendingRewards.has(window.targetId) || this.pendingCharacterLeaves.has(window.targetId))return this.reject(client,"target_unavailable");
    if(player.flying || !onMapGround(player) || distance3d(player,opponent)>MUAY_GRAPPLE_COUNTER_RANGE || Math.abs(player.y-opponent.y)>1.1)return this.reject(client,"muay_out_of_range");
    if(!this.bodyPathClear(player.mapId,player,opponent))return this.reject(client,"muay_blocked");
    if(player.mana<MUAY_GRAPPLE_COUNTER_STAMINA)return this.reject(client,"insufficient_mana");
    player.mana-=MUAY_GRAPPLE_COUNTER_STAMINA;this.clearGrappleCounter(id,"used");
    player.facing=facingTo(opponent.x-player.x,opponent.z-player.z);this.recordCombat(id,window.targetId);
    const attack=(player.atk+weaponBonuses(this.inventories.get(id),"pvp").melee)*MUAY_PVP_DAMAGE_MULTIPLIER;
    const damage=this.swordGuardDamage(window.targetId,player,calculateDamage(attack,opponent.def,opponent.level));
    opponent.hp=Math.max(0,opponent.hp-damage);opponent.hitSeq++;
    this.broadcast("pvp_hit",{attackerId:id,targetId:window.targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"grapple_counter"},{afterNextPatch:true});
    if(opponent.hp===0){player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(window.targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:window.targetId,source:"grapple_counter",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});}
    void this.saveCharacter(id);
  }
  private finishMuayGrapple(client:Client,targetId:unknown):void {
    const id=client.sessionId,hold=this.muayGrapples.get(id),player=this.state.players.get(id);
    if(!hold || targetId!==hold.targetId || this.simulatedMs>=hold.until || !player?.alive) {this.releaseMuayGrapple(id,"ended");return this.reject(client,"muay_grapple_ended");}
    const monster=this.getMonster(hold.targetId),target=monster ?? this.state.players.get(hold.targetId);
    if(!target?.alive || !this.sameCombatMap(id,hold.targetId) || distance3d(player,target)>2.1 || !wearsWraps(equippedWeaponId(this.inventories.get(id))) ||
      this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
      (!monster && (this.pendingItemUses.has(hold.targetId) || this.pendingRewards.has(hold.targetId) || this.pendingCharacterLeaves.has(hold.targetId)))) {
      this.releaseMuayGrapple(id,"ended");return this.reject(client,"muay_grapple_ended");
    }
    const dx=target.x-player.x,dz=target.z-player.z,length=Math.hypot(dx,dz), nx=length>0.001 ? dx/length : -Math.sin(player.facing),nz=length>0.001 ? dz/length : -Math.cos(player.facing);
    const next={x:target.x+nx*1.5,y:target.y,z:target.z+nz*1.5},map=getWorldMap(target.mapId);
    if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(target),false,target.mapId) || isRestArea(target.mapId,next) || !this.bodyPathClear(target.mapId,target,next) ||
      (monster && (monster.id===RULES.monsterId ? !isMonsterSegmentClear(monster,next) : !this.forest.canDisplace(monster.id,next))))return this.reject(client,"muay_throw_blocked");
    const sweep=advanceDash(target,{dx:nx,dz:nz},1.5,(x,z)=>this.canOccupy(x,z,surfaceLayer(target),false,target.mapId) && !isRestArea(target.mapId,{x,z}),map.bounds);
    if(sweep.blocked || sweep.moved<1.4999)return this.reject(client,"muay_throw_blocked");
    this.moveOnSurface(target,next.x,next.z);
    this.releaseMuayGrapple(id,"thrown");this.recordCombat(id,hold.targetId);this.recordMuayTraining(id,"strikes");
    const pvp=!monster,attack=(player.atk+weaponBonuses(this.inventories.get(id),pvp?"pvp":"pve").melee)*MUAY_SKILLS.grapple.power*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:1);
    if(monster)this.hitMonsterWithSpell(id,monster,calculateDamage(attack,monster.defense,monster.level),"muay");
    else {
      const opponent=target as Player,damage=this.swordGuardDamage(hold.targetId,player,calculateDamage(attack,opponent.def,opponent.level));
      opponent.hp=Math.max(0,opponent.hp-damage);opponent.hitSeq++;
      this.broadcast("pvp_hit",{attackerId:id,targetId:hold.targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"muay"},{afterNextPatch:true});
      if(opponent.hp===0){player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(hold.targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:hold.targetId,source:"muay",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});}
    }
    this.broadcast("muay_skill_used",{playerId:id,skillId:"grapple",targetId:hold.targetId},{afterNextPatch:true});void this.saveCharacter(id);
  }

  private sendBladeBook(client:Client):void {
    const player=this.state.players.get(client.sessionId),book=this.bladeBooks.get(client.sessionId);
    if (!player || !book || player.pathId!=="blade") return;
    try { client.send("blade_book_state",{book,lessons:BLADE_LESSONS,practiceLabels:BLADE_PRACTICE_LABELS,points:bladePoints(player.level),rankLevels:SKILL_RANK_LEVELS,rankPractice:SKILL_RANK_PRACTICE,rankable:BLADE_RANKABLE_SKILLS}); }
    catch(error) { console.warn("MONTRA blade book notice was not delivered",error); }
  }

  private sendSentinelBook(client:Client):void {
    const player=this.state.players.get(client.sessionId),book=this.sentinelBooks.get(client.sessionId);
    if(!player || player.pathId!=="sentinel" || !book)return;
    try{client.send("sentinel_book_state",{book,core:SENTINEL_CORE,coreLevels:MUAY_CORE_LEVELS,corePointLevels:MUAY_CORE_POINT_LEVELS,coreProgress:Array.from({length:MUAY_CORE_LEVELS.length+1},(_,rank)=>sentinelCoreProgress(rank)),lessons:SENTINEL_LESSONS,practiceLabels:SENTINEL_PRACTICE_LABELS,points:sentinelPoints(player.level),rankLevels:SKILL_RANK_LEVELS,rankPractice:SKILL_RANK_PRACTICE,rankable:SENTINEL_RANKABLE_SKILLS});}
    catch(error){console.warn("MONTRA sentinel book notice was not delivered",error);}
  }

  private recordSentinelPractice(id:string,category:keyof SentinelBook["practice"]):void {
    const player=this.state.players.get(id),book=this.sentinelBooks.get(id);
    if(player?.pathId!=="sentinel" || !book)return;
    book.practice[category]=Math.min(1_000_000,book.practice[category]+1);
    const client=this.clients.find(c=>c.sessionId===id);if(client)this.sendSentinelBook(client);
  }

  private changeSentinelBook(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_sentinel_book");
    const input=message as Record<string,unknown>,keys=Object.keys(input),action=input.action;
    if(action==="learn" || action==="upgrade" || action==="core_upgrade") {if(keys.length!==2 || typeof input.skillId!=="string")return this.reject(client,"invalid_sentinel_book");}
    else if(action==="equip") {if(keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 || (input.skillId!==null && typeof input.skillId!=="string"))return this.reject(client,"invalid_sentinel_book");}
    else if(action==="reset" || action==="core_reset") {if(keys.length!==1)return this.reject(client,"invalid_sentinel_book");}
    else return this.reject(client,"invalid_sentinel_book");
    const id=client.sessionId,player=this.buildPlayer(client,"occult"),book=this.sentinelBooks.get(id);
    if(!player)return;
    if(player.pathId!=="sentinel")return this.reject(client,"sentinel_class_required");
    if(!book)return this.reject(client,"build_unavailable");
    if(player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 || this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)return this.reject(client,"sentinel_book_needs_shrine");
    const next=validateSentinelBook(book,player.level);
    if(action==="core_upgrade"){
      const skillId=input.skillId as SentinelCoreId;
      if(!Object.hasOwn(SENTINEL_CORE,skillId))return this.reject(client,"invalid_sentinel_book");
      const rank=next.coreRanks?.[skillId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || player.level<MUAY_CORE_LEVELS[rank])return this.reject(client,"sentinel_level");
      if(Object.values(next.coreRanks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(player.level))return this.reject(client,"sentinel_no_points");
      next.coreRanks={...next.coreRanks,[skillId]:rank+1};
    }else if(action==="core_reset"){
      if(!Object.keys(next.coreRanks ?? {}).length)return this.reject(client,"sentinel_book_empty");
      delete next.coreRanks;
    }else if(action==="learn"){
      const id=input.skillId as SentinelSkillId;if(!Object.hasOwn(SENTINEL_LESSONS,id))return this.reject(client,"invalid_sentinel_book");
      const lesson:SentinelLesson=SENTINEL_LESSONS[id];
      if(next.learned.includes(id))return this.reject(client,"sentinel_already_learned");
      if(player.level<lesson.level)return this.reject(client,"sentinel_level");
      if(next.learned.length+skillRankCost(next.ranks)>=sentinelPoints(player.level))return this.reject(client,"sentinel_no_points");
      if(lesson.requires.some(req=>!next.learned.includes(req as SentinelSkillId)))return this.reject(client,"sentinel_prerequisite");
      if(Object.entries(lesson.practice).some(([category,needed])=>next.practice[category as keyof typeof next.practice]<(needed ?? 0)))return this.reject(client,"sentinel_practice");
      next.learned.push(id);
    }else if(action==="upgrade"){
      const id=input.skillId as SentinelSkillId;
      if(!SENTINEL_RANKABLE_SKILLS.some(skill=>skill===id) || !next.learned.includes(id))return this.reject(client,"sentinel_skill_locked");
      const rank=next.ranks?.[id] ?? 0;
      if(rank>=SKILL_RANK_LEVELS.length || player.level<SKILL_RANK_LEVELS[rank])return this.reject(client,"sentinel_level");
      if(Object.values(next.practice).reduce((sum,count)=>sum+count,0)<SKILL_RANK_PRACTICE[rank])return this.reject(client,"sentinel_practice");
      if(next.learned.length+skillRankCost(next.ranks)>=sentinelPoints(player.level))return this.reject(client,"sentinel_no_points");
      next.ranks={...next.ranks,[id]:rank+1};
    }else if(action==="equip"){
      const skillId=input.skillId as SentinelSkillId|null;
      if(skillId!==null && (!next.learned.includes(skillId) || SENTINEL_LESSONS[skillId].effect==="passive"))return this.reject(client,"sentinel_skill_locked");
      for(let i=0;i<4;i++)if(skillId!==null && next.slots[i]===skillId)next.slots[i]=null;
      next.slots[input.slot as number]=skillId;
    }else{if(!next.learned.length)return this.reject(client,"sentinel_book_empty");next.learned=[];next.slots=[null,null,null,null];delete next.ranks;}
    const snapshot=this.captureCharacterSnapshot(id);if(!snapshot)return this.reject(client,"build_unavailable");
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,sentinelBook:next}).then(()=>{
      this.sentinelBooks.set(id,next);this.sendSentinelBook(client);
      if(action==="reset"){
        this.sentinelAnchors.delete(id);this.sentinelCounters.delete(id);this.swordGuards.delete(id);
        this.effects.remove(id,"sentinel_step",id);this.effects.remove(id,"sentinel_anchor",id);
        for(const [member,link] of this.sentinelInterceptions)if(link.ownerId===id)this.sentinelInterceptions.delete(member);
      }
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      try{client.send("sentinel_book_changed",{action});}catch(error){console.warn("MONTRA sentinel book confirmation was not delivered",error);}
    },error=>{console.error("MONTRA sentinel book save failed",error);this.reject(client,"sentinel_book_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private endBladeCloak(id:string,reason:string):boolean {
    if(!this.bladeCloaks.delete(id)) return false;
    const player=this.state.players.get(id),book=this.bladeBooks.get(id);
    if(reason!=="class_changed" && reason!=="safe_area" && reason!=="dead" && player?.alive && player.pathId==="blade" && book?.learned.includes("veil_guard") && this.effects.modifiers(id).length<STACKING_RULES.maxModifiers) {
      this.effects.grant(id,{id:"blade_veil_guard",sourceId:id,group:"blade_defense",bonuses:{def:BLADE_LESSONS.veil_guard.power}},this.simulatedMs+2000);
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
    }
    this.syncPlayerViews();
    try {this.clients.find(client=>client.sessionId===id)?.send("blade_cloak_changed",{active:false,reason});}
    catch(error) {console.warn("MONTRA blade cloak notice was not delivered",error);}
    return true;
  }

  private sentinelDamage(id:string,targetId:string,power:number,stun:boolean,range=3):boolean {
    const actor=this.state.players.get(id),monster=this.getMonster(targetId),target=monster ?? this.state.players.get(targetId);
    if(!actor?.alive || actor.pathId!=="sentinel" || !target?.alive || !this.sameCombatMap(id,targetId) ||
       this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
       (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))) ||
       distance3d(actor,target)>range || meleeHeightBlocked(actor,target,1.1) || !this.bodyPathClear(actor.mapId,actor,target))return false;
    this.recordCombat(id,targetId);
    const attack=(actor.atk+weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee)*power*(monster?1:0.75);
    if(monster)this.hitMonsterWithSpell(id,monster,calculateDamage(attack,monster.defense,monster.level),"sword");
    else {
      const victim=target as Player,damage=this.swordGuardDamage(targetId,actor,calculateDamage(attack,victim.def,victim.level));
      if(!actor.alive || !victim.alive)return false;
      victim.hp=Math.max(0,victim.hp-damage);victim.hitSeq++;
      this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"sentinel"},{afterNextPatch:true});
      if(victim.hp===0){actor.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:actor.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});}
    }
    if(stun && target.alive) {
      const result=this.sentinelInterrupt(id,targetId);
      this.sendSwordNotice(this.clients.find(c=>c.sessionId===id),"sentinel_control",{targetId,result});
    }
    return true;
  }

  private castSentinelCore(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_sentinel_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(SENTINEL_CORE,input.skillId) || Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))return this.reject(client,"invalid_sentinel_skill");
    const id=client.sessionId,skillId=input.skillId as SentinelCoreId,skill=SENTINEL_CORE[skillId];
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const actor=this.spellCaster(client),book=this.sentinelBooks.get(id);
    if(!actor || !book)return;
    if(actor.pathId!=="sentinel" || !this.persistentCharacters.has(id))return this.reject(client,"sentinel_class_required");
    if(actor.flying || !onMapGround(actor) || isRestArea(actor.mapId,actor))return this.reject(client,"sentinel_location");
    if(Date.now()<(book.cooldowns[skillId] ?? 0))return this.reject(client,"sentinel_cooldown");
    const rank=book.coreRanks?.[skillId] ?? 0,p=sentinelCoreProgress(rank),cost=skill.stamina+rank;
    if(actor.mana<cost)return this.reject(client,"insufficient_mana");
    let ally:Player|undefined,targetId="";
    if(skillId==="protect"){
      targetId=typeof input.targetId==="string"?input.targetId:"";ally=this.state.players.get(targetId);
      if(!targetId || targetId===id || !this.parties.get(id)?.members.includes(targetId) || !ally?.alive || ally.mapId!==actor.mapId ||
        this.pendingWarps.has(targetId) || this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId) ||
        (this.field && this.warSeats.get(targetId)?.side!==this.warSeats.get(id)?.side) || distance3d(actor,ally)>p.protect.range ||
        !this.combatSegmentClear(actor.mapId,actor,ally) || !this.bodyPathClear(actor.mapId,actor,ally))return this.reject(client,"sentinel_party_required");
    }
    if(skillId==="bulwark"){
      const active=this.effects.modifiers(id);
      if(active.length>=STACKING_RULES.maxModifiers && !active.some(effect=>effect.id==="sentinel_core_bulwark" && effect.sourceId===id))return this.reject(client,"sentinel_effect_limit");
    }
    actor.mana-=cost;book.cooldowns[skillId]=Date.now()+skill.cooldownMs;
    this.startSkillAction(id,actor,"idle");
    if(skillId==="shock"){
      const candidates:Array<{target:Monster|Player;id:string}>=[...[this.state.monster,...this.state.monsters.values()].map(target=>({target,id:target.id})),...[...this.state.players.entries()].map(([id,target])=>({target,id}))];
      const targets=candidates
        .filter(entry=>entry.id && entry.id!==id && entry.target.alive && distance3d(actor,entry.target)<=p.shock.range && Math.abs(actor.y-entry.target.y)<=1.1 && this.sameCombatMap(id,entry.id) && !this.pendingItemUses.has(entry.id) && !this.pendingRewards.has(entry.id) && !this.pendingCharacterLeaves.has(entry.id) && this.bodyPathClear(actor.mapId,actor,entry.target))
        .sort((a,b)=>distance3d(actor,a.target)-distance3d(actor,b.target) || a.id.localeCompare(b.id));
      for(const entry of targets.slice(0,5))if(this.sentinelInterrupt(id,entry.id,p.shock.monsterStunMs)==="applied")this.recordCombat(id,entry.id);
    } else if(skillId==="bulwark"){
      this.effects.grant(id,{id:"sentinel_core_bulwark",sourceId:id,group:"sentinel_self",bonuses:{def:p.bulwark.defense}},this.simulatedMs+p.bulwark.durationMs);
      this.applyStats(id,actor,this.statAllocations.get(id) ?? emptyAllocations());
    } else if(skillId==="riposte")this.sentinelCoreStances.set(id,{until:this.simulatedMs+p.riposte.durationMs,rank,nextCounter:0});
    else if(ally){
      this.sentinelInterceptions.set(targetId,{ownerId:id,until:this.simulatedMs+p.protect.durationMs,fraction:.3});
      this.markSupportManaCombat(id,[[targetId,ally]]);
      let applied=0;
      const monsters=[this.state.monster,...this.state.monsters.values()].sort((a,b)=>distance3d(actor,a)-distance3d(actor,b) || a.id.localeCompare(b.id));
      for(const monster of monsters){
        if(applied>=3 || !monster.alive || distance3d(actor,monster)>p.protect.tauntRange || !this.sameCombatMap(id,monster.id) || !this.bodyPathClear(actor.mapId,actor,monster))continue;
        if(monster.id===RULES.monsterId){
          if(monster.tier==="normal" && !this.monsterReturning && this.simulatedMs>=this.sentinelLegacyTaunt.resistUntil){this.sentinelLegacyTaunt={ownerId:id,until:this.simulatedMs+p.protect.tauntMs,resistUntil:this.simulatedMs+SENTINEL_CONTROL.tauntImmunityMs};monster.targetId=id;this.monsterNavigator.clear();applied++;}
        }else if(this.forest.taunt(monster.id,id,this.simulatedMs,p.protect.tauntMs,SENTINEL_CONTROL.tauntImmunityMs)==="applied")applied++;
      }
      this.sendSwordNotice(client,"sentinel_taunt",{applied});
      // PvP challenge is an indicator only; it never changes another player's target.
      for(const [otherId,other] of this.state.players){
        if(otherId===id || !other.alive || distance3d(actor,other)>p.protect.tauntRange || !this.sameCombatMap(id,otherId) ||
          this.pendingItemUses.has(otherId) || this.pendingRewards.has(otherId) || this.pendingCharacterLeaves.has(otherId) || !this.bodyPathClear(actor.mapId,actor,other))continue;
        this.sendSwordNotice(this.clients.find(peer=>peer.sessionId===otherId),"sentinel_challenged",{playerId:id,durationMs:p.protect.tauntMs});
      }
    }
    this.sendSentinelBook(client);
    this.broadcast("sentinel_core_used",{playerId:id,skillId,targetId,durationMs:skillId==="riposte"?p.riposte.durationMs:skillId==="protect"?p.protect.durationMs:0},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castSentinelSkill(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_sentinel_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(SENTINEL_LESSONS,input.skillId) ||
      Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))
      return this.reject(client,"invalid_sentinel_skill");
    const id=client.sessionId,skillId=input.skillId as SentinelSkillId,skill:SentinelLesson=SENTINEL_LESSONS[skillId];
    const actor=this.spellCaster(client),book=this.sentinelBooks.get(id);
    if(!actor || !book)return;
    if(actor.pathId!=="sentinel" || !this.persistentCharacters.has(id))return this.reject(client,"sentinel_class_required");
    if(!book.learned.includes(skillId) || !book.slots.includes(skillId) || skill.effect==="passive")return this.reject(client,"sentinel_skill_locked");
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    if(actor.flying || !onMapGround(actor) || isRestArea(actor.mapId,actor))return this.reject(client,"sentinel_location");
    if(Date.now()<(book.cooldowns[skillId] ?? 0))return this.reject(client,"sentinel_cooldown");
    if(actor.mana<skill.stamina)return this.reject(client,"insufficient_mana");
    if(skill.effect==="counter" && this.simulatedMs>=(this.sentinelCounters.get(id) ?? 0))return this.reject(client,"sentinel_counter_required");
    if((skill.effect==="step" || skill.effect==="anchor") && this.effects.modifiers(id).length>=STACKING_RULES.maxModifiers &&
      !this.effects.modifiers(id).some(effect=>effect.id==="sentinel_"+skillId && effect.sourceId===id))return this.reject(client,"sentinel_effect_limit");
    const targetId=typeof input.targetId==="string"?input.targetId:id;
    const offensive=["stun","slam","counter","step"].includes(skill.effect);
    let target:Monster|Player|undefined;
    if(offensive){
      target=this.getMonster(targetId) ?? this.state.players.get(targetId);
      if(targetId===id || !target?.alive || !this.sameCombatMap(id,targetId) ||
        this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))return this.reject(client,"target_unavailable");
      if(distance3d(actor,target)>skill.range || meleeHeightBlocked(actor,target,1.1) || !this.bodyPathClear(actor.mapId,actor,target))return this.reject(client,"sentinel_out_of_range");
    }
    const party=(this.parties.get(id)?.members ?? [id]).filter(member=>!this.field || member===id || this.warSeats.get(member)?.side===this.warSeats.get(id)?.side);
    let allies:Array<[string,Player]>=[];
    if(["ward","intercept","party_ward"].includes(skill.effect)){
      const members=skill.effect==="party_ward"?party:[targetId];
      if(members.some(member=>!party.includes(member)) || (skill.effect==="intercept" && targetId===id))return this.reject(client,"sentinel_party_required");
      allies=members.map(member=>[member,this.state.players.get(member)] as const).filter((entry):entry is [string,Player]=>Boolean(entry[1]?.alive && entry[1].mapId===actor.mapId &&
        !this.pendingWarps.has(entry[0]) && !this.pendingItemUses.has(entry[0]) && !this.pendingRewards.has(entry[0]) && !this.pendingCharacterLeaves.has(entry[0]) &&
        distance3d(actor,entry[1])<=skill.range && (entry[0]===id || this.bodyPathClear(actor.mapId,actor,entry[1]))));
      if(!allies.length || (skill.effect!=="party_ward" && allies.length!==1))return this.reject(client,"target_unavailable");
      if(skill.effect!=="intercept")for(const [member] of allies){
        const active=this.effects.modifiers(member);
        if(active.length>=STACKING_RULES.maxModifiers && !active.some(effect=>effect.id===skillId && effect.sourceId===id))return this.reject(client,"sentinel_effect_limit");
      }
    }
    let next:{x:number;y:number;z:number}|undefined;
    if(skill.effect==="step" || skill.effect==="intercept"){
      const destination=skill.effect==="intercept"?allies[0][1]:target!;
      const dx=destination.x-actor.x,dz=destination.z-actor.z,length=Math.hypot(dx,dz),travel=Math.max(0,length-1.7);
      const vx=length>0.001?dx/length:0,vz=length>0.001?dz/length:0;
      next={x:actor.x+vx*travel,y:actor.y,z:actor.z+vz*travel};
      next.y=groundAt(actor.mapId,next.x,next.z)+surfaceLayer(actor);
      const map=getWorldMap(actor.mapId);
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(actor),false,actor.mapId) || isRestArea(actor.mapId,next) || !this.bodyPathClear(actor.mapId,actor,next))return this.reject(client,"sentinel_blocked");
      if(travel>0.00001){const sweep=advanceDash(actor,{dx:vx,dz:vz},travel,(x,z)=>this.canOccupy(x,z,surfaceLayer(actor),false,actor.mapId) && !isRestArea(actor.mapId,{x,z}),map.bounds);
        if(sweep.blocked || sweep.moved+0.00001<travel)return this.reject(client,"sentinel_blocked");}
    }
    actor.mana-=skill.stamina;book.cooldowns[skillId]=Date.now()+skill.cooldownMs;
    if(allies.length)this.markSupportManaCombat(id,allies);
    if(offensive && target)actor.facing=facingTo(target.x-actor.x,target.z-actor.z);
    if(next){this.startSkillAction(id,actor,"idle");this.moveOnSurface(actor,next.x,next.z);}
    if(skill.effect==="guard")this.swordGuards.set(id,{until:this.simulatedMs+2500,factor:skill.power,direction:true,counterUntil:0});
    else if(skill.effect==="step" || skill.effect==="anchor"){
      this.effects.grant(id,{id:"sentinel_"+skillId,sourceId:id,group:"sentinel_self",bonuses:{def:skill.power*supportRankMultiplier(book.ranks,skillId)}},this.simulatedMs+6000);
      this.applyStats(id,actor,this.statAllocations.get(id) ?? emptyAllocations());
      if(skill.effect==="anchor")this.sentinelAnchors.set(id,this.simulatedMs+6000);
    } else if(skill.effect==="slam"){
      this.startSkillAction(id,actor,"attacking");
      this.sentinelWindups.set(id,{targetId,until:this.simulatedMs+800,power:skill.power*(this.getMonster(targetId)?skillRankMultiplier(book.ranks,skillId):1)});
      this.broadcast("sentinel_windup",{playerId:id,targetId,durationMs:800},{afterNextPatch:true});
    } else if(skill.effect==="stun" || skill.effect==="counter"){
      if(skill.effect==="counter")this.sentinelCounters.delete(id);
      this.sentinelDamage(id,targetId,skill.power*(this.getMonster(targetId)?skillRankMultiplier(book.ranks,skillId):1),skill.effect==="stun");
    } else if(skill.effect==="sweep"){
      let hit=0;
      for(const monster of [this.state.monster,...this.state.monsters.values()]){
        const dx=monster.x-actor.x,dz=monster.z-actor.z,d=Math.hypot(dx,dz);
        if(hit<3 && monster.alive && d<=skill.range && (d<0.001 || (-Math.sin(actor.facing)*dx-Math.cos(actor.facing)*dz)/d>=0.5) && this.sentinelDamage(id,monster.id,skill.power*skillRankMultiplier(book.ranks,skillId),false,skill.range))hit++;
      }
    } else if(skill.effect==="taunt"){
      let applied=0;
      for(const monster of [this.state.monster,...this.state.monsters.values()]){
        if(applied>=3 || !monster.alive || distance3d(actor,monster)>skill.range || !this.sameCombatMap(id,monster.id) || !this.bodyPathClear(actor.mapId,actor,monster))continue;
        if(monster.id===RULES.monsterId){
          if(monster.tier==="normal" && !this.monsterReturning && this.simulatedMs>=this.sentinelLegacyTaunt.resistUntil){
            this.sentinelLegacyTaunt={ownerId:id,until:this.simulatedMs+SENTINEL_CONTROL.tauntMs,resistUntil:this.simulatedMs+SENTINEL_CONTROL.tauntImmunityMs};monster.targetId=id;this.monsterNavigator.clear();applied++;
          }
        }else if(this.forest.taunt(monster.id,id,this.simulatedMs,SENTINEL_CONTROL.tauntMs,SENTINEL_CONTROL.tauntImmunityMs)==="applied")applied++;
      }
      this.sendSwordNotice(client,"sentinel_taunt",{applied});
    } else if(skill.effect==="ward" || skill.effect==="party_ward"){
      let assisted=false;
      for(const [member,ally] of allies){
        this.effects.grant(member,{id:skillId,sourceId:id,group:"sentinel_support",bonuses:{def:skill.power*supportRankMultiplier(book.ranks,skillId)}},this.simulatedMs+8000);
        this.applyStats(member,ally,this.statAllocations.get(member) ?? emptyAllocations());
        if(member!==id && (this.forest.engaged(member) || this.state.monster.targetId===member || Boolean(this.getMonster(this.attackTargets.get(member) ?? ""))))assisted=true;
      }
      if(assisted)this.recordSentinelPractice(id,"assist");
    } else if(skill.effect==="intercept")this.sentinelInterceptions.set(targetId,{ownerId:id,until:this.simulatedMs+6000,fraction:skill.power});
    this.sendSentinelBook(client);
    this.broadcast("sentinel_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castBladeCloak(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message) ||
        Object.keys(message).length!==1 || (message as Record<string,unknown>).skillId!=="cloak")
      return this.reject(client,"invalid_blade_skill");
    const id=client.sessionId,player=this.spellCaster(client),book=this.bladeBooks.get(id);
    if(!player || !book) return;
    if(player.pathId!=="blade" || !this.persistentCharacters.has(id)) return this.reject(client,"blade_class_required");
    if(!book.learned.includes("cloak") || !book.slots.includes("cloak")) return this.reject(client,"blade_skill_locked");
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id)) return this.reject(client,"character_busy");
    if(this.bladeCloaks.has(id)) return this.reject(client,"blade_cloak_active");
    if(player.flying || !onMapGround(player) || isRestArea(player.mapId,player)) return this.reject(client,"blade_cloak_location");
    if(this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<2000) return this.reject(client,"blade_cloak_combat");
    const lesson=BLADE_LESSONS.cloak;
    if(Date.now()<(book.cooldowns.cloak ?? 0)) return this.reject(client,"blade_cooldown");
    if(player.mana<lesson.stamina) return this.reject(client,"insufficient_mana");
    player.mana-=lesson.stamina;book.cooldowns.cloak=Date.now()+lesson.cooldownMs;
    this.startSkillAction(id,player,"attacking");
    this.bladeCasts.set(id,this.simulatedMs+600);
    this.broadcast("blade_cloak_cast",{playerId:id,durationMs:600},{afterNextPatch:true});
    this.sendBladeBook(client);void this.saveCharacter(id);
  }

  private recordBladePractice(id:string,category:keyof BladeBook["practice"]):void {
    const book=this.bladeBooks.get(id),player=this.state.players.get(id);
    if(!book || player?.pathId!=="blade") return;
    book.practice[category]=Math.min(1_000_000,book.practice[category]+1);
    const client=this.clients.find(c=>c.sessionId===id);if(client)this.sendBladeBook(client);
  }

  private clearBladeMark(id:string):void {
    if(this.bladeMarks.delete(id))this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"blade_mark_state",{active:false});
  }

  private recordBladeOpening(id:string,monster:boolean):void {
    this.bladeOpenings.set(id,this.simulatedMs+4000);
    this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"blade_opening",{durationMs:4000});
    if(monster)this.recordBladePractice(id,"ambush");
  }

  private bladeDamage(id:string,targetId:string,power:number):boolean {
    const player=this.state.players.get(id),monster=this.getMonster(targetId),target=monster ?? this.state.players.get(targetId);
    if(!player?.alive || player.pathId!=="blade" || !target?.alive || !this.sameCombatMap(id,targetId) ||
       distance3d(player,target)>3 || Math.abs(player.y-target.y)>1.1 || !this.bodyPathClear(player.mapId,player,target))return false;
    this.recordCombat(id,targetId);
    const attack=(player.atk+weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee)*power*(monster?1:0.75);
    if(monster) this.hitMonsterWithSpell(id,monster,calculateDamage(attack,monster.defense,monster.level),"sword");
    else {
      const victim=target as Player,damage=this.swordGuardDamage(targetId,player,calculateDamage(attack,victim.def,victim.level));
      victim.hp=Math.max(0,victim.hp-damage);victim.hitSeq++;
      this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"blade"},{afterNextPatch:true});
      if(victim.hp===0){player.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:player.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});}
    }
    return true;
  }

  private castBladeSkill(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_blade_skill");
    const input=message as Record<string,unknown>,keys=Object.keys(input);
    if(typeof input.skillId!=="string" || !Object.hasOwn(BLADE_LESSONS,input.skillId) ||
       keys.some(key=>key!=="skillId" && key!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))
      return this.reject(client,"invalid_blade_skill");
    if(input.skillId==="cloak")return this.castBladeCloak(client,message);
    const id=client.sessionId,skillId=input.skillId as BladeSkillId,skill:BladeLesson=BLADE_LESSONS[skillId];
    const player=this.spellCaster(client),book=this.bladeBooks.get(id);
    if(!player || !book)return;
    if(player.pathId!=="blade" || !this.persistentCharacters.has(id))return this.reject(client,"blade_class_required");
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    if(!book.learned.includes(skillId) || !book.slots.includes(skillId) || skill.effect==="passive")return this.reject(client,"blade_skill_locked");
    if(player.flying || !onMapGround(player) || isRestArea(player.mapId,player))return this.reject(client,"blade_cloak_location");
    if(this.bladeWindups.has(id))return this.reject(client,"blade_windup_active");
    const now=Date.now();if(now<(book.cooldowns[skillId] ?? 0))return this.reject(client,"blade_cooldown");
    if(player.mana<skill.stamina)return this.reject(client,"insufficient_mana");
    const targeted=["approach","strike","consume","windup","counter"].includes(skill.effect);
    let targetId="",target:Monster|Player|undefined,monster:Monster|undefined;
    if(targeted){
      const order=parseAttackCommand({targetId:input.targetId}) ?? parsePkTargetCommand({targetId:input.targetId});
      if(!order)return this.reject(client,"invalid_blade_target");
      targetId=order.targetId;monster=this.getMonster(targetId);target=monster ?? this.state.players.get(targetId);
      if(!target?.alive || targetId===id || !this.sameCombatMap(id,targetId))return this.reject(client,"target_unavailable");
      if(!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId)))return this.reject(client,"target_unavailable");
      if(distance3d(player,target)>skill.range || Math.abs(player.y-target.y)>1.1)return this.reject(client,"blade_out_of_range");
      if(!this.bodyPathClear(player.mapId,player,target))return this.reject(client,"blade_blocked");
    } else if(input.targetId!==undefined) return this.reject(client,"invalid_blade_skill");
    const cloaked=this.bladeCloaks.has(id),mark=this.bladeMarks.get(id),guard=this.swordGuards.get(id);
    if((skill.effect==="approach" || skillId==="hidden_edge") && !cloaked)return this.reject(client,"blade_cloak_required");
    if(skill.effect==="consume" && (!mark || mark.targetId!==targetId || this.simulatedMs>=mark.until))return this.reject(client,"blade_mark_required");
    if(skill.effect==="counter" && (!guard || this.simulatedMs>=guard.counterUntil))return this.reject(client,"blade_counter_required");
    if(skill.effect==="focus" && this.simulatedMs>=(this.bladeOpenings.get(id) ?? 0))return this.reject(client,"blade_opening_required");
    if(skill.effect==="focus" && this.effects.modifiers(id).length>=STACKING_RULES.maxModifiers)return this.reject(client,"blade_effect_limit");
    if((skill.effect==="approach" && target) || skill.effect==="evade" || skill.effect==="retreat"){
      const dx=target && skill.effect==="approach" ? target.x-player.x : Math.sin(player.facing);
      const dz=target && skill.effect==="approach" ? target.z-player.z : Math.cos(player.facing);
      const length=Math.hypot(dx,dz),travel=skill.effect==="approach" ? Math.max(0,length-1.7) : 1.2;
      const vx=length>0.001?dx/length:0,vz=length>0.001?dz/length:0;
      const next={x:player.x+vx*travel,y:player.y,z:player.z+vz*travel},map=getWorldMap(player.mapId);
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || isRestArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"blade_blocked");
      if(travel>0.00001){const sweep=advanceDash(player,{dx:vx,dz:vz},travel,(x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !isRestArea(player.mapId,{x,z}),map.bounds);
        if(sweep.blocked || sweep.moved+0.00001<travel)return this.reject(client,"blade_blocked");}
      this.startSkillAction(id,player,"idle");this.moveOnSurface(player,next.x,next.z);
    }
    player.mana-=skill.stamina;book.cooldowns[skillId]=now+skill.cooldownMs;
    if(skill.effect==="evade") {
      this.endBladeCloak(id,"evade");this.swordGuards.set(id,{until:this.simulatedMs+500,factor:skill.power,direction:true,counterUntil:0});
      this.bladeEvades.set(id,this.simulatedMs+500);
    } else if(skill.effect==="retreat") this.endBladeCloak(id,"retreat");
    else if(skill.effect==="focus") {
      this.bladeOpenings.delete(id);this.effects.grant(id,{id:"blade_focus",sourceId:id,group:"blade_attack",bonuses:{atk:skill.power}},this.simulatedMs+8000);
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
    } else if(skill.effect==="windup") {
      this.endBladeCloak(id,"attack");this.startSkillAction(id,player,"attacking");
      this.bladeWindups.set(id,{targetId,until:this.simulatedMs+800,power:skill.power*(monster?skillRankMultiplier(book.ranks,skillId):1)*(cloaked?(monster?1.5:1.2):1),ambush:cloaked});
    } else if(target && skill.effect!=="approach") {
      const ambush=this.endBladeCloak(id,"attack");
      const hit=this.bladeDamage(id,targetId,skill.power*(monster?skillRankMultiplier(book.ranks,skillId):1)*(ambush?(monster?1.5:1.2):1));
      if(hit){
        if(ambush)this.recordBladeOpening(id,Boolean(monster));
        if(skillId==="hidden_edge"){this.bladeMarks.set(id,{targetId,until:this.simulatedMs+8000});this.sendSwordNotice(client,"blade_mark_state",{active:true,targetId,durationMs:8000});if(monster)this.recordBladePractice(id,"mark");}
        if(skill.effect==="consume"){this.clearBladeMark(id);if(monster){this.recordBladePractice(id,"mark");this.recordBladePractice(id,"combo");}}
        if(skill.effect==="counter" && guard)guard.counterUntil=0;
      }
    }
    this.sendBladeBook(client);
    if(skill.effect!=="approach" || !cloaked)this.broadcast("blade_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    else this.sendSwordNotice(client,"blade_skill_used",{playerId:id,skillId});
    void this.saveCharacter(id);
  }

  private updateBladeEffects():void {
    for(const [id,until] of this.bladeCasts)if(this.simulatedMs>=until){
      this.bladeCasts.delete(id);
      const player=this.state.players.get(id),client=this.clients.find(c=>c.sessionId===id);
      if(!player?.alive || player.pathId!=="blade" || !client || this.pendingWarps.has(id) || isRestArea(player.mapId,player)){
        if(player?.alive)player.combatState="idle";
        continue;
      }
      player.combatState="idle";
      for(const [attackerId,targetId] of [...this.attackTargets]) if(targetId===id){const attacker=this.state.players.get(attackerId);if(attacker)this.endAttack(attackerId,attacker);}
      if(this.state.monster.targetId===id)this.state.monster.targetId="";
      this.forest.clearTarget(id);this.bladeCloaks.set(id,this.simulatedMs+5000);this.syncPlayerViews();
      this.sendSwordNotice(client,"blade_cloak_changed",{active:true,durationMs:5000});
    }
    for(const [id,mark] of this.bladeMarks)if(this.simulatedMs>=mark.until || !this.state.players.get(id)?.alive ||
      !(this.getMonster(mark.targetId) ?? this.state.players.get(mark.targetId))?.alive)this.clearBladeMark(id);
    for(const [id,until] of this.bladeOpenings)if(this.simulatedMs>=until)this.bladeOpenings.delete(id);
    for(const [id,until] of this.bladeEvades)if(this.simulatedMs>=until)this.bladeEvades.delete(id);
    for(const [id,windup] of this.bladeWindups)if(this.simulatedMs>=windup.until){
      this.bladeWindups.delete(id);
      const player=this.state.players.get(id);if(player?.alive)player.combatState="idle";
      const hit=this.bladeDamage(id,windup.targetId,windup.power);
      if(hit && windup.ambush)this.recordBladeOpening(id,Boolean(this.getMonster(windup.targetId)));
      this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"blade_windup",{result:hit?"hit":"miss"});
    }
  }

  private changeBladeBook(client:Client,message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_blade_book");
    const input=message as Record<string,unknown>,keys=Object.keys(input),action=input.action;
    if (action==="learn" || action==="upgrade") {
      if(keys.length!==2 || typeof input.skillId!=="string") return this.reject(client,"invalid_blade_book");
    } else if(action==="equip") {
      if(keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 ||
          (input.skillId!==null && typeof input.skillId!=="string")) return this.reject(client,"invalid_blade_book");
    } else if(action==="reset") {
      if(keys.length!==1) return this.reject(client,"invalid_blade_book");
    } else return this.reject(client,"invalid_blade_book");
    const id=client.sessionId,player=this.buildPlayer(client,"occult"),book=this.bladeBooks.get(id);
    if(!player) return;
    if(player.pathId!=="blade") return this.reject(client,"blade_class_required");
    if(!book) return this.reject(client,"build_unavailable");
    if(this.bladeCloaks.has(id) || this.bladeWindups.has(id) || this.bladeCasts.has(id)) return this.reject(client,"character_busy");
    if(player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)
      return this.reject(client,"blade_book_needs_shrine");
    const next=validateBladeBook(book,player.level);
    if(action==="learn") {
      const skillId=input.skillId as BladeSkillId;
      if(!Object.hasOwn(BLADE_LESSONS,skillId)) return this.reject(client,"invalid_blade_book");
      const lesson:BladeLesson=BLADE_LESSONS[skillId];
      if(next.learned.includes(skillId)) return this.reject(client,"blade_already_learned");
      if(player.level<lesson.level) return this.reject(client,"blade_level");
      if(next.learned.length+skillRankCost(next.ranks)>=bladePoints(player.level)) return this.reject(client,"blade_no_points");
      if(lesson.requires.some(req=>!next.learned.includes(req as BladeSkillId))) return this.reject(client,"blade_prerequisite");
      if(Object.entries(lesson.practice).some(([category,needed])=>next.practice[category as keyof typeof next.practice]<(needed ?? 0)))
        return this.reject(client,"blade_practice");
      next.learned.push(skillId);
    } else if(action==="upgrade") {
      const skillId=input.skillId as BladeSkillId;
      if(!BLADE_RANKABLE_SKILLS.some(id=>id===skillId) || !next.learned.includes(skillId))return this.reject(client,"blade_skill_locked");
      const rank=next.ranks?.[skillId] ?? 0;
      if(rank>=SKILL_RANK_LEVELS.length || player.level<SKILL_RANK_LEVELS[rank])return this.reject(client,"blade_level");
      if(Object.values(next.practice).reduce((sum,count)=>sum+count,0)<SKILL_RANK_PRACTICE[rank])return this.reject(client,"blade_practice");
      if(next.learned.length+skillRankCost(next.ranks)>=bladePoints(player.level))return this.reject(client,"blade_no_points");
      next.ranks={...next.ranks,[skillId]:rank+1};
    } else if(action==="equip") {
      const skillId=input.skillId as BladeSkillId|null;
      if(skillId!==null && (!next.learned.includes(skillId) || BLADE_LESSONS[skillId].effect==="passive")) return this.reject(client,"blade_skill_locked");
      for(let i=0;i<4;i++) if(skillId!==null && next.slots[i]===skillId) next.slots[i]=null;
      next.slots[input.slot as number]=skillId;
    } else {
      if(!next.learned.length) return this.reject(client,"blade_book_empty");
      next.learned=[];next.slots=[null,null,null,null];delete next.ranks;
    }
    const snapshot=this.captureCharacterSnapshot(id);
    if(!snapshot) return this.reject(client,"build_unavailable");
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,bladeBook:next}).then(()=>{
      this.bladeBooks.set(id,next);
      if(action==="reset"){
        this.clearBladeMark(id);this.bladeOpenings.delete(id);this.bladeEvades.delete(id);this.bladeWindups.delete(id);this.swordGuards.delete(id);
        this.effects.remove(id,"blade_focus",id);this.effects.remove(id,"blade_veil_guard",id);
        this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      }
      this.sendBladeBook(client);
      try {client.send("blade_book_changed",{action});} catch(error) {console.warn("MONTRA blade book confirmation was not delivered",error);}
    },error=>{console.error("MONTRA blade book save failed",error);this.reject(client,"blade_book_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private sendOccultBook(client:Client):void {
    const player=this.state.players.get(client.sessionId),book=this.occultBooks.get(client.sessionId);
    if (!player || !book || !isOccultPath(player.pathId)) return;
    try {
      client.send("occult_book_state",{path:player.pathId,book,lessons:OCCULT_LESSONS,points:occultPoints(player.level),
        masteryLabels:OCCULT_MASTERY_LABELS,masteryRequirements:OCCULT_MASTERY_REQUIREMENTS,menderRicePve:MENDER_PVE_RICE_MULTIPLIER,rankLevels:SKILL_RANK_LEVELS,rankPractice:SKILL_RANK_PRACTICE,rankable:OCCULT_RANKABLE_SKILLS});
    } catch(error) { console.warn("MONTRA occult book notice was not delivered",error); }
  }

  private recordOccultTraining<P extends OccultPath>(id:string,path:P,categories:readonly (keyof OccultMastery[P])[]):void {
    const book=this.occultBooks.get(id),player=this.state.players.get(id);
    if (!book || player?.pathId!==path) return;
    book.training[path]=Math.min(1_000_000,book.training[path]+1);
    const counters=book.mastery[path] as Record<string,number>;
    for (const category of new Set(categories)) {
      const key=String(category);
      if (Object.hasOwn(counters,key)) counters[key]=Math.min(1_000_000,counters[key]+1);
    }
    const client=this.clients.find(c=>c.sessionId===id);
    if (client) this.sendOccultBook(client);
  }

  private clearOccultCurse(targetId:string,reason:string):boolean {
    if (!this.occultCurses.delete(targetId)) return false;
    const client=this.clients.find(c=>c.sessionId===targetId);
    try {client?.send("occult_curse_state",{active:false,reason});}
    catch(error) {console.warn("MONTRA curse notice was not delivered",error);}
    return true;
  }

  private changeOccultBook(client:Client,message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_occult_book");
    const input=message as Record<string,unknown>,keys=Object.keys(input),action=input.action;
    if (action==="learn" || action==="upgrade") {
      if (keys.length!==2 || typeof input.skillId!=="string") return this.reject(client,"invalid_occult_book");
    } else if (action==="equip") {
      if (keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 ||
          (input.skillId!==null && typeof input.skillId!=="string")) return this.reject(client,"invalid_occult_book");
    } else if (action==="reset") {
      if (keys.length!==1) return this.reject(client,"invalid_occult_book");
    } else return this.reject(client,"invalid_occult_book");
    const id=client.sessionId,player=this.buildPlayer(client,"occult"),book=this.occultBooks.get(id);
    if (!player || !book) return;
    if (!isOccultPath(player.pathId)) return this.reject(client,"occult_class_required");
    if (player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)
      return this.reject(client,"occult_book_needs_shrine");
    const path=player.pathId,next=validateOccultBook(book,player.level);
    if (action==="learn") {
      const skillId=input.skillId as string;
      if (!Object.hasOwn(OCCULT_LESSONS,skillId)) return this.reject(client,"invalid_occult_book");
      const lesson:OccultLesson=OCCULT_LESSONS[skillId as OccultSkillId];
      if (lesson.path!==path) return this.reject(client,"occult_wrong_path");
      if (next.learned[path].includes(skillId as OccultSkillId)) return this.reject(client,"occult_already_learned");
      if (player.level<lesson.level) return this.reject(client,"occult_level");
      if (next.learned[path].length+occultRankCost(next.ranks,path)>=occultPoints(player.level)) return this.reject(client,"occult_no_points");
      if (lesson.requires.some(required=>!next.learned[path].includes(required as OccultSkillId))) return this.reject(client,"occult_prerequisite");
      if (next.training[path]<lesson.training) return this.reject(client,"occult_training");
      const mastery=OCCULT_MASTERY_REQUIREMENTS[skillId as OccultSkillId];
      const counters=next.mastery[path] as Readonly<Record<string,number>>;
      if (mastery && Object.entries(mastery).some(([category,count])=>(counters[category] ?? 0)<count))
        return this.reject(client,"occult_mastery");
      next.learned[path].push(skillId as OccultSkillId);
    } else if(action==="upgrade") {
      const skillId=input.skillId as OccultSkillId;
      if(!OCCULT_RANKABLE_SKILLS.includes(skillId) || !next.learned[path].includes(skillId) || OCCULT_LESSONS[skillId].path!==path)return this.reject(client,"occult_skill_locked");
      const rank=next.ranks?.[skillId] ?? 0;
      if(rank>=SKILL_RANK_LEVELS.length || player.level<SKILL_RANK_LEVELS[rank])return this.reject(client,"occult_level");
      if(next.training[path]<SKILL_RANK_PRACTICE[rank])return this.reject(client,"occult_training");
      if(next.learned[path].length+occultRankCost(next.ranks,path)>=occultPoints(player.level))return this.reject(client,"occult_no_points");
      next.ranks={...next.ranks,[skillId]:rank+1};
    } else if (action==="equip") {
      const skillId=input.skillId as OccultSkillId|null;
      if (skillId!==null && !next.learned[path].includes(skillId)) return this.reject(client,"occult_skill_locked");
      for (let i=0;i<4;i++) if (skillId!==null && next.loadouts[path][i]===skillId) next.loadouts[path][i]=null;
      next.loadouts[path][input.slot as number]=skillId;
    } else {
      if (!next.learned[path].length) return this.reject(client,"occult_book_empty");
      next.learned[path]=[];next.loadouts[path]=[null,null,null,null];
      if(next.ranks){for(const key of Object.keys(next.ranks))if(OCCULT_LESSONS[key as OccultSkillId].path===path)delete next.ranks[key];if(!Object.keys(next.ranks).length)delete next.ranks;}
    }
    const snapshot=this.captureCharacterSnapshot(id);
    if (!snapshot) return this.reject(client,"build_unavailable");
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,occultBook:next}).then(()=>{
      this.occultBooks.set(id,next);
      if (!this.legacyCombatRoom()) {
        if (player.possessionActive && !this.canPrepareSpirit(id,path,true)) this.endPossession(id,"loadout_changed");
        if (this.state.summons.has(id) && !this.canPrepareSpirit(id,path,false)) this.despawnSummon(id,"loadout_changed");
      }
      this.sendOccultBook(client);
      try {client.send("occult_book_changed",{action});} catch(error) {console.warn("MONTRA occult book confirmation was not delivered",error);}
    },error=>{console.error("MONTRA occult book save failed",error);this.reject(client,"occult_book_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private castOccultSkill(client:Client,message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_occult_skill");
    const input=message as Record<string,unknown>,keys=Object.keys(input);
    if ((keys.length!==1 && keys.length!==2) || typeof input.skillId!=="string" ||
        (keys.length===2 && (typeof input.targetId!=="string" || !Object.hasOwn(input,"targetId"))) ||
        !Object.hasOwn(OCCULT_LESSONS,input.skillId)) return this.reject(client,"invalid_occult_skill");
    const id=client.sessionId,skillId=input.skillId as OccultSkillId,lesson:OccultLesson=OCCULT_LESSONS[skillId];
    const caster=this.spellCaster(client),book=this.occultBooks.get(id);
    if (!caster || !book) return;
    if (!isOccultPath(caster.pathId)) return this.reject(client,"occult_class_required");
    const path=caster.pathId;
    if (lesson.path!==path || !book.learned[path].includes(skillId) || !book.loadouts[path].includes(skillId))
      return this.reject(client,"occult_skill_locked");
    if (Date.now()<(book.cooldowns[skillId] ?? 0)) return this.reject(client,"occult_cooldown");
    if (caster.mana<lesson.stamina) return this.reject(client,"insufficient_mana");
    const offensive=["mark","rice","rice_area","detonate","interrupt","curse","curse_burst","spirit","spirit_bind","pve_rice"].includes(lesson.effect);
    const targetId=typeof input.targetId==="string" ? input.targetId : id;
    let monster:Monster|undefined, opponent:Player|undefined;
    let targets:Array<[string,Player]>=[];
    if (offensive) {
      if (targetId===id || !this.sameCombatMap(id,targetId)) return this.reject(client,"target_unavailable");
      monster=this.getMonster(targetId);
      if (!monster && (lesson.effect==="curse" || lesson.effect==="curse_burst")) opponent=this.state.players.get(targetId);
      const target=monster ?? opponent;
      if (!target?.alive) return this.reject(client,"target_unavailable");
      if (distance3d(caster,target)>lesson.range) return this.reject(client,"occult_out_of_range");
      if (!this.bodyPathClear(caster.mapId,caster,target)) return this.reject(client,"occult_blocked");
      const mark=this.occultMarks.get(id);
      if (lesson.effect==="detonate" && (!mark || mark.targetId!==targetId || mark.until<=this.simulatedMs))
        return this.reject(client,"occult_mark_required");
      const curse=this.occultCurses.get(targetId);
      if (lesson.effect==="curse_burst" && (!curse || curse.ownerId!==id || curse.until<=this.simulatedMs))
        return this.reject(client,"occult_curse_required");
      if (lesson.effect==="spirit" || lesson.effect==="spirit_bind") {
        const spirit=this.state.summons.get(id);
        if (!spirit || spirit.kind!=="pot_spirit") return this.reject(client,"possession_needs_summon");
        if (distance3d(caster,target)>RULES.summonEngageDistance) return this.reject(client,"occult_out_of_range");
        if (!this.bodyPathClear(caster.mapId,spirit,target)) return this.reject(client,"occult_blocked");
      }
    } else {
      const party=(this.parties.get(id)?.members ?? [id]).filter(member=>
        !this.field || member===id || this.warSeats.get(member)?.side===this.warSeats.get(id)?.side);
      if (["heal_area","ward_area","cleanse_area"].includes(lesson.effect) || (lesson.effect==="trance" && path==="mender")) {
        targets=party.map(member=>[member,this.state.players.get(member)] as const)
          .filter((entry):entry is [string,Player]=>Boolean(entry[1]?.alive && !this.pendingWarps.has(entry[0]) &&
            !this.pendingItemUses.has(entry[0]) && !this.pendingRewards.has(entry[0]) && !this.pendingCharacterLeaves.has(entry[0]) && entry[1].mapId===caster.mapId &&
            distance3d(caster,entry[1])<=lesson.range && (entry[0]===id ||
              (isWorldSegmentClear(caster.mapId,caster,entry[1]) && this.bodyPathClear(caster.mapId,caster,entry[1])))));
      } else {
        if (!party.includes(targetId)) return this.reject(client,"occult_party_required");
        const target=this.state.players.get(targetId);
        if (!target?.alive || target.mapId!==caster.mapId || this.pendingWarps.has(targetId) ||
            this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId)) return this.reject(client,"target_unavailable");
        if (distance3d(caster,target)>lesson.range || (targetId!==id &&
            (!isWorldSegmentClear(caster.mapId,caster,target) || !this.bodyPathClear(caster.mapId,caster,target))))
          return this.reject(client,"occult_out_of_range");
        targets=[[targetId,target]];
      }
      if (lesson.effect==="trance" && !caster.possessionActive) return this.reject(client,"occult_trance_required");
      if ((lesson.effect==="spirit_ward" || lesson.effect==="spirit_heal") &&
          this.state.summons.get(id)?.kind!=="pot_spirit") return this.reject(client,"possession_needs_summon");
      if (lesson.effect==="heal" || lesson.effect==="spirit_heal") targets=targets.filter(([,target])=>target.hp<target.maxHp);
      if (!targets.length) return this.reject(client,"class_skill_no_target");
      if (lesson.effect==="cleanse" && !this.occultCurses.has(targetId)) return this.reject(client,"occult_no_curse");
      if (lesson.effect==="cleanse_area" && !targets.some(([member])=>this.occultCurses.has(member))) return this.reject(client,"occult_no_curse");
      if (lesson.effect==="ward" || lesson.effect==="ward_area" || lesson.effect==="spirit_ward" || lesson.effect==="trance") {
        for (const [member] of targets) {
          const active=this.effects.modifiers(member);
          if (active.length>=STACKING_RULES.maxModifiers && !active.some(effect=>effect.id===skillId && effect.sourceId===id))
            return this.reject(client,"occult_effect_limit");
        }
      }
    }

    caster.mana-=lesson.stamina;
    book.cooldowns[skillId]=Date.now()+lesson.cooldownMs;
    if (!offensive) this.markSupportManaCombat(id, targets);
    if (offensive) {
      const target=monster ?? opponent!;
      caster.facing=facingTo(target.x-caster.x,target.z-caster.z);
      this.recordCombat(id,targetId);
      const mark=this.occultMarks.get(id),hasMark=mark?.targetId===targetId && mark.until>this.simulatedMs;
      if (lesson.effect==="spirit" || lesson.effect==="spirit_bind") {
        this.occultSpiritOrders.set(id,{targetId,until:this.simulatedMs+6000,skillId:skillId as "seer_spirit"|"seer_spirit_bind"});
        this.lastSummonAttackAt.delete(id);
      } else {
        let power=lesson.power*(monster?skillRankMultiplier(book.ranks,skillId):1);
        if (lesson.effect==="rice" && hasMark) power*=1.3;
        if (lesson.effect==="detonate") this.occultMarks.delete(id);
        if (lesson.effect==="curse_burst") this.clearOccultCurse(targetId,"detonated");
        const attack=caster.magicAtk+weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").ranged;
        const damage=calculateDamage(attack*power*(opponent?0.65:1),monster?.defense ?? opponent!.magicDef,target.level);
        this.occultDamage(id,targetId,damage);
        if (lesson.effect==="rice_area" && monster) {
          const others=[this.state.monster,...this.state.monsters.values()]
            .filter(other=>other.id!==targetId && other.alive && other.mapId===caster.mapId &&
              distance3d(other,monster!)<=3 && this.sameCombatMap(id,other.id) &&
              this.bodyPathClear(caster.mapId,caster,other) && this.bodyPathClear(caster.mapId,monster!,other))
            .sort((a,b)=>distance3d(a,monster!)-distance3d(b,monster!)).slice(0,2);
          for (const other of others) {this.recordCombat(id,other.id);this.occultDamage(id,other.id,calculateDamage(attack*power,other.defense,other.level));}
        }
        if (target.alive && monster && lesson.effect==="interrupt") this.interruptMuayTarget(monster,700);
        if (target.alive && lesson.effect==="mark") this.occultMarks.set(id,{targetId,until:this.simulatedMs+8000});
        if (target.alive && lesson.effect==="curse") {
          this.occultCurses.set(targetId,{ownerId:id,until:this.simulatedMs+6500,nextTick:this.simulatedMs+2000,damage:Math.max(1,Math.round(damage*0.35))});
          const victim=this.clients.find(c=>c.sessionId===targetId);
          try {victim?.send("occult_curse_state",{active:true,durationMs:6500});}
          catch(error) {console.warn("MONTRA curse notice was not delivered",error);}
        }
      }
      if (path==="seer" && monster && lesson.effect!=="spirit" && lesson.effect!=="spirit_bind") {
        const category=lesson.effect==="rice" || lesson.effect==="rice_area" ? "rice" :
          lesson.effect==="curse" || lesson.effect==="curse_burst" ? "curse" : "talisman";
        this.recordOccultTraining(id,"seer",[category]);
      }
    } else {
      let trained=false;
      const supportPower=lesson.power*supportRankMultiplier(book.ranks,skillId);
      for (const [member,target] of targets) {
        if (lesson.effect==="heal" || lesson.effect==="heal_area" || lesson.effect==="spirit_heal") {
          const amount=this.healAmount(id,member,target.maxHp*supportPower);
          if (target.hp<target.maxHp) {target.hp=Math.min(target.maxHp,target.hp+amount);trained=true;void this.saveCharacter(member);}
        } else if (lesson.effect==="cleanse" || lesson.effect==="cleanse_area") {
          trained=this.clearOccultCurse(member,"cleansed") || trained;
        } else {
          const bonuses=path==="seer" ? {magicAtk:supportPower} : {def:supportPower,magicDef:supportPower};
          this.effects.grant(member,{id:skillId,sourceId:id,group:"occult_ward",bonuses},this.simulatedMs+8000);
          this.applyStats(member,target,this.statAllocations.get(member) ?? emptyAllocations());
          if (skillId==="mender_trance") {
            target.mana=Math.min(target.maxMana,target.mana+15);
            void this.saveCharacter(member);
          }
          if (this.simulatedMs-(this.lastCombatMs.get(member) ?? -Infinity)<PROGRESSION.combatQuietMs) trained=true;
        }
      }
      if (lesson.effect==="heal_area") this.occultHealingFields.set(id,{mapId:caster.mapId,x:caster.x,y:caster.y,z:caster.z,
        until:this.simulatedMs+6500,nextTick:this.simulatedMs+2000,power:0.03*supportRankMultiplier(book.ranks,skillId),range:lesson.range});
      if (trained && path==="mender") {
        const categories:(keyof OccultMastery["mender"])[] =
          lesson.effect==="heal" || lesson.effect==="heal_area" ? ["healing"] :
          lesson.effect==="spirit_heal" ? ["healing","spirit"] :
          lesson.effect==="cleanse" || lesson.effect==="cleanse_area" ? ["cleanse"] :
          lesson.effect==="spirit_ward" || lesson.effect==="trance" ? ["protection","spirit"] : ["protection"];
        this.recordOccultTraining(id,"mender",categories);
      } else if (trained && path==="seer") this.recordOccultTraining(id,"seer",["spirit"]);
    }
    this.sendOccultBook(client);
    this.broadcast("occult_skill_used",{playerId:id,skillId,targetId:offensive?targetId:targets[0]?.[0] ?? id},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private occultDamage(ownerId:string,targetId:string,damage:number):void {
    const monster=this.getMonster(targetId);
    if (monster?.alive) {this.hitMonsterWithSpell(ownerId,monster,damage,"talisman");return;}
    const owner=this.state.players.get(ownerId),victim=this.state.players.get(targetId);
    if (!owner?.alive || !victim?.alive || !this.sameCombatMap(ownerId,targetId,true)) return;
    this.endBladeCloak(targetId,"damaged");
    damage=this.swordGuardDamage(targetId,owner,damage);
    victim.hp=Math.max(0,victim.hp-damage);victim.hitSeq++;
    this.broadcast("pvp_hit",{attackerId:ownerId,targetId,damage,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"occult"},{afterNextPatch:true});
    if (victim.hp===0) {
      owner.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",ownerId);
      this.broadcast("pvp_kill",{winnerId:ownerId,loserId:targetId,source:"occult",kills:owner.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});
      void this.saveCharacter(ownerId);
    }
  }

  private updateOccultEffects():void {
    for (const [owner,mark] of this.occultMarks) {
      const target=this.getMonster(mark.targetId);
      if (this.simulatedMs>=mark.until || !target?.alive || !this.sameCombatMap(owner,mark.targetId)) this.occultMarks.delete(owner);
    }
    for (const [targetId,curse] of this.occultCurses) {
      const owner=this.state.players.get(curse.ownerId),target=this.getMonster(targetId) ?? this.state.players.get(targetId);
      if (this.simulatedMs>=curse.until || !owner?.alive || owner.pathId!=="seer" || !target?.alive ||
          !this.sameCombatMap(curse.ownerId,targetId,true)) {this.clearOccultCurse(targetId,"expired");continue;}
      if (this.simulatedMs>=curse.nextTick) {
        curse.nextTick+=2000;
        this.recordCombat(curse.ownerId,targetId);
        this.occultDamage(curse.ownerId,targetId,curse.damage);
      }
    }
    for (const [owner,order] of this.occultSpiritOrders)
      if (this.simulatedMs>=order.until || !this.state.summons.has(owner)) this.occultSpiritOrders.delete(owner);
    for (const [ownerId,field] of this.occultHealingFields) {
      const owner=this.state.players.get(ownerId);
      if (this.simulatedMs>=field.until || !owner?.alive || owner.pathId!=="mender" || owner.mapId!==field.mapId) {
        this.occultHealingFields.delete(ownerId);continue;
      }
      if (this.simulatedMs<field.nextTick) continue;
      field.nextTick+=2000;
      const party=this.parties.get(ownerId)?.members ?? [ownerId];
      let healed=false;
      for (const member of party) {
        const target=this.state.players.get(member);
        if (!target?.alive || target.mapId!==field.mapId || target.hp>=target.maxHp ||
            this.pendingWarps.has(member) || this.pendingItemUses.has(member) || this.pendingCharacterLeaves.has(member) ||
            this.pendingRewards.has(member) ||
            (this.field && member!==ownerId && this.warSeats.get(member)?.side!==this.warSeats.get(ownerId)?.side) ||
            distance3d(target,field)>field.range || !isWorldSegmentClear(field.mapId,field,target) ||
            !this.bodyPathClear(field.mapId,field,target)) continue;
        target.hp=Math.min(target.maxHp,target.hp+this.healAmount(ownerId,member,target.maxHp*field.power));
        healed=true;
        void this.saveCharacter(member);
      }
      if (healed) {this.recordOccultTraining(ownerId,"mender",["healing"]);void this.saveCharacter(ownerId);}
    }
  }

  private changeMuayBook(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_muay_book");
    const input=message as Record<string,unknown>, keys=Object.keys(input), action=input.action;
    if(action==="learn" || action==="upgrade" || action==="core_upgrade") {
      if(keys.length!==2 || typeof input.skillId!=="string")return this.reject(client,"invalid_muay_book");
    } else if(action==="school") {
      if(keys.length!==2 || typeof input.school!=="string")return this.reject(client,"invalid_muay_book");
    } else if(action==="equip") {
      if(keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 || (input.skillId!==null && typeof input.skillId!=="string"))return this.reject(client,"invalid_muay_book");
    } else if(action==="reset" || action==="core_reset") {
      if(keys.length!==1)return this.reject(client,"invalid_muay_book");
    } else return this.reject(client,"invalid_muay_book");
    const id=client.sessionId, player=this.buildPlayer(client), book=this.muayBooks.get(id);
    if(!player || !book)return;
    if(player.pathId!=="muay_boran")return this.reject(client,"muay_class_required");
    if(player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
      this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)return this.reject(client,"muay_book_needs_shrine");
    const next:MuayBook={learned:[...book.learned],training:{...book.training},mastery:{chaiya:{...book.mastery.chaiya},korat:{...book.mastery.korat},lopburi:{...book.mastery.lopburi},thasao:{...book.mastery.thasao}},school:book.school,slots:[...book.slots],
      loadouts:{chaiya:[...book.loadouts.chaiya],korat:[...book.loadouts.korat],lopburi:[...book.loadouts.lopburi],thasao:[...book.loadouts.thasao]},...(book.ranks?{ranks:{...book.ranks}}:{}),...(book.coreRanks?{coreRanks:{...book.coreRanks}}:{})};
    if(action==="core_upgrade") {
      const skillId=input.skillId as MuayCoreId;
      if(!Object.hasOwn(MUAY_CORE,skillId))return this.reject(client,"invalid_muay_book");
      const rank=next.coreRanks?.[skillId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || player.level<MUAY_CORE_LEVELS[rank])return this.reject(client,"muay_book_level");
      if(Object.values(next.coreRanks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(player.level))return this.reject(client,"muay_book_no_points");
      next.coreRanks={...next.coreRanks,[skillId]:rank+1};
    } else if(action==="core_reset") {
      if(!Object.keys(next.coreRanks ?? {}).length)return this.reject(client,"muay_book_empty");
      delete next.coreRanks;
    } else if(action==="learn") {
      const skillId=input.skillId as string;
      if(!Object.hasOwn(MUAY_LESSONS,skillId))return this.reject(client,"invalid_muay_book");
      const lesson=MUAY_LESSONS[skillId as MuayLessonId];
      if(!isMuayFoundation(skillId) && lesson.school!==next.school)return this.reject(client,"muay_wrong_school");
      if(next.learned.includes(skillId as MuayLessonId))return this.reject(client,"muay_book_already_learned");
      if(player.level<lesson.level)return this.reject(client,"muay_book_level");
      if(next.learned.length+skillRankCost(next.ranks)>=muayPoints(player.level))return this.reject(client,"muay_book_no_points");
      if((lesson.requires as readonly string[]).some(req=>!next.learned.includes(req as MuayLessonId)))return this.reject(client,"muay_book_prerequisite");
      if(next.training.strikes<lesson.training.strikes || next.training.blocks<lesson.training.blocks)return this.reject(client,"muay_book_training");
      const mastery=MUAY_MASTERY_REQUIREMENTS[skillId as MuayLessonId],progress=next.mastery[lesson.school];
      if(mastery && (progress.technique<mastery.technique || progress.sequences<mastery.sequences))return this.reject(client,"muay_book_mastery");
      next.learned.push(skillId as MuayLessonId);
    } else if(action==="upgrade") {
      const skillId=input.skillId as MuayLessonId;
      if(!MUAY_RANKABLE_SKILLS.includes(skillId) || !next.learned.includes(skillId))return this.reject(client,"muay_skill_locked");
      if(MUAY_LESSONS[skillId].school!==next.school)return this.reject(client,"muay_wrong_school");
      const rank=next.ranks?.[skillId] ?? 0;
      if(rank>=SKILL_RANK_LEVELS.length || player.level<SKILL_RANK_LEVELS[rank])return this.reject(client,"muay_book_level");
      if(next.training.strikes+next.training.blocks<SKILL_RANK_PRACTICE[rank])return this.reject(client,"muay_book_training");
      if(next.learned.length+skillRankCost(next.ranks)>=muayPoints(player.level))return this.reject(client,"muay_book_no_points");
      next.ranks={...next.ranks,[skillId]:rank+1};
    } else if(action==="school") {
      const school=input.school as string;
      if(!Object.hasOwn(MUAY_SCHOOLS,school))return this.reject(client,"invalid_muay_book");
      const selected=school as MuaySchool, requirements=MUAY_SCHOOLS[selected];
      if(next.school===selected)return this.reject(client,"muay_school_selected");
      if(player.level<requirements.level)return this.reject(client,"muay_book_level");
      if(next.training.strikes<requirements.strikes || next.training.blocks<requirements.blocks)return this.reject(client,"muay_book_training");
      next.school=selected;next.slots=[...next.loadouts[selected]];
    } else if(action==="equip") {
      const skillId=input.skillId as MuaySkillId|null;
      if(skillId!==null && (!Object.hasOwn(MUAY_SKILLS,skillId) || !next.learned.includes(skillId as MuayLessonId) ||
        (!isMuayFoundation(skillId) && MUAY_LESSONS[skillId as MuayLessonId].school!==next.school)))return this.reject(client,"muay_skill_locked");
      for(let i=0;i<next.slots.length;i++)if(skillId!==null && next.slots[i]===skillId)next.slots[i]=null;
      next.slots[input.slot as number]=skillId;
      next.loadouts[next.school]=[...next.slots];
    } else {
      if(!next.learned.length)return this.reject(client,"muay_book_empty");
      next.learned=[];next.loadouts=newMuayLoadouts();next.slots=[...next.loadouts[next.school]];delete next.ranks;
    }
    const snapshot=this.captureCharacterSnapshot(id);
    if(!snapshot)return this.reject(client,"build_unavailable");
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,muayBook:next}).then(()=>{
      this.muayBooks.set(id,next);player.muayBookData=JSON.stringify(next);
      if(action==="school" || action==="reset") {this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");this.clearMuayCombo(id);this.sendSwordNotice(client,"muay_counter_cleared",{});}
      try {client.send("muay_book_changed",{action});} catch(error) {console.warn("MONTRA Muay book confirmation was not delivered",error);}
    },error=>{console.error("MONTRA Muay book save failed",error);this.reject(client,"muay_book_save_failed");}).finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }


  private sendSwordNotice(client:Client|undefined, type:string, payload:Record<string,unknown>):void {
    if (!client) return;
    try {
      client.send(type,payload);
    } catch (error) {
      // Notices are optional. A disconnect must not interrupt combat resolution.
      console.warn("MONTRA sword notice was not delivered",error);
    }
  }

  private clearMuayDefense(id:string,phase:"cancelled"|"miss"|"success"):void {
    const window=this.muayDefenseWindows.get(id);if(!window)return;
    this.muayDefenseWindows.delete(id);
    this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_defense",{kind:window.kind,phase});
  }
  private updateMuayDefense():void {
    for(const [id,window] of this.muayDefenseWindows) {
      if(this.swordGuards.get(id)?.until!==window.until)this.clearMuayDefense(id,"cancelled");
      else if(this.simulatedMs>=window.until)this.clearMuayDefense(id,"miss");
    }
  }

  private swordGuardDamage(id:string, attacker:{x:number;z:number}, damage:number,guardPierce=0, summonOwnerId?:string):number {
    if(this.sentinelWindups.delete(id)) {
      const winding=this.state.players.get(id);if(winding?.alive)winding.combatState="idle";
      this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"sentinel_windup_result",{result:"interrupted"});
    }
    if(this.bladeCasts.delete(id)) {
      const casting=this.state.players.get(id);if(casting?.alive)casting.combatState="idle";
      this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"blade_cloak_changed",{active:false,reason:"interrupted"});
    }
    if(this.bladeWindups.delete(id)) {
      const winding=this.state.players.get(id);if(winding?.alive)winding.combatState="idle";
      this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"blade_windup",{result:"interrupted"});
    }
    const stance=this.muayCoreStances.get(id),player=this.state.players.get(id);
    const swordStance=this.swordCoreStances.get(id);
    if(swordStance && player?.alive && player.pathId==="phutthaisawan" && wearsTwinSwords(equippedWeaponId(this.inventories.get(id))) && this.simulatedMs<swordStance.until) {
      const monster=attacker===this.state.monster ? this.state.monster : [...this.state.monsters.values()].find(m=>m===attacker);
      const opponentId=monster?.id ?? [...this.state.players.entries()].find(([,p])=>p===attacker)?.[0];
      const progress=swordCoreProgress(swordStance.rank).sritra_core;
      if(opponentId && this.simulatedMs>=swordStance.nextCounter) {
        // Reserve before striking to prevent two counter stances recursing.
        swordStance.nextCounter=this.simulatedMs+progress.counterIntervalMs;
        if(this.swordCoreHit(id,opponentId,progress.counterPower,1))
          this.broadcast("sword_core_counter",{playerId:id,targetId:opponentId},{afterNextPatch:true});
        else swordStance.nextCounter=this.simulatedMs;
      }
      return this.sentinelShareDamage(id,attacker,Math.max(1,Math.round(damage*progress.damageFactor)),summonOwnerId);
    }
    const sentinelStance=this.sentinelCoreStances.get(id);
    if(sentinelStance && player?.alive && player.pathId==="sentinel" && this.simulatedMs<sentinelStance.until){
      const monster=attacker===this.state.monster ? this.state.monster : [...this.state.monsters.values()].find(m=>m===attacker);
      const opponentId=monster?.id ?? [...this.state.players.entries()].find(([,p])=>p===attacker)?.[0];
      const progress=sentinelCoreProgress(sentinelStance.rank).riposte;
      if(opponentId && this.simulatedMs>=sentinelStance.nextCounter){
        sentinelStance.nextCounter=this.simulatedMs+progress.counterIntervalMs;
        if(this.sentinelDamage(id,opponentId,monster?progress.counterPower:1,false))this.broadcast("sentinel_core_counter",{playerId:id,targetId:opponentId},{afterNextPatch:true});
        else sentinelStance.nextCounter=this.simulatedMs;
      }
      return this.sentinelShareDamage(id,attacker,Math.max(1,Math.round(damage*progress.damageFactor)),summonOwnerId);
    }
    if(stance && player?.alive && this.simulatedMs<stance.until) {
      const monster=attacker===this.state.monster ? this.state.monster : [...this.state.monsters.values()].find(m=>m===attacker);
      const opponentId=monster?.id ?? [...this.state.players.entries()].find(([,p])=>p===attacker)?.[0];
      if(opponentId && this.simulatedMs>=stance.nextCounter) {
        // Set the limit before the counter so two simultaneous stances cannot recurse.
        const progress=muayCoreProgress(stance.rank).chaiya;
        stance.nextCounter=this.simulatedMs+progress.counterIntervalMs;
        this.muayCoreHit(id,opponentId,progress.counterPower,1);
      }
      return this.sentinelShareDamage(id,attacker,Math.max(1,Math.round(damage*muayCoreProgress(stance.rank).chaiya.damageFactor)),summonOwnerId);
    }
    const guard=this.swordGuards.get(id);
    if (!guard || !player || this.simulatedMs>=guard.until) return this.sentinelShareDamage(id,attacker,damage,summonOwnerId);
    const dx=attacker.x-player.x, dz=attacker.z-player.z, length=Math.hypot(dx,dz);
    const front=length<0.001 || (-Math.sin(player.facing)*dx-Math.cos(player.facing)*dz)/length>=0;
    if (guard.direction && !front) return this.sentinelShareDamage(id,attacker,damage,summonOwnerId);
    const defense=this.muayDefenseWindows.get(id);
    const kind=defense && defense.until===guard.until && this.simulatedMs<defense.until ? defense.kind : undefined;
    guard.counterUntil=this.simulatedMs+3000;
    if(player.pathId==="sentinel"){
      this.sentinelCounters.set(id,this.simulatedMs+3000);
      if(attacker===this.state.monster || [...this.state.monsters.values()].some(monster=>monster===attacker))this.recordSentinelPractice(id,"guard");
    }
    if(player.pathId==="blade" && this.simulatedMs<(this.bladeEvades.get(id) ?? 0)) {
      this.bladeEvades.delete(id);guard.until=this.simulatedMs;
      if(attacker===this.state.monster || [...this.state.monsters.values()].some(monster=>monster===attacker))this.recordBladePractice(id,"evade");
      this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"blade_evade",{success:true});
    }
    this.recordSwordTraining(id,"blocks");
    if(kind!=="evade")this.recordMuayTraining(id,"blocks");
    if(kind) {guard.until=this.simulatedMs;this.clearMuayDefense(id,"success");}
    this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),player.pathId === "muay_boran" ? "muay_guarded" : "sword_guarded",{until:guard.counterUntil,kind:kind ?? "guard"});
    return this.sentinelShareDamage(id,attacker,Math.max(1,Math.round(damage*(guard.factor+(1-guard.factor)*guardPierce))),summonOwnerId);
  }

  private sentinelShareDamage(id:string,attacker:{x:number;z:number},damage:number,summonOwnerId?:string):number {
    const link=this.sentinelInterceptions.get(id),victim=this.state.players.get(id);
    if(!link || !victim)return damage;
    const owner=this.state.players.get(link.ownerId),party=this.parties.get(id);
    if(this.simulatedMs>=link.until || !owner?.alive || owner.pathId!=="sentinel" || !party?.members.includes(link.ownerId) ||
       owner.mapId!==victim.mapId || distance3d(owner,victim)>6 || isRestArea(owner.mapId,owner) ||
       this.pendingWarps.has(link.ownerId) || this.pendingItemUses.has(link.ownerId) || this.pendingRewards.has(link.ownerId) ||
       this.pendingCharacterLeaves.has(link.ownerId)){
      this.sentinelInterceptions.delete(id);return damage;
    }
    const monster=attacker===this.state.monster ? this.state.monster : [...this.state.monsters.values()].find(m=>m===attacker);
    const summonOwner=summonOwnerId && this.state.summons.get(summonOwnerId)===attacker ? this.state.players.get(summonOwnerId) : undefined;
    const aggressor=summonOwner ? [summonOwnerId!,summonOwner] as const : [...this.state.players.entries()].find(([,p])=>p===attacker);
    if(monster ? !this.sameCombatMap(link.ownerId,monster.id) : !aggressor || !this.sameCombatMap(aggressor[0],link.ownerId))return damage;
    const shared=Math.min(damage-1,Math.floor(damage*link.fraction));
    if(shared<=0)return damage;
    if(this.sentinelWindups.delete(link.ownerId)){
      owner.combatState="idle";
      this.sendSwordNotice(this.clients.find(client=>client.sessionId===link.ownerId),"sentinel_windup_result",{result:"interrupted"});
    }
    owner.hp=Math.max(0,owner.hp-shared);owner.hitSeq++;this.lastCombatMs.set(link.ownerId,this.simulatedMs);
    if(monster)this.recordSentinelPractice(link.ownerId,"assist");
    this.broadcast("sentinel_intercept",{playerId:link.ownerId,targetId:id,damage:shared,hp:owner.hp,maxHp:owner.maxHp,hitSeq:owner.hitSeq,attackerId:aggressor?.[0] ?? monster?.id,source:summonOwner?"summon":monster?"monster":"player"},{afterNextPatch:true});
    if(owner.hp===0){
      this.sentinelInterceptions.delete(id);
      if(aggressor){aggressor[1].pkKills++;owner.pkDeaths++;this.knockoutPlayer(link.ownerId,"pk",aggressor[0]);
        void this.saveCharacter(aggressor[0]);
        this.broadcast("pvp_kill",{winnerId:aggressor[0],loserId:link.ownerId,kills:aggressor[1].pkKills,deaths:owner.pkDeaths},{afterNextPatch:true});}
      else this.knockoutPlayer(link.ownerId,"monster",monster!.id);
    }
    return damage-shared;
  }

  private muayCoreHit(id:string,targetId:string,power:number,pvpPower=power):boolean {
    const actor=this.state.players.get(id),monster=this.getMonster(targetId);
    const target=monster ?? this.state.players.get(targetId);
    if(!actor?.alive || actor.pathId!=="muay_boran" || !wearsWraps(equippedWeaponId(this.inventories.get(id))) ||
      actor.flying || !onMapGround(actor) || this.sentinelStuns.has(id) || this.muayControlled(id) ||
      !target?.alive || !this.sameCombatMap(id,targetId) ||
      distance3d(actor,target)>3 || !this.bodyPathClear(actor.mapId,actor,target))return false;
    const damage=calculateDamage((actor.atk+weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee)*(monster?power:pvpPower*MUAY_PVP_DAMAGE_MULTIPLIER),
      monster?.defense ?? (target as Player).def,target.level);
    actor.facing=facingTo(target.x-actor.x,target.z-actor.z);
    this.recordCombat(id,targetId);
    if(monster)this.hitMonsterWithSpell(id,monster,damage,"muay");
    else {
      const victim=target as Player,actual=this.swordGuardDamage(targetId,actor,damage);
      victim.hp=Math.max(0,victim.hp-actual);victim.hitSeq++;
      this.broadcast("pvp_hit",{attackerId:id,targetId,damage:actual,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"muay"},{afterNextPatch:true});
      if(victim.hp===0){actor.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);void this.saveCharacter(id);
        this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:actor.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});}
    }
    return true;
  }

  private castMuayCore(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_muay_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(MUAY_CORE,input.skillId) ||
      Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") ||
      (input.targetId!==undefined && typeof input.targetId!=="string"))return this.reject(client,"invalid_muay_skill");
    const id=client.sessionId,skillId=input.skillId as MuayCoreId,skill=MUAY_CORE[skillId];
    if(this.muayControlled(id) || this.sentinelStuns.has(id))return this.reject(client,"muay_controlled");
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const actor=this.spellCaster(client),book=this.muayBooks.get(id),cooldowns=this.muayCooldowns.get(id);
    if(!actor || !book || !cooldowns)return;
    if(actor.pathId!=="muay_boran" || !wearsWraps(equippedWeaponId(this.inventories.get(id))))return this.reject(client,"muay_wrap_required");
    if(actor.flying || !onMapGround(actor) || isRestArea(actor.mapId,actor))return this.reject(client,"muay_safe_area");
    if(this.muayCoreSequences.has(id))return this.reject(client,"muay_controlled");
    const rank=book.coreRanks?.[skillId] ?? 0,progress=muayCoreProgress(rank),follow=this.muayCoreFollowups.get(id);
    if(skillId==="lopburi" && follow && this.simulatedMs<follow.until) {
      const requested=typeof input.targetId==="string"?input.targetId:"";
      const candidate=requested || [this.state.monster,...this.state.monsters.values()].filter(m=>m.alive && m.mapId===actor.mapId && distance3d(actor,m)<=3)
        .sort((a,b)=>distance3d(actor,a)-distance3d(actor,b))[0]?.id || "";
      const followProgress=muayCoreProgress(follow.rank).lopburi;
      if(!candidate || !this.muayCoreHit(id,candidate,followProgress.followPower,1.05))return this.reject(client,"muay_out_of_range");
      const monster=this.getMonster(candidate);
      if(monster?.alive && followProgress.staggerMs)this.interruptMuayTarget(monster,followProgress.staggerMs);
      this.muayCoreFollowups.delete(id);
      this.broadcast("muay_core_followup",{playerId:id,active:false},{afterNextPatch:true});
      return;
    }
    if(Date.now()<(cooldowns[skillId] ?? 0))return this.reject(client,"muay_cooldown");
    const manaCost=muayCoreManaCost(skillId,rank);
    if(actor.mana<manaCost)return this.reject(client,"insufficient_mana");
    const targetId=typeof input.targetId==="string"?input.targetId:"";
    const target=targetId ? this.getMonster(targetId) ?? this.state.players.get(targetId) : undefined;
    if(skill.kind==="target" && (!target?.alive || !this.sameCombatMap(id,targetId) ||
      distance3d(actor,target)>(skillId==="thasao"?progress.thasao.range:3) ||
      !this.bodyPathClear(actor.mapId,actor,target)))return this.reject(client,"muay_out_of_range");
    if(skillId==="lopburi" || skillId==="thasao") {
      const intent=skillId==="lopburi" ? this.muayMoveIntent.get(id) ?? {x:-Math.sin(actor.facing),z:-Math.cos(actor.facing)}
        : {x:target!.x-actor.x,z:target!.z-actor.z};
      const length=Math.hypot(intent.x,intent.z);
      if(length<.001)return this.reject(client,"muay_blocked");
      const travel=skillId==="lopburi"?progress.lopburi.distance:Math.max(0,length-1.8);
      const dir={dx:intent.x/length,dz:intent.z/length},map=getWorldMap(actor.mapId)!;
      let position={x:actor.x,z:actor.z},total=0;
      while(total+.00001<travel) {
        const step=advanceDash(position,dir,travel-total,(x,z)=>this.canOccupy(x,z,surfaceLayer(actor),false,actor.mapId) && !isRestArea(actor.mapId,{x,z}),map.bounds);
        position={x:step.x,z:step.z};total+=step.moved;
        if(step.blocked || step.moved<.00001)break;
      }
      if((travel>.05 && total<Math.min(.25,travel)) || (skillId==="thasao" && total+.05<travel))return this.reject(client,"muay_blocked");
      this.destinations.delete(id);this.moveOnSurface(actor,position.x,position.z);actor.facing=facingTo(dir.dx,dir.dz);
    }
    actor.mana-=manaCost;cooldowns[skillId]=Date.now()+skill.cooldownMs;actor.muayData=JSON.stringify(cooldowns);
    this.startSkillAction(id,actor,"idle");
    if(skillId==="chaiya") {
      const duration=progress.chaiya.durationMs;
      this.muayCoreStances.set(id,{until:this.simulatedMs+duration,rank,nextCounter:0});
    } else if(skillId==="lopburi") {
      this.muayCoreFollowups.set(id,{until:this.simulatedMs+progress.lopburi.followMs,rank});
      this.broadcast("muay_core_followup",{playerId:id,active:true,durationMs:progress.lopburi.followMs},{afterNextPatch:true});
    } else if(target) {
      const damageRank=this.getMonster(targetId) ? rank : 0;
      const damageProgress=muayCoreProgress(damageRank);
      const hits=skillId==="korat"?3:damageProgress.thasao.hits;
      const interval=skillId==="korat"?350:220;
      const power=damageProgress.thasao.hitPower;
      this.muayCoreSequences.set(id,{targetId,next:this.simulatedMs,remaining:hits,interval,power,skillId:skillId as "korat"|"thasao",rank:damageRank});
      if(skillId==="thasao") {
        const monster=this.getMonster(targetId);
        const result=monster ? this.interruptMuayTarget(monster,damageProgress.thasao.staggerMs) : this.sentinelInterrupt(id,targetId);
        if(result==="applied" && !monster)this.sentinelStuns.set(targetId,this.simulatedMs+Math.min(1000,hits*interval));
      }
    }
    this.broadcast("muay_core_used",{playerId:id,skillId,durationMs:skillId==="chaiya"?progress.chaiya.durationMs:0},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private updateMuayCore():void {
    for(const [id,sequence] of this.muayCoreSequences) {
      if(this.simulatedMs<sequence.next)continue;
      const heavy=muayCoreProgress(sequence.rank).korat;
      const power=sequence.skillId==="korat" ? [.42,.53,heavy.finalPower][3-sequence.remaining]*heavy.scale : sequence.power;
      if(!this.muayCoreHit(id,sequence.targetId,power)){this.muayCoreSequences.delete(id);continue;}
      sequence.remaining--;sequence.next+=sequence.interval;
      if(!sequence.remaining)this.muayCoreSequences.delete(id);
    }
    for(const [id,stance] of this.muayCoreStances)if(this.simulatedMs>=stance.until)this.muayCoreStances.delete(id);
    for(const [id,follow] of this.muayCoreFollowups)if(this.simulatedMs>=follow.until)this.muayCoreFollowups.delete(id);
  }

  private castMuaySkill(client:Client, message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_muay_skill");
    const input=message as Record<string,unknown>;
    if (typeof input.skillId!=="string" || !Object.hasOwn(MUAY_SKILLS,input.skillId) ||
        Object.keys(input).some(key=>key!=="skillId" && key!=="targetId") ||
        (input.targetId!==undefined && typeof input.targetId!=="string")) return this.reject(client,"invalid_muay_skill");
    const id=client.sessionId, skillId=input.skillId as MuaySkillId, skill=MUAY_SKILLS[skillId];
    if(this.muayHeldBy.has(id))return this.reject(client,"muay_controlled");
    if(this.muayGrapples.has(id)) {
      if(skillId!=="grapple")return this.reject(client,"muay_controlled");
      return this.finishMuayGrapple(client,input.targetId);
    }
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const player=this.spellCaster(client), cooldowns=this.muayCooldowns.get(id);
    if (!player || !cooldowns) return;
    if (player.pathId!=="muay_boran") return this.reject(client,"muay_class_required");
    if (!wearsWraps(equippedWeaponId(this.inventories.get(id)))) return this.reject(client,"muay_wrap_required");
    const book=this.muayBooks.get(id);
    if (!book) return this.reject(client,"muay_class_required");
    if (!book.slots.includes(skillId) || !book.learned.includes(skillId as MuayLessonId) || (!isMuayFoundation(skillId) && MUAY_LESSONS[skillId as MuayLessonId].school!==book.school)) return this.reject(client,"muay_skill_locked");
    if (player.flying || !onMapGround(player)) return this.reject(client,"flying");
    if (isRestArea(player.mapId,player)) return this.reject(client,"muay_safe_area");
    const now=Date.now();
    if (now<(cooldowns[skillId] ?? 0)) return this.reject(client,"muay_cooldown");
    if (player.mana<skill.stamina) return this.reject(client,"insufficient_mana");
    const guard=this.swordGuards.get(id);
    const isCounter=skill.effect==="counter" || skill.effect==="counter_sidestep";
    if (isCounter && (!guard || this.simulatedMs>=guard.counterUntil)) return this.reject(client,"muay_counter_required");
    let target:Monster|Player|undefined, monster:Monster|undefined, targetId="";
    if (skill.effect!=="guard" && skill.effect!=="parry" && skill.effect!=="evade") {
      const order=parseAttackCommand({targetId:input.targetId}) ?? parsePkTargetCommand({targetId:input.targetId});
      if (!order) return this.reject(client,"invalid_muay_target");
      targetId=order.targetId;monster=this.getMonster(targetId);
      target=monster ?? this.state.players.get(targetId);
      if (!target?.alive || targetId===id || !this.sameCombatMap(id,targetId)) { this.clearMuayCombo(id); return this.reject(client,"target_unavailable"); }
      if (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))) return this.reject(client,"target_unavailable");
      if (distance3d(player,target)>skill.range || Math.abs(player.y-target.y)>1.1) return this.reject(client,"muay_out_of_range");
      if (!this.bodyPathClear(player.mapId,player,target)) return this.reject(client,"muay_blocked");
    }
    const followup=MUAY_FOLLOWUPS[book.school],opening=this.muayFollowups.get(id);
    if(skillId===followup.finisher && (!opening || opening.school!==book.school || opening.targetId!==targetId || this.simulatedMs>=opening.until))
      return this.reject(client,"muay_followup_required");
    if(skill.effect==="evade") {
      const dx=Math.sin(player.facing),dz=Math.cos(player.facing),distance=1.2;
      const next={x:player.x+dx*distance,y:player.y,z:player.z+dz*distance},map=getWorldMap(player.mapId);
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || isRestArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"muay_blocked");
      const sweep=advanceDash(player,{dx,dz},distance,(x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !isRestArea(player.mapId,{x,z}),map.bounds);
      if(sweep.blocked || sweep.moved+0.00001<distance)return this.reject(client,"muay_blocked");
      this.startSkillAction(id,player,"idle");
      this.moveOnSurface(player,next.x,next.z);
    }
    let retreatPoint:{x:number;y:number;z:number}|undefined,muayMoved=false;
    if(skill.effect==="retreat_strike" && target) {
      const dx=player.x-target.x,dz=player.z-target.z,length=Math.hypot(dx,dz),vx=length>0.001?dx/length:Math.sin(player.facing),vz=length>0.001?dz/length:Math.cos(player.facing),travel=1.2;
      const next={x:player.x+vx*travel,y:player.y,z:player.z+vz*travel},map=getWorldMap(player.mapId);
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || isRestArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"muay_blocked");
      const sweep=advanceDash(player,{dx:vx,dz:vz},travel,(x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !isRestArea(player.mapId,{x,z}),map.bounds);
      if(sweep.blocked || sweep.moved+0.00001<travel)return this.reject(client,"muay_blocked");
      retreatPoint=next;
    }
    if ((skill.effect==="step" || skill.effect==="sidestep" || skill.effect==="step_flurry" || skill.effect==="counter_sidestep") && target) {
      const dx=target.x-player.x,dz=target.z-player.z,distance=Math.hypot(dx,dz),move=Math.max(0,distance-1.7);
      const side=skill.effect==="sidestep" || skill.effect==="counter_sidestep" ? (skillId==="lopburi_reverse" ? -0.8 : 0.8) : 0, divisor=Math.max(distance,0.001);
      const next={x:player.x+(dx*move-dz*side)/divisor,y:player.y,z:player.z+(dz*move+dx*side)/divisor};
      if (!this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || isRestArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next)) return this.reject(client,"muay_blocked");
      const vx=next.x-player.x,vz=next.z-player.z,travel=Math.hypot(vx,vz);
      if (travel>0.00001) {
        const sweep=advanceDash(player,{dx:vx/travel,dz:vz/travel},travel,
          (x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !isRestArea(player.mapId,{x,z}),getWorldMap(player.mapId)!.bounds);
        if (sweep.blocked || sweep.moved+0.00001<travel) return this.reject(client,"muay_blocked");
      }
      muayMoved=travel>0.1;
      this.destinations.delete(id); this.moveOnSurface(player,next.x,next.z);
    }
    if(skill.effect==="grapple" && target && !this.startMuayGrapple(client,player,target,monster,targetId))return;
    if(opening && (skillId===followup.finisher || (targetId && opening.targetId!==targetId)))this.clearMuayFollowup(id);
    player.mana-=skill.stamina;
    cooldowns[skillId]=now+skill.cooldownMs;
    player.muayData=JSON.stringify(cooldowns);
    if (skill.effect==="guard" || skill.effect==="parry" || skill.effect==="evade") {
      this.clearMuayDefense(id,"cancelled");
      const duration=skill.effect==="guard" ? (skillId==="chaiya_cover" ? 1800 : 1200) : skill.effect==="parry" ? 600 : 450;
      const until=this.simulatedMs+duration;
      this.swordGuards.set(id,{until,factor:skill.power,direction:true,counterUntil:0});
      if(skill.effect!=="guard") {
        this.muayDefenseWindows.set(id,{kind:skill.effect,until});
        this.sendSwordNotice(client,"muay_defense",{kind:skill.effect,phase:"start",durationMs:duration});
      }
      this.sendSwordNotice(client,"muay_counter_cleared",{});
    } else if (target && skill.effect!=="grapple") {
      player.facing=facingTo(target.x-player.x,target.z-player.z);
      if (isCounter && guard) { guard.counterUntil=0; this.sendSwordNotice(client,"muay_counter_cleared",{}); }
      this.recordCombat(id,targetId);
      this.recordMuayTraining(id,"strikes");
      const pvp=!monster,comboMultiplier=this.advanceMuaySkillCombo(id,book.school,targetId,skillId as Exclude<MuaySkillId,"guard"|"parry"|"evade"|"grapple"|"chaiya_cover">,pvp);
      const attack=(player.atk+weaponBonuses(this.inventories.get(id),pvp?"pvp":"pve").melee)*skill.power*comboMultiplier*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:skillRankMultiplier(book.ranks,skillId));
      const hits=skill.effect==="flurry" || skill.effect==="step_flurry" ? 2 : 1;
      for(let hit=0;hit<hits && target.alive;hit++) {
        if(monster) {
          const damage=calculateDamage(attack,monster.defense,monster.level);
          this.hitMonsterWithSpell(id,monster,damage,"muay");
        } else {
          const opponent=target as Player;
          const damage=this.swordGuardDamage(targetId,player,calculateDamage(attack,opponent.def,opponent.level),skillId==="korat_pierce" ? 0.25 : 0);
          opponent.hp=Math.max(0,opponent.hp-damage);opponent.hitSeq++;
          this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"muay"},{afterNextPatch:true});
          if(opponent.hp===0) {
            player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.clearMuayCombo(id);
            this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,source:"muay",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
          }
        }
      }
      if(skill.effect==="teep" && target.alive)this.sendSwordNotice(client,"muay_interrupt",{result:monster ? this.interruptMuayTarget(monster) : "pvp_no_interrupt"});
      if(skillId==="chaiya_finish")player.mana=Math.min(player.maxMana,player.mana+10);
      if(skillId==="chaiya_return")player.mana=Math.min(player.maxMana,player.mana+8);
      if(skillId==="korat_finish" && monster && target.alive)this.sendSwordNotice(client,"muay_interrupt",{result:this.interruptMuayTarget(monster,500),source:"korat_finish"});
      if(skillId==="korat_press" && monster && target.alive)this.sendSwordNotice(client,"muay_interrupt",{result:this.interruptMuayTarget(monster,600),source:"korat_press"});
      if(retreatPoint){this.startSkillAction(id,player,"idle");this.moveOnSurface(player,retreatPoint.x,retreatPoint.z);muayMoved=true;}
      if(monster)this.recordMuayMastery(id,book.school,countsMuayTechnique(book.school,skillId,muayMoved),comboMultiplier>1 || skillId===followup.finisher);
      if(skillId===followup.opener && target.alive && book.learned.includes(followup.finisher)) {
        this.muayFollowups.set(id,{school:book.school,targetId,until:this.simulatedMs+MUAY_FOLLOWUP_WINDOW_MS});
        this.sendSwordNotice(client,"muay_followup",{active:true,skillId:followup.finisher,targetId,durationMs:MUAY_FOLLOWUP_WINDOW_MS});
      }
    }
    this.broadcast("muay_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private changeSwordCore(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_sword_tree");
    const input=message as Record<string,unknown>,keys=Object.keys(input),action=input.action;
    if(action==="upgrade" ? keys.length!==2 || typeof input.skillId!=="string" : action!=="reset" || keys.length!==1)return this.reject(client,"invalid_sword_tree");
    const id=client.sessionId,player=this.buildPlayer(client,"swordTree"),tree=this.swordTrees.get(id);
    if(!player || !tree)return;
    if(player.pathId!=="phutthaisawan")return this.reject(client,"sword_class_required");
    if(player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 || this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)return this.reject(client,"sword_tree_needs_shrine");
    const next:SwordTree={...tree,cooldowns:{...tree.cooldowns},coreRanks:{...tree.coreRanks}};
    if(action==="upgrade") {
      const skillId=input.skillId as SwordCoreId;
      if(!Object.hasOwn(SWORD_CORE,skillId))return this.reject(client,"invalid_sword_tree");
      const rank=next.coreRanks?.[skillId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || player.level<MUAY_CORE_LEVELS[rank])return this.reject(client,"sword_tree_level");
      if(Object.values(next.coreRanks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(player.level))return this.reject(client,"sword_tree_no_points");
      next.coreRanks={...next.coreRanks,[skillId]:rank+1};
    } else {
      if(!Object.keys(next.coreRanks ?? {}).length)return this.reject(client,"sword_tree_empty");
      delete next.coreRanks;
    }
    const snapshot=this.captureCharacterSnapshot(id);
    if(!snapshot)return this.reject(client,"build_unavailable");
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,swordTree:next}).then(()=>{
      this.swordTrees.set(id,next);player.swordTreeData=JSON.stringify(next);
      try {client.send("sword_tree_changed",{action});}catch(error){console.warn("MONTRA sword confirmation was not delivered",error);}
    }).catch(error=>{console.error("MONTRA sword core save failed",error);this.reject(client,"sword_tree_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private swordCoreHit(id:string,targetId:string,power:number,pvpPower=power,range=3):boolean {
    const actor=this.state.players.get(id),monster=this.getMonster(targetId),target=monster ?? this.state.players.get(targetId);
    if(!actor?.alive || actor.pathId!=="phutthaisawan" || !wearsTwinSwords(equippedWeaponId(this.inventories.get(id))) ||
      actor.flying || !onMapGround(actor) || this.sentinelStuns.has(id) || this.muayControlled(id) || targetId===id ||
      !target?.alive || (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))) ||
      !this.sameCombatMap(id,targetId) || distance3d(actor,target)>range || Math.abs(actor.y-target.y)>1.1 || !this.bodyPathClear(actor.mapId,actor,target))return false;
    const damage=calculateDamage((actor.atk+weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee)*(monster?power:pvpPower*SWORD_PVP_DAMAGE_MULTIPLIER),monster?.defense ?? (target as Player).def,target.level);
    actor.facing=facingTo(target.x-actor.x,target.z-actor.z);this.recordCombat(id,targetId);
    if(monster)this.hitMonsterWithSpell(id,monster,damage,"sword");
    else {
      const victim=target as Player,actual=this.swordGuardDamage(targetId,actor,damage);
      // A counter may defeat either participant before the original hit lands.
      if(!actor.alive || !victim.alive)return false;
      victim.hp=Math.max(0,victim.hp-actual);victim.hitSeq++;
      this.broadcast("pvp_hit",{attackerId:id,targetId,damage:actual,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"sword"},{afterNextPatch:true});
      if(victim.hp===0){actor.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);void this.saveCharacter(id);this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:actor.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});}
    }
    return true;
  }

  private castSwordCore(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_sword_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(SWORD_CORE,input.skillId) || Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))return this.reject(client,"invalid_sword_skill");
    const id=client.sessionId,skillId=input.skillId as SwordCoreId,skill=SWORD_CORE[skillId];
    if(this.muayControlled(id) || this.sentinelStuns.has(id) || this.swordCoreSequences.has(id))return this.reject(client,"muay_controlled");
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const actor=this.spellCaster(client),tree=this.swordTrees.get(id);
    if(!actor || !tree)return;
    if(actor.pathId!=="phutthaisawan" || !wearsTwinSwords(equippedWeaponId(this.inventories.get(id))))return this.reject(client,"sword_weapon_required");
    if(actor.flying || !onMapGround(actor) || isRestArea(actor.mapId,actor))return this.reject(client,"sword_blocked");
    if(Date.now()<(tree.cooldowns[skillId] ?? 0))return this.reject(client,"sword_skill_cooldown");
    const rank=tree.coreRanks?.[skillId] ?? 0,progress=swordCoreProgress(rank),mana=skill.stamina+rank;
    if(actor.mana<mana)return this.reject(client,"insufficient_mana");
    const targetId=typeof input.targetId==="string"?input.targetId:"",monster=this.getMonster(targetId),target=monster ?? this.state.players.get(targetId);
    if(skill.kind==="target" && (!target?.alive || targetId===id || (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))) || !this.sameCombatMap(id,targetId) || Math.abs(actor.y-target.y)>1.1 || distance3d(actor,target)>(skillId==="phuttha_core"?6:(monster?progress.atamat_core.range:3.5)) || !this.bodyPathClear(actor.mapId,actor,target)))return this.reject(client,"sword_out_of_range");
    const supportTargets:Array<[string,Player]>=[];
    if(skillId==="chumphon_core") {
      for(const memberId of this.parties.get(id)?.members ?? [id]) {
        const member=this.state.players.get(memberId),p=progress.chumphon_core;
        if(!member?.alive || member.mapId!==actor.mapId || this.pendingWarps.has(memberId) || this.pendingItemUses.has(memberId) || this.pendingRewards.has(memberId) || this.pendingCharacterLeaves.has(memberId) || (this.field && memberId!==id && this.warSeats.get(memberId)?.side!==this.warSeats.get(id)?.side) || distance3d(actor,member)>p.range || (memberId!==id && (!this.combatSegmentClear(actor.mapId,actor,member) || !this.bodyPathClear(actor.mapId,actor,member))))continue;
        const active=this.effects.modifiers(memberId);
        if(active.length>=STACKING_RULES.maxModifiers && !active.some(effect=>effect.id===skillId && effect.sourceId===id))continue;
        supportTargets.push([memberId,member]);
      }
      if(!supportTargets.length)return this.reject(client,"sword_effect_limit");
    }
    if(skillId==="phuttha_core" && target) {
      const dx=target.x-actor.x,dz=target.z-actor.z,length=Math.hypot(dx,dz),travel=Math.max(0,length-1.8);
      if(travel>.001) {
        const direction={dx:dx/length,dz:dz/length},map=getWorldMap(actor.mapId)!;
        let position={x:actor.x,z:actor.z},total=0;
        while(total+.00001<travel){const step=advanceDash(position,direction,travel-total,(x,z)=>this.canOccupy(x,z,surfaceLayer(actor),false,actor.mapId) && !isRestArea(actor.mapId,{x,z}),map.bounds);position={x:step.x,z:step.z};total+=step.moved;if(step.blocked || step.moved<.00001)break;}
        if(total+.05<travel)return this.reject(client,"sword_blocked");
        this.moveOnSurface(actor,position.x,position.z);
      }
    }
    actor.mana-=mana;tree.cooldowns[skillId]=Date.now()+skill.cooldownMs;actor.swordTreeData=JSON.stringify(tree);
    this.startSkillAction(id,actor,"idle");
    if(skillId==="sritra_core")this.swordCoreStances.set(id,{until:this.simulatedMs+progress.sritra_core.durationMs,rank,nextCounter:0});
    else if(skillId==="phuttha_core" && target)this.swordCoreSequences.set(id,{targetId,next:this.simulatedMs,remaining:3,rank:monster?rank:0});
    else if(skillId==="atamat_core" && target) {
      const dx=target.x-actor.x,dz=target.z-actor.z,length=Math.max(.001,Math.hypot(dx,dz));
      const candidates:Monster[]=[];
      if(monster) {
        const consider=(m:Monster)=>{const vx=m.x-actor.x,vz=m.z-actor.z,d=Math.hypot(vx,vz);if(m.id!==targetId && m.alive && d<=progress.atamat_core.range && (d<.001 || (dx*vx+dz*vz)/(length*d)>=.5))candidates.push(m);};
        consider(this.state.monster);this.state.monsters.forEach(consider);
      }
      this.swordCoreHit(id,targetId,progress.atamat_core.power,.85,monster?progress.atamat_core.range:3.5);
      candidates.sort((a,b)=>distance3d(actor,a)-distance3d(actor,b) || a.id.localeCompare(b.id));
      let count=1;for(const candidate of candidates){if(count>=3)break;if(this.swordCoreHit(id,candidate.id,progress.atamat_core.power,.85,progress.atamat_core.range))count++;}
    } else if(skillId==="chumphon_core") {
      for(const [memberId,member] of supportTargets) {
        const p=progress.chumphon_core;
        this.effects.grant(memberId,{id:skillId,sourceId:id,group:"sword_support",bonuses:{def:p.defense}},this.simulatedMs+p.durationMs);
        this.applyStats(memberId,member,this.statAllocations.get(memberId) ?? emptyAllocations());
      }
      this.markSupportManaCombat(id,supportTargets);
    }
    this.broadcast("sword_skill_used",{playerId:id,skillId,targetId,durationMs:skillId==="sritra_core"?progress.sritra_core.durationMs:0},{afterNextPatch:true});void this.saveCharacter(id);
  }

  private updateSwordCore():void {
    for(const [id,sequence] of this.swordCoreSequences) {
      if(this.simulatedMs<sequence.next)continue;
      const p=swordCoreProgress(sequence.rank).phuttha_core,hit=3-sequence.remaining;
      if(!this.swordCoreHit(id,sequence.targetId,[.36,.46,p.finalPower][hit]*p.scale,[.36,.46,.65][hit])){this.swordCoreSequences.delete(id);continue;}
      sequence.remaining--;sequence.next+=280;if(!sequence.remaining)this.swordCoreSequences.delete(id);
    }
    for(const [id,stance] of this.swordCoreStances)if(this.simulatedMs>=stance.until || !this.state.players.get(id)?.alive)this.swordCoreStances.delete(id);
  }

  private castSwordSkill(client:Client, message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_sword_skill");
    const input=message as Record<string,unknown>, keys=Object.keys(input);
    if (typeof input.skillId!=="string" || !Object.hasOwn(SWORD_NODES,input.skillId) ||
        keys.some(key=>key!=="skillId" && key!=="targetId") ||
        (input.targetId!==undefined && typeof input.targetId!=="string")) return this.reject(client,"invalid_sword_skill");
    const id=client.sessionId, skillId=input.skillId, skill=SWORD_NODES[skillId];
    const player=this.spellCaster(client), tree=this.swordTrees.get(id);
    if (!player || !tree) return;
    if (player.pathId!=="phutthaisawan" || !wearsTwinSwords(equippedWeaponId(this.inventories.get(id))))
      return this.reject(client,"sword_weapon_required");
    if (!tree.learned.includes(skillId) || (skill.school!=="common" && skill.school!==tree.school) || skill.effect==="passive")
      return this.reject(client,"sword_skill_locked");
    if (player.flying) return this.reject(client,"flying");
    const now=Date.now();
    if (now<(tree.cooldowns[skillId] ?? 0)) return this.reject(client,"sword_skill_cooldown");
    if (player.mana<skill.stamina) return this.reject(client,"insufficient_mana");
    const guard=this.swordGuards.get(id);
    if (skill.effect==="counter" && (!guard || this.simulatedMs>=guard.counterUntil)) return this.reject(client,"sword_counter_required");
    const combo=this.swordCombos.get(id);
    if (skillId==="twin_finale" && (!combo || combo.count<3 || this.simulatedMs>=combo.until)) return this.reject(client,"sword_combo_required");

    let targetId="", target:Monster|Player|undefined, monster:Monster|undefined;
    if (skill.effect!=="guard" && skill.effect!=="support") {
      const order=parseAttackCommand({targetId:input.targetId}) ?? parsePkTargetCommand({targetId:input.targetId});
      if (!order) return this.reject(client,"invalid_sword_target");
      targetId=order.targetId;
      monster=this.getMonster(targetId);
      target=monster ?? this.state.players.get(targetId);
      if (!target?.alive || targetId===id || !this.sameCombatMap(id,targetId)) return this.reject(client,"target_unavailable");
      if (skill.effect==="area" && !monster) return this.reject(client,"invalid_sword_target");
      if (distance3d(player,target)>skill.range || Math.abs(player.y-target.y)>1.1) return this.reject(client,"sword_out_of_range");
      if (!this.bodyPathClear(player.mapId,player,target)) return this.reject(client,"sword_blocked");
    }
    if ((skill.effect==="step" || skillId==="riposte") && target) {
      const dx=target.x-player.x,dz=target.z-player.z,distance=Math.hypot(dx,dz);
      const move=Math.max(0,distance-1.7);
      const side=skillId==="circle_step" || skillId==="riposte" ? 0.8 : 0;
      const next={x:player.x+(dx*move-dz*side)/Math.max(distance,0.001),y:player.y,z:player.z+(dz*move+dx*side)/Math.max(distance,0.001)};
      if (!this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || isRestArea(player.mapId,next) ||
          !this.bodyPathClear(player.mapId,player,next)) return this.reject(client,"sword_blocked");
      const travelX=next.x-player.x, travelZ=next.z-player.z, travel=Math.hypot(travelX,travelZ);
      if (travel>0.00001) {
        const sweep=advanceDash(player,{dx:travelX/travel,dz:travelZ/travel},travel,
          (x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !isRestArea(player.mapId,{x,z}),
          getWorldMap(player.mapId)!.bounds);
        if (sweep.blocked || sweep.moved+0.00001<travel) return this.reject(client,"sword_blocked");
      }
      this.destinations.delete(id);
      this.moveOnSurface(player,next.x,next.z);
    }
    player.mana-=skill.stamina;
    tree.cooldowns[skillId]=now+skill.cooldownMs;
    player.swordTreeData=JSON.stringify(tree);
    if (skill.effect==="guard") {
      this.swordGuards.set(id,{until:this.simulatedMs+1200,factor:skill.power,direction:skillId!=="circle_guard",counterUntil:0});
      this.sendSwordNotice(client,"sword_counter_cleared",{});
    } else if (skill.effect==="support") {
      const members=this.parties.get(id)?.members ?? [id];
      const supported:Array<[string,Player]>=[];
      for (const memberId of members) {
        const member=this.state.players.get(memberId);
        if (!member?.alive || member.mapId!==player.mapId || this.pendingWarps.has(memberId) ||
            distance3d(player,member)>skill.range || !this.bodyPathClear(player.mapId,player,member)) continue;
        const active=this.effects.modifiers(memberId);
        if (active.length>=STACKING_RULES.maxModifiers && !active.some(effect=>effect.id===skillId && effect.sourceId===id)) continue;
        this.effects.grant(memberId,{id:skillId,sourceId:id,group:"sword_support",bonuses:{def:skill.power}},this.simulatedMs+8000);
        this.applyStats(memberId,member,this.statAllocations.get(memberId) ?? emptyAllocations());
        supported.push([memberId,member]);
      }
      this.markSupportManaCombat(id,supported);
    } else if (target) {
      player.facing=facingTo(target.x-player.x,target.z-player.z);
      const base=(player.atk+weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee) *
        (tree.learned.includes("rhythm") ? 1.05 : 1);
      const victims: {id:string; target:Monster|Player; monster:boolean}[]=[{id:targetId,target,monster:Boolean(monster)}];
      if (skill.effect==="area") {
        const dx=target.x-player.x,dz=target.z-player.z,length=Math.max(0.001,Math.hypot(dx,dz));
        const consider=(candidate:Monster) => {
          const vx=candidate.x-player.x,vz=candidate.z-player.z,d=Math.hypot(vx,vz);
          if (candidate.id!==targetId && candidate.alive && d<=skill.range && Math.abs(candidate.y-player.y)<=1.1 &&
              (d<0.001 || (dx*vx+dz*vz)/(length*d)>=0.5) && this.sameCombatMap(id,candidate.id) &&
              this.bodyPathClear(player.mapId,player,candidate)) victims.push({id:candidate.id,target:candidate,monster:true});
        };
        consider(this.state.monster);
        this.state.monsters.forEach(consider);
      }
      const hits=skill.effect==="flurry" ? (skillId==="twin_finale"?3:2) : 1;
      if (skill.effect==="counter" && guard) {
        guard.counterUntil=0;
        this.sendSwordNotice(client,"sword_counter_cleared",{});
      }
      if (skillId==="twin_finale") { this.swordCombos.delete(id); this.sendSwordNotice(client,"sword_combo",{count:0}); }
      for (const victim of victims.slice(0,5)) {
        for (let count=0;count<hits && victim.target.alive;count++) {
          this.recordCombat(id,victim.id);
          const defense=victim.monster ? (victim.target as Monster).defense : (victim.target as Player).def;
          let damage=calculateDamage(base*skill.power*(victim.monster?skillRankMultiplier(tree.ranks,skillId):SWORD_PVP_DAMAGE_MULTIPLIER),defense,victim.target.level);
          if (victim.monster) this.hitMonsterWithSpell(id,victim.target as Monster,damage,"sword");
          else {
            const opponent=victim.target as Player;
            damage=this.swordGuardDamage(victim.id,player,damage);
            opponent.hp=Math.max(0,opponent.hp-damage); opponent.hitSeq++;
            this.broadcast("pvp_hit",{attackerId:id,targetId:victim.id,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"sword"},{afterNextPatch:true});
            if (opponent.hp===0) {
              player.pkKills++; opponent.pkDeaths++; this.knockoutPlayer(victim.id,"pk",id);
              void this.saveCharacter(id);
              this.broadcast("pvp_kill",{winnerId:id,loserId:victim.id,source:"sword",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
            }
          }
        }
      }
    }
    this.broadcast("sword_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private equipItem(client:Client,message:unknown,body:boolean):void {
      if(this.sentinelStuns.has(client.sessionId))return this.reject(client,"sentinel_stunned");
      if(this.sentinelWindups.has(client.sessionId))return this.reject(client,"sentinel_windup_active");
      const gearOrder=body ? parseBodyCommand(message) : null;
      const order=body ? gearOrder : parseEquipWeaponCommand(message);
      if (!order) return this.reject(client, "invalid_weapon_equip");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.pendingWarps.has(id)) return this.reject(client, "character_busy");
      if (this.climbs.has(id) || this.flightTransitions.has(id) ||
          this.activeDashes.has(id)) return this.reject(client, "equipment_busy");
      const inventory = this.inventories.get(id);
      if (!inventory || !this.persistentCharacters.has(id)) {
        return this.reject(client, "inventory_unavailable");
      }
      if (this.pendingItemUses.has(id)) return this.reject(client, "item_busy");
      if (this.simulatedMs - (this.lastWeaponEquipMs.get(id) ?? -Infinity) < 700) {
        return this.reject(client, "equipment_cooldown");
      }
      const change = gearOrder ? equipBody(inventory,gearOrder.position,gearOrder.slot,gearOrder.expected,player.pathId,player.level) : equipInventoryWeapon(inventory,order.slot,player.pathId,player.level);
      // Explicit guard works under both strict and non-strict Windows TS.
      if ("reason" in change) return this.reject(client, change.reason);
      const snapshot = this.captureCharacterSnapshot(id, change.inventory);
      if (!snapshot) return this.reject(client, "inventory_unavailable");

      // Save before activating the combat bonus or acknowledging equipment.
      // Weapon equip and potion use share one private mutation lock.
      const task = (async () => {
        try {
          await characterStore.save(snapshot);
          const current = this.state.players.get(id);
          if (!current || this.inventories.get(id) !== inventory) return;
          this.inventories.set(id, change.inventory);
          current.equippedWeaponId = change.weaponId ?? "";
          this.applyStats(id,current,this.statAllocations.get(id) ?? emptyAllocations());
          if (!body && current.pathId === "muay_boran" && !wearsWraps(change.weaponId)) {
            this.swordGuards.delete(id);
            this.clearMuayDefense(id,"cancelled");
            this.clearMuayCombo(id);
            this.sendSwordNotice(client,"muay_counter_cleared",{});
          }
          this.lastWeaponEquipMs.set(id, this.simulatedMs);
          client.send("inventory_state", change.inventory);
          if (!body) client.send("weapon_equipped", {
            slot: order.slot, weaponId: change.weaponId,
          });
        } catch (error) {
          console.error("MONTRA weapon equip write failed:", id, error);
          client.send("item_use_failed", { reason: "disk_write_failed" });
        } finally {
          this.pendingItemUses.delete(id);
        }
      })();
      this.pendingItemUses.set(id, task);
  }

  private recordCombat(ownerId: string, targetId: string): void {
    this.lastCombatMs.set(ownerId, this.simulatedMs);
    if (!this.getMonster(targetId)) {this.lastCombatMs.set(targetId,this.simulatedMs);this.lastPvpMs.set(ownerId,this.simulatedMs);this.lastPvpMs.set(targetId,this.simulatedMs);}
  }

  private healAmount(owner:string,target:string,base:number):number {
    const amount=Math.max(1,Math.round(base));
    const recent=Math.max(this.lastPvpMs.get(owner)??-Infinity,this.lastPvpMs.get(target)??-Infinity);
    if(this.field || this.simulatedMs-recent<PROGRESSION.combatQuietMs)return amount;
    return amount+gearHealing(this.inventories.get(owner),amount);
  }

  private applyStats(id:string, player: Player, allocations: Allocations): void {
    const base=calculateStats(player.level,allocations),bag=this.inventories.get(id);
    this.extraStaminaRegen.set(player,overflowStaminaRegen(base,bag));
    const stats=calculateModifiedStats(equippedStats(base,bag),this.effects.modifiers(id));
    player.maxHp = stats.maxHp; player.atk = stats.atk;
    player.def = stats.def;
    player.magicAtk = stats.magicAtk; player.magicDef = stats.magicDef;
    player.maxStamina = stats.maxStamina;
    const mana=gearMana(player.level,bag);
    player.maxMana=mana.max;this.extraRestManaRegen.set(player,mana.restRegen);
    player.mana = Math.min(player.mana, player.maxMana);
    player.hp = Math.min(player.hp, stats.maxHp);
    player.stamina = Math.min(player.stamina, stats.maxStamina);
    player.statPoints = pointsAvailable(player.level, allocations);
    player.xpToNext = player.level >= PROGRESSION.maxLevel ? 0 : xpForNextLevel(player.level);
  }

  private endPossession(id:string, reason:string):void {
    if(!this.buffs.end(id,this.simulatedMs))return;
    rememberPossessionCooldown(this.persistentCharacters.get(id));
    this.effects.remove(id,POSSESSION_MODIFIER.id,POSSESSION_MODIFIER.sourceId);
    const player=this.state.players.get(id);
    if(player){player.possessionActive=false;this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());}
    this.broadcast("possession_changed",{playerId:id,active:false,reason},{afterNextPatch:true});
  }

  private grantMonsterExperience(id: string, sharedAmount?: number, monsterLevel: number = PROGRESSION.monsterLevel, tier:MonsterTier = "normal", bossLoot = false, monsterId=""): void {
    const player = this.state.players.get(id);
    const priorReward=this.pendingRewards.get(id);
    if (!player || !this.persistentCharacters.has(id) || (this.pendingWarps.has(id) && !priorReward)) return;
    // Freeze the winner while the previous item mutation and EXP write finish;
    // onLeave/saveCharacter await this task before capturing the final snapshot.
    this.pendingWarps.add(id);
    const priorItem = this.pendingItemUses.get(id);
    let task: Promise<void>;
    task = Promise.resolve().then(async () => {
      try {
        if (priorReward) await priorReward.catch(() => {});
        if (priorItem) await priorItem.catch(() => {});
        const current = this.state.players.get(id), snapshot = this.captureCharacterSnapshot(id);
        if (!current || !snapshot) return;
        const amount = current.level >= PROGRESSION.maxLevel ? 0 : (sharedAmount ?? monsterExperience(current.level, monsterLevel, tier));
        const personalEligible=this.accountSessions.has(id) && current.alive && Boolean(current.pathId);
        if (amount <= 0 && tier !== "boss" && !bossLoot && !personalEligible) return;
        const next = addExperience(current.level, current.experience, amount);
        const dropsPotion = (tier === "elite" && amount > 0) || tier === "boss";
        const treasure=bossLoot?bossTreasure(monsterId):undefined;
        const fragment=treasure?.fragment;
        const fragmentBag=fragment && snapshot.inventory?grantStackReward(snapshot.inventory,fragment):null;
        const afterFragment=fragmentBag ?? snapshot.inventory;
        const prize=dropsPotion && afterFragment?grantRewardPotion(afterFragment):null;
        const previousLoot=prize ?? fragmentBag;
        const bag=previousLoot ?? snapshot.inventory;
        const card=personalEligible && bag ? monsterCardDrop(monsterId,monsterLevel) : null;
        const cardBag=card && bag ? grantStackReward(bag,card) : null;
        const afterCard=cardBag ?? bag;
        const accessory=treasure && personalEligible && afterCard?bossAccessoryReward(afterCard,monsterId,current.level):null;
        const beforeField=accessory?.bag ?? afterCard;
        const fieldDrop=beforeField && personalEligible
          ? practiceLoot(beforeField,current.pathId,monsterLevel,tier,current.level,monsterId) : undefined;
        const loot=fieldDrop?.bag ?? accessory?.bag ?? cardBag ?? previousLoot;
        await characterStore.save({ ...snapshot, ...next, inventory:loot ?? snapshot.inventory, updatedAt: new Date().toISOString() });
        if (loot) this.inventories.set(id,loot);
        const leveled=next.level!==current.level;
        current.level = next.level; current.experience = next.experience;
        this.applyStats(id,current, this.statAllocations.get(id) ?? emptyAllocations());
        try {
          const recipient = this.clients.find(client => client.sessionId === id);
          if(leveled && this.sentItemCatalog.has(id))recipient?.send("gear_guides",personalGearGuides(current.pathId,current.level));
          if (loot) recipient?.send("inventory_state",loot);
          recipient?.send("experience_gained", {amount,level:next.level,experience:next.experience,
            ...(fragment===SHRINE_SHARD ? {shrineShard:fragmentBag?"granted":"bag_full"} : {}),
            ...(fragment && fragment!==SHRINE_SHARD ? {bossFragment:fragment,fragmentGranted:Boolean(fragmentBag)} : {}),
            ...(accessory ? {bossAccessory:accessory.id,accessoryGranted:accessory.granted} : {}),
            ...(monsterId==="atlas_rift_warden" ? {riftVictory:true} : {}),
            ...(fieldDrop?.id!==undefined ? {personalDrop:fieldDrop.id ?? "bag_full",dropQuantity:fieldDrop.quantity??1,lootMisses:fieldDrop.bag.lootMisses??0} : {}),
            ...(card ? {cardDrop:card,cardReceived:Boolean(cardBag)} : {}),
            ...(dropsPotion ? {elitePotion:prize ? "granted" : "bag_full"} : {})});
        } catch { /* The committed reward remains available on reconnect. */ }
      } catch (error) {
        console.error("MONTRA EXP save failed:", id, error);
        this.clients.find(client => client.sessionId === id)?.send("character_save_error", { reason: "disk_write_failed" });
      } finally {
        if (this.pendingRewards.get(id)===task) { this.pendingWarps.delete(id); this.pendingRewards.delete(id); }
      }
    });
    this.pendingRewards.set(id, task);
  }

  private awardMonsterExperience(winnerId:string, monster:Monster = this.state.monster, tier:MonsterTier = "normal"): void {
    const winner=this.state.players.get(winnerId), party=this.parties.get(winnerId);
    const bossLoot=characterStore.economyEnabled && !!bossTreasure(monster.id) && (tier==="elite" || tier==="boss");
    if (!winner) return;
    if (!party) {
      this.grantMonsterExperience(winnerId, undefined, monster.level, tier,
        bossLoot && winner.alive && winner.mapId === monster.mapId && distance3d(winner,monster) <= PARTY_XP_RADIUS, monster.id);
      return;
    }
    const members:PartyRewardMember[]=[];
    for(const id of party.members){
      const player=this.state.players.get(id);
      if(player)members.push({sessionId:id,mapId:player.mapId,x:player.x,y:player.y,z:player.z,alive:player.alive,
        persistent:this.persistentCharacters.has(id),level:player.level,
        inTransit:this.pendingWarps.has(id) && !this.pendingRewards.has(id)});
    }
    const shares=partyMonsterShares(winner.level,{mapId:monster.mapId,level:monster.level,tier,x:monster.x,y:monster.y,z:monster.z},members,PARTY_XP_RADIUS,bossLoot || this.accountSessions.has(winnerId));
    for(const share of shares)this.grantMonsterExperience(share.sessionId,share.amount,monster.level,tier,bossLoot,monster.id);
  }

  private guildAction(client:Client, action:(character:string)=>void):void {
    const character=this.persistentCharacters.get(client.sessionId);
    if(!character || this.pendingCharacterLeaves.has(client.sessionId))return this.reject(client,"guild_unavailable");
    if(!this.gates.get(client.sessionId)?.guild.consume(this.simulatedMs))return this.reject(client,"guild_rate_limited");
    try { action(character); }
    catch(error){
      const reasons=["guild_already_member","guild_name_taken","guild_leader_only","guild_full",
        "guild_not_member","guild_transfer_first","guild_invalid_member","guild_invite_expired","guild_invalid_target",
        "guild_officer_required","guild_invalid_assignment","guild_squad_required","guild_squad_full","guild_squad_leader_exists"];
      const reason=error instanceof Error && reasons.includes(error.message)?error.message:"guild_error";
      if(reason==="guild_error")console.error("MONTRA guild action failed",error);
      client.send("guild_error",{reason});
    }
  }
  private sendGuild(client:Client,character:string):void {
    client.send("guild_state",guildStore().view(character,guildOnline));
  }

  private partyAction(client:Client, action:()=>void): void {
    if (!this.gates.get(client.sessionId)?.party.consume(this.simulatedMs)) return this.reject(client,"party_rate_limited");
    if (!this.persistentCharacters.has(client.sessionId) || this.pendingCharacterLeaves.has(client.sessionId)) return this.reject(client,"party_unavailable");
    try { action(); } catch(error) {
      const reasons=["party_invalid_target","party_leader_only","party_full","party_target_joined","party_invite_expired"];
      const reason=error instanceof Error && reasons.includes(error.message) ? error.message : "party_error";
      if (reason==="party_error") console.error("MONTRA party error",error);
      client.send("party_error",{reason});
    }
  }
  private sendPartyState(party:Party): void {
    const members=party.members.map(sessionId=>({sessionId,name:this.state.players.get(sessionId)?.characterName ?? "ผู้เล่น"}));
    for(const id of party.members) {
      const client=this.clients.find(c=>c.sessionId===id);
      try { client?.send("party_state",{partyId:party.id,leaderId:party.leader,members,xpRadius:PARTY_XP_RADIUS}); } catch { /* disconnected */ }
    }
  }
  private leaveParty(id:string):void {
    const result=this.parties.leave(id); if(!result) return;
    if(this.bladeCloaks.size)this.syncPlayerViews();
    const client=this.clients.find(c=>c.sessionId===id);
    try { client?.send("party_state",{partyId:null,leaderId:null,members:[]}); } catch { /* disconnected */ }
    if (result.current) this.sendPartyState(result.current);
  }
  private parsePartyInvitation(message:unknown):string|null {
    if (!message || typeof message!=="object" || Array.isArray(message)) return null;
    const value=message as Record<string,unknown>;
    return Object.keys(value).length===1 && typeof value.inviteId==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.inviteId) ? value.inviteId : null;
  }

  private economyId(client: Client): string | null {
    const id=client.sessionId, player=this.state.players.get(id), characterId=this.persistentCharacters.get(id);
    if (!characterStore.economyEnabled || !player || !player.alive || !characterId) { this.reject(client,"economy_unavailable"); return null; }
    if (this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id)) { this.reject(client,"character_busy"); return null; }
    return characterId;
  }
  private economyAction(client: Client, action: (id:string)=>void): void {
    if (!this.gates.get(client.sessionId)?.economy.consume(this.simulatedMs)) return this.reject(client,"economy_rate_limited");
    const id=this.economyId(client); if (!id) return;
    try { action(id); } catch (error) {
      const allowed=["invalid_amount","invalid_slot","item_unavailable","item_equipped","inventory_full","duplicate_weapon","listing_unavailable","listing_limit","cannot_buy_own_listing","insufficient_gold","invalid_trade","invalid_gold","invalid_request_id","request_id_conflict","forge_max_rank","forge_item_changed","craft_missing_shard","craft_missing_material","item_bound","socket_changed","card_unavailable","drill_missing_metal","item_level_required","card_gear_level"];
      const reason=error instanceof Error && (allowed.includes(error.message)||["resource_ground","resource_range","resource_cooldown","resource_empty"].includes(error.message)) ? error.message : "economy_failed";
      if (reason==="economy_failed") console.error("MONTRA economy failed",error);
      client.send("economy_error",{reason});
    }
  }
  private sendResourceMap(client:Client,view:ReturnType<typeof characterStore.economy.resourceMap>){
    this.resourceView.set(client,{mapId:view.mapId,stock:view.nodes.map(n=>n.stock)});
    if(view.nodes.length<=40){client.send("world_resources",view);return;}
    const {nodes,...region}=view;
    for(let i=0;i<nodes.length;i+=40)client.send("world_resource_page",{mapId:view.mapId,start:i,nodes:nodes.slice(i,i+40)});
    client.send("world_resources",{...region,nodeCount:nodes.length});
  }
  private sendResources(onlyMap?:string){
    if(!characterStore.economyEnabled || this.field)return;
    const maps=new Map<string,ReturnType<typeof characterStore.economy.resourceMap>>();
    for(const client of this.clients){
      const map=this.state.players.get(client.sessionId)?.mapId;
      if(!map || (onlyMap&&map!==onlyMap) || !this.sentItemCatalog.has(client.sessionId))continue;
      if(!maps.has(map))maps.set(map,characterStore.economy.resourceMap(map));
      const view=maps.get(map)!,previous=this.resourceView.get(client);
      if(previous?.mapId!==map || previous.stock.length!==view.nodes.length){this.sendResourceMap(client,view);continue;}
      const changed=view.nodes.filter((n,i)=>n.stock!==previous.stock[i]);
      if(!changed.length)continue;
      if(changed.length>40){this.sendResourceMap(client,view);continue;}
      client.send("world_resource_delta",{mapId:map,available:view.available,nodes:changed.map(({id,stock,nextIn})=>({id,stock,nextIn}))});
      this.resourceView.set(client,{mapId:map,stock:view.nodes.map(n=>n.stock)});
    }
  }
  private syncEconomy(client: Client, id: string): void {
    const account=characterStore.economy.getAccount(id), player=this.state.players.get(client.sessionId);
    if (!player) return;
    this.inventories.set(client.sessionId,account.inventory);
    player.equippedWeaponId=equippedWeaponId(account.inventory) ?? "";
    this.applyStats(client.sessionId,player,this.statAllocations.get(client.sessionId) ?? emptyAllocations());
    try { client.send("inventory_state",account.inventory); client.send("economy_state",{gold:account.gold}); } catch { /* disconnect does not roll back committed assets */ }
  }
  private tradeFor(client: Client, tradeId:string): TradeSession | null {
    const trade=this.trades.get(tradeId);
    if (!trade || (trade.a!==client.sessionId && trade.b!==client.sessionId)) { this.reject(client,"trade_unavailable"); return null; }
    if (this.simulatedMs >= trade.expires) { this.trades.delete(tradeId); this.reject(client,"trade_expired"); return null; }
    return trade;
  }
  private tradeSnapshot(id:string, offer:TradeOffer): string {
    const bag=this.inventories.get(id);
    if (!bag) throw new Error("invalid_trade");
    if (offer.slot===null) return "no_item";
    const stack=bag.slots[offer.slot];
    if (!stack || stack.quantity<offer.amount || bag.equippedWeaponSlot===offer.slot) throw new Error("item_unavailable");
    return JSON.stringify({stack, equipped:bag.equippedWeaponSlot});
  }
  private notifyTrade(trade:TradeSession, event:string): void {
    for (const id of [trade.a,trade.b]) {
      const client=this.clients.find(c=>c.sessionId===id); if (!client) continue;
      const other=id===trade.a?trade.b:trade.a;
      const describe=(who:string)=>trade.offers[who] ? {...trade.offers[who],item:trade.items[who]} : null;
      try { client.send(event,{tradeId:trade.id,otherId:other,otherName:this.state.players.get(other)?.characterName ?? "",own:describe(id),other:describe(other),ownConfirmed:trade.confirmed.has(id),otherConfirmed:trade.confirmed.has(other)}); } catch { /* disconnected */ }
    }
  }

  private async enterTerritory(client:Client,start:boolean,message:unknown){
    const id=client.sessionId,p=this.state.players.get(id),character=this.persistentCharacters.get(id);
    if(!p || !character || !WORLD_EXPANSION || this.field || !this.warClients.has(id) ||
       !this.gates.get(id)?.guild.consume(this.simulatedMs))return;
    let point=2;
    if(!parseEmptyCommand(message)){
      const request=message as {objectiveId?:number};
      const legacy=!start && p.mapId===CASTLE_ID && guildStore().war.inspect(CASTLE_ID,Date.now()).pilot?.throne===undefined;
      if(p.mapId!==CASTLE_ID || !request || Object.keys(request).length!==1 || !(legacy?[2,4,5]:musterNodes).includes(request.objectiveId!))return this.reject(client,"invalid_request");
      point=request.objectiveId!;
    }
    const fort=p.mapId===RIVER_CITY?riverNodes.A:warSites[p.mapId];
    if(!fort || !p.alive || p.flying || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) ||
       this.attackTargets.has(id) || [...this.attackTargets.values()].includes(id) ||
       this.simulatedMs-(this.lastCombatMs.get(id)??-Infinity)<WARP_COMBAT_LOCK_MS)
      return client.send("territory_error",{reason:"war_busy"});
    try{
      const war=guildStore().war,member=war.member(character);
      if(!member)throw Error("war_guild");
      if(start && planarDistance(p,fort)>5)throw Error("war_flag");
      const now=Date.now(),field=start?war.start(p.mapId,member,now):{site:p.mapId,seq:war.inspect(p.mapId,now).seq};
      const side=war.side(field,member,now);
      const roomId=await battleRoom(field);
      if(!this.clients.includes(client) || !p.alive || p.mapId!==field.site)return;
      const ticket=randomUUID();
      for(const [who,entry] of admissions)if(entry.expires<=Date.now())admissions.delete(who);
      const target=matchMaker.getLocalRoomById(roomId);
      if(!(target instanceof MyRoom))throw Error("war_unavailable");
      const occupied=[...target.warSeats.values()].filter(s=>s.side===side).length;
      const reserved=[...admissions].filter(([who,s])=>who!==character && s.roomId===roomId && s.side===side).length;
      if(occupied+reserved>=(field.site===CASTLE_ID?CASTLE_SEATS:WAR_SIDE_SIZE))throw Error("war_side_full");
      admissions.set(character,{roomId,ticket,side,point,guild:member.id,expires:Date.now()+30_000});
      client.send("territory_transfer",{roomId,ticket});
    }catch(error){
      const reason=error instanceof Error?error.message:"";
      if(!reason.startsWith("war_"))console.error("MONTRA territory entry",error);
      client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});
    }
  }
  private useCityGate(client:Client,message:unknown){
    if(!this.field)return;
    const castle=this.field.site===CASTLE_ID;
    const req=message as {gateId?:string;repair?:boolean}|null;
    const river=this.field.site===RIVER_CITY;
    if((castle || river)?(!req || typeof req.gateId!=="string" || (req.repair!==undefined && (!castle || req.repair!==true))):!parseEmptyCommand(message))return;
    const id=client.sessionId,p=this.state.players.get(id),seat=this.warSeats.get(id),character=this.persistentCharacters.get(id);
    if(!p?.alive || p.flying || !seat || !character || !onMapGround(p) || this.climbs.has(id) || this.pendingCharacterLeaves.has(id))return;
    const now=Date.now();
    if(now-(this.gateActions.get(id)??-Infinity)<1000)return;
    const war=guildStore().war,gates=WORLD_MAPS[this.field.site].strategic!.rampart!.gates;
    const gate=castle || river?gates.find(g=>g.id===req!.gateId):gates[0];
    if(!gate || war.member(character)?.id!==seat.guild)return;
    const b=gate.box,cx=b.x+b.width/2,cz=b.z+b.length/2;
    const inside=gate.side==="south"?p.z<cz:gate.side==="north"?p.z>cz:gate.side==="east"?p.x<cx:p.x>cx;
    if(!segmentIntersectsExpandedWall(p,p,b,2.5) || (seat.side==="defend" && !inside))
      return client.send("territory_error",{reason:"war_gate_near"});
    const occupied=[...this.state.players.values()].some(peer=>peer.alive && onMapGround(peer) && segmentIntersectsExpandedWall(peer,peer,b,.4));
    this.gateActions.set(id,now);
    try{
      if(castle){
        // Settle the elapsed interval using the previous door state before changing a supply route.
        this.nextWarSample=0;this.updateTerritory();
        const states=war.castleGate(this.field,gate.id,seat.side,occupied,now,req!.repair===true);
        this.closedFieldGates=new Set(Object.keys(states).filter(key=>states[key].closed));
      }else if(river){
        const states=war.riverGate(this.field,gate.id,seat.side,occupied,now);
        this.closedFieldGates=new Set(Object.keys(states).filter(key=>states[key].closed));
      }else{war.gate(this.field,seat.side,occupied,now,this.fieldCensus().relaySide);this.gateClosed=war.inspect(this.field.site,now).gateClosed;}
      this.nextWarSample=0;
    }catch(e){const reason=e instanceof Error?e.message:"";if(!reason.startsWith("war_"))console.error("MONTRA gate",e);client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});}
  }
  private fieldCensus(){
    let attack=0,defend=0;
    const field=this.field,relay=field && WORLD_MAPS[field.site].strategic?.relay;
    const relayHolders={attack:0,defend:0};
    const riverPresence=field?.site===RIVER_CITY?riverPosts.map(()=>({attack:0,defend:0})):undefined;
    const counts=field?.site===CASTLE_ID?castleObjectives.map(()=>({attack:0,defend:0})):undefined;
    const campCounts=counts?forwardCamps.map(()=>({attack:0,defend:0})):undefined;
    if(field){
      const war=guildStore().war;
      for(const [id,seat] of this.warSeats){
        const p=this.state.players.get(id),character=this.persistentCharacters.get(id);
        if(!p || !character || this.pendingCharacterLeaves.has(id))continue;
        if(war.member(character)?.id!==seat.guild){this.clients.find(c=>c.sessionId===id)?.leave(4000,"war_membership_changed");continue;}
        if(!p.alive || !onMapGround(p) || p.flying || p.mapId!==field.site || this.climbs.has(id) || this.pendingWarps.has(id))continue;
        if(riverPresence){
          const i=riverPosts.findIndex(post=>planarDistance(p,post)<=4);
          if(i>=0)riverPresence[i][seat.side]++;
        }
        if(counts){
          const i=castleObjectives.findIndex(node=>planarDistance(p,node)<=CAPTURE_RADIUS);
          if(i>=0)counts[i][seat.side]++;
          const camp=forwardCamps.find(c=>planarDistance(p,c)<=CAPTURE_RADIUS);
          if(camp)campCounts![camp.id-1][seat.side]++;
        }else if(planarDistance(p,warSites[field.site])<=5){if(seat.side==="attack")attack++;else defend++;}
        else if(relay && planarDistance(p,relay)<=relay.radius)relayHolders[seat.side]++;
      }
    }
    const contested=relayHolders.attack>0 && relayHolders.defend>0;
    const relaySide:WarSide|null=contested?null:relayHolders.attack?"attack":relayHolders.defend?"defend":null;
    return {attack,defend,counts,campCounts,relaySide,contested,riverPresence};
  }
  private canMarch(id:string){
    const p=this.state.players.get(id),base=this.playerSpawn.get(id);
    return Boolean(base && p?.alive && onMapGround(p) && !p.flying && planarDistance(p,base)<=5 &&
      !this.climbs.has(id) && !this.activeDashes.has(id) && !this.flightTransitions.has(id) && !this.pendingWarps.has(id) &&
      !this.pendingCharacterLeaves.has(id) && !this.attackTargets.has(id) && ![...this.attackTargets.values()].includes(id) &&
      this.simulatedMs-(this.lastCombatMs.get(id)??-Infinity)>=WARP_COMBAT_LOCK_MS);
  }
  private fieldCamp(id:string,campId:number){
    const field=this.field,seat=this.warSeats.get(id),character=this.persistentCharacters.get(id);
    if(!field || field.site!==CASTLE_ID || !seat || !character || this.pendingCharacterLeaves.has(id))return;
    const war=guildStore().war,now=Date.now(),s=war.inspect(field.site,now);
    if(s.seq!==field.seq || s.phase!=="battle" || !s.seconds || !s.pilot?.throne || war.member(character)?.id!==seat.guild)return;
    const camp=forwardCamps.find(c=>c.id===campId);
    if(!camp)return;
    const census=this.fieldCensus();
    const supply=castleLogistics(s.pilot,census.counts!,census.campCounts!,seat.side);
    if(!supply?.camps.some(c=>c.id===campId && c.status==="ready"))return;
    const slot=parseInt(character.slice(-2),16)%9;
    const dest={x:camp.x+slot%3-1,z:camp.z+Math.floor(slot/3)-1};
    return this.canOccupy(dest.x,dest.z,0,false,field.site)?dest:undefined;
  }
  private orderCamp(client:Client,message:unknown){
    const id=client.sessionId,field=this.field,seat=this.warSeats.get(id),character=this.persistentCharacters.get(id);
    if(!field || field.site!==CASTLE_ID || !seat || !character || !this.gates.get(id)?.guild.consume(this.simulatedMs))return;
    const req=message as {action?:unknown;campId?:unknown}|null;
    if(!req || Object.keys(req).length!==2 || (req.action!=="select" && req.action!=="march") || typeof req.campId!=="number" ||
      (req.campId!==0 && !forwardCamps.some(c=>c.id===req.campId)))return this.reject(client,"invalid_request");
    const campId=req.campId,war=guildStore().war;
    const error=(reason:string)=>client.send("territory_error",{reason});
    const s=war.inspect(field.site,Date.now());
    if(s.seq!==field.seq || s.phase!=="battle" || !s.seconds || !s.pilot?.throne || war.member(character)?.id!==seat.guild)return error("war_ended");
    const dest=campId?this.fieldCamp(id,campId):undefined;
    if(campId && !dest)return error("war_camp_cut");
    if(req.action==="select")seat.camp=war.campPreference(field,character,campId);
    else{
      if(!dest || campId!==seat.camp || !this.canMarch(id))return error("war_camp_base");
      const p=this.state.players.get(id)!;
      this.destinations.delete(id);this.crestTurns.delete(id);this.despawnSummon(id,"warp");
      this.moveOnSurface(p,dest.x,dest.z);p.targetId="";p.combatState="idle";
    }
    this.nextWarSample=0;
  }
  private updateTerritory(){
    const now=Date.now();
    const clock=this.field?.site===CASTLE_ID?now:this.simulatedMs;
    if(!WORLD_EXPANSION || (!this.warClients.size && !this.field) || clock<this.nextWarSample)return;
    this.nextWarSample=clock+1000;
    const war=guildStore().war;
    const {attack,defend,counts,campCounts,relaySide,contested,riverPresence}=this.fieldCensus();
    if(this.field){
      war.advance(this.field,now,attack,defend,counts,this.previousPilotSample,relaySide,riverPresence);
      if(counts)this.previousPilotSample=now;
    }
    const states=Object.fromEntries(Object.keys(warSites).map(site=>[site,war.inspect(site,now)]));
    if(this.field){
      const s=states[this.field.site];this.battleActive=s.seq===this.field.seq && s.phase==="battle";
      this.gateClosed=this.battleActive && !s.river && !s.pilot && s.gateClosed;
      const gates=s.river?.gates ?? s.pilot?.gates;
      if(gates)this.closedFieldGates=new Set(Object.entries(this.battleActive?gates:{}).filter(([,g])=>g.closed).map(([id])=>id));
    }
    const owners=Object.fromEntries(Object.entries(states).map(([site,s])=>[site,s.owner]));
    const teams=this.field?Object.fromEntries([...this.warSeats].map(([id,seat])=>[id,seat.side])):undefined;
    const pilot=this.field && states[this.field.site].pilot;
    const supplies=this.battleActive && counts && campCounts && pilot?.throne?{
      attack:castleLogistics(pilot,counts,campCounts,"attack"),defend:castleLogistics(pilot,counts,campCounts,"defend")
    }:undefined;
    for(const c of this.clients){
      if(!this.warClients.has(c.sessionId))continue;
      const p=this.state.players.get(c.sessionId);if(!p)continue;
      const s=states[p.mapId],character=this.persistentCharacters.get(c.sessionId),member=s&&character?war.member(character):null;
      const inField=Boolean(this.field),ownBattle=!inField || this.field?.seq===s?.seq;
      const seat=this.warSeats.get(c.sessionId);
      const supply=seat && member?.id===seat.guild && supplies?.[seat.side];
      const view=ownBattle?s?.pilot:undefined;
      const visiblePilot=view?.throne && s.phase==="battle"?{...view,points:view.points.map(point=>
        point.id>=4 && (!inField || !p.alive || planarDistance(p,castleObjectives[point.id-1])>18)?{...point,progress:0}:point)}:view;
      const local=s?{site:p.mapId,phase:ownBattle?s.phase:"finished",owner:s.owner,attackName:s.attackName,defendName:s.defendName,
        progress:Math.trunc(s.progress),goal:WAR_HOLD,seconds:s.seconds,attack,defend,inField,side:this.warSeats.get(c.sessionId)?.side,
        pilot:visiblePilot,river:inField && ownBattle && s.river?{...s.river,supplied:seat && riverSupplied(s.river,seat.side)}:undefined,
        supply:supply?{...supply,selected:seat!.camp,atBase:this.canMarch(c.sessionId)}:undefined,
        relay:inField && ownBattle && this.battleActive && WORLD_MAPS[p.mapId].strategic?.relay?{side:relaySide,contested}:undefined,
        government:!inField && member && member.id===s.ownerId?war.government.view(p.mapId,member,now):undefined,
        gateHp:s.gateHp,gateClosed:inField && this.gateClosed,
        canStart:!inField && s.phase==="open" && member?.officer===true && member.id!==s.ownerId,
        canJoin:!inField && s.phase==="battle" && !!member && (member.id===s.attacker || member.id===s.defender || (!s.owner && !s.defendName && member.officer))}:null;
      const payload={owners,local,teams},signature=JSON.stringify(payload);
      if(signature!==this.warSent.get(c.sessionId)){c.send("territory_state",payload);this.warSent.set(c.sessionId,signature);}
    }
  }
  messages = {
    territory_govern:(client:Client,message:unknown)=>{
      const id=client.sessionId,p=this.state.players.get(id),character=this.persistentCharacters.get(id);
      if(!this.gates.get(id)?.guild.consume(this.simulatedMs))return this.reject(client,"guild_rate_limited");
      const order=parseGovernmentOrder(message);
      if(!order)return this.reject(client,"invalid_request");
      if(!WORLD_EXPANSION || !this.warClients.has(id) || this.field || !character || !p || !p.alive || p.flying ||
         !onMapGround(p) || this.climbs.has(id) || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) ||
         !Object.hasOwn(warSites,p.mapId) || order.site!==p.mapId)
        return client.send("territory_error",{reason:"war_government_location"});
      try{
        const delta=guildStore().war.govern(character,order,Date.now());
        client.send("territory_governed",{action:order.action,delta});
        notifyGuilds();
      }catch(error){
        const reason=error instanceof Error?error.message:"";
        if(!reason.startsWith("war_"))console.error("MONTRA government",error);
        client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});
      }
      this.warSent.delete(id);this.nextWarSample=0;
    },
    territory_gate:(client:Client,message:unknown)=>this.useCityGate(client,message),
    territory_camp:(client:Client,message:unknown)=>this.orderCamp(client,message),
    get_territories:(client:Client,message:unknown)=>{
      if(parseEmptyCommand(message) && this.warClients.has(client.sessionId) && this.gates.get(client.sessionId)?.guild.consume(this.simulatedMs))this.warSent.delete(client.sessionId);
    },
    territory_start:(client:Client,message:unknown)=>{void this.enterTerritory(client,true,message);},
    territory_join:(client:Client,message:unknown)=>{void this.enterTerritory(client,false,message);},
    get_guild: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>this.sendGuild(client,character));
    },
    guild_create: (client:Client,message:unknown) => {
      const name=parseGuildName(message);if(!name)return this.reject(client,"guild_invalid_name");
      this.guildAction(client,character=>{
        const player=this.state.players.get(client.sessionId);if(!player)throw new Error("guild_invalid_target");
        guildStore().create(character,player.characterName,name);notifyGuilds();
      });
    },
    guild_invite: (client:Client,message:unknown) => {
      const request=parseTradeRequest(message);if(!request)return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{
        const guild=guildStore().view(character,guildOnline),target=this.clients.find(c=>c.sessionId===request.targetId);
        const targetCharacter=this.persistentCharacters.get(request.targetId);
        const actor=guild?.members.find(m=>m.id===guild.ownId);
        if(!guild || !actor || (actor.rank!=="commander" && actor.rank!=="officer"))throw new Error("guild_officer_required");
        if(guild.members.length>=GUILD_MAX_MEMBERS)throw new Error("guild_full");
        if(!target || !targetCharacter || request.targetId===client.sessionId || this.pendingCharacterLeaves.has(request.targetId))throw new Error("guild_invalid_target");
        if(guildStore().view(targetCharacter,guildOnline))throw new Error("guild_already_member");
        for(const [id,invite] of this.guildInvites)if(invite.expires<=this.simulatedMs || invite.to===request.targetId)this.guildInvites.delete(id);
        const id=randomUUID();
        this.guildInvites.set(id,{from:client.sessionId,to:request.targetId,guildId:guild.id,expires:this.simulatedMs+60000});
        target.send("guild_invitation",{inviteId:id,guildName:guild.name,fromName:this.state.players.get(client.sessionId)?.characterName ?? "",expiresIn:60});
        client.send("guild_notice",{reason:"invitation_sent"});
      });
    },
    guild_accept: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message);if(!inviteId)return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{
        const invite=this.guildInvites.get(inviteId),leader=invite && this.persistentCharacters.get(invite.from);
        if(!invite || invite.to!==client.sessionId || invite.expires<=this.simulatedMs || !leader || this.pendingCharacterLeaves.has(invite.from)){
          if(invite && invite.expires<=this.simulatedMs)this.guildInvites.delete(inviteId);
          throw new Error("guild_invite_expired");
        }
        const player=this.state.players.get(client.sessionId);if(!player)throw new Error("guild_invalid_target");
        const inviter=guildStore().view(leader,guildOnline);
        const inviterRank=inviter?.members.find(m=>m.id===inviter.ownId)?.rank;
        if(inviter?.id!==invite.guildId || (inviterRank!=="commander" && inviterRank!=="officer"))throw new Error("guild_invite_expired");
        guildStore().add(leader,character,player.characterName);
        this.guildInvites.delete(inviteId);client.send("guild_invitation_closed",{});notifyGuilds();
      });
    },
    guild_decline: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message);if(!inviteId)return this.reject(client,"guild_invalid_request");
      this.guildAction(client,()=>{
        const invite=this.guildInvites.get(inviteId);
        if(!invite || invite.to!==client.sessionId || invite.expires<=this.simulatedMs)throw new Error("guild_invite_expired");
        this.guildInvites.delete(inviteId);client.send("guild_invitation_closed",{});
        this.clients.find(c=>c.sessionId===invite.from)?.send("guild_notice",{reason:"invitation_declined"});
      });
    },
    guild_leave: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{guildStore().leave(character);notifyGuilds();});
    },
    guild_assign: (client:Client,message:unknown) => {
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"guild_invalid_request");
      const value=message as Record<string,unknown>;
      if(Object.keys(value).length!==3 || typeof value.memberId!=="string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.memberId) ||
        (value.kind!=="rank" && value.kind!=="squad" && value.kind!=="specialty"))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{
        guildStore().assign(character,value.memberId as string,value.kind as "rank"|"squad"|"specialty",value.value);
        notifyGuilds();
      });
    },
    guild_manage: (client:Client,message:unknown) => {
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"guild_invalid_request");
      const value=message as Record<string,unknown>;
      if(Object.keys(value).length!==2 || typeof value.memberId!=="string" ||
         !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.memberId) ||
         (value.action!=="kick" && value.action!=="transfer"))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{guildStore().manage(character,value.memberId as string,value.action as "kick"|"transfer");notifyGuilds();});
    },
    get_party: (client:Client,message:unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{const party=this.parties.get(client.sessionId);if(party)this.sendPartyState(party);else client.send("party_state",{partyId:null,leaderId:null,members:[]});});
    },
    party_invite: (client:Client,message:unknown) => {
      const request=parseTradeRequest(message); if(!request) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{
        const target=this.clients.find(c=>c.sessionId===request.targetId), player=this.state.players.get(client.sessionId);
        if(!target || !player || !this.persistentCharacters.has(request.targetId) || this.pendingCharacterLeaves.has(request.targetId)) throw new Error("party_invalid_target");
        if(this.field && this.warSeats.get(client.sessionId)?.side!==this.warSeats.get(request.targetId)?.side)throw Error("party_invalid_target");
        const invite=this.parties.invite(client.sessionId,request.targetId,this.simulatedMs);
        target.send("party_invitation",{inviteId:invite.id,fromId:client.sessionId,fromName:player.characterName,expiresIn:60});
        client.send("party_notice",{reason:"invitation_sent"});
      });
    },
    party_accept: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message); if(!inviteId) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{
        const invite=this.parties.invitation(client.sessionId,inviteId,this.simulatedMs);
        if(!this.state.players.has(invite.from) || !this.persistentCharacters.has(invite.from) || this.pendingCharacterLeaves.has(invite.from)) throw new Error("party_invite_expired");
        const party=this.parties.accept(client.sessionId,inviteId,this.simulatedMs);
        if(this.bladeCloaks.size)this.syncPlayerViews();
        this.sendPartyState(party);
      });
    },
    party_decline: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message); if(!inviteId) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{const invite=this.parties.decline(client.sessionId,inviteId,this.simulatedMs);this.clients.find(c=>c.sessionId===invite.from)?.send("party_notice",{reason:"invitation_declined"});client.send("party_invitation_closed",{});});
    },
    party_leave: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message)) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>this.leaveParty(client.sessionId));
    },
    get_economy: (client:Client, message:unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>this.syncEconomy(client,id));
    },
    market_list: (client:Client, message:unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>client.send("market_state",{listings:characterStore.economy.list(id).map(x=>({id:x.id,seller:x.seller.slice(0,12),item:x.item,price:x.price}))}));
    },
    market_create: (client:Client, message:unknown) => {
      const order=parseMarketCreate(message); if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const result=characterStore.economy.listItem(id,order.requestId,order.slot,order.amount,order.price); this.syncEconomy(client,id); client.send("market_result",{action:"create",...result,requestId:order.requestId});});
    },
    market_buy: (client:Client, message:unknown) => {
      const order=parseMarketAction(message); if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const result=characterStore.economy.buy(id,order.requestId,order.listingId); this.syncEconomy(client,id); client.send("market_result",{action:"buy",...result,requestId:order.requestId});});
    },
    market_cancel: (client:Client, message:unknown) => {
      const order=parseMarketAction(message); if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const result=characterStore.economy.cancel(id,order.requestId,order.listingId); this.syncEconomy(client,id); client.send("market_result",{action:"cancel",...result,requestId:order.requestId});});
    },
    trade_request: (client:Client, message:unknown) => {
      const order=parseTradeRequest(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{
        const id=client.sessionId, target=this.clients.find(c=>c.sessionId===order.targetId), a=this.state.players.get(id), b=this.state.players.get(order.targetId);
        for (const [key,trade] of this.trades) if (this.simulatedMs>=trade.expires) this.trades.delete(key);
        if (!target || !a || !b || id===order.targetId || !this.economyId(target) || this.bladeHiddenFrom(id,order.targetId) || this.bladeHiddenFrom(order.targetId,id) || a.mapId!==b.mapId || distance3d(a,b)>5 || [...this.trades.values()].some(t=>[t.a,t.b].includes(id)||[t.a,t.b].includes(order.targetId))) throw new Error("invalid_trade");
        const trade:TradeSession={id:randomUUID(),a:id,b:order.targetId,expires:this.simulatedMs+60_000,offers:{},items:{},fingerprints:{},confirmed:new Set()};
        this.trades.set(trade.id,trade); this.notifyTrade(trade,"trade_update");
      });
    },
    trade_offer: (client:Client, message:unknown) => {
      const order=parseTradeOffer(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,id=>{
        const trade=this.tradeFor(client,order.tradeId); if (!trade) return;
        const offer:TradeOffer={slot:order.slot,amount:order.amount,gold:order.gold};
        if (characterStore.economy.getAccount(id).gold<offer.gold) throw new Error("insufficient_gold");
        trade.fingerprints[client.sessionId]=this.tradeSnapshot(client.sessionId,offer);
        const stack=offer.slot===null ? null : this.inventories.get(client.sessionId)?.slots[offer.slot];
        trade.items[client.sessionId]=stack ? {...stack,quantity:offer.amount} : null;
        trade.offers[client.sessionId]=offer; trade.confirmed.clear(); this.notifyTrade(trade,"trade_update");
      });
    },
    trade_confirm: (client:Client, message:unknown) => {
      const order=parseTradeId(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{
        const trade=this.tradeFor(client,order.tradeId); if (!trade) return;
        const aClient=this.clients.find(c=>c.sessionId===trade.a), bClient=this.clients.find(c=>c.sessionId===trade.b);
        const a=this.state.players.get(trade.a), b=this.state.players.get(trade.b);
        if (!aClient || !bClient || !a || !b || !trade.offers[trade.a] || !trade.offers[trade.b] || a.mapId!==b.mapId || distance3d(a,b)>5) throw new Error("invalid_trade");
        const aId=this.economyId(aClient), bId=this.economyId(bClient);
        if (!aId || !bId) throw new Error("invalid_trade");
        if ([trade.a,trade.b].some(id=>this.tradeSnapshot(id,trade.offers[id])!==trade.fingerprints[id])) { trade.confirmed.clear(); throw new Error("invalid_trade"); }
        trade.confirmed.add(client.sessionId);
        if (trade.confirmed.size<2) { this.notifyTrade(trade,"trade_update"); return; }
        characterStore.economy.trade(aId,bId,trade.id,trade.offers[trade.a],trade.offers[trade.b]);
        this.trades.delete(trade.id); this.syncEconomy(aClient,aId); this.syncEconomy(bClient,bId); this.notifyTrade(trade,"trade_complete");
      });
    },
    trade_cancel: (client:Client, message:unknown) => {
      const order=parseTradeId(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{const trade=this.tradeFor(client,order.tradeId); if (trade) { this.trades.delete(trade.id); this.notifyTrade(trade,"trade_cancelled"); }});
    },
    chat: (client: Client, message: unknown) => {
      const command=parseChatMessage(message);
      if(!command) return this.reject(client,"invalid_chat");
      const id=client.sessionId, player=this.state.players.get(id);
      if(!player || this.pendingWarps.has(id)) return this.reject(client,"chat_unavailable");
      if(!this.gates.get(id)?.chat.consume(this.simulatedMs)) return this.reject(client,"chat_rate_limited");
      if(command.channel==="bug") {
        if(!this.gates.get(id)?.bugReport.consume(this.simulatedMs)) return this.reject(client,"chat_bug_rate_limited");
        const entry={name:player.characterName,mapId:player.mapId,x:player.x,y:player.y,z:player.z,text:command.text};
        void saveBugReport(characterStore.directory,entry).then(reportId=>client.send("chat_report_result",{ok:true,reportId}))
          .catch(error=>{console.error("MONTRA bug report save failed",error);try {client.send("chat_report_result",{ok:false});} catch { /* disconnected */ }});
        return;
      }
      const party=command.channel==="party" ? this.parties.get(id) : null;
      if(command.channel==="party" && !party) return this.reject(client,"chat_party_unavailable");
      let target:Client | undefined;
      if(command.channel==="private") {
        target=this.clients.find(peer=>peer.sessionId===command.targetId);
        if(!target || target.sessionId===id || !this.state.players.has(target.sessionId) || this.pendingWarps.has(target.sessionId)) return this.reject(client,"chat_target_unavailable");
      }
      const event={senderId:id,name:player.characterName,mapId:player.mapId,channel:command.channel,text:command.text,
        ...(target ? {targetId:target.sessionId,targetName:this.state.players.get(target.sessionId)!.characterName} : {})};
      for(const peer of this.clients) {
        const recipient=this.state.players.get(peer.sessionId);
        if(!recipient || this.pendingWarps.has(peer.sessionId)) continue;
        const deliver=command.channel==="world" || (command.channel==="map" && recipient.mapId===player.mapId) ||
          (command.channel==="party" && party!.members.includes(peer.sessionId)) ||
          (command.channel==="private" && (peer.sessionId===id || peer.sessionId===target!.sessionId));
        if(deliver) peer.send("chat_message",event);
      }
    },
    craft_weapon: (client: Client, message: unknown) => {
      const order = parseCraft(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const result = order.recipeId===SHRINE_GLAIVE ? characterStore.economy.craftShrineGlaive(id,order.requestId) : characterStore.economy.craftPersonal(id,order.requestId,order.recipeId,this.state.players.get(client.sessionId)!.level);
        this.syncEconomy(client, id);
        client.send("craft_result", {requestId: order.requestId, ...result});
      });
    },
    get_resource_atlas: (client:Client,message:unknown)=>{
      if(!parseEmptyCommand(message) || this.field)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,()=>client.send("resource_atlas",characterStore.economy.resourceAtlas()));
    },
    harvest_resource: (client:Client,message:unknown)=>{
      const m=message as {node?:unknown;requestId?:unknown};
      if(!m || Object.keys(m).length!==2 || typeof m.node!=="string" || typeof m.requestId!=="string" || this.field)return this.reject(client,"invalid_economy_request");
      const node=getResourceNode(m.node),request=m.requestId;
      if(!node)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{
        const player=this.state.players.get(client.sessionId)!;
        harvestableFrom(player,node);
        const result=characterStore.economy.harvest(id,request,node,Date.now(),player.level);
        this.syncEconomy(client,id);client.send("resource_result",{...result,action:"harvest"});this.sendResources(node.mapId);
      });
    },
    refine_resource: (client:Client,message:unknown)=>{
      const m=message as {expected?:unknown;requestId?:unknown};
      if(!m || Object.keys(m).length!==2 || typeof m.expected!=="string" || typeof m.requestId!=="string")return this.reject(client,"invalid_economy_request");
      const raw=m.expected,request=m.requestId;
      this.economyAction(client,id=>{
        const result=characterStore.economy.refine(id,request,raw,this.state.players.get(client.sessionId)!.level);
        this.syncEconomy(client,id);client.send("resource_result",{...result,action:"refine"});
      });
    },
    sell_material: (client:Client,message:unknown)=>{
      const order=parseSellMaterial(message);
      if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{
        const result=characterStore.economy.sellMaterial(id,order.requestId,order.slot,order.expected,order.quantity);
        this.syncEconomy(client,id);client.send("material_sold",result);
      });
    },
    card_socket: (client:Client,message:unknown) => {
      const order=parseSocketOrder(message);
      if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{
        const result=characterStore.economy.socketItem(id,order);
        this.syncEconomy(client,id);
        client.send("card_socket_result",{requestId:order.requestId,...result});
      });
    },
    forge_weapon: (client: Client, message: unknown) => {
      const order = parseForge(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const result = characterStore.economy.forgeWeapon(id,order.requestId,order.slot,order.stamp,order.action,this.state.players.get(client.sessionId)!.level);
        this.syncEconomy(client, id);
        client.send("forge_result", { requestId: order.requestId, action: order.action, ...result });
      });
    },
    select_build: (client: Client, message: unknown) => {
      const build = parseBuild(message);
      if (!build) return this.reject(client, "invalid_build");
      this.selectBuild(client, build);
    },
    sword_tree_learn: (client: Client, message: unknown) => this.changeSwordTree(client, message, "learn"),
    sword_tree_upgrade: (client: Client, message: unknown) => this.changeSwordTree(client, message, "upgrade"),
    sword_tree_school: (client: Client, message: unknown) => this.changeSwordTree(client, message, "school"),
    sword_tree_reset: (client: Client, message: unknown) => this.changeSwordTree(client, message, "reset"),
    sword_tree_equip: (client: Client, message: unknown) => this.changeSwordTree(client, message, "equip"),
    sword_core_book: (client: Client, message: unknown) => this.changeSwordCore(client, message),
    sword_core_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castSwordCore(client, message);},
    // Keep the legacy protocol for older clients while the current HUD uses four core skills.
    sword_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castSwordSkill(client, message);},
    muay_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castMuaySkill(client, message);},
    muay_core_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castMuayCore(client, message);},
    grapple_escape: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.escapeMuayGrapple(client, message);},
    grapple_counter: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.counterMuayGrapple(client, message);},
    muay_book: (client: Client, message: unknown) => this.changeMuayBook(client, message),
    occult_book_get: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"invalid_occult_book");
      const player=this.state.players.get(client.sessionId);
      if (!player || !isOccultPath(player.pathId)) return this.reject(client,"occult_class_required");
      if (!this.gates.get(client.sessionId)?.occult.consume(this.simulatedMs)) return this.reject(client,"occult_rate_limited");
      this.sendOccultBook(client);
    },
    occult_book: (client: Client, message: unknown) => this.changeOccultBook(client,message),
    occult_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castOccultSkill(client,message);},
    blade_book_get: (client: Client, message: unknown) => {
      if(!parseEmptyCommand(message)) return this.reject(client,"invalid_blade_book");
      const player=this.buildPlayer(client,"occult");
      if(!player) return;
      if(player.pathId!=="blade") return this.reject(client,"blade_class_required");
      this.sendBladeBook(client);
    },
    blade_book: (client: Client, message: unknown) => this.changeBladeBook(client,message),
    blade_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castBladeSkill(client,message);},
    sentinel_book_get: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_sentinel_book");
      const player=this.buildPlayer(client,"occult");if(!player)return;
      if(player.pathId!=="sentinel")return this.reject(client,"sentinel_class_required");
      this.sendSentinelBook(client);
    },
    sentinel_book: (client:Client,message:unknown) => this.changeSentinelBook(client,message),
    sentinel_skill: (client:Client,message:unknown) => {if(!this.blockMounted(client))this.castSentinelSkill(client,message);},
    sentinel_core_skill: (client:Client,message:unknown) => {if(!this.blockMounted(client))this.castSentinelCore(client,message);},
    cast_class_skill: (client: Client, message: unknown) => {
      if(this.blockMounted(client))return;
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_build");
      if (!this.legacyCombatRoom()) return this.reject(client,"use_learned_skill");
      this.castClassSkill(client);
    },
    allocate_stat: (client: Client, _message: unknown) => this.reject(client, "automatic_stats"),
    warp: (client: Client, message: unknown) => {
      if(this.bladeWindups.has(client.sessionId) || this.bladeCasts.has(client.sessionId)) return this.reject(client,"blade_windup_active");
      if(this.bladeCloaks.has(client.sessionId)) return this.reject(client,"blade_cloak_action");
      if(this.field)return client.send("territory_error",{reason:"war_exit"});
      const id = client.sessionId;
      if(this.sentinelStuns.has(id))return this.reject(client,"sentinel_stunned");
      if(this.sentinelWindups.has(id))return this.reject(client,"sentinel_windup_active");
      if(this.muayControlled(id))return this.reject(client,"muay_controlled");
      const player = this.state.players.get(id);
      if (!player || !this.persistentCharacters.has(id)) return this.reject(client, "character_not_persistent");
      if (this.pendingItemUses.has(id) || this.pendingWarps.has(id)) return this.reject(client, "character_busy");
      const engaged = this.attackTargets.has(id) || this.state.monster.targetId === id || this.forest.engaged(id) ||
        [...this.attackTargets.values()].includes(id);
      const result = checkWarp(message, {
        mapId: player.mapId, position: player, alive: player.alive,
        flying: player.flying, climbing: this.climbs.has(id),
        dashing: this.activeDashes.has(id), changingHeight: this.flightTransitions.has(id),
        lastCombatMs: engaged ? this.simulatedMs : (this.lastCombatMs.get(id) ?? -Infinity),
        lastWarpMs: this.lastWarpMs.get(id) ?? -Infinity, nowMs: this.simulatedMs,
      });
      if ("reason" in result) return this.reject(client, result.reason);
      const snapshot = this.captureCharacterSnapshot(id);
      if (!snapshot) return this.reject(client, "character_not_persistent");
      const portal = result.portal;
      if(getWorldMap(portal.targetMapId)?.reliefLabels && !isAtlasMap(portal.targetMapId) && !this.originalReliefClients.has(id))return this.reject(client,"world_client_update_required");
      if(isAtlasMap(portal.targetMapId) && getWorldMap(portal.targetMapId)?.terrain && !this.reliefClients.has(id))return this.reject(client,"world_client_update_required");
      if(portal.targetMapId===RIDGE_PASS && !this.terrainClients.has(id))return this.reject(client,"world_client_update_required");
      if(portal.targetMapId===RIVER_CITY && !this.riverClients.has(id))return this.reject(client,"world_client_update_required");
      if(portal.targetMapId===CASTLE_ID && !this.castleClients.has(id))return this.reject(client,"world_client_update_required");
      if(getWorldMap(portal.targetMapId)?.strategic && !this.provinceClients.has(id))return this.reject(client,"world_client_update_required");
      if(isAtlasMap(portal.targetMapId) && !this.atlasClients.has(id))return this.reject(client,"world_client_update_required");
      if(portal.targetMapId===TEMPLE_ID && !this.templeClients.has(id))return this.reject(client,"world_client_update_required");
      const destination = { ...snapshot, mapId: portal.targetMapId, ...portal.targetSpawn,
        updatedAt: new Date().toISOString() };
      // Freeze the actor during disk I/O. All other save paths wait for this
      // shared item/character mutation lock before taking their snapshots.
      this.pendingWarps.add(id);
      const task = (async () => {
        try {
          try {
            await characterStore.save(destination);
          } catch (error) {
            console.error("MONTRA warp save failed:", id, error);
            try { client.send("warp_failed", { reason: "disk_write_failed" }); } catch { /* disconnected */ }
            return;
          }
          const current = this.state.players.get(id);
          if (!current) return;
          this.dismount(id,"warp");
          // Once the durable write succeeds, commit the destination before
          // any optional notifications so a disconnected client cannot turn
          // a committed warp into a misleading disk-failure result.
          current.mapId = portal.targetMapId;
          current.x = portal.targetSpawn.x; current.y = portal.targetSpawn.y; current.z = portal.targetSpawn.z;
          current.targetId = ""; current.combatState = "idle"; current.flying = false;
          if(this.swordCoreStances.delete(id))this.sendSwordNotice(client,"sword_stance_end",{});
          if(this.sentinelCoreStances.delete(id))this.sendSwordNotice(client,"sentinel_core_end",{});
          this.swordCoreSequences.delete(id);
          if(current.pathId==="muay_boran"){this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");this.sendSwordNotice(client,"muay_counter_cleared",{});}
          this.clearMuayCombo(id);
          this.clearMuayCombosForTarget(id);
          this.clearGrappleCountersFor(id,"warp");
          this.destinations.delete(id);
          this.attackTargets.delete(id);
          for (const [otherId, targetId] of this.attackTargets) {
            if (targetId === id) {
              const other = this.state.players.get(otherId);
              if (other) this.endAttack(otherId, other);
            }
          }
          if (this.state.monster.targetId === id) this.state.monster.targetId = "";
          this.forest.clearTarget(id);
          this.despawnSummon(id, "warp");
          this.playerSpawn.set(id, getSafeMapSpawn(portal.targetMapId));
          this.lastWarpMs.set(id, this.simulatedMs);
          try { client.send("warp_complete", { mapId: current.mapId }); } catch { /* disconnected */ }
        } finally {
          this.pendingWarps.delete(id);
          this.pendingItemUses.delete(id);
        }
      })();
      this.pendingItemUses.set(id, task);
    },
    equip_weapon: (client:Client,message:unknown)=>this.equipItem(client,message,false),
    equip_gear: (client:Client,message:unknown)=>this.equipItem(client,message,true),

    get_character_status: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_status_request");
      const id=client.sessionId, player=this.state.players.get(id);
      if (!player) return;
      const last=this.lastStatusReadMs.get(id) ?? -Infinity;
      if (this.simulatedMs-last<1_000) return;
      this.lastStatusReadMs.set(id,this.simulatedMs);
      const inventory=this.inventories.get(id);
      client.send("character_status",{
        level:player.level, weaponId:equippedWeaponId(inventory) ?? "",
        base:calculateStats(player.level,this.statAllocations.get(id) ?? emptyAllocations()),
        weapon:{pve:weaponBonuses(inventory,"pve"),pvp:weaponBonuses(inventory,"pvp")},forgeRatings:equipmentRatings(inventory),overflowRegen:this.extraStaminaRegen.get(player)??0,
        effects:this.effects.active(id,this.simulatedMs)
      });
    },
    get_inventory: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_inventory_request");
      const id = client.sessionId;
      const inventory = this.inventories.get(id);
      if (!inventory) return this.reject(client, "inventory_unavailable");
      const last = this.lastInventoryReadMs.get(id) ?? -Infinity;
      if (this.simulatedMs - last < 1_000) return;
      this.lastInventoryReadMs.set(id, this.simulatedMs);
      if(!this.sentItemCatalog.has(id)){
        for(const items of CATALOG_PAGES)client.send("item_catalog_page",{items});
        const player=this.state.players.get(id);
        if(player)client.send("gear_guides",personalGearGuides(player.pathId,player.level));
        this.sentItemCatalog.add(id);
      }
      if(characterStore.economyEnabled && !this.field && this.state.players.has(id))this.sendResourceMap(client,characterStore.economy.resourceMap(this.state.players.get(id)!.mapId));
      client.send("inventory_state",{...inventory,catalogReady:true,workbenchGold:WORKBENCH_GOLD,cardDrill:DRILL_COST,refineInput:REFINE_INPUT});
    },
    use_item: (client: Client, message: unknown) => {
      if(this.sentinelStuns.has(client.sessionId))return this.reject(client,"sentinel_stunned");
      if(this.sentinelWindups.has(client.sessionId))return this.reject(client,"sentinel_windup_active");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const slot = parseUseItemCommand(message);
      if (slot === null) return this.reject(client, "invalid_item_use");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      const inventory = this.inventories.get(id);
      if (!inventory || !this.persistentCharacters.has(id)) {
        return this.reject(client, "inventory_unavailable");
      }
      if (this.pendingItemUses.has(id)) return this.reject(client, "item_busy");
      if (this.simulatedMs < (this.itemUseReadyAt.get(id) ?? -Infinity)) return this.reject(client, "item_cooldown");
      const result = useInventoryItem(
        inventory, slot, player.hp, player.maxHp, player.alive,player.level,player.mana,player.maxMana);
      // The Windows VPS build uses different TS strictness from CI.
      // An explicit property guard narrows ItemUseResult in both modes.
      if ("reason" in result) return this.reject(client, result.reason);
      const snapshot = this.captureCharacterSnapshot(id, result.inventory, result.hp);
      if (!snapshot) return this.reject(client, "inventory_unavailable");

      // Durability-first transaction: the server writes the decremented stack
      // atomically BEFORE updating HP or acknowledging the potion. If disk is
      // full, neither HP nor potion count changes for the player.
      if(result.restoredMana)snapshot.mana=player.mana+result.restoredMana;
      const task = (async () => {
        try {
          await characterStore.save(snapshot);
          const current = this.state.players.get(id);
          if (!current || this.inventories.get(id) !== inventory) return;
          this.inventories.set(id, result.inventory);
          const beforeHp = current.hp;
          const beforeMana=current.mana;
          if (current.alive) {
            // Apply the heal on top of any damage that occurred DURING I/O.
            // Never resurrect a player killed while a save was pending.
            current.hp = Math.min(current.maxHp, current.hp + result.healed);
            current.mana=Math.min(current.maxMana,current.mana+result.restoredMana);
          }
          this.itemUseReadyAt.set(id,this.simulatedMs+(personalItem(result.itemId)?.kind==="consumable"?14_000:POTION_COOLDOWN_MS));
          client.send("inventory_state", result.inventory);
          client.send("item_used", {
            slot, itemId: result.itemId,
            healed: Math.max(0, current.hp - beforeHp),
            restoredMana:Math.max(0,current.mana-beforeMana),
            hp: current.hp,
          });
        } catch (error) {
          console.error("MONTRA item use persistence failed:", id, error);
          client.send("item_use_failed", { reason: "disk_write_failed" });
        } finally {
          this.pendingItemUses.delete(id);
        }
      })();
      this.pendingItemUses.set(id, task);
    },
    toggle_mount: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_mount");
      const id=client.sessionId, player=this.state.players.get(id);
      if(!player?.alive || !this.persistentCharacters.has(id))return this.reject(client,"mount_unavailable");
      if(player.mounted){this.dismount(id,"manual");return;}
      if(this.simulatedMs-(this.lastMountMs.get(id) ?? -Infinity)<1000)return this.reject(client,"mount_cooldown");
      if(this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
        this.climbs.has(id) || this.flightTransitions.has(id) || player.flying || !onMapGround(player) || this.activeDashes.has(id) ||
        this.sentinelStuns.has(id) || this.sentinelWindups.has(id) || this.sentinelAnchors.has(id) || this.muayControlled(id) ||
        this.bladeCloaks.has(id) || this.bladeWindups.has(id) || this.bladeCasts.has(id))return this.reject(client,"mount_unavailable");
      const engaged=this.attackTargets.has(id) || [...this.attackTargets.values()].includes(id) || this.state.monster.targetId===id || this.forest.engaged(id);
      if(engaged || this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)return this.reject(client,"mount_in_combat");
      this.despawnSummon(id,"mounted");
      this.destinations.delete(id);this.crestTurns.delete(id);player.targetId="";player.combatState="idle";
      player.mounted=true;this.mountHitSequence.set(id,player.hitSeq);this.lastMountMs.set(id,this.simulatedMs);
      this.broadcast("mount_changed",{playerId:id,mounted:true},{afterNextPatch:true});
    },
    fly: (client: Client, message: unknown) => {
      if(this.blockMounted(client))return;
      if(this.bladeWindups.has(client.sessionId) || this.bladeCasts.has(client.sessionId)) return this.reject(client,"blade_windup_active");
      if(this.bladeCloaks.has(client.sessionId)) return this.reject(client,"blade_cloak_action");
      if(this.sentinelStuns.has(client.sessionId))return this.reject(client,"sentinel_stunned");
      if(this.sentinelWindups.has(client.sessionId))return this.reject(client,"sentinel_windup_active");
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_flight");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      // Saved characters from earlier releases can always land safely.
      const legacyFlightTest=process.env.MONTRA_ACCOUNTS_REQUIRED==="0" && process.env.NODE_ENV!=="production";
      if (!legacyFlightTest && !player.flying && !isOccultPath(player.pathId)) return this.reject(client, "flight_class_required");
      if (this.climbs.has(id)) return this.reject(client, "climbing");
      if (this.activeDashes.has(id)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(id)) return this.reject(client, "flight_in_progress");
      const flightMap=getWorldMap(player.mapId);
      if (!player.flying && (flightMap?.region?.noFlight || flightMap?.strategic?.kind==="territory")) return this.reject(client, "flight_forbidden");
      if (!this.gates.get(id)?.flight.consume(this.simulatedMs)) {
        return this.reject(client, "flight_rate_limited");
      }
      const landing = player.flying;
      // Do NOT allow a landing into the wall's solid body or off map.
      const landingY = landing ? (player.mapId === DEFAULT_MAP_ID
        ? flightLandingHeight(player.x, player.z) : 0) : null;
      if (landing && (landingY === null ||
          !this.canOccupy(player.x, player.z, landingY, false, player.mapId))) {
        return this.reject(client, "landing_blocked");
      }
      if (!landing && !onMapGround(player) && !(isOnPlatform(surfaceLayer(player)) && (flightMap?.strategic?.rampart || player.mapId===DEFAULT_MAP_ID))) {
        return this.reject(client, "flight_unavailable");
      }
      const targetY = landing ? landingY! : FLIGHT.altitude;
      this.attackTargets.delete(id);
      this.destinations.delete(id);
      player.targetId = "";
      player.combatState = landing ? "descending" : "ascending";
      // Flying stays true during descent so its state is never persisted as
      // a partial/in-between height; only completion returns ground/wall mode.
      player.flying = true;
      this.flightTransitions.set(id, { targetY, landing });
      this.broadcast("flight_started", {
        playerId: id, direction: landing ? "down" : "up", targetY:targetY+groundAt(player.mapId,player.x,player.z),
      }, { afterNextPatch: true });
    },
    dash: (client: Client, message: unknown) => {
      if(this.blockMounted(client))return;
      if(this.bladeWindups.has(client.sessionId) || this.bladeCasts.has(client.sessionId)) return this.reject(client,"blade_windup_active");
      if(this.bladeCloaks.has(client.sessionId)) return this.reject(client,"blade_cloak_action");
      if(this.sentinelStuns.has(client.sessionId))return this.reject(client,"sentinel_stunned");
      if(this.sentinelWindups.has(client.sessionId))return this.reject(client,"sentinel_windup_active");
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const direction = parseDashCommand(message);
      if (!direction) return this.reject(client, "invalid_dash");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(id)) return this.reject(client, "climbing");
      if (player.flying || this.flightTransitions.has(id)) return this.reject(client, "flying");
      if (this.activeDashes.has(id)) return this.reject(client, "dash_in_progress");
      if (this.simulatedMs - (this.lastDashMs.get(id) ?? -Infinity) < RULES.dashCooldownMs) {
        return this.reject(client, "dash_cooldown");
      }
      if (!this.gates.get(id)?.dash.consume(this.simulatedMs)) {
        return this.reject(client, "dash_rate_limited");
      }
      if (player.stamina < PROGRESSION.dashCost) return this.reject(client, "insufficient_stamina");
      player.stamina -= PROGRESSION.dashCost;

      // Dash replaces an attack approach or tap-to-move order; the client
      // cannot set the start point, height, distance, elapsed time or speed.
      this.attackTargets.delete(id);
      this.destinations.delete(id);
      player.targetId = "";
      player.facing = facingTo(direction.dx, direction.dz);
      player.combatState = "dashing";
      this.activeDashes.set(id, { ...direction, remaining: RULES.dashDistance });
      this.lastDashMs.set(id, this.simulatedMs);
      this.broadcast("dash_started", { playerId: id }, { afterNextPatch: true });
    },
    get_character_slots: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_slot_request");
      const id = client.sessionId;
      const ids = this.guestSlotIds.get(id);
      if (!ids) return this.reject(client, "character_not_persistent");
      const previous = this.lastSlotListMs.get(id) ?? -Infinity;
      if (this.simulatedMs - previous < 2_000) return;
      this.lastSlotListMs.set(id, this.simulatedMs);
      void characterStore.listSlots(ids).then(slots => {
        if (this.guestSlotIds.get(id) === ids) client.send("character_slots", { slots });
      }).catch(error => console.error("MONTRA slot list failed", error));
    },
    rename_character: (client: Client, message: unknown) => {
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const name = parseCharacterName(message);
      if (!name) return this.reject(client, "invalid_character_name");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !this.persistentCharacters.has(id)) return this.reject(client, "character_not_persistent");
      if (this.simulatedMs - (this.lastRenameMs.get(id) ?? -Infinity) < 5_000) {
        return this.reject(client, "rename_cooldown");
      }
      if (player.characterName === name) return;
      this.lastRenameMs.set(id, this.simulatedMs);
      player.characterName = name;
      const party=this.parties.get(id); if(party) this.sendPartyState(party);
      const guildCharacter=this.persistentCharacters.get(id);
      if(guildCharacter){try{if(guildStore().rename(guildCharacter,name))notifyGuilds();}catch(error){console.error("MONTRA guild rename failed",error);}}
      void this.saveCharacter(id);
    },
    move: (client: Client, message: unknown) => {
      const id=client.sessionId;
      if(this.sentinelStuns.has(id))return this.reject(client,"sentinel_stunned");
      if(this.bladeWindups.has(id) || this.bladeCasts.has(id) || this.sentinelWindups.has(id)){
        // A ground tap releases the monster lock without allowing movement during the cast.
        const actor=this.state.players.get(id),targetId=this.attackTargets.get(id);
        if(actor && targetId && this.getMonster(targetId) && parseMoveCommand(message,getWorldMap(actor.mapId)?.bounds)){
          this.attackTargets.delete(id);actor.targetId="";
        }
        return this.reject(client,this.sentinelWindups.has(id)?"sentinel_windup_active":"blade_windup_active");
      }
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const destination = parseMoveCommand(message, getWorldMap(this.state.players.get(client.sessionId)?.mapId ?? DEFAULT_MAP_ID)?.bounds);
      if (!destination) return this.reject(client, "invalid_move");
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(client.sessionId)) return this.reject(client, "climbing");
      if (this.activeDashes.has(client.sessionId)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(client.sessionId)) return this.reject(client, "flight_in_progress");
      if (!player.flying && isOnPlatform(surfaceLayer(player)) && !this.canOccupy(destination.x,destination.z,surfaceLayer(player),false,player.mapId)) {
        return this.reject(client, "must_descend");
      }
      if (!this.gates.get(client.sessionId)?.move.consume(this.simulatedMs)) {
        return this.reject(client, "move_rate_limited");
      }

      const rampart=getWorldMap(player.mapId)?.strategic?.rampart;
      if(rampart && isOnPlatform(surfaceLayer(player)) && wallRing(rampart,player.x,player.z)!==wallRing(rampart,destination.x,destination.z))return this.reject(client,"must_descend");
      const dx=destination.x-player.x,dz=destination.z-player.z,length=Math.hypot(dx,dz);
      if(length>0.05)this.muayMoveIntent.set(client.sessionId,{x:dx/length,z:dz/length});
      // A manual tap cancels auto-approach AND auto-attack (even if walking).
      this.attackTargets.delete(client.sessionId);
      player.targetId = "";
      player.combatState = "moving";
      if(rampart && isOnPlatform(surfaceLayer(player)))this.crestTurns.set(client.sessionId,crestCorners(rampart,player,destination));
      else this.crestTurns.delete(client.sessionId);
      this.destinations.set(client.sessionId, destination);
    },

    attack: (client: Client, message: unknown) => {
      if(this.blockMounted(client))return;
      const monsterOrder = parseAttackCommand(message);
      if(!monsterOrder && (this.bladeWindups.has(client.sessionId) || this.bladeCasts.has(client.sessionId))) return this.reject(client,"blade_windup_active");
      if(this.sentinelStuns.has(client.sessionId))return this.reject(client,"sentinel_stunned");
      if(!monsterOrder && this.sentinelWindups.has(client.sessionId))return this.reject(client,"sentinel_windup_active");
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const pkOrder = monsterOrder ? null : parsePkTargetCommand(message);
      if (!monsterOrder && !pkOrder) return this.reject(client, "invalid_attack");

      const attackerId = client.sessionId;
      const attacker = this.state.players.get(attackerId);
      if (!attacker || !attacker.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(attackerId)) return this.reject(client, "climbing");
      if (this.activeDashes.has(attackerId)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(attackerId)) return this.reject(client, "flight_in_progress");
      if (!this.gates.get(attackerId)?.attack.consume(this.simulatedMs)) {
        return this.reject(client, "attack_rate_limited");
      }

      // Only the server-issued session ID of ANOTHER live player in the
      // same room is eligible for PK. No duel agreement is required.
      const targetId = monsterOrder ? monsterOrder.targetId : pkOrder!.targetId;
      if (targetId === attackerId) return this.reject(client, "self_attack");
      const monster=monsterOrder ? this.getMonster(targetId) : undefined;
      const target=monsterOrder ? monster : this.state.players.get(targetId);
      if (!this.canPursueBasic(attackerId,attacker,targetId,monster)) return this.reject(client,"target_unavailable");

      if (!target || !target.alive) {
        return this.reject(client, monsterOrder ? "monster_down" : "target_unavailable");
      }

      // Tap to attack: cancel manual travel, then follow the target each tick.
      this.destinations.delete(attackerId);
      this.attackTargets.set(attackerId, targetId);
      this.lastCombatMs.set(attackerId, this.simulatedMs);
      attacker.targetId = targetId;

      const attackRange = isOccultPath(attacker.pathId) ? FORT.rangedRange : monsterOrder ? RULES.playerAttackRange : RULES.pkAttackRange;
      // Wall/vertical separation cannot be solved by a ground-only chase.
      if (!isOccultPath(attacker.pathId) && meleeHeightBlocked(attacker,target,attackRange)) {
        this.attackTargets.delete(attackerId);
        attacker.targetId = "";
        return this.reject(client, "melee_height_blocked");
      }
      // During a wind-up only change the next basic target, never the skill already in flight.
      if (this.basicAttackPaused(attackerId)) return;
      if (isRestArea(attacker.mapId,attacker) || distance3d(attacker, target) > attackRange) {
        attacker.combatState = "approaching";
        client.send("combat_notice", { reason: "approaching" });
      } else {
        attacker.combatState = "attacking";
      }
    },

    summon: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.summonSpirit(client, message, "guardian");},
    pot_summon: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.summonSpirit(client, message, "pot_spirit");},

    possess: (client:Client,message:unknown) => {
      if(this.blockMounted(client))return;
      const id=client.sessionId;
      if(this.sentinelStuns.has(id))return this.reject(client,"sentinel_stunned");
      if(this.sentinelWindups.has(id))return this.reject(client,"sentinel_windup_active");
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_possession");
      if(this.pendingWarps.has(id))return this.reject(client,"character_busy");
      const player=this.state.players.get(id);
      if(!player || !player.alive)return this.reject(client,"not_alive");
      if(!isOccultPath(player.pathId))return this.reject(client,"occult_class_required");
      if(!this.gates.get(id)?.possession.consume(this.simulatedMs))return this.reject(client,"possession_rate_limited");
      if(player.possessionActive){this.endPossession(id,"cancelled");return;}
      if(!this.legacyCombatRoom() && !this.canPrepareSpirit(id,player.pathId,true))return this.reject(client,"occult_skill_locked");
      if(POSSESSION_BUFF.requiresSummon && !this.state.summons.has(id))return this.reject(client,"possession_needs_summon");
      if(possessionCoolingDown(this.persistentCharacters.get(id)))return this.reject(client,"possession_cooldown");
      if(player.mana<15)return this.reject(client,"insufficient_mana");
      const result=this.buffs.activate(id,this.simulatedMs);
      if(result!=="ok")return this.reject(client,result==="cooldown" ? "possession_cooldown" : "possession_active");
      player.mana-=15;
      this.effects.grant(id,POSSESSION_MODIFIER,this.simulatedMs+POSSESSION_BUFF.durationMs);
      this.despawnSummon(id,"possessed");
      player.possessionActive=true;this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      this.broadcast("possession_changed",{playerId:id,active:true,durationMs:POSSESSION_BUFF.durationMs},{afterNextPatch:true});
    },

    unsummon: (client: Client, message: unknown) => {
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const id = client.sessionId;
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_unsummon");
      if (!this.state.summons.has(id)) return this.reject(client, "no_summon");
      if (!this.gates.get(id)?.summon.consume(this.simulatedMs)) {
        return this.reject(client, "summon_rate_limited");
      }
      this.despawnSummon(id, "dismissed");
    },

    // The client never writes Y. A validated ladder is the only route
    // between ground y=0 and the watchwall top y=4.
    climb: (client: Client, message: unknown) => {
      if(this.blockMounted(client))return;
      if(this.bladeWindups.has(client.sessionId) || this.bladeCasts.has(client.sessionId)) return this.reject(client,"blade_windup_active");
      if(this.bladeCloaks.has(client.sessionId)) return this.reject(client,"blade_cloak_action");
      if(this.sentinelStuns.has(client.sessionId))return this.reject(client,"sentinel_stunned");
      if(this.sentinelWindups.has(client.sessionId))return this.reject(client,"sentinel_windup_active");
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const villageOrder=parseClimbRequest(message);
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      const rampart=getWorldMap(player.mapId)?.strategic?.rampart;
      const msg=message as Record<string,unknown>|null;
      const stair=msg && typeof msg==="object" && Object.keys(msg).length===2 && (msg.direction==="up" || msg.direction==="down")
        ? rampart?.stairs.find(s=>s.id===msg.structureId):undefined;
      if(player.mapId!==DEFAULT_MAP_ID && !stair)return this.reject(client,"no_ladder_in_map");
      if(!stair && !villageOrder)return this.reject(client,"invalid_climb");
      const direction=stair?msg!.direction:villageOrder!.direction;
      if (this.climbs.has(id)) return this.reject(client, "already_climbing");
      if (this.activeDashes.has(id)) return this.reject(client, "dashing");
      if (player.flying || this.flightTransitions.has(id)) return this.reject(client, "flying");
      if (!this.gates.get(id)?.climb.consume(this.simulatedMs)) {
        return this.reject(client, "climb_rate_limited");
      }

      const upward = direction === "up";
      if (upward && !onMapGround(player)) return this.reject(client, "not_on_ground");
      if (!upward && !isOnPlatform(surfaceLayer(player))) return this.reject(client, "not_on_wall");

      const foot=stair?.foot ?? {x:FORT.ladderFootX,z:FORT.ladderFootZ},top=stair?.top ?? {x:FORT.ladderTopX,z:FORT.ladderTopZ};
      const ladderPosition=upward?foot:top;
      const maxReach = upward ? FORT.climbTriggerRadius : FORT.descendTriggerRadius;
      if (planarDistance(player, ladderPosition) > maxReach) {
        return this.reject(client, "ladder_too_far");
      }

      this.attackTargets.delete(id);
      this.destinations.delete(id);
      player.targetId = "";
      player.combatState = "climbing";
      this.climbs.set(id, upward
        ? {...top,y:FORT.height}
        : {...foot,y:0});
      this.broadcast("climb_started", { playerId:id, direction },
        { afterNextPatch:true });
    },

    shoot: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castBlessedRice(client, message);},
    blessed_rice: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.castBlessedRice(client, message);},
    apply_talisman: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.applyTalisman(client, message);},
  };

  private spellCaster(client: Client) {
    const id = client.sessionId;
    if(this.sentinelStuns.has(id))return this.reject(client,"sentinel_stunned");
    if(this.sentinelWindups.has(id))return this.reject(client,"sentinel_windup_active");
    if(this.bladeWindups.has(id) || this.bladeCasts.has(id))return this.reject(client,"blade_windup_active");
    if(this.muayControlled(id))return this.reject(client,"muay_controlled");
    const player = this.state.players.get(id);
    if (this.pendingWarps.has(id)) return this.reject(client, "character_busy");
    if (!player?.alive) return this.reject(client, "not_alive");
    if (this.climbs.has(id)) return this.reject(client, "climbing");
    if (this.activeDashes.has(id)) return this.reject(client, "dashing");
    if (this.flightTransitions.has(id)) return this.reject(client, "flight_in_progress");
    if (!this.gates.get(id)?.attack.consume(this.simulatedMs)) return this.reject(client, "attack_rate_limited");
    return player;
  }

  private hitMonsterWithSpell(id: string, target: Monster, damage: number, source: "ranged" | "talisman" | "sword" | "muay") {
    target.hp = Math.max(0, target.hp - damage);
    target.hitSeq++;
    this.broadcast("combat_hit", {attackerId:id, targetId:target.id, damage, hp:target.hp,
      maxHp:target.maxHp, hitSeq:target.hitSeq, source}, {afterNextPatch:true});
    if (target.hp === 0) this.killMonster(id, target.id);
  }

  private applyTalisman(client: Client, message: unknown) {
    const order = parseAttackCommand(message);
    if (!order) return this.reject(client, "invalid_talisman_target");
    const id = client.sessionId, caster = this.spellCaster(client);
    if (!caster) return;
    if (!isOccultPath(caster.pathId)) return this.reject(client, "occult_class_required");
    if (!this.legacyCombatRoom()) return this.reject(client,"occult_skill_locked");
    const target = this.getMonster(order.targetId);
    if (!target?.alive || !this.sameCombatMap(id, target.id)) return this.reject(client, "target_unavailable");
    if (distance3d(caster, target) > TALISMAN.range) return this.reject(client, "talisman_out_of_range");
    if (!this.bodyPathClear(caster.mapId, caster, target)) return this.reject(client, "talisman_blocked");
    const now = Date.now();
    if (now < caster.talismanReadyAt) return this.reject(client, "talisman_cooldown");

    caster.talismanReadyAt = now + TALISMAN.cooldownMs;
    caster.facing = facingTo(target.x - caster.x, target.z - caster.z);
    this.recordCombat(id, target.id);
    const magic = caster.magicAtk + weaponBonuses(this.inventories.get(id), "pve").ranged;
    const damage = calculateDamage(magic * TALISMAN.magicMultiplier, target.defense, target.level);
    this.hitMonsterWithSpell(id, target, damage, "talisman");
    this.recordOccultTraining(id,"seer",["talisman"]);
  }

  private castBlessedRice(client: Client, message: unknown) {
    const monsterOrder = parseAttackCommand(message);
    const pkOrder = monsterOrder ? null : parsePkTargetCommand(message);
    if (!monsterOrder && !pkOrder) return this.reject(client, "invalid_shoot");
    const id = client.sessionId, shooter = this.spellCaster(client);
    if (!shooter) return;
    if (!isOccultPath(shooter.pathId)) return this.reject(client, "occult_class_required");
    if (!this.legacyCombatRoom()) return this.reject(client,"occult_skill_locked");
    const targetId = monsterOrder ? monsterOrder.targetId : pkOrder!.targetId;
    if (targetId === id) return this.reject(client, "self_attack");
    if (!this.sameCombatMap(id, targetId)) return this.reject(client, "target_unavailable");
    const target = monsterOrder
      ? this.getMonster(targetId)
      : this.state.players.get(targetId);
    if (!target || !target.alive) return this.reject(client, "target_unavailable");

    const from = { x:shooter.x, y:shooter.y+FORT.shootOriginHeight, z:shooter.z };
    const to = { x:target.x, y:target.y + FORT.targetBodyHeight, z:target.z };
    const map=getWorldMap(shooter.mapId),downhill=map?.terrain?(onMapGround(shooter) || isOnPlatform(surfaceLayer(shooter))) && onMapGround(target) && shooter.y-target.y>=2:map?.strategic?.rampart && isOnPlatform(shooter.y) && onMapGround(target);
    if (distance3d(from,to) > FORT.rangedRange+(downhill?3:0)) {
      return this.reject(client, "shot_out_of_range");
    }
    if (!map || !provinceShotClear(map,from,to,this.closedGatesFor(shooter.mapId))) {
      return this.reject(client, "shot_blocked");
    }

    const last = this.lastAttackMs.get(id) ?? -Infinity;
    if (this.simulatedMs-last < FORT.rangedCooldownMs) {
      return this.reject(client, "shot_cooldown");
    }
    this.lastAttackMs.set(id,this.simulatedMs);
    this.recordCombat(id, targetId);
    shooter.facing = facingTo(target.x-shooter.x, target.z-shooter.z);
    const rangedAttack = shooter.magicAtk + weaponBonuses(this.inventories.get(id), monsterOrder ? "pve" : "pvp").ranged;
    let rangedDamage = monsterOrder ? calculateDamage(rangedAttack*(shooter.pathId==="mender"?MENDER_PVE_RICE_MULTIPLIER:1), (target as Monster).defense, (target as Monster).level) :
      calculateDamage(rangedAttack, (target as Player).magicDef, (target as Player).level);

    if (monsterOrder) {
      this.hitMonsterWithSpell(id, target as Monster, rangedDamage, "ranged");
      this.recordOccultTraining(id,"seer",["rice"]);
    } else {
      const victim=target as Player;
      rangedDamage=this.swordGuardDamage(targetId,shooter,rangedDamage);
      victim.hp=Math.max(0,victim.hp-rangedDamage);
      victim.hitSeq+=1;
      this.broadcast("pvp_hit", {
        attackerId:id,targetId,damage:rangedDamage,
        hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"ranged",
      }, { afterNextPatch:true });
      if (victim.hp===0) {
        shooter.pkKills+=1;
        victim.pkDeaths+=1;
        this.knockoutPlayer(targetId,"pk",id);
        void this.saveCharacter(id);
        this.broadcast("pvp_kill", {
          winnerId:id,loserId:targetId,source:"ranged",
          kills:shooter.pkKills,deaths:victim.pkDeaths,
        }, { afterNextPatch:true });
      }
    }

    this.broadcast("ranged_hit", {
      attackerId:id,targetId,damage:rangedDamage,from,to,skill:"blessed_rice",
    }, { afterNextPatch:true });
  }

  private legacyCombatRoom():boolean {
    return process.env.MONTRA_ACCOUNTS_REQUIRED==="0" && process.env.NODE_ENV!=="production";
  }
  private canPrepareSpirit(id:string, path:OccultPath, tranceOnly:boolean):boolean {
    const book=this.occultBooks.get(id);
    return Boolean(book?.loadouts[path].some(skill=>skill && book.learned[path].includes(skill) &&
      (tranceOnly ? OCCULT_LESSONS[skill].effect==="trance" :
      ["spirit","spirit_bind","spirit_heal","spirit_ward","trance"].includes(OCCULT_LESSONS[skill].effect))));
  }
  private summonSpirit(client: Client, message: unknown, kind: "guardian" | "pot_spirit") {
    if(this.sentinelStuns.has(client.sessionId))return this.reject(client,"sentinel_stunned");
    if(this.sentinelWindups.has(client.sessionId))return this.reject(client,"sentinel_windup_active");
    if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
    const id = client.sessionId;
    if (!parseEmptyCommand(message)) return this.reject(client, "invalid_summon");
    const owner = this.state.players.get(id);
    if (!owner || !owner.alive) return this.reject(client, "not_alive");
    if (!isOccultPath(owner.pathId)) return this.reject(client, "occult_class_required");
    if (!this.legacyCombatRoom() && (kind!=="pot_spirit" || !this.canPrepareSpirit(id,owner.pathId,false))) return this.reject(client,"occult_skill_locked");
    if (owner.possessionActive) return this.reject(client, "possession_active");
    if (this.state.summons.has(id)) return this.reject(client, "summon_limit");
    if (!this.gates.get(id)?.summon.consume(this.simulatedMs)) {
      return this.reject(client, "summon_rate_limited");
    }
    const last = this.lastSummonAt.get(id) ?? -Infinity;
    if (this.simulatedMs - last < RULES.summonCooldownMs) {
      return this.reject(client, "summon_cooldown");
    }
    if (owner.mana < 15) return this.reject(client, "insufficient_mana");
    owner.mana -= 15;
    this.lastSummonAt.set(id, this.simulatedMs);

    const map = getWorldMap(owner.mapId)!;
    const besideOwner = {x:clampToMap(owner.x - 1.1, map.bounds, "x"), y:owner.y, z:clampToMap(owner.z + 0.9, map.bounds, "z")};
    if(map.terrain)besideOwner.y+=groundAt(map.id,besideOwner.x,besideOwner.z)-groundAt(map.id,owner.x,owner.z);
    const blocked = kind === "pot_spirit" && (!isSafeWorldPoint(map, besideOwner) || !this.bodyPathClear(map.id, owner, besideOwner));
    const spawn = blocked ? owner : besideOwner;
    const guardian = new SummonedGuardian({
      ownerId: id, kind, x:spawn.x, y:spawn.y, z:spawn.z,
      facing: owner.facing, action: "follow", targetId: "",
    });
    this.state.summons.set(id, guardian);
    this.lastSummonAttackAt.delete(id);
    this.broadcast("summon_spawn", { ownerId: id, kind },
      { afterNextPatch: true });
  }

  private despawnSummon(ownerId: string, reason: string) {
    this.occultSpiritOrders.delete(ownerId);
    this.occultSpiritPracticed.delete(ownerId);
    if (!this.state.summons.has(ownerId)) return;
    this.state.summons.delete(ownerId);
    this.lastSummonAttackAt.delete(ownerId);
    this.broadcast("summon_despawn", { ownerId, reason },
      { afterNextPatch: true });
  }

  private findSummonTarget(ownerId: string, owner: Player, guardian: SummonedGuardian) {
    const intended = this.attackTargets.get(ownerId);
    const candidates: string[] = [];
    const spiritOrder=this.occultSpiritOrders.get(ownerId);
    if (spiritOrder && spiritOrder.until>this.simulatedMs) candidates.push(spiritOrder.targetId);
    if (intended) candidates.push(intended);

    // A guardian defends its owner when another player is actively attacking.
    // It does not randomly attack neutral people in this Free PK world.
    for (const [otherId, targetId] of this.attackTargets) {
      if (otherId !== ownerId && targetId === ownerId) candidates.push(otherId);
    }
    if (this.state.monster.targetId === ownerId) candidates.push(RULES.monsterId);
    for (const m of this.state.monsters.values()) if (m.targetId === ownerId) candidates.push(m.id);

    const fromPot = guardian.kind === "pot_spirit";
    const reachable = (target: WorldPoint) => this.bodyPathClear(owner.mapId, owner, target) && this.bodyPathClear(owner.mapId, guardian, target);
    for (const targetId of candidates) {
      if (targetId === ownerId) continue;
      if (!this.sameCombatMap(ownerId, targetId)) continue;
      const target = this.getMonster(targetId) ?? this.state.players.get(targetId);
      if (!target || !target.alive) continue;
      // Guard's combat tether prevents hits across the map even if another
      // client sends a valid but distant target ID.
      if (distance3d(owner, target) > RULES.summonEngageDistance) continue;
      if(getWorldMap(owner.mapId)?.walls?.length && !this.combatSegmentClear(owner.mapId,owner,target))continue;
      if (fromPot && !reachable(target)) continue;
      return { targetId, target };
    }
    if (!fromPot || isRestArea(owner.mapId, owner)) return null;

    // With no combat order the pot spirit hunts the nearest reachable monster.
    let nearest: Monster | undefined;
    let bestDistance: number = RULES.summonEngageDistance;
    const consider = (monster: Monster) => {
      if (!monster.alive || !this.sameCombatMap(ownerId, monster.id)) return;
      const distance = distance3d(owner, monster);
      if (distance > bestDistance || !reachable(monster)) return;
      nearest = monster;
      bestDistance = distance;
    };
    consider(this.state.monster);
    this.state.monsters.forEach(consider);
    return nearest ? { targetId: nearest.id, target: nearest } : null;
  }

  private closedGatesFor(mapId:string){
    return (mapId===CASTLE_ID || mapId===RIVER_CITY)?this.closedFieldGates:this.gateClosed;
  }
  private combatSegmentClear(mapId:string,from:WorldPoint,to:WorldPoint){
    return isWorldSegmentClear(mapId,from,to,this.closedGatesFor(mapId));
  }
  private bodyPathClear(mapId: string, from: WorldPoint, target: WorldPoint) {
    return provinceShotClear(WORLD_MAPS[mapId],{x:from.x,y:from.y+1,z:from.z},{x:target.x,y:target.y+1,z:target.z},this.closedGatesFor(mapId));
  }

  private updateSummons(dt: number) {
    for (const [ownerId, guardian] of [...this.state.summons]) {
      const owner = this.state.players.get(ownerId);
      if (!owner || !owner.alive) {
        this.despawnSummon(ownerId, "owner_unavailable");
        continue;
      }

      const distanceToOwner = distance3d(guardian, owner);
      const candidate = distanceToOwner <= RULES.summonLeashDistance
        ? this.findSummonTarget(ownerId, owner, guardian) : null;

      if (candidate) {
        const { targetId, target } = candidate;
        const dx = target.x - guardian.x;
        const dz = target.z - guardian.z;
        const distance = distance3d(guardian,target);
        guardian.targetId = targetId;
        if (distance > 0.001) guardian.facing = facingTo(dx, dz);

        if (distance <= RULES.summonAttackRange) {
          guardian.action = "attack";
          this.trySummonAttack(ownerId, guardian, targetId);
        } else {
          guardian.action = "chase";
          const next = step3d(
            guardian, target, RULES.summonMoveSpeed * dt
          );
          guardian.x = clampToMap(next.point.x, getWorldMap(owner.mapId)!.bounds, "x");
          guardian.y = Math.max(next.point.y,groundAt(owner.mapId,next.point.x,next.point.z));
          guardian.z = clampToMap(next.point.z, getWorldMap(owner.mapId)!.bounds, "z");
        }
        continue;
      }

      // Follow the owner on the left side, rather than standing at spawn.
      // All positions and animation states are resolved by fixed server ticks.
      guardian.targetId = "";
      const desired = {
        x: clampToMap(owner.x - 1.0, getWorldMap(owner.mapId)!.bounds, "x"),
        y: owner.y,
        z: clampToMap(owner.z + 0.85, getWorldMap(owner.mapId)!.bounds, "z"),
      };
      const dx = desired.x - guardian.x;
      const dz = desired.z - guardian.z;
      const distance = distance3d(guardian,desired);
      guardian.action = "follow";
      // The horizontal comfort radius must not leave a spirit floating >1m
      // above a guardian who just descended from the watchwall.
      if (distance > RULES.summonFollowDistance || Math.abs(guardian.y - owner.y) > 0.18) {
        const next = step3d(
          guardian, desired, RULES.summonMoveSpeed * dt
        );
        guardian.x = clampToMap(next.point.x, getWorldMap(owner.mapId)!.bounds, "x");
        guardian.y = Math.max(next.point.y,groundAt(owner.mapId,next.point.x,next.point.z));
        guardian.z = clampToMap(next.point.z, getWorldMap(owner.mapId)!.bounds, "z");
        if (next.moved) guardian.facing = facingTo(dx, dz);
      } else {
        guardian.facing = owner.facing;
      }
    }
  }

  private trySummonAttack(ownerId: string, guardian: SummonedGuardian, targetId: string) {
    const owner = this.state.players.get(ownerId);
    const sameGuardian = this.state.summons.get(ownerId) === guardian;
    if (!owner || !owner.alive || !sameGuardian) return;

    const monster = this.getMonster(targetId);
    if (!this.sameCombatMap(ownerId, targetId)) return;
    const target = monster ?? this.state.players.get(targetId);
    if (!target || !target.alive || targetId === ownerId) return;
    if (distance3d(owner, target) > RULES.summonEngageDistance) return;
    if (distance3d(guardian, target) > RULES.summonAttackRange + 0.00001 || !this.combatSegmentClear(owner.mapId,guardian,target)) return;

    const last = this.lastSummonAttackAt.get(ownerId) ?? -Infinity;
    if (this.simulatedMs - last < RULES.summonAttackCooldownMs) return;
    this.lastSummonAttackAt.set(ownerId, this.simulatedMs);
    this.recordCombat(ownerId, targetId);
    guardian.hitSeq += 1;

    if (monster) {
      const order=this.occultSpiritOrders.get(ownerId);
      const empowered=order?.targetId===targetId && order.until>this.simulatedMs;
      const gearPower=guardian.kind==="pot_spirit" && owner.pathId==="seer" ? spiritGearPower(this.inventories.get(ownerId)) : 0;
      const damage = calculateDamage((RULES.summonAttackDamage+gearPower)*(empowered?OCCULT_LESSONS[order.skillId].power:1), monster.defense, monster.level);
      if (empowered) this.occultSpiritOrders.delete(ownerId);
      if (guardian.kind==="pot_spirit" && (empowered || !this.occultSpiritPracticed.has(ownerId))) {
        this.occultSpiritPracticed.add(ownerId);
        if (owner.pathId==="seer") this.recordOccultTraining(ownerId,"seer",["spirit"]);
        else if (owner.pathId==="mender") this.recordOccultTraining(ownerId,"mender",["spirit"]);
      }
      monster.hp = Math.max(0, monster.hp - damage);
      monster.hitSeq += 1;
      if (empowered && order.skillId==="seer_spirit_bind" && monster.hp>0) this.interruptMuayTarget(monster,700);
      this.broadcast("summon_hit", {
        ownerId, summonId: ownerId, targetId,
        damage, hp: monster.hp,
        hitSeq: guardian.hitSeq,
      }, { afterNextPatch: true });
      if (monster.hp === 0) this.killMonster(ownerId, targetId);
      return;
    }

    // Summon can help in Free PK only when its owner selected or was attacked
    // by this opponent. Damage/kill attribution belongs to the owner.
    const victim = target as Player;
    const damage = this.swordGuardDamage(targetId,guardian,calculateDamage(RULES.summonAttackDamage, victim.magicDef, victim.level),0,ownerId);
    victim.hp = Math.max(0, victim.hp - damage);
    victim.hitSeq += 1;
    this.broadcast("pvp_hit", {
      attackerId: ownerId, source: "summon", summonOwnerId: ownerId,
      targetId, damage,
      hp: victim.hp, maxHp: victim.maxHp, hitSeq: victim.hitSeq,
    }, { afterNextPatch: true });
    if (victim.hp === 0) {
      owner.pkKills += 1;
      victim.pkDeaths += 1;
      this.knockoutPlayer(targetId, "pk", ownerId);
      void this.saveCharacter(ownerId);
      this.broadcast("pvp_kill", {
        winnerId: ownerId, loserId: targetId,
        source: "summon",
        kills: owner.pkKills, deaths: victim.pkDeaths,
      }, { afterNextPatch: true });
    }
  }

  private reject(client: Client, reason: string) {
    // Avoid amplifying floods with unlimited rejection responses.
    const previous = this.lastRejectNoticeMs.get(client.sessionId) ?? -Infinity;
    if (this.simulatedMs - previous >= 500) {
      this.lastRejectNoticeMs.set(client.sessionId, this.simulatedMs);
      client.send("command_rejected", { reason });
    }
  }

  async onCreate(options?:{warRoomKey?:string;field?:Battlefield}) {
    if(options?.warRoomKey===warRoomKey && options.field){
      this.field=options.field;
      if(this.field.site===CASTLE_ID)this.maxClients=CASTLE_SEATS*2;
      await this.setPrivate(true);
    }
    this.state.territoryWarAvailable=WORLD_EXPANSION;
    if (characterStore.economyEnabled) this.state.craftRecipe = JSON.stringify(SHRINE_RECIPE);
    this.state.forgeCatalog = JSON.stringify(FORGE);
    this.state.buildCatalog = BUILD_CATALOG;
    this.state.economyAvailable = characterStore.economyEnabled;
    if(characterStore.economyEnabled && !this.field)this.clock.setInterval(()=>this.sendResources(),5000);
    this.forest.initialize(!this.field);
    this.state.worldDefinition=this.field?battlefieldWorldDefinition:worldDefinition;
    this.state.swordTreeCatalog = swordTreeCatalog;
    this.state.muayBookCatalog = muayBookCatalog;
    this.state.monster.id = RULES.monsterId;
    this.state.monster.x = RULES.monsterSpawnX;
    this.state.monster.z = RULES.monsterSpawnZ;
    this.state.monster.y=groundAt(DEFAULT_MAP_ID,RULES.monsterSpawnX,RULES.monsterSpawnZ);
    this.state.monster.hp = RULES.monsterMaxHp;
    this.state.monster.maxHp = RULES.monsterMaxHp;
    this.state.monster.alive = true;
    this.state.monster.aiState = "patrol";

    // Simulation time and collision/combat logic advance in exact 50ms steps,
    // independently of client FPS, render speed and message arrival cadence.
    this.setFixedTimestep((ctx) => {
      this.simulatedMs += ctx.dtMs;
      this.tick(ctx.dt);
    }, RULES.tickRate);
    this.clock.setInterval(() => {
      for (const [clientId, session] of this.accountSessions) {
        let valid = false;
        try { valid = Boolean(accounts().resolve(session)); } catch { /* fail closed */ }
        if (!valid) this.clients.find(client => client.sessionId === clientId)?.leave();
      }
    }, 3000);

    const fort = this.state.fortification;
    fort.id = FORT.id;
    fort.x = FORT.x;
    fort.z = FORT.z;
    fort.width = FORT.width;
    fort.length = FORT.length;
    fort.height = FORT.height;
    fort.ladderFootX = FORT.ladderFootX;
    fort.ladderFootZ = FORT.ladderFootZ;
    fort.ladderTopX = FORT.ladderTopX;
    fort.ladderTopZ = FORT.ladderTopZ;

    console.log("MONTRA Elevation Engine started:", this.roomId);
  }

  private tick(dt: number) {
    for(const [id,until] of this.sentinelStuns)if(this.simulatedMs>=until){
      this.sentinelStuns.delete(id);const player=this.state.players.get(id);if(player)player.stunned=false;
    }
    for(const [id,until] of this.sentinelStunResists)if(this.simulatedMs>=until)this.sentinelStunResists.delete(id);
    for(const [id,until] of this.sentinelAnchors)if(this.simulatedMs>=until)this.sentinelAnchors.delete(id);
    for(const [id,until] of this.sentinelCounters)if(this.simulatedMs>=until)this.sentinelCounters.delete(id);
    for(const [id,link] of this.sentinelInterceptions)if(this.simulatedMs>=link.until)this.sentinelInterceptions.delete(id);
    for(const [id,stance] of this.sentinelCoreStances)if(this.simulatedMs>=stance.until || !this.state.players.get(id)?.alive)this.sentinelCoreStances.delete(id);
    for(const [id,windup] of this.sentinelWindups)if(this.simulatedMs>=windup.until){
      this.sentinelWindups.delete(id);const actor=this.state.players.get(id);if(actor?.alive)actor.combatState="idle";
      const hit=this.sentinelDamage(id,windup.targetId,windup.power,true);
      this.sendSwordNotice(this.clients.find(c=>c.sessionId===id),"sentinel_windup_result",{result:hit?"hit":"miss"});
    }
    this.updateBladeEffects();
    for(const [id,until] of this.bladeCloaks) {
      const player=this.state.players.get(id);
      if(!player?.alive || player.pathId!=="blade" || isRestArea(player.mapId,player))this.endBladeCloak(id,"safe_area");
      else if(this.simulatedMs>=until)this.endBladeCloak(id,"expired");
    }
    this.updateTerritory();
    this.updateOccultEffects();
    this.updateMuayGrapples();
    this.updateMuayDefense();
    this.updateMuayCore();
    this.updateSwordCore();
    for(const id of this.buffs.expired(this.simulatedMs))this.endPossession(id,"expired");
    for(const id of this.effects.expire(this.simulatedMs)) {const p=this.state.players.get(id);if(p)this.applyStats(id,p,this.statAllocations.get(id) ?? emptyAllocations());}
    this.updateRespawns();
    this.updateClimbs(dt);
    this.updateFlights(dt);
    this.updatePlayerMovement(dt);
    this.updateMonsterAI(dt);
    this.forest.update(this.simulatedMs, dt, this.state.players, this.pendingWarps, (id,m,force=1) => {
      const p=this.state.players.get(id);
      if (!p || !this.sameCombatMap(id,m.id)) return;
      const profile=this.forest.profile(m.id); if(!profile)return;
      const damage=this.swordGuardDamage(id,m,calculateDamage(profile.attack*force,p.def+equipmentRatings(this.inventories.get(id)).guard,p.level));
      this.endBladeCloak(id,"damaged");
      p.hp=Math.max(0,p.hp-damage);p.hitSeq++;this.lastCombatMs.set(id,this.simulatedMs);
      this.broadcast("monster_hit",{targetId:id,attackerId:m.id,damage,hp:p.hp,maxHp:p.maxHp,hitSeq:p.hitSeq},{afterNextPatch:true});
      if(p.hp===0)this.knockoutPlayer(id,"monster",m.id);
    }, id => this.broadcast("monster_respawn",{targetId:id}),
    (id,p,m)=>!this.bladeCloaks.has(id) || planarDistance(p,m)<=(m.tier==="normal"?(this.bladeBooks.get(id)?.learned.includes("quiet_step")?0.75:1.5):5));
    this.updatePlayerAttacks();
    this.updateSummons(dt);
    for(const [id,hitSequence] of this.mountHitSequence) {
      const player=this.state.players.get(id);
      if(!player || !player.alive || player.hitSeq!==hitSequence || this.sentinelStuns.has(id) || this.muayControlled(id))this.dismount(id,"hit");
    }
    this.updateResources(dt);
    if (this.simulatedMs >= this.nextCharacterSaveMs) {
      this.nextCharacterSaveMs = this.simulatedMs + CHARACTER_SAVE_INTERVAL_MS;
      for (const id of this.persistentCharacters.keys()) void this.saveCharacter(id);
    }
  }

  private isFighting(id:string):boolean {
    return this.attackTargets.has(id) || this.state.monster.targetId === id || this.forest.engaged(id) ||
      this.simulatedMs - (this.lastCombatMs.get(id) ?? -Infinity) < PROGRESSION.combatQuietMs;
  }

  private markSupportManaCombat(id:string, targets:readonly [string, Player][]):void {
    if (targets.some(([member]) => this.isFighting(member) ||
      (member!==id && this.simulatedMs < (this.supportManaCombatUntil.get(member) ?? 0))))
      this.supportManaCombatUntil.set(id,this.simulatedMs + PROGRESSION.combatQuietMs);
  }

  private updateResources(dt: number): void {
    for (const [id, player] of this.state.players) {
      if (!player.alive || this.pendingWarps.has(id)) continue;
      const fighting = this.isFighting(id);
      // HP saves are integer-valued in legacy snapshots. Keep fractional regen
      // in a transient accumulator instead of rounding up on each save/rejoin.
      const pending = (this.hpRegenRemainder.get(id) ?? 0) + (fighting ? PROGRESSION.hpRegenIn : PROGRESSION.hpRegenOut) * dt;
      const healed = Math.floor(pending + 1e-9);
      player.hp = Math.min(player.maxHp, player.hp + healed);
      this.hpRegenRemainder.set(id, player.hp >= player.maxHp ? 0 : pending - healed);
      player.stamina = Math.min(player.maxStamina, player.stamina + ((fighting ? PROGRESSION.staminaRegenIn : PROGRESSION.staminaRegenOut)+(this.extraStaminaRegen.get(player)??0)) * dt);
      const manaFighting = fighting || this.simulatedMs < (this.supportManaCombatUntil.get(id) ?? 0);
      const manaRegen = manaFighting ? PROGRESSION.manaRegenIn : Math.max(PROGRESSION.manaRegenOut, player.maxMana / 20)+(this.extraRestManaRegen.get(player)??0);
      player.mana = Math.min(player.maxMana, player.mana + manaRegen * dt);
    }
  }

  private updateClimbs(dt: number) {
    for (const [id,destination] of [...this.climbs]) {
      const player = this.state.players.get(id);
      if (!player || !player.alive) {
        this.climbs.delete(id);
        continue;
      }
      const next = progressClimb(player, destination, dt);
      player.x = clampToMap(next.point.x, getWorldMap(player.mapId)!.bounds, "x");
      player.y = next.point.y;
      player.z = clampToMap(next.point.z, getWorldMap(player.mapId)!.bounds, "z");
      player.facing = facingTo(destination.x-player.x, destination.z-player.z);
      player.combatState = "climbing";
      if (next.arrived) {
        this.climbs.delete(id);
        player.combatState = "idle";
        this.broadcast("climb_finished", {
          playerId:id, height:player.y,
        }, { afterNextPatch:true });
      }
    }
  }

  /** Flight transitions are vertical only; horizontal movement begins on arrival. */
  private updateFlights(dt: number) {
    for (const [id, transition] of [...this.flightTransitions]) {
      const player = this.state.players.get(id);
      if (!player || !player.alive) {
        this.flightTransitions.delete(id);
        continue;
      }
      const base=groundAt(player.mapId,player.x,player.z);
      const next = progressFlightHeight(player.y-base, transition.targetY, dt);
      player.y = next.y+base;
      player.combatState = transition.landing ? "descending" : "ascending";
      if (!next.arrived) continue;
      this.flightTransitions.delete(id);
      player.flying = !transition.landing;
      player.combatState = "idle";
      this.broadcast("flight_finished", {
        playerId: id, altitude: player.y, flying: player.flying,
      }, { afterNextPatch: true });
      void this.saveCharacter(id);
    }
  }

  private canOccupy(x: number, z: number, feetY: number, flying = false, mapId = DEFAULT_MAP_ID): boolean {
    const map=getWorldMap(mapId);
    if(mapId!==DEFAULT_MAP_ID || map?.terrain){
      const r=map?.strategic?.rampart;
      if(r && isOnPlatform(feetY))return onRampart(r,x,z);
      if(r && this.closedFieldGates.size && r.gates.some(g=>this.closedFieldGates.has(g.id) && segmentIntersectsExpandedWall({x,z},{x,z},g.box,.4)))return false;
      if(r && this.gateClosed && segmentIntersectsExpandedWall({x,z},{x,z},r.gates[0].box,.4))return false;
      if(map?.terrain)return isSafeWorldPoint(map,{x,z,y:groundAt(mapId,x,z)+feetY});
      return Boolean(map && (isOnGround(feetY) || (flying && isFlightAltitude(feetY))) &&
        isSafeWorldPoint(map, { x, y: feetY, z }));
    }
    if (!Number.isFinite(x) || !Number.isFinite(z) ||
        Math.abs(x) > RULES.mapLimit || Math.abs(z) > RULES.mapLimit) return false;
    if (flying && isFlightAltitude(feetY)) return true; // 6m flight lane
    if (isOnPlatform(feetY)) return isOnTop(x,z); // solid wall crest (4m)
    if (isOnGround(feetY)) return !touchesWallBody(x,z); // ground 0m
    return false; // Never trust arbitrary Y from a client/save.
  }

  private moveOnSurface(player:{x:number;y:number;z:number;mapId:string;flying?:boolean},x:number,z:number){
    if(getWorldMap(player.mapId)?.terrain){
      const layer=player.flying?FLIGHT.altitude:isOnPlatform(surfaceLayer(player))?FORT.height:0;
      player.y=groundAt(player.mapId,x,z)+layer;
    }
    player.x=x;player.z=z;
  }

  private updatePlayerMovement(dt: number) {
    for (const [sessionId, player] of this.state.players) {
      if (!player.alive || this.basicAttackPaused(sessionId) || this.pendingWarps.has(sessionId) || this.climbs.has(sessionId) || this.flightTransitions.has(sessionId)) {
        this.activeDashes.delete(sessionId);
        continue;
      }
      const moveSpeed=player.flying ? FLIGHT.horizontalSpeed : player.mounted ? RULES.mountedSpeed : RULES.playerSpeed * (this.sentinelAnchors.has(sessionId)?0.6:1) *
        (this.bladeCloaks.has(sessionId) && this.bladeBooks.get(sessionId)?.learned.includes("quiet_step") ? 1+BLADE_LESSONS.quiet_step.power : 1);

      const dash = this.activeDashes.get(sessionId);
      if (dash) {
        const move = advanceDash(
          player, dash,
          Math.min(dash.remaining, RULES.dashSpeed * dt),
          (x, z) => this.canOccupy(x,z,surfaceLayer(player), player.flying, player.mapId),
          getWorldMap(player.mapId)!.bounds,
        );
        this.moveOnSurface(player,move.x,move.z);
        player.facing = facingTo(dash.dx, dash.dz);
        dash.remaining = Math.max(0, dash.remaining - move.moved);
        if (move.blocked || dash.remaining < 0.0001) {
          this.activeDashes.delete(sessionId);
          player.combatState = "idle";
          this.broadcast("dash_finished", {
            playerId: sessionId, blocked: move.blocked,
          }, { afterNextPatch: true });
        } else {
          player.combatState = "dashing";
        }
        continue;
      }

      const targetId = this.attackTargets.get(sessionId);
      if (targetId) {
        const monster = this.getMonster(targetId);
        const isMonster = Boolean(monster);
        const target = isMonster
          ? (monster?.alive ? monster : undefined)
          : this.state.players.get(targetId);

        if (!target || !target.alive || targetId === sessionId || !this.canPursueBasic(sessionId,player,targetId,monster)) {
          this.endAttack(sessionId, player);
          continue;
        }
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const distance = distance3d(player, target);
        player.targetId = targetId;
        player.facing = facingTo(dx, dz);

        const ranged = isOccultPath(player.pathId);
        const attackRange = ranged ? FORT.rangedRange : isMonster ? RULES.playerAttackRange : RULES.pkAttackRange;
        if (!ranged && meleeHeightBlocked(player,target,attackRange)) {
          this.endAttack(sessionId, player);
          continue;
        }
        const inRestArea=isMonster && isRestArea(player.mapId,player);
        const clearShot = !ranged || this.combatSegmentClear(player.mapId,player,target);
        if (!inRestArea && distance <= attackRange && clearShot) {
          player.combatState = "attacking";
          continue;
        }

        // Recalculate every fixed tick so moving players can be chased.
        // Never teleport, regardless of where the client taps.
        const stopDistance = inRestArea || !clearShot ? 0 : attackRange - 0.4;
        const ratio = Math.max(0, (distance - stopDistance) / distance);
        const approach = {
          x: clampToMap(player.x + dx * ratio, getWorldMap(player.mapId)!.bounds, "x"),
          z: clampToMap(player.z + dz * ratio, getWorldMap(player.mapId)!.bounds, "z"),
        };
        const next = stepTowards(player, approach,
          moveSpeed * dt);
        if (this.canOccupy(next.x,next.z,surfaceLayer(player),player.flying,player.mapId)) {
          this.moveOnSurface(player,next.x,next.z);
          player.combatState = "approaching";
        } else {
          this.endAttack(sessionId,player);
        }
        continue;
      }

      const destination=this.destinations.get(sessionId);
      const turns=destination && isOnPlatform(surfaceLayer(player))?this.crestTurns.get(sessionId):undefined;
      const target=turns?.[0] ?? destination;
      if (!target) {
        player.combatState = "idle";
        player.targetId = "";
        continue;
      }
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      if(player.mounted){
        const distance=Math.hypot(dx,dz);
        if(distance<.035){player.combatState="idle";this.destinations.delete(sessionId);continue;}
        const move=advanceDash(player,{dx:dx/distance,dz:dz/distance},Math.min(distance,moveSpeed*dt),
          (x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId),getWorldMap(player.mapId)!.bounds);
        if(move.moved)player.facing=facingTo(dx,dz);
        this.moveOnSurface(player,move.x,move.z);
        if(move.blocked || Math.hypot(target.x-player.x,target.z-player.z)<.035){this.destinations.delete(sessionId);player.combatState="idle";}
        else player.combatState="moving";
        continue;
      }
      const next = stepTowards(player, target,
        moveSpeed * dt);
      if (next.moved) player.facing = facingTo(dx, dz);
      if (this.canOccupy(next.x,next.z,surfaceLayer(player),player.flying,player.mapId)) {
        this.moveOnSurface(player,next.x,next.z);
      } else {
        // Slide on the wall face if a legal axis exists; never tunnel through
        // solid geometry via client destinations or elevated edge tapping.
        if (this.canOccupy(next.x,player.z,surfaceLayer(player),player.flying,player.mapId)) this.moveOnSurface(player,next.x,player.z);
        else if (this.canOccupy(player.x,next.z,surfaceLayer(player),player.flying,player.mapId)) this.moveOnSurface(player,player.x,next.z);
        else {
          this.destinations.delete(sessionId);
          player.combatState = "idle";
          continue;
        }
      }
      const arrived = Math.hypot(target.x-player.x,target.z-player.z) < .035;
      player.combatState = arrived ? "idle" : "moving";
      if(arrived){if(turns?.length)turns.shift();else this.destinations.delete(sessionId);}
    }
  }

  private updatePlayerAttacks() {
    for (const [attackerId, targetId] of [...this.attackTargets]) {
      const attacker = this.state.players.get(attackerId);
      if (!attacker || !attacker.alive) {
        this.attackTargets.delete(attackerId);
        continue;
      }

      if (this.basicAttackPaused(attackerId)) continue;
      const monster = this.getMonster(targetId);
      const isMonster = Boolean(monster);
      const target = isMonster
        ? (monster?.alive ? monster : undefined)
        : this.state.players.get(targetId);
      if (!target || !target.alive || targetId === attackerId || !this.canPursueBasic(attackerId,attacker,targetId,monster)) {
        this.endAttack(attackerId, attacker);
        continue;
      }

      if (isMonster && isRestArea(attacker.mapId,attacker)) continue;
      const ranged = isOccultPath(attacker.pathId);
      const range = ranged ? FORT.rangedRange : isMonster ? RULES.playerAttackRange : RULES.pkAttackRange;
      if (distance3d(attacker,target)>range+.00001 || !this.combatSegmentClear(attacker.mapId,attacker,target))continue;
      attacker.facing = facingTo(target.x - attacker.x, target.z - attacker.z);
      attacker.combatState = "attacking";

      // Same cooldown clock for PvP and PvE. Switching targets cannot
      // bypass cooldown or borrow a timestamp supplied by the browser.
      const dualSword = attacker.pathId === "phutthaisawan" && wearsTwinSwords(equippedWeaponId(this.inventories.get(attackerId)));
      const cooldown = dualSword ? DUAL_SWORD.attackIntervalMs : (isMonster ? RULES.playerAttackCooldownMs : RULES.pkCooldownMs);
      const last = this.lastAttackMs.get(attackerId) ?? -Infinity;
      if (this.simulatedMs - last < cooldown) continue;
      this.lastAttackMs.set(attackerId, this.simulatedMs);
      const ambush=this.endBladeCloak(attackerId,"attack");
      if(ambush)this.recordBladeOpening(attackerId,Boolean(monster));
      this.recordCombat(attackerId, targetId);
      if (dualSword) {
        const previous=this.swordCombos.get(attackerId);
        const previousCount=previous && previous.until>=this.simulatedMs ? previous.count : 0;
        const count=Math.min(3,previousCount+1);
        this.swordCombos.set(attackerId,{count,until:this.simulatedMs+3500});
        this.recordSwordTraining(attackerId,"strikes");
        if (previousCount===2) this.recordSwordTraining(attackerId,"finishes");
        this.sendSwordNotice(this.clients.find(client=>client.sessionId===attackerId),"sword_combo",{count});
      }
      if (attacker.pathId === "muay_boran" && wearsWraps(equippedWeaponId(this.inventories.get(attackerId)))) this.recordMuayTraining(attackerId,"strikes");

      const bonuses = weaponBonuses(this.inventories.get(attackerId), monster ? "pve" : "pvp");
      const meleeBonus = bonuses.melee;
      const swordMastery = ambush ? (monster?1.5:1.2) : 1;
      if (ranged) this.broadcast("ranged_hit", {
        attackerId,targetId,skill:"basic_magic",
        from:{x:attacker.x,y:attacker.y+FORT.shootOriginHeight,z:attacker.z},
        to:{x:target.x,y:target.y+FORT.targetBodyHeight,z:target.z},
      }, {afterNextPatch:true});
      if (monster) {
        const meleeDamage = ranged ? calculateDamage(attacker.magicAtk + bonuses.ranged,monster.defense,monster.level)
          : calculateDamage((attacker.atk + meleeBonus) * (dualSword ? DUAL_SWORD.damageMultiplier : 1) * swordMastery, monster.defense, monster.level);
        monster.hp = Math.max(0, monster.hp - meleeDamage);
        monster.hitSeq += 1;
        this.broadcast("combat_hit", {
          targetId,
          attackerId, damage: meleeDamage,
          hp: monster.hp, maxHp: monster.maxHp, hitSeq: monster.hitSeq,
        }, { afterNextPatch: true });
        if (monster.hp === 0) this.killMonster(attackerId, targetId);
        continue;
      }

      // FREE PK: health, range, damage, respawn and kill credit are wholly
      // server-owned. The client only submits another session's targetId.
      const victim = target as Player;
      const meleeDamage = this.swordGuardDamage(targetId,attacker,ranged
        ? calculateDamage(attacker.magicAtk + bonuses.ranged,victim.magicDef,victim.level)
        : calculateDamage((attacker.atk + meleeBonus) * (dualSword ? DUAL_SWORD.damageMultiplier : 1) * swordMastery, victim.def, victim.level));
      victim.hp = Math.max(0, victim.hp - meleeDamage);
      victim.hitSeq += 1;
      this.broadcast("pvp_hit", {
        attackerId, targetId, damage: meleeDamage,
        hp: victim.hp, maxHp: victim.maxHp, hitSeq: victim.hitSeq,
      }, { afterNextPatch: true });

      if (victim.hp === 0) {
        attacker.pkKills += 1;
        victim.pkDeaths += 1;
        this.knockoutPlayer(targetId, "pk", attackerId);
        void this.saveCharacter(attackerId);
        this.broadcast("pvp_kill", {
          winnerId: attackerId, loserId: targetId,
          kills: attacker.pkKills, deaths: victim.pkDeaths,
        }, { afterNextPatch: true });
      }
    }
  }

  private knockoutPlayer(id: string, cause: "pk" | "monster", attackerId = "") {
    this.muayCoreStances.delete(id);this.muayCoreFollowups.delete(id);this.muayCoreSequences.delete(id);this.swordCoreStances.delete(id);this.swordCoreSequences.delete(id);
    this.sentinelCoreStances.delete(id);this.sentinelStuns.delete(id);this.sentinelWindups.delete(id);this.sentinelCounters.delete(id);this.sentinelAnchors.delete(id);this.sentinelInterceptions.delete(id);
    for(const [member,link] of this.sentinelInterceptions)if(link.ownerId===id)this.sentinelInterceptions.delete(member);
    this.endBladeCloak(id,"dead");this.bladeCasts.delete(id);this.bladeWindups.delete(id);
    this.releaseMuayFor(id,"knockout");
    this.clearGrappleCountersFor(id,"knockout");
    this.swordCombos.delete(id);
    this.swordGuards.delete(id);
    this.clearMuayDefense(id,"cancelled");
    this.clearMuayCombo(id);
    this.clearMuayCombosForTarget(id);
    const victim = this.state.players.get(id);
    if (!victim || !victim.alive) return;
    this.dismount(id,"dead");
    victim.stunned=false;
    this.endPossession(id,"owner_dead");
    this.effects.forget(id);
    this.applyStats(id, victim, this.statAllocations.get(id) ?? emptyAllocations());
    victim.hp = 0;
    this.hpRegenRemainder.delete(id);
    victim.alive = false;
    victim.combatState = "dead";
    victim.targetId = "";
    this.climbs.delete(id);
    this.flightTransitions.delete(id);
    victim.flying = false;
    this.activeDashes.delete(id);
    this.despawnSummon(id, "owner_dead");
    this.destinations.delete(id);
    this.attackTargets.delete(id);
    this.playerRespawnAt.set(id, this.simulatedMs + RULES.playerRespawnMs);
    void this.saveCharacter(id);

    // Everyone chasing this human stops when the target dies. No
    // duplicated damage on a corpse, and no stale targets after respawn.
    for (const [otherId, targetId] of [...this.attackTargets]) {
      if (targetId !== id) continue;
      const other = this.state.players.get(otherId);
      if (other) this.endAttack(otherId, other);
      else this.attackTargets.delete(otherId);
    }
    if (this.state.monster.targetId === id) this.state.monster.targetId = "";
    this.forest.clearTarget(id);
    this.broadcast("player_down", {
      playerId: id, source: cause, attackerId,
    }, { afterNextPatch: true });
  }

  private killMonster(winnerId: string, targetId: string = RULES.monsterId) {
    this.releaseMuayFor(targetId,"knockout");
    if (targetId !== RULES.monsterId) {
      const m=this.state.monsters.get(targetId);
      const profile=this.forest.profile(targetId);
      if(!m || !profile || !this.forest.kill(targetId,this.simulatedMs,this.state.players,this.pendingWarps))return;
      this.clearMuayCombosForTarget(targetId);
      this.awardMonsterExperience(winnerId,m,profile.tier);
      for(const [id,target] of this.attackTargets) if(target===targetId){const p=this.state.players.get(id);if(p)this.endAttack(id,p);}
      return;
    }
    const monster = this.state.monster;
    this.clearMuayCombosForTarget(targetId);
    this.monsterInterruptUntil=0;this.monsterInterruptResistUntil=0;
    this.sentinelLegacyTaunt={ownerId:"",until:0,resistUntil:0};
    monster.alive = false;
    monster.hp = 0;
    this.monsterNavigator.clear();
    monster.aiState = "dead";
    monster.targetId = "";
    this.monsterRespawnAt = this.simulatedMs + RULES.monsterRespawnMs;
    this.monsterReturning = false;
    this.awardMonsterExperience(winnerId);

    // Only cancel PvE attacks on this monster. Concurrent Free PK fights
    // must continue even when someone else defeats the ghost.
    for (const [id, targetId] of [...this.attackTargets]) {
      if (targetId !== RULES.monsterId) continue;
      const player = this.state.players.get(id);
      if (player) this.endAttack(id, player);
      else this.attackTargets.delete(id);
    }
  }

  private updateMonsterAI(dt: number) {
    const monster = this.state.monster;
    if (!monster.alive) return;
    if(this.simulatedMs<this.monsterInterruptUntil){monster.aiState="stagger";return;}

    const spawn = { x: RULES.monsterSpawnX, z: RULES.monsterSpawnZ };
    if (planarDistance(monster, spawn) >= RULES.monsterLeashRadius) {
      this.monsterReturning = true;
    }
    if (this.monsterReturning) {
      monster.targetId = "";
      monster.aiState = "return";
      this.moveMonster(spawn, RULES.monsterChaseSpeed * dt, "return");
      if (planarDistance(monster, spawn) < 0.2) this.monsterReturning = false;
      return;
    }

    // Keep an existing target if it is alive and remains in the combat area.
    let targetId = monster.targetId;
    let target = targetId ? this.state.players.get(targetId) : undefined;
    if (!target || !target.alive || this.pendingWarps.has(targetId) || (this.bladeCloaks.has(targetId) && planarDistance(monster,target)>(this.bladeBooks.get(targetId)?.learned.includes("quiet_step")?0.75:1.5)) || target.mapId !== DEFAULT_MAP_ID || isRestArea(target.mapId,target) || !onMapGround(target) ||
        planarDistance(monster, target) > RULES.monsterGiveUpRadius) {
      target = undefined;
      targetId = "";
    }
    const taunt=this.sentinelLegacyTaunt,forced=this.state.players.get(taunt.ownerId);
    if(this.simulatedMs<taunt.until && forced?.alive && forced.mapId===DEFAULT_MAP_ID &&
       !this.pendingWarps.has(taunt.ownerId) && !isRestArea(forced.mapId,forced) &&
       onMapGround(forced) && !this.bladeCloaks.has(taunt.ownerId) && planarDistance(monster,forced)<=RULES.monsterGiveUpRadius){
      target=forced;targetId=taunt.ownerId;
    }else if(this.simulatedMs>=taunt.until || !forced?.alive){taunt.ownerId="";taunt.until=0;}

    // No shared targeting oracle: this NPC sees only characters within aggro.
    if (!target) {
      let nearest: number = RULES.monsterAggroRadius;
      for (const [id, player] of this.state.players) {
        if (!player.alive || this.pendingWarps.has(id) || (this.bladeCloaks.has(id) && planarDistance(monster,player)>(this.bladeBooks.get(id)?.learned.includes("quiet_step")?0.75:1.5)) || player.mapId !== DEFAULT_MAP_ID || isRestArea(player.mapId,player) || !onMapGround(player)) continue;
        const distance = planarDistance(monster, player);
        if (distance < nearest) {
          nearest = distance;
          target = player;
          targetId = id;
        }
      }
    }

    if (target) {
      monster.targetId = targetId;
      const distance = planarDistance(monster, target);
      monster.facing = facingTo(target.x - monster.x, target.z - monster.z);
      if (distance > RULES.monsterAttackRange) {
        monster.aiState = "chase";
        this.moveMonster(target, RULES.monsterChaseSpeed * dt, "chase:" + targetId);
      } else {
        monster.aiState = "attack";
        this.monsterAttack(targetId, target);
      }
      return;
    }

    monster.targetId = "";
    // Simple deterministic patrol around the spawn, controlled by server time.
    const phase = this.simulatedMs / 2500;
    const destination = {
      x: spawn.x + Math.cos(phase) * RULES.monsterPatrolRadius,
      z: spawn.z + Math.sin(phase) * RULES.monsterPatrolRadius,
    };
    monster.aiState = "patrol";
    this.moveMonster(destination, RULES.monsterPatrolSpeed * dt, "patrol");
  }

  /** RRT routes around obstacles; movement speed remains RULES-based.
   * Planning runs roughly once every 1.3 seconds for a moving target, while
   * the server still applies at most one legal movement step per 20Hz tick.
   */
  private moveMonster(target: Vec2, step: number, intent: string) {
    const monster = this.state.monster;
    const waypoint = this.monsterNavigator.nextWaypoint(
      monster, target, this.simulatedMs, intent
    );
    if (!waypoint) return; // Never fall back to walking through the wall.

    const dx = waypoint.x-monster.x;
    const dz = waypoint.z-monster.z;
    const next = stepTowards(monster, waypoint, step);
    if (!next.moved || isRestArea(DEFAULT_MAP_ID,next) || !isMonsterSegmentClear(monster, next)) return;

    monster.facing = facingTo(dx,dz);
    monster.x = clampToMap(next.x);
    monster.z = clampToMap(next.z);
    monster.y=groundAt(DEFAULT_MAP_ID,monster.x,monster.z);
  }

  private monsterAttack(targetId: string, target: Player) {
    if (isRestArea(DEFAULT_MAP_ID,this.state.monster)) return;
    if (!target.alive || this.pendingWarps.has(targetId) || target.mapId !== DEFAULT_MAP_ID || isRestArea(target.mapId,target)) return;
    if (distance3d(this.state.monster, target) > RULES.monsterAttackRange) return;
    if (this.simulatedMs - this.lastMonsterAttackMs < RULES.monsterAttackCooldownMs) return;
    this.lastMonsterAttackMs = this.simulatedMs;
    this.lastCombatMs.set(targetId, this.simulatedMs);

    const damage = this.swordGuardDamage(targetId,this.state.monster,calculateDamage(RULES.monsterAttackDamage, target.def+equipmentRatings(this.inventories.get(targetId)).guard, target.level));
    this.endBladeCloak(targetId,"damaged");
    target.hp = Math.max(0, target.hp - damage);
    target.hitSeq += 1;
    this.broadcast("monster_hit", {
      targetId,
      attackerId: RULES.monsterId,
      damage,
      hp: target.hp,
      maxHp: target.maxHp,
      hitSeq: target.hitSeq,
    }, { afterNextPatch: true });

    if (target.hp === 0) {
      this.knockoutPlayer(targetId, "monster");
    }
  }

  private updateRespawns() {
    const monster = this.state.monster;
    if (!monster.alive && this.monsterRespawnAt &&
        this.simulatedMs >= this.monsterRespawnAt) {
      monster.hp = monster.maxHp;
      this.monsterNavigator.clear();
      monster.x = RULES.monsterSpawnX;
      monster.z = RULES.monsterSpawnZ;
      monster.y=groundAt(DEFAULT_MAP_ID,monster.x,monster.z);
      monster.facing = 0;
      monster.alive = true;
      monster.aiState = "patrol";
      monster.targetId = "";
      this.monsterRespawnAt = 0;
      this.lastMonsterAttackMs = -Infinity;
      this.broadcast("monster_respawn", { targetId: RULES.monsterId });
    }

    for (const [id, atMs] of this.playerRespawnAt) {
      if (this.simulatedMs < atMs) continue;
      this.playerRespawnAt.delete(id);
      const player = this.state.players.get(id);
      if (!player) continue;
      const camp=this.warSeats.get(id)?.camp;
      const front=camp?this.fieldCamp(id,camp):undefined;
      const spawn=front ?? this.playerSpawn.get(id) ?? {x:0,z:0};
      if(camp && !front)this.clients.find(c=>c.sessionId===id)?.send("territory_error",{reason:"war_camp_fallback"});
      player.hp = player.maxHp;
      player.alive = true;
      player.x = spawn.x;
      player.y = groundAt(player.mapId,spawn.x,spawn.z);
      player.z = spawn.z;
      this.climbs.delete(id);
      this.flightTransitions.delete(id);
      player.flying = false;
      this.activeDashes.delete(id);
      player.facing = 0;
      player.combatState = "idle";
      player.targetId = "";
      this.lastAttackMs.delete(id);
      this.broadcast("player_respawn", { playerId: id });
      void this.saveCharacter(id);
    }
  }

  private canPursueBasic(id:string, player:Player, targetId:string, monster:Monster|undefined):boolean {
    // A PvE order can walk out of a rest area. Only the damage check requires both sides outside.
    if (!monster || !this.restApproachClients.has(id))return this.sameCombatMap(id,targetId);
    return !this.pendingWarps.has(id) && player.mapId===monster.mapId && !isRestArea(monster.mapId,monster);
  }

  private startSkillAction(id:string, player:Player, state:"idle"|"attacking") {
    this.destinations.delete(id);
    const targetId=this.attackTargets.get(id);
    if (!targetId || !this.getMonster(targetId)?.alive) {
      this.endAttack(id,player);
    }
    player.combatState=state;
  }

  private basicAttackPaused(id:string):boolean {
    return this.sentinelStuns.has(id) || this.sentinelWindups.has(id) ||
      this.bladeWindups.has(id) || this.bladeCasts.has(id) || this.muayCoreSequences.has(id) || this.swordCoreSequences.has(id) || this.muayControlled(id);
  }

  private endAttack(id: string, player: Player) {
    this.attackTargets.delete(id);
    player.targetId = "";
    player.combatState = "idle";
  }

  private captureCharacterSnapshot(
    id: string, inventoryOverride?: InventorySnapshot, hpOverride?: number,
  ): CharacterSnapshot | null {
    const characterId = this.persistentCharacters.get(id);
    const player = this.state.players.get(id);
    const inventory = inventoryOverride ?? this.inventories.get(id);
    if (!characterId || !player || !inventory) return null;
    return {
      version: 1, id: characterId, name: player.characterName,
      level: player.level, experience: player.experience,
      pkKills: player.pkKills, pkDeaths: player.pkDeaths,
      mapId: player.mapId,
      statAllocations: this.statAllocations.get(id) ?? emptyAllocations(),
      build: this.playerBuild(player) ?? undefined,
      classSkillReadyAt: player.classSkillReadyAt,
      talismanReadyAt: player.talismanReadyAt,
      swordTree: this.swordTrees.get(id),
      muayCooldowns: this.muayCooldowns.get(id),
      muayBook: this.muayBooks.get(id),
      occultBook: this.occultBooks.get(id),
      bladeBook: this.bladeBooks.get(id),
      sentinelBook: this.sentinelBooks.get(id),
      muayWrapGranted: this.muayWrapGranted.has(id),
      stamina: player.stamina,
      mana: player.mana,
      x: player.x,
      // Keep stable flight altitude when a transition is mid-flight.
      y: player.flying ? FLIGHT.altitude : getWorldMap(player.mapId)?.reliefLabels ? (isOnPlatform(surfaceLayer(player))?FORT.height:0) : player.y,
      z: player.z,
      hp: Math.max(0, Math.round(hpOverride ?? player.hp)),
      inventory, updatedAt: new Date().toISOString(),
    };
  }

  private async saveCharacter(id: string): Promise<void> {
    try {
      // Do not snapshot old potion counts while a disk-backed item use is
      // pending. OnLeave/onDispose also wait so no final write can re-grant it.
      const itemTask = this.pendingItemUses.get(id);
      if (itemTask) await itemTask.catch(() => {});
      const rewardTask = this.pendingRewards.get(id);
      if (rewardTask) await rewardTask.catch(() => {});
      const snapshot = this.captureCharacterSnapshot(id);
      if (snapshot) await characterStore.save(snapshot);
    } catch (error) {
      console.error("MONTRA S2+inventory save failed for", id, error);
      this.clients.find((client) => client.sessionId === id)
        ?.send("character_save_error", { reason: "disk_write_failed" });
    }
  }

  async onJoin(client: Client, options?: unknown) {
    if (WORLD_EXPANSION && (!options || typeof options !== "object" || Array.isArray(options) || (options as Record<string,unknown>).worldVersion !== 1)) throw new Error("world_client_update_required");
    // Old smoke tests and clients without browser storage remain transient.
    // A valid guest token is a secret bearer credential, never sent in Schema.
    const required = process.env.MONTRA_ACCOUNTS_REQUIRED !== "0";
    const fields = options && typeof options === "object" && !Array.isArray(options) ? options as Record<string,unknown> : {};
    const identity = required ? accounts().resolve(fields.accountSession) : null;
    if (required && !identity) throw new Error("login_required");
    const token = required ? null : getGuestToken(options);
    const slot = parseCharacterSlot(options);
    if (!required && !token && slot !== 1) throw new Error("guest_token_required");
    const slotIds = identity?.characterIds ?? (token ? CHARACTER_SLOTS.map(candidate => characterIdFromToken(token, candidate)) : null);
    // Account UUID remains stable when a deleted slot receives a new ID.
    const accountId = identity?.accountId ?? slotIds?.[0] ?? null;
    const characterId = slotIds?.[slot - 1] ?? null;
    // A single Guest ID may own three saves but can play only ONE at a time.
    if (accountId && !claimCharacter(accountId, client.sessionId)) {
      throw new Error("character_already_online");
    }

    try {
      // Reserve before the asynchronous save lookup so simultaneous arrivals get different starts.
      const reserved = [...this.playerSpawn.values()];
      const spawn = this.field?.site===CASTLE_ID ? VILLAGE_ARRIVALS[0] : VILLAGE_ARRIVALS.find(p => !reserved.some(other => other.x === p.x && other.z === p.z));
      if (!spawn) throw new Error("world_room_full");
      this.playerSpawn.set(client.sessionId, spawn);
      const setup = fields.characterSetup && typeof fields.characterSetup === "object" && !Array.isArray(fields.characterSetup)
        ? fields.characterSetup as {name?:unknown; build?:unknown} : undefined;
      const saved = characterId ? (await characterStore.loadOrCreateById(characterId, spawn, setup, required)).character : null;
      if (required && !accounts().resolve(fields.accountSession)) throw new Error("login_required");
      const allocations = saved?.statAllocations ?? emptyAllocations();
      const initialStats = equippedStats(calculateStats(saved?.level ?? 1, allocations),saved?.inventory);
      const initialMaxMana=gearMana(saved?.level??1,saved?.inventory).max;
      const mapId = saved?.mapId ?? DEFAULT_MAP_ID;
      const provinceReady=(options as {provinceVersion?:unknown}|undefined)?.provinceVersion===1;
      const castleReady=(options as {castleVersion?:unknown}|undefined)?.castleVersion===2;
      const riverReady=(options as {riverCityVersion?:unknown}|undefined)?.riverCityVersion===1;
      const terrainReady=(options as {terrainVersion?:unknown}|undefined)?.terrainVersion===1;
      const reliefReady=(options as {atlasReliefVersion?:unknown}|undefined)?.atlasReliefVersion===1;
      const originalReady=(options as {originalReliefVersion?:unknown}|undefined)?.originalReliefVersion===1;
      if(getWorldMap(mapId)?.reliefLabels && !isAtlasMap(mapId) && !originalReady)throw new Error("world_client_update_required");
      if(isAtlasMap(mapId) && getWorldMap(mapId)?.terrain && !reliefReady)throw new Error("world_client_update_required");
      if(mapId===RIDGE_PASS && !terrainReady)throw new Error("world_client_update_required");
      if(mapId===RIVER_CITY && !riverReady)throw new Error("world_client_update_required");
      if(mapId===CASTLE_ID && !castleReady)throw new Error("world_client_update_required");
      if(getWorldMap(mapId)?.strategic && !provinceReady)throw new Error("world_client_update_required");
      const atlasReady=(options as {atlasVersion?:unknown}|undefined)?.atlasVersion===1;
      if(isAtlasMap(mapId) && !atlasReady)throw new Error("world_client_update_required");
      const templeReady=(options as {templeVersion?:unknown}|undefined)?.templeVersion===1;
      if(mapId===TEMPLE_ID && !templeReady)throw new Error("world_client_update_required");
      const map = getWorldMap(mapId);
      if (!map) throw new Error("unknown_character_map");
      // A saved location is restored only if the current server geometry allows it.
      // Atlas saves keep the pre-relief ground/flight layer on disk; project onto the current surface at admission.
      const restoreFlight = Boolean(saved && (!map.terrain || !map.region?.noFlight) && isFlightAltitude(saved.y));
      const savedY=saved ? saved.y+(map.reliefLabels?groundAt(mapId,saved.x,saved.z):0) : 0;
      let validPosition = saved && (!map.terrain || isSafeWorldPoint(map,{...saved,y:savedY})) && this.canOccupy(
        saved.x, saved.z, savedY-groundAt(mapId,saved.x,saved.z), restoreFlight, mapId);
      let safeSpawn = mapId === DEFAULT_MAP_ID ? { ...spawn, y: 0 } : getSafeMapSpawn(mapId);
      if(this.field){
        const credential=characterId && admissions.get(characterId),war=guildStore().war,member=characterId && war.member(characterId);
        if(!credential || credential.roomId!==this.roomId || credential.expires<=Date.now() ||
           credential.ticket!==(options as Record<string,unknown>)?.warTicket || !member || mapId!==this.field.site)throw Error("war_admission");
        const side=war.side(this.field,member,Date.now());
        if(side!==credential.side || member.id!==credential.guild)throw Error("war_admission");
        const sideSize=[...this.warSeats.values()].filter(s=>s.side===side).length;
        if(sideSize>=(mapId===CASTLE_ID?CASTLE_SEATS:WAR_SIDE_SIZE))throw Error("war_side_full");
        war.side(this.field,member,Date.now(),true);admissions.delete(characterId!);
        const seat={guild:member.id,side,camp:0};
        this.warSeats.set(client.sessionId,seat);
        if(mapId===CASTLE_ID){
          const defended=war.inspect(mapId,Date.now()).pilot?.throne?.defended;
          safeSpawn=pilotSpawn(war.muster(this.field,characterId!,credential.point),side,sideSize,defended);
          seat.camp=war.campPreference(this.field,characterId!);
        }else if(mapId===RIVER_CITY){
          const node=side==="attack"?riverNodes.A:riverNodes.D;
          safeSpawn={x:node.x+sideSize*.6-1.2,y:0,z:node.z};
        }else{
          const gate=WORLD_MAPS[mapId].portals.find(p=>p.z===(side==="attack"?26:-58))!;
          safeSpawn={x:gate.x,y:0,z:gate.z};
        }
        safeSpawn={...safeSpawn,y:groundAt(mapId,safeSpawn.x,safeSpawn.z)};
        validPosition=false;
      }
      const player = new Player({
        ...(validPosition && saved ? {x:saved.x,y:savedY,z:saved.z} : safeSpawn),
        facing: 0,
        hp: saved && saved.hp > 0 ? Math.min(saved.hp, initialStats.maxHp) : initialStats.maxHp,
        maxHp: initialStats.maxHp,
        alive: true, combatState: "idle", targetId: "",
        pkKills: saved?.pkKills ?? 0, pkDeaths: saved?.pkDeaths ?? 0,
        characterId: characterId ? characterId.slice(0, 12) : "",
        characterName: saved?.name ?? "นที",
        level: saved?.level ?? 1, experience: saved?.experience ?? 0,
        pathId: saved?.build?.path ?? "", ancestryId: saved?.build?.ancestry ?? "",
        classSkillReadyAt: saved?.classSkillReadyAt ?? 0,
        talismanReadyAt: saved?.talismanReadyAt ?? 0,
        swordTreeData: JSON.stringify(saved?.swordTree ?? newSwordTree()),
        muayData: JSON.stringify(saved?.muayCooldowns ?? {}),
        muayBookData: JSON.stringify(saved?.muayBook ?? newMuayBook()),
        bladeTalentId: saved?.build?.path === "blade" ? saved.build.bladeTalent ?? talentGroup("blade")!.defaultId : "",
        wardTalentId: saved?.build?.path === "sentinel" ? saved.build.wardTalent ?? DEFAULT_WARD_TALENT : "",
        persistent: Boolean(saved), characterSlot: slot,
        flying: Boolean(validPosition && restoreFlight),
        equippedWeaponId: equippedWeaponId(saved?.inventory) ?? "",
        mapId,
        stamina: Math.min(saved?.stamina ?? initialStats.maxStamina, initialStats.maxStamina),
        mana: Math.min(saved?.mana ?? initialMaxMana,initialMaxMana),
      });

      this.swordTrees.set(client.sessionId, saved?.swordTree ?? newSwordTree());
      this.muayCooldowns.set(client.sessionId, saved?.muayCooldowns ?? {});
      this.muayBooks.set(client.sessionId, saved?.muayBook ?? newMuayBook());
      this.occultBooks.set(client.sessionId, saved?.occultBook ?? newOccultBook());
      if(saved?.bladeBook || player.pathId==="blade")this.bladeBooks.set(client.sessionId, saved?.bladeBook ?? newBladeBook());
      if(saved?.sentinelBook || player.pathId==="sentinel")this.sentinelBooks.set(client.sessionId, saved?.sentinelBook ?? newSentinelBook());
      if (saved?.muayWrapGranted) this.muayWrapGranted.add(client.sessionId);
      this.statAllocations.set(client.sessionId, allocations);
      if (saved?.inventory)this.inventories.set(client.sessionId,saved.inventory);
      this.applyStats(client.sessionId,player, allocations);
      this.state.players.set(client.sessionId, player);
      client.view=new StateView();
      this.syncPlayerViews();
      if((options as Record<string,unknown>)?.warVersion===1)this.warClients.add(client.sessionId);
      if(originalReady)this.originalReliefClients.add(client.sessionId);
      if(reliefReady)this.reliefClients.add(client.sessionId);
      if(terrainReady)this.terrainClients.add(client.sessionId);
      if(riverReady)this.riverClients.add(client.sessionId);
      if(castleReady)this.castleClients.add(client.sessionId);
      if((options as {monsterAutoAttackVersion?:unknown}|undefined)?.monsterAutoAttackVersion===1)this.restApproachClients.add(client.sessionId);
      if(provinceReady)this.provinceClients.add(client.sessionId);
      if(atlasReady)this.atlasClients.add(client.sessionId);
      if(templeReady)this.templeClients.add(client.sessionId);
      if (characterId && accountId && slotIds) {
        if (!saved?.inventory) throw new Error("inventory_migration_missing");
        this.persistentCharacters.set(client.sessionId, characterId);
        this.guildSubscriptions.set(client.sessionId,subscribeGuild(characterId,()=>this.sendGuild(client,characterId)));
        this.inventories.set(client.sessionId, saved.inventory);
        this.activeGuestAccounts.set(client.sessionId, accountId);
        this.guestSlotIds.set(client.sessionId, slotIds);
        if (required && typeof fields.accountSession === "string") this.accountSessions.set(client.sessionId, fields.accountSession);
      }
      this.playerSpawn.set(client.sessionId, safeSpawn);
      this.gates.set(client.sessionId, {
        move: new CommandBucket(RULES.moveBurst, RULES.moveRatePerSecond, this.simulatedMs),
        attack: new CommandBucket(RULES.attackBurst, RULES.attackRatePerSecond, this.simulatedMs),
        summon: new CommandBucket(
          RULES.summonCommandBurst, RULES.summonCommandRatePerSecond, this.simulatedMs
        ),
        climb: new CommandBucket(3, 1, this.simulatedMs),
        dash: new CommandBucket(RULES.dashCommandBurst,
          RULES.dashCommandRatePerSecond, this.simulatedMs),
        flight: new CommandBucket(3, 2, this.simulatedMs),
        chat: new CommandBucket(3, 0.5, this.simulatedMs),
        bugReport: new CommandBucket(1, 1 / 30, this.simulatedMs),
        build: new CommandBucket(3, 1, this.simulatedMs),
        swordTree: new CommandBucket(6, 2, this.simulatedMs),
        occult: new CommandBucket(6, 2, this.simulatedMs),
        possession: new CommandBucket(2, 0.5, this.simulatedMs),
        economy: new CommandBucket(8, 3, this.simulatedMs),
        party: new CommandBucket(6, 2, this.simulatedMs),
        guild: new CommandBucket(6, 2, this.simulatedMs),
      });
      if(characterId){try{guildStore().rename(characterId,player.characterName);notifyGuilds();}catch(error){console.error("MONTRA guild join failed",error);}}
      console.log("MONTRA 3-slot join:", client.sessionId, "room", this.roomId,
        saved ? "persistent" : "transient", "slot", slot);
    } catch (error) {
      this.warSeats.delete(client.sessionId);this.warClients.delete(client.sessionId);
      this.playerSpawn.delete(client.sessionId);
      if (accountId) releaseCharacter(accountId, client.sessionId);
      throw error;
    }
  }

  async onLeave(client: Client, code: CloseCode) {
    const id = client.sessionId;
    this.mountHitSequence.delete(id);this.lastMountMs.delete(id);
    this.accountSessions.delete(id);
    this.clearGrappleCountersFor(id,"disconnect");
    this.clearMuayDefense(id,"cancelled");
    this.releaseMuayFor(id,"disconnect");this.muayGrappleImmunity.delete(id);
    this.clearMuayCombosForTarget(id);
    this.endPossession(id,"owner_left");
    this.buffs.forget(id);
    this.effects.forget(id);
    this.templeClients.delete(id);
    this.atlasClients.delete(id);
    this.crestTurns.delete(id);this.gateActions.delete(id);this.warSeats.delete(id);this.warClients.delete(id);this.warSent.delete(id);
    this.riverClients.delete(id);this.terrainClients.delete(id);this.reliefClients.delete(id);this.originalReliefClients.delete(id);
    this.castleClients.delete(id);
    this.restApproachClients.delete(id);
    this.provinceClients.delete(id);
    this.leaveParty(id);
    const guildCharacter=this.persistentCharacters.get(id);
    if(guildCharacter){this.guildSubscriptions.get(id)?.();this.guildSubscriptions.delete(id);notifyGuilds();}
    for(const [inviteId,invite] of this.guildInvites)if(invite.from===id || invite.to===id){
      this.guildInvites.delete(inviteId);
      this.clients.find(c=>c.sessionId===invite.to)?.send("guild_invitation_closed",{});
    }
    for (const trade of this.trades.values()) if (trade.a===id || trade.b===id) { this.trades.delete(trade.id); this.notifyTrade(trade,"trade_cancelled"); }
    const accountId = this.activeGuestAccounts.get(id);
    // Capture the snapshot BEFORE removing the player from server Schema.
    const saving = this.saveCharacter(id);
    this.pendingCharacterLeaves.set(id, saving);
    this.despawnSummon(id, "owner_left");
    this.lastSummonAt.delete(id);
    this.climbs.delete(id);
    this.flightTransitions.delete(id);
    this.activeDashes.delete(id);
    this.lastDashMs.delete(id);
    this.destinations.delete(id);
    this.attackTargets.delete(id);
    this.lastAttackMs.delete(id);
    this.lastCombatMs.delete(id);this.lastPvpMs.delete(id);this.sentItemCatalog.delete(id);
    this.supportManaCombatUntil.delete(id);
    this.muayMoveIntent.delete(id);this.muayCoreStances.delete(id);this.muayCoreFollowups.delete(id);this.muayCoreSequences.delete(id);this.swordCoreStances.delete(id);this.swordCoreSequences.delete(id);
    this.lastWarpMs.delete(id);
    this.playerRespawnAt.delete(id);
    this.playerSpawn.delete(id);
    this.gates.delete(id);
    this.lastRejectNoticeMs.delete(id);
    // Keep the player and inventory readable until an in-flight potion write
    // and the final save have completed; otherwise the final snapshot is lost.
    this.lastRenameMs.delete(id);
    this.lastSlotListMs.delete(id);
    if (this.state.monster.targetId === id) this.state.monster.targetId = "";
    this.forest.clearTarget(id);
    // Remote player targets cannot remain locked to disconnected sessions.
    for (const [otherId, targetId] of [...this.attackTargets]) {
      if (targetId !== id) continue;
      const attacker = this.state.players.get(otherId);
      if (attacker) this.endAttack(otherId, attacker);
      else this.attackTargets.delete(otherId);
    }
    try {
      await saving;
    } finally {
      this.state.players.delete(id);
      this.pendingItemUses.delete(id);
      this.pendingRewards.delete(id);
      this.statAllocations.delete(id);
      this.swordTrees.delete(id);
      this.muayCooldowns.delete(id);
      this.muayCombos.delete(id);
      this.muayFollowups.delete(id);
      this.muayBooks.delete(id);
      this.occultBooks.delete(id);
      this.bladeBooks.delete(id);
      this.sentinelBooks.delete(id);
      this.sentinelCoreStances.delete(id);this.sentinelStuns.delete(id);this.sentinelStunResists.delete(id);this.sentinelWindups.delete(id);this.sentinelCounters.delete(id);this.sentinelAnchors.delete(id);this.sentinelInterceptions.delete(id);
      for(const [member,link] of this.sentinelInterceptions)if(link.ownerId===id)this.sentinelInterceptions.delete(member);
      this.bladeCloaks.delete(id);
      this.bladeCasts.delete(id);
      this.bladeMarks.delete(id);this.bladeOpenings.delete(id);this.bladeEvades.delete(id);this.bladeWindups.delete(id);
      this.occultMarks.delete(id);
      this.occultSpiritOrders.delete(id);
      this.occultHealingFields.delete(id);
      this.clearOccultCurse(id,"left");
      for (const [target,curse] of this.occultCurses) if (curse.ownerId===id) this.clearOccultCurse(target,"owner_left");
      this.muayWrapGranted.delete(id);
      this.swordCombos.delete(id);
      this.swordGuards.delete(id);
      this.hpRegenRemainder.delete(id);
      this.inventories.delete(id);
      this.itemUseReadyAt.delete(id);
      this.lastInventoryReadMs.delete(id);
      this.lastStatusReadMs.delete(id);
      this.lastWeaponEquipMs.delete(id);
      this.playerSpawn.delete(id);
      this.pendingCharacterLeaves.delete(id);
      this.persistentCharacters.delete(id);
      this.guestSlotIds.delete(id);
      this.activeGuestAccounts.delete(id);
      if (accountId) releaseCharacter(accountId, id);
    }
    console.log("MONTRA S2 leave:", id, code);
  }

  async onDispose() {
    if(this.field)battleRooms.delete(this.field.seq);
    this.buffs.clear();
    this.effects.clear();
    this.trades.clear();
    this.parties.clear();
    this.guildInvites.clear();
    for(const unsubscribe of this.guildSubscriptions.values())unsubscribe();
    this.guildSubscriptions.clear();
    notifyGuilds();
    const pending = [...this.persistentCharacters.keys()].map(async id => {
      try { await (this.pendingCharacterLeaves.get(id) ?? this.saveCharacter(id)); }
      finally {
        const accountId = this.activeGuestAccounts.get(id);
        if (accountId) releaseCharacter(accountId, id);
      }
    });
    await Promise.allSettled(pending);
    this.persistentCharacters.clear();
    this.mountHitSequence.clear();this.lastMountMs.clear();
    this.accountSessions.clear();
    this.inventories.clear();
    this.pendingItemUses.clear();
    this.pendingRewards.clear();
    this.statAllocations.clear();
    this.muayCooldowns.clear();
    this.muayCombos.clear();
    this.muayFollowups.clear();
    this.muayDefenseWindows.clear();
    this.muayGrappleCounters.clear();
    this.muayBooks.clear();
    this.occultBooks.clear();
    this.bladeBooks.clear();
    this.sentinelBooks.clear();
    this.sentinelCoreStances.clear();this.sentinelStuns.clear();this.sentinelStunResists.clear();this.sentinelWindups.clear();this.sentinelCounters.clear();this.sentinelAnchors.clear();this.sentinelInterceptions.clear();
    this.bladeCloaks.clear();
    this.bladeCasts.clear();
    this.bladeMarks.clear();this.bladeOpenings.clear();this.bladeEvades.clear();this.bladeWindups.clear();
    this.occultSpiritPracticed.clear();
    this.occultMarks.clear();
    this.occultSpiritOrders.clear();
    this.occultHealingFields.clear();
    this.occultCurses.clear();
    this.muayWrapGranted.clear();
    this.hpRegenRemainder.clear();
    this.itemUseReadyAt.clear();
    this.lastInventoryReadMs.clear();
    this.lastStatusReadMs.clear();
    this.lastWeaponEquipMs.clear();
    this.activeGuestAccounts.clear();
    this.pendingCharacterLeaves.clear();
    this.guestSlotIds.clear();
    this.lastSlotListMs.clear();
    this.lastRenameMs.clear();
    this.destinations.clear();
    this.attackTargets.clear();
    this.lastAttackMs.clear();
    this.lastCombatMs.clear();this.lastPvpMs.clear();this.sentItemCatalog.clear();
    this.supportManaCombatUntil.clear();
    this.muayMoveIntent.clear();this.muayCoreStances.clear();this.muayCoreFollowups.clear();this.muayCoreSequences.clear();this.swordCoreStances.clear();this.swordCoreSequences.clear();
    this.lastWarpMs.clear();
    this.pendingWarps.clear();
    this.playerRespawnAt.clear();
    this.playerSpawn.clear();
    this.gates.clear();
    this.lastRejectNoticeMs.clear();
    this.monsterNavigator.clear();
    this.lastSummonAt.clear();
    this.lastSummonAttackAt.clear();
    this.state.summons.clear();
    this.climbs.clear();
    this.flightTransitions.clear();
    this.activeDashes.clear();
    this.lastDashMs.clear();
    console.log("MONTRA Elevation room disposed:", this.roomId);
  }
}
