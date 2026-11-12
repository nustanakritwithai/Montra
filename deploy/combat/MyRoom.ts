import { TITAN_BOSS } from "./RegionalBosses.js";
import {newShadowCutState,markShadowCut,returnShadowCut,clearShadowCut,SHADOW_CUT_TRIAL,type ShadowCutState,type ShadowMark,type ShadowPoint} from "./ShadowCutPrototype.js";
import {newFlowingState,useFlowing,advanceFlowing,clearFlowing,consumeFlowingGuard,type FlowingState} from "./FlowingBladesPrototype.js";
import {newCounterCursor,recordChaiyaBlock,validChaiyaOpportunity,grantChaiyaDebuff,consumeChaiyaDebuff,activeChaiyaDebuff,type CounterCursor,type CounterOpportunity,type ChaiyaDebuff} from "./ChaiyaCounterPrototype.js";
import { PrototypeCommandGate } from "./PrototypeCommandGate.js";
import {createAshTrap,observeTrapBatch,selectTrapTargets,createRescueTalisman,observeRescue,expirePrototype,
  type AshTrap,type Position,type TrapMovement,type RescueTalisman,type RescueContext,type Result} from "./OccultPrototypeRules.js";
import {activateFirmGuard,firmGuardMultiplier,newFirmGuardState,updateFirmGuard,type FirmGuardState,type GuardActor} from "./FirmGuardPrototype.js";
import {MIXED_SKILLS_ENABLED,hotbarState,hotbarSchool,availableHotbarSlot,validateHotbarSlots,validateMixedSkillLoadouts,type MixedSkillLoadouts,type HotbarBooks} from './SkillHotbar.js';
import { FORGE_CATALOG } from "./ForgeRules.js";
import { accounts } from "./AccountService.js";
import { Room, matchMaker, type Client, type CloseCode } from "colyseus";
import { WAR_ENTRY_RADIUS, WAR_PARTICIPATION_INTERVAL_MS, WAR_SUPPLY_INTERVAL_MS, warSites, getWarDefinition, warEntryDamageFactor, warParticipationExperience, type Battlefield, type WarSide } from "./TerritoryWar.js";
import {parseGovernmentOrder} from "./TerritoryGovernment.js";
import {parseWarRegistration,SCHEDULED_WARS_ENABLED} from "./WarSchedule.js";
import {parseRouteOrder} from "./WarRoutes.js";
import { RIDGE_PASS } from "./GroundTerrain.js";
import {RIVER_CITY,RIVER_WAREHOUSE_PLOT,riverNodes,riverPosts,riverSupplied} from "./RiverCity.js";
import {CASTLE_ID,CAPTURE_RADIUS,castleObjectives,musterNodes,pilotSpawn,forwardCamps,castleLogistics} from "./CastlePilot.js";
import { Encoder, StateView } from "@colyseus/schema";
import { randomUUID,randomInt } from "node:crypto";
import {ghostPotConfig, GhostWorkerBusy, LegacyGhostWorker, POT_CAPTURE_PROFILE, rollPotCapture, type LegacyGhostSkill} from "./LegacyGhostPot.js";
import {
  addCapturedGhost, findPoolGhost, GHOST_POOL_CAPACITY, makeGhostPool, parseGhostCommand, parseGhostTargetCommand, placePoolGhost,
  type GhostCombatCommand, type GhostPool, type GhostSkillCommand,
} from "./GhostPool.js";
import {FISH_BITE_DELAY,FISH_DURATION,advanceFishing,fishItem,pullFish,validateFishingPosition,type FishingSession} from "./Fishing.js";
import {
  CHARACTER_SAVE_INTERVAL_MS, characterStore, characterIdFromToken,
  claimCharacter, releaseCharacter, getGuestToken, parseCharacterName,
  parseCharacterSlot, CHARACTER_SLOTS,
} from "./CharacterStore.js";
import { MyRoomState, Player, SailingBoat, SummonedGuardian, type Monster } from "./schema/MyRoomState.js";
import { BOAT_DECK, BOAT_LAUNCH_RANGE, BOAT_SHORES, MontraBoats, parseBoatIntent } from "./MontraBoats.js";
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
import {MASTERY_ENABLED,masteryBonuses,masteryCapacity,masteryPreview,encodeMasteryVitals,scaleResource,type MasteryMode} from "./RebirthCombat.js";
import type {CombatStats} from "./Progression.js";
import { classLearningLevel, newRebirthState, recordClassLevel, startNextLife, MAX_REBIRTHS, type RebirthState } from "./Rebirth.js";
import { prepareRebirth } from "./RebirthTransition.js";
import { FOREST_OBJECTIVES, objectiveRanger, objectiveAvailable, advanceForestObjective, parseForestObjectiveId, type ForestObjective } from "./ForestObjectives.js";
import { worldDirector, type DirectorEvent } from "./WorldDirector.js";
import {parseGuideQuestion,fallbackGuideSelection,selectGuideIntent,guideGate,type GuideSite} from "./TyphoonGuide.js";
import {guideAnswer,type GuideWar} from "./GuideAnswers.js";
import {questChoices,questAdvice,preferredQuestId,type QuestChoice} from "./QuestAdvisor.js";
import { isAtlasMap } from "./WorldAtlas.js";
import { TEMPLE_ID } from "./TempleMap.js";
import { DEFAULT_MAP_ID, HOME_MAP, HOME_BUILD_GRID, homeMapId, homeWallBlocks, isHomeMap, getWorldMap, groundAt, surfaceLayer, meleeHeightBlocked, onMapGround, getSafeMapSpawn, isSafeWorldPoint, isRestArea, isWorldSegmentClear, VILLAGE_ARRIVALS, WORLD_ROOM_CAPACITY, WORLD_MAPS, WORLD_EXPANSION, type WorldPortal } from "./WorldMaps.js";
import { provinceShotClear, segmentIntersectsExpandedWall } from "./WorldMaps.js";
import { crestCorners, onRampart, wallRing } from "./StrategicProvinces.js";
import { checkWarp, checkWarpDestination, type WarpContext, WARP_COMBAT_LOCK_MS, WARP_COOLDOWN_MS } from "./WarpRules.js";
import { parseChatMessage } from "./ChatRules.js";
import { saveBugReport } from "./BugReports.js";
import { BuffBook, POSSESSION_BUFF, possessionCoolingDown, rememberPossessionCooldown } from "./Buffs.js";
import { BUILD_CATALOG, DEFAULT_WARD_TALENT, DUAL_SWORD, PATHS, isOccultPath, talentGroup, classSkill, parseBuild, type CharacterBuild, type PathId } from "./CharacterBuilds.js";
import { BuffLedger } from "./BuffLedger.js";
import { SEER_CORE, seerCoreProgress, MENDER_CORE, menderCoreProgress, OCCULT_LESSONS, OCCULT_MASTERY_LABELS, OCCULT_MASTERY_REQUIREMENTS, OCCULT_RANKABLE_SKILLS, newOccultBook, occultPoints, occultRankCost, validateOccultBook, type SeerCoreId, type MenderCoreId, type OccultBook, type OccultLesson, type OccultSkillId, type OccultPath, type OccultMastery } from "./OccultRules.js";
import { BLADE_CORE, bladeCoreProgress, BLADE_LESSONS, BLADE_PRACTICE_LABELS, BLADE_RANKABLE_SKILLS, bladePoints, newBladeBook, validateBladeBook, type BladeCoreId, type BladeBook, type BladeLesson, type BladeSkillId } from "./BladeRules.js";
import { SENTINEL_CORE, sentinelCoreProgress, SENTINEL_LESSONS, SENTINEL_PRACTICE_LABELS, SENTINEL_RANKABLE_SKILLS, SENTINEL_CONTROL, sentinelPoints, newSentinelBook, validateSentinelBook, type SentinelCoreId, type SentinelBook, type SentinelLesson, type SentinelSkillId } from "./SentinelRules.js";
import { calculateModifiedStats, STACKING_RULES } from "./StatModifiers.js";
import { POSSESSION_MODIFIER, TALISMAN, MENDER_PVE_RICE_MULTIPLIER, SWORD_CORE, swordCoreProgress, SWORD_SCHOOLS, SWORD_NODES, SWORD_RANKABLE_SKILLS, SWORD_PVP_DAMAGE_MULTIPLIER, newSwordTree, emptySwordLoadouts, swordPoints, type SwordCoreId, type SwordTree, type SwordSchool } from "./SkillCatalog.js";
import { isMuayFoundation, MUAY_CORE, MUAY_CORE_LEVELS, MUAY_CORE_POINT_LEVELS, MUAY_CORE_MANA_PER_RANK, muayCorePoints, muayCoreManaCost, muayCoreProgress, MUAY_BASE_SKILLS, MUAY_COMBOS, MUAY_COMBO_MOVES, MUAY_COMBO_MULTIPLIER, MUAY_COMBO_WINDOW_MS, MUAY_FOLLOWUPS, MUAY_FOLLOWUP_WINDOW_MS, MUAY_MASTERY_GUIDES, MUAY_MASTERY_LABELS, MUAY_MASTERY_REQUIREMENTS, MUAY_RANKABLE_SKILLS, MUAY_INTERRUPT_MS, MUAY_INTERRUPT_IMMUNITY_MS, MUAY_GRAPPLE_HOLD_MS, MUAY_GRAPPLE_ESCAPE_STAMINA, MUAY_GRAPPLE_COUNTER_STAMINA, MUAY_GRAPPLE_COUNTER_WINDOW_MS, MUAY_GRAPPLE_COUNTER_RANGE, MUAY_PVP_COMBO_MULTIPLIER, MUAY_PVP_DAMAGE_MULTIPLIER, MUAY_LESSONS, MUAY_SCHOOLS, MUAY_SKILLS, MUAY_WRAP_ID, advanceMuayCombo, countsMuayTechnique, muayPoints, newMuayBook, newMuayLoadouts, type MuayCoreId, type MuayBook, type MuaySchool, type MuayComboState, type MuayLessonId, type MuaySkillId, type MuayCooldowns } from "./MuayRules.js";
import { WORKBENCH_GOLD, personalItem, materialTier, wearsWraps, wearsTwinSwords, monsterCardDrop, bossTreasure, type MaterialId } from "./PersonalItems.js";
import { CATALOG_PAGES, practiceSite, catalogPageWithRates, cardCatalogWithRates } from "./MonsterLoot.js";
import {dynamicBalanceRevision} from "./DynamicBalance.js";
import { parseSocketOrder, DRILL_COST } from "./CardSockets.js";
import {personalGearGuides} from "./GearGuides.js";
import {getResourceNode,harvestableFrom,REFINE_INPUT} from "./WorldResources.js";
import { CRAFT_QUEUE_LIMIT, CRAFT_QUEUE_MS_PER_ITEM, MARKET_FAVORITE_LIMIT, MAX_CRAFT_QUANTITY } from "./EconomyStore.js";
import { parseMarketHistory, parseMarketFavorite, parseSellMaterial, parseSalvage, parseCraft, parseCraftClaim, parseHomeAction, parseEconomyRequest, parseForge, parseClaimForgeCopy, parseMarketCreate, parseMarketAction, parseMarketBrowse, parseAuctionCreate, parseAuctionBid, parseAuctionAction, parseAuctionCredit, parseStarterSupply, parseTradeRequest, parseTradeId, parseTradeOffer } from "./EconomyRules.js";
import type { TradeOffer } from "./EconomyStore.js";
import { guildStore, guildOnline, notifyGuilds, subscribeGuild, parseGuildName, GUILD_MAX_MEMBERS } from "./GuildStore.js";
import {
  CITY_CONSTRUCTION_ENABLED, CITY_MINING_CONSTRUCTION_ENABLED, CITY_MINING_ENABLED, CITY_MINING_PRODUCT, CITY_MINING_SITE,
  CITY_PRODUCTION_ENABLED, CITY_PRODUCTION_SITE,
  CITY_GOVERNANCE_ENABLED, CITY_HAUL_ENABLED, CITY_LOCAL_MARKET_ENABLED, CITY_MARKET_CONTRIBUTIONS_ENABLED,
  CITY_MISSIONS_ENABLED, CITY_NEUTRAL_MARKET_ENABLED, CITY_NEUTRAL_RETURN_MARKET_ENABLED, CITY_PURCHASE_ENABLED,
  CITY_RETURN_MARKET_ENABLED, CITY_SITES, CITY_SUPPLY_ENABLED, CITY_TRADE_CONTRACTS_ENABLED, CITY_WORKSHOP_ENABLED,
  isCityContractOrder, isCityHaulOrder, isCityMarketOrder, isCityMissionOrder, isCityNeutralMarketOrder, isCityNeutralReturnOrder,
  isCityPurchaseOrder, isCitySupplyOrder,
  isWarehouseOrder, parseCityOrder,
  type CityContractOrder, type CityHaulOrder, type CityMarketContributionOrder, type CityMarketOrder,
  type CityMissionOrder, type CityNeutralMarketOrder, type CityNeutralReturnOrder,
  type CityOrder, type CityPolicyOrder, type CityPurchaseOrder,
  type CitySite, type CitySupplyOrder,
} from "./CityProductionRules.js";
import { PartyManager, PARTY_XP_RADIUS, type Party } from "./PartyManager.js";
import { partyMonsterShares, type PartyRewardMember } from "./PartyMonsterRewards.js";
import type { MonsterTier } from "./MonsterProfiles.js";
import {huntEventDirector,huntBonus,type HuntMap} from "./HuntEvents.js";
import { PROGRESSION, SKILL_RANK_LEVELS, SKILL_RANK_PRACTICE, skillRankCost, skillRankMultiplier, supportRankMultiplier, addExperience, calculateDamage, calculateStats, cycleExperience, emptyAllocations,
  monsterExperience, pointsAvailable, xpForNextLevel, type Allocations } from "./Progression.js";
import {
  POTION_COOLDOWN_MS, grantRewardPotion, grantStackReward, bossAccessoryReward, SHRINE_RECIPE, SHRINE_SHARD, SHRINE_GLAIVE, parseUseItemCommand,
  useInventoryItem, parseEquipWeaponCommand, equipInventoryWeapon, equipBody, parseBodyCommand, equippedStats, equipmentRatings, gearHealing, spiritGearPower, gearMana, overflowStaminaRegen, practiceLoot,
  equippedWeaponId, gearLook, weaponBonuses, type InventorySnapshot,
} from "./ItemRules.js";

import { ForestEncounters, legacyCapturedGhostSource, type MonsterCombatTarget } from "./ForestEncounters.js";
import { mapsWithServiceNpcs, serviceNpcsFor } from "./ServiceNpcs.js";

type AdvancedSkillFamily = "sword" | "muay" | "blade" | "sentinel" | "occult";
const REPLACEMENT_SKILL_FAMILIES = {
  flowing_blades: "sword",
  chaiya_advanced_counter: "muay",
  shadow_cut: "blade",
  firm_guard: "sentinel",
  seer_ash_rice: "occult",
  seer_spirit_rain: "occult",
  mender_deep_heal: "occult",
  mender_deep_circle: "occult",
} as const satisfies Record<string,AdvancedSkillFamily>;

function replacementSkillFamily(skillId:unknown):AdvancedSkillFamily|undefined {
  if(typeof skillId==="string" && Object.hasOwn(REPLACEMENT_SKILL_FAMILIES,skillId))
    return REPLACEMENT_SKILL_FAMILIES[skillId as keyof typeof REPLACEMENT_SKILL_FAMILIES];
}

type DefaultMonsterHit = Readonly<{sequence:number;targetId:string;target:Player}>;
type RewardPrey = Readonly<Pick<Monster,"id"|"mapId"|"level"|"x"|"y"|"z">>;
type MonsterDefeat = Readonly<{winnerId:string;monster:Monster;prey:RewardPrey;hitSeq:number}>;

type PrototypeShadowEndReason = "expired" | "invalidated";
type PrototypeShadowView = Readonly<{playerId:string;markSeq:number;origin:ShadowPoint;startedAtServerMs:number;expiresAtServerMs:number;durationMs:number}>;
const HEALING_FIELD_INTERVAL_MS=2000;
const HEALING_FIELD_DURATION_MS=6500;
const MOVING_CIRCLE_MAX_TARGETS=3;
const MOVING_CIRCLE_POWER_FACTOR=0.6;
const SPIRIT_RAIN_HOP_RANGE=4;
const SPIRIT_RAIN_HIT_FACTORS=[1,0.75,0.5] as const;

type OccultHealingField={mapId:string;until:number;nextTick:number;power:number;range:number} &
  ({kind:"fixed";x:number;y:number;z:number} | {kind:"moving";castId:string;startedAt:number});
type MovingHealingField=Extract<OccultHealingField,{kind:"moving"}>;
type PrototypeCircleView=Readonly<{castId:string;ownerId:string;mapId:string;position:Position;range:number;expiresAt:number}>;
type PrototypeOccultView = Readonly<{
  ash:readonly Pick<AshTrap,"castId"|"ownerId"|"mapId"|"position"|"armedAt"|"expiresAt">[];
  rescues:readonly Pick<RescueTalisman,"castId"|"ownerId"|"targetId"|"mapId"|"expiresAt">[];
  circles:readonly PrototypeCircleView[];
}>;
type PrototypeSkillNotice = Readonly<{
  version: 1;
  phase: string;
  playerId: string;
  targetId: string;
  skillId: string;
  seq?: number;
  markSeq?: number;
  castId?: string;
  amount?: number;
  targetIds?: readonly string[];
  reason?: PrototypeShadowEndReason;
  origin?: ShadowPoint;
  destination?: ShadowPoint;
  serverNowMs?: number;
  startedAtServerMs?: number;
  armedAtServerMs?: number;
  expiresAtServerMs?: number;
  durationMs?: number;
}>;
export type PrototypeRoomTransport = Readonly<{
  ready(client:Client, nonce:string|undefined):void;
  confirmed(client:Client):void;
  probeResult(client:Client, seq:number):void;
  shadowState(client:Client, state:Readonly<{version:1;serverNowMs:number;marks:readonly PrototypeShadowView[]}>):void;
  occultState(client:Client,state:PrototypeOccultView & Readonly<{version:1;serverNowMs:number}>):void;
  skill(notice:PrototypeSkillNotice):void;
}>;

const mapsWithServices=Object.fromEntries(Object.entries(mapsWithServiceNpcs()).map(([id,map])=>[
  id, BOAT_SHORES[id] ? {...map, boatDock:{...BOAT_SHORES[id],range:BOAT_LAUNCH_RANGE,deck:BOAT_DECK}} : map,
]));
const worldDefinition=WORLD_EXPANSION?JSON.stringify({version:1,maps:mapsWithServices,combatFeatures:{warBanner:true,meteor:true,titanStrikeRadius:TITAN_BOSS.strikeRadius},homeMap:characterStore.economyEnabled?{...HOME_MAP,buildGrid:HOME_BUILD_GRID}:undefined}):"";
const cityPurchaseIntake = WORLD_EXPANSION && CITY_PRODUCTION_ENABLED && CITY_MINING_ENABLED && CITY_PURCHASE_ENABLED;
const cityMissionIntake = WORLD_EXPANSION && CITY_PRODUCTION_ENABLED && CITY_MINING_ENABLED && CITY_MISSIONS_ENABLED;
const cityHaulIntake = cityMissionIntake && CITY_HAUL_ENABLED;
const cityMarketIntake = WORLD_EXPANSION && CITY_PRODUCTION_ENABLED && CITY_MINING_ENABLED && CITY_LOCAL_MARKET_ENABLED;
const cityMarketContributionIntake = cityMarketIntake && CITY_MARKET_CONTRIBUTIONS_ENABLED;
const cityReturnMarketIntake = cityMarketIntake && CITY_RETURN_MARKET_ENABLED;
const cityNeutralMarketIntake = cityMarketIntake && CITY_NEUTRAL_MARKET_ENABLED;
const cityNeutralReturnMarketIntake = cityNeutralMarketIntake && cityReturnMarketIntake && CITY_NEUTRAL_RETURN_MARKET_ENABLED;
const cityContractIntake = cityMarketIntake && cityMissionIntake && CITY_TRADE_CONTRACTS_ENABLED;
function cityBrokerAt(site: CitySite | null, x: number, z: number): CitySite | null {
  return site && serviceNpcsFor(site).some(npc => npc.role === "market" &&
    Math.hypot(x - npc.x, z - npc.z) <= npc.radius) ? site : null;
}
function syncCityProduction(now: number, site: CitySite = CITY_PRODUCTION_SITE) {
  const guilds = guildStore(), store = characterStore.economy;
  if (site === CITY_MINING_SITE)
    store.finishCitySupplyRepairs(repair => guilds.war.government.repairWithCitySupply(repair, now));
  const pending = guilds.pendingCityDisbands();
  for (const disband of pending) guilds.settleCityDisband(store, disband);
  if (pending.length) notifyGuilds();
  return store.syncCity(previous => guilds.war.government.cityOwnership(previous, site), now, site);
}
function sweepCityProduction(now: number): void {
  for (const site of CITY_SITES) {
    try { syncCityProduction(now, site); }
    catch (error) { console.error("MONTRA city production settlement failed", site, error); }
  }
}
function encodeBattleWorld(maps:Readonly<Record<string,unknown>>):string {
  return JSON.stringify({version:1,maps,combatFeatures:{warBanner:true}},(key,value)=>key==="boss" && value?.id?.startsWith("boss_")?undefined:value);
}
const battlefieldWorldDefinition=WORLD_EXPANSION?encodeBattleWorld(WORLD_MAPS):"";
const isolatedBattleWorldDefinitions=new Map<string,string>();
for(const site of Object.keys(warSites)){
  const arena=getWarDefinition(site)?.isolated,map=WORLD_MAPS[site];
  if(!arena || !map)continue;
  const restAreas=[{...arena.attack,radius:4,name:"ฐานฝ่ายบุก"},{...arena.defend,radius:4,name:"ฐานฝ่ายรับ"}];
  const strategic=map.strategic && {...map.strategic,safeRoads:[] as number[],relay:arena.relay,sites:[arena.flag]};
  isolatedBattleWorldDefinitions.set(site,encodeBattleWorld({
    ...WORLD_MAPS,[site]:{...map,strategic,battlefield:true,portals:[],restAreas,camps:[],boss:undefined,guardian:undefined},
  }));
}
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
const METEOR = {range: 3.5, cooldownMs: 15_000, stamina: 20, maxTargets: 5, power: 1.2} as const;
const WAR_BANNER = {radius: 12, durationMs: 60_000, cooldownMs: 15_000, defenseBonus: 0.10} as const;

type GhostOrder = {targetId: string; target: Monster | Player; targetName: string};
type ActiveGhost = {
  instanceId: string; generation: number; combatId: string;
  level: number; defense: number; magicDefense: number; attackPower: number;
  basicRange: number; basicCooldownMs: number; skills: LegacyGhostSkill[];
  order?: GhostOrder;
};
type GhostCombatActor = {ownerId: string; guardian: SummonedGuardian; active: ActiveGhost};
type GhostSkillUsage = {uses: number; readyAt: number};

export class MyRoom extends Room<{ state: MyRoomState }> {
  maxClients:number = WORLD_ROOM_CAPACITY;
  state = new MyRoomState();

  private readonly boatWorld = new MontraBoats();
  private readonly ghostConfig = ghostPotConfig();
  private ghostWorker?: LegacyGhostWorker;
  private readonly ghostPools = new Map<string, GhostPool>();
  private readonly activeGhosts = new Map<string, ActiveGhost>();
  private readonly ghostHealth = new Map<string, Map<string, number>>();
  private readonly ghostSkillUsage = new Map<string, Map<string, GhostSkillUsage>>();
  private readonly ghostAttackAt = new Map<string, number>();
  private readonly ghostControlPending = new Set<string>();
  private readonly ghostCaptureTargets = new Set<string>();
  private readonly ghostCaptureReadyAt = new Map<string, number>();

  private forest = new ForestEncounters(this.state.monsters);
  private getMonster(id:string): Monster | undefined { return id === RULES.monsterId ? this.state.monster : this.state.monsters.get(id); }
  private simulatedMs = 0;
  private field?:Battlefield;
  private warSeats=new Map<string,{guild:string;side:WarSide;camp:number}>();
  private warCivilianPositions=new Map<string,Pick<CharacterSnapshot,"mapId"|"x"|"y"|"z">>();
  private warParticipation=new Map<string,{sample:number;activeMs:number;supplyMs:number;lastAction:number;lastObjective:number;lastSupport?:number}>();
  private warCargo=new Map<string,{seq:number;token:string;x:number;z:number;started:number}>();
  private warClients=new Set<string>();
  private warSent=new Map<string,string>();
  private nextWarSample=0;
  private previousPilotSample?:number;
  private closedFieldGates=new Set<string>();
  private gateActions=new Map<string,number>();
  private battleActive=false;
  private destinations = new Map<string, Vec2>();
  private crestTurns=new Map<string,Vec2[]>();
  private activeDashes = new Map<string, ActiveDash>();
  private lastDashMs = new Map<string, number>();
  private attackTargets = new Map<string, string>();
  private mountHitSequence = new Map<string, number>();
  private readonly replacementSkillsEnabled = process.env.MONTRA_REPLACEMENT_SKILLS === "1";
  private readonly replacementSkillNotices: Array<{notice: PrototypeSkillNotice; mapId: string}> = [];
  private prototypeSessions = new Map<string, PrototypeCommandGate>();
  private prototypeBuckets = new Map<string, CommandBucket>();
  private prototypeGameplaySessions = new Set<string>();
  private prototypeGameplayChallenges = new Map<string,string>();
  private prototypeFlowing = new Map<string,FlowingState>();
  private prototypeShadows = new Map<string,ShadowCutState>();
  private prototypeFirmGuards = new Map<string,FirmGuardState>();
  private prototypeAshTraps = new Map<string,AshTrap>();
  private prototypeRescues = new Map<string,RescueTalisman>();
  private monsterHitSequence = 0;
  private pendingDefaultMonsterHits = new WeakSet<DefaultMonsterHit>();
  private pendingMonsterDefeats = new WeakSet<MonsterDefeat>();
  private forestStrikeHits = new WeakMap<Monster,{at:number;targets:Set<string>}>();
  private prototypeCounters = new Map<string,CounterCursor>();
  private prototypeOpportunities = new Map<string,CounterOpportunity>();
  private prototypeDebuffs = new Map<string,ChaiyaDebuff>();
  protected prototypeGameplayEnabled(): boolean {
    return this.replacementSkillsEnabled && !this.field;
  }
  protected requireAllPrototypeClients(): boolean {
    return false;
  }
  private prototypeGameplayAllowed(id:string):boolean {
    return this.prototypeGameplayEnabled() && this.prototypeGameplaySessions.has(id) &&
      (!this.requireAllPrototypeClients() || this.clients.every(peer=>this.prototypeGameplaySessions.has(peer.sessionId)));
  }
  private clearPrototypeTransient(id:string):void {
    if(this.occultHealingFields.get(id)?.kind==="moving")this.clearOccultHealingField(id);
    this.prototypeFirmGuards.delete(id);
    this.clearAshTrap(id);
    for(const talisman of this.prototypeRescues.values())if(talisman.ownerId===id || talisman.targetId===id)this.clearRescue(talisman);
    const shadow=this.prototypeShadows.get(id);if(shadow)this.endPrototypeShadow(id,shadow,"invalidated");
    const flow=this.prototypeFlowing.get(id);if(flow)this.prototypeFlowing.set(id,clearFlowing(flow));
    this.prototypeOpportunities.delete(id);
    for(const [target,mark] of this.prototypeDebuffs)if(target===id || mark.sourceId===id)this.prototypeDebuffs.delete(target);
    for(const [owner,opp] of this.prototypeOpportunities)if(opp.attackerId===id)this.prototypeOpportunities.delete(owner);
    for(const [owner,state] of this.prototypeFlowing)if(state.pending?.targetId===id)this.prototypeFlowing.set(owner,clearFlowing(state));
  }
  private clearAllPrototypeEffects():void {
    for(const shadow of this.prototypeShadows.values())clearShadowCut(shadow);
    for(const [id,state] of this.prototypeFlowing)this.prototypeFlowing.set(id,clearFlowing(state));
    this.prototypeOpportunities.clear();this.prototypeDebuffs.clear();this.prototypeFirmGuards.clear();this.prototypeAshTraps.clear();this.prototypeRescues.clear();
  }
  private updatePrototypeEffects():void {
    if(!this.prototypeGameplayEnabled()){this.clearAllPrototypeEffects();return;}
    for(const [id,shadow] of this.prototypeShadows){
      const p=this.state.players.get(id);
      if(!p?.alive || p.pathId!=="blade" || this.pendingWarps.has(id) || (shadow.mark && p.mapId!==shadow.mark.point.mapId))this.endPrototypeShadow(id,shadow,"invalidated");
      else if(shadow.mark && this.simulatedMs>=shadow.mark.until)this.endPrototypeShadow(id,shadow,"expired");
    }
    for(const [id,state] of this.prototypeFlowing) {
      const p=this.state.players.get(id);
      if(!p?.alive || p.pathId!=="phutthaisawan" || this.pendingWarps.has(id))this.prototypeFlowing.set(id,clearFlowing(state));
      else this.prototypeFlowing.set(id,advanceFlowing(state,this.simulatedMs));
    }
    this.updatePrototypeFirmGuards();
    for(const [id,opp] of this.prototypeOpportunities)if(this.simulatedMs>=opp.until || !this.state.players.get(id)?.alive)this.prototypeOpportunities.delete(id);
    for(const [id,mark] of this.prototypeDebuffs)if(!activeChaiyaDebuff(mark,this.simulatedMs) || !this.getMonster(id)?.alive)this.prototypeDebuffs.delete(id);
  }
  private sendPrototypeOccultState(client:Client,transport:PrototypeRoomTransport):void {
    const viewer=this.state.players.get(client.sessionId);
    if(!viewer || this.pendingWarps.has(client.sessionId))return;
    const ash:Array<PrototypeOccultView["ash"][number]>=[],rescues:Array<PrototypeOccultView["rescues"][number]>=[];
    for(const trap of this.prototypeAshTraps.values()){
      const {castId,ownerId,mapId,position,armedAt,expiresAt}=trap;
      if(mapId===viewer.mapId && expiresAt>this.simulatedMs && this.ashTrapOwner(trap))
        ash.push({castId,ownerId,mapId,position:{...position},armedAt,expiresAt});
    }
    for(const talisman of this.prototypeRescues.values()){
      const {castId,ownerId,targetId,mapId,expiresAt}=talisman;
      const target=this.state.players.get(targetId);
      if(mapId!==viewer.mapId || expiresAt<=this.simulatedMs || !target?.alive)continue;
      const context=this.rescueContext(talisman,target);
      if(context.mapId===mapId && context.eligible && context.ownerValid)rescues.push({castId,ownerId,targetId,mapId,expiresAt});
    }
    const circles:PrototypeCircleView[]=[];
    for(const [ownerId,field] of this.occultHealingFields){
      if(field.kind!=="moving" || field.mapId!==viewer.mapId || field.until<=this.simulatedMs)continue;
      const owner=this.movingHealingOwner(ownerId);
      if(owner?.mapId===field.mapId)circles.push({castId:field.castId,ownerId,mapId:field.mapId,
        position:{x:owner.x,y:owner.y,z:owner.z},range:field.range,expiresAt:field.until});
    }
    try{transport.occultState(client,{version:1,serverNowMs:this.simulatedMs,ash,rescues,circles});}catch{}
  }

  private ashTrapNotice(trap:AshTrap,phase:"placed"|"triggered"|"expired"|"cleared",targetId:string,targets?:readonly string[]):void {
    try{
      this.prototypeTransport()?.skill({version:1,phase,skillId:"seer_ash_rice",playerId:trap.ownerId,targetId,
        castId:trap.castId,targetIds:targets,origin:{...trap.position,mapId:trap.mapId},serverNowMs:this.simulatedMs,
        armedAtServerMs:trap.armedAt,expiresAtServerMs:trap.expiresAt});
    }catch{/* Trap state and combat are already committed. */}
  }

  private clearAshTrap(id:string):void {
    const trap=this.prototypeAshTraps.get(id);
    if(trap){
      this.prototypeAshTraps.delete(id);
      this.ashTrapNotice(trap,"cleared","");
    }
  }

  private ashTrapOwner(trap:AshTrap):{owner:Player;book:OccultBook}|undefined {
    const id=trap.ownerId,owner=this.state.players.get(id),book=this.occultBooks.get(id);
    if(!owner?.alive || owner.pathId!=="seer" || owner.mapId!==trap.mapId || !book?.learned.seer.includes("seer_ash_rice") ||
      !this.advancedEquipped(id,"seer_ash_rice",book.loadouts.seer.includes("seer_ash_rice")) ||
      this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingRewards.has(id) ||
      this.pendingCharacterLeaves.has(id) || this.isProtectedArea(owner.mapId,owner) || !this.prototypeGameplayAllowed(id))return;
    return {owner,book};
  }

  private updateAshTraps(movements:readonly TrapMovement[]):void {
    for(const [id,trap] of this.prototypeAshTraps){
      const caster=this.ashTrapOwner(trap);
      if(!caster){this.clearAshTrap(id);continue;}
      const {owner,book}=caster;
      const batch=movements.length>1024?movements:movements.map(move=>{
        const monster=move.mapId===trap.mapId?this.getMonster(move.monsterId):undefined;
        return {...move,eligible:Boolean(move.eligible && monster?.alive && this.sameCombatMap(id,move.monsterId) &&
          this.bodyPathClear(trap.mapId,trap.position,move.current))};
      });
      const result=observeTrapBatch(trap,{now:this.simulatedMs,ownerValid:true,movements:batch});
      if(result.state)continue;
      this.prototypeAshTraps.delete(id);
      if(result.event?.type!=="trap_triggered"){
        this.ashTrapNotice(trap,"expired","");
        continue;
      }
      const event=result.event;
      const targets=selectTrapTargets(event,[this.state.monster,...this.state.monsters.values()].map(monster=>
        ({id:monster.id,mapId:monster.mapId,alive:monster.alive,position:monster})),candidate=>
        this.sameCombatMap(id,candidate.id) && this.bodyPathClear(trap.mapId,trap.position,candidate.position));
      const lesson=OCCULT_LESSONS.seer_ash_rice;
      const attack=this.masteryPower(owner,"pve","magicAtk",weaponBonuses(this.inventories.get(id),"pve").ranged);
      const power=lesson.power*skillRankMultiplier(book.ranks,"seer_ash_rice");
      for(const targetId of targets){
        const monster=this.getMonster(targetId);
        if(!monster?.alive)continue;
        this.recordCombat(id,targetId);
        const mark=this.occultMarks.get(id);
        const marked=mark?.targetId===targetId && mark.until>this.simulatedMs;
        this.occultDamage(id,targetId,calculateDamage(attack*power*(marked?1.3:1),monster.defense,monster.level),false,"direct");
      }
      if(targets.length){
        this.recordOccultTraining(id,"seer",["rice"]);
        this.ashTrapNotice(trap,"triggered",event.targetId,targets);
      }else this.ashTrapNotice(trap,"cleared","");
    }
  }

  private rescueNotice(talisman:RescueTalisman,phase:"placed"|"triggered"|"expired"|"cleared",amount?:number):void {
    try{
      this.prototypeTransport()?.skill({version:1,phase,skillId:"mender_deep_heal",playerId:talisman.ownerId,
        targetId:talisman.targetId,castId:talisman.castId,amount,serverNowMs:this.simulatedMs,expiresAtServerMs:talisman.expiresAt});
    }catch{/* The next state patch still carries the authoritative HP. */}
  }

  private clearRescue(talisman:RescueTalisman):void {
    this.prototypeRescues.delete(talisman.targetId);
    this.rescueNotice(talisman,"cleared");
  }

  private rescueContext(talisman:RescueTalisman,target:Player):RescueContext {
    const {ownerId,targetId,mapId}=talisman;
    const owner=this.state.players.get(ownerId),book=this.occultBooks.get(ownerId);
    const available=(id:string)=>!this.pendingWarps.has(id) && !this.pendingItemUses.has(id) &&
      !this.pendingRewards.has(id) && !this.pendingCharacterLeaves.has(id);
    return {targetId,mapId:target.mapId,alive:target.alive,eligible:available(targetId),hp:target.hp,maxHp:target.maxHp,
      ownerValid:Boolean(owner?.alive && owner.pathId==="mender" && owner.mapId===mapId && available(ownerId) &&
        this.prototypeGameplayAllowed(ownerId) && book?.learned.mender.includes("mender_deep_heal") &&
        this.advancedEquipped(ownerId,"mender_deep_heal",book.loadouts.mender.includes("mender_deep_heal")) &&
        (ownerId===targetId || this.parties.get(ownerId)?.members.includes(targetId)))};
  }

  private finishRescue(talisman:RescueTalisman,target:Player,result:Result<RescueTalisman>):void {
    if(result.state)return;
    this.prototypeRescues.delete(talisman.targetId);
    const event=result.event;
    if(event?.type==="rescue_triggered" || event?.type==="rescue_expired"){
      target.hp=Math.min(target.maxHp,target.hp+event.amount);
      this.recordOccultTraining(talisman.ownerId,"mender",["healing"]);
      void this.saveCharacter(talisman.targetId);
      this.rescueNotice(talisman,event.type==="rescue_triggered"?"triggered":"expired",event.amount);
    }else this.rescueNotice(talisman,"expired");
  }

  private resolveRescueAfterDamage(id:string,target:Player,damage:number):void {
    if(damage<=0 || target.hp<=0 || !target.alive)return;
    const talisman=this.prototypeRescues.get(id);
    if(!talisman)return;
    const context=this.rescueContext(talisman,target);
    if(context.mapId!==talisman.mapId || !context.eligible || !context.ownerValid){this.clearRescue(talisman);return;}
    this.finishRescue(talisman,target,observeRescue(talisman,{...context,now:this.simulatedMs}));
  }

  private updateRescues():void {
    for(const talisman of this.prototypeRescues.values()){
      const target=this.state.players.get(talisman.targetId);
      if(!target){this.clearRescue(talisman);continue;}
      const context=this.rescueContext(talisman,target);
      if(!context.alive || context.mapId!==talisman.mapId || !context.eligible || !context.ownerValid){this.clearRescue(talisman);continue;}
      this.finishRescue(talisman,target,expirePrototype(talisman,this.simulatedMs,context));
    }
  }

  private firmGuardActor(id:string,player:Player):GuardActor {
    const eligible=player.pathId==="sentinel" && !player.flying && !player.mounted && onMapGround(player) &&
      !this.isProtectedArea(player.mapId,player) && !this.pendingWarps.has(id) && !this.pendingItemUses.has(id) &&
      !this.pendingRewards.has(id) && !this.pendingCharacterLeaves.has(id) && !this.climbs.has(id) &&
      !this.activeDashes.has(id) && !this.flightTransitions.has(id) && !this.sentinelStuns.has(id) && !this.muayControlled(id) &&
      this.prototypeGameplayAllowed(id);
    return {id,point:{x:player.x,y:player.y,z:player.z,mapId:player.mapId},alive:player.alive,eligible};
  }

  private updatePrototypeFirmGuards():void {
    for(const [id,state] of this.prototypeFirmGuards){
      const player=this.state.players.get(id);
      if(player)updateFirmGuard(state,this.firmGuardActor(id,player),player.facing,this.simulatedMs);
      if(!player || !state.guard)this.prototypeFirmGuards.delete(id);
    }
  }

  private protectMonsterHit(sequence:number,targetId:string,target:Player,monster:Monster):{id:string;factor:number}|undefined {
    if(!this.prototypeFirmGuards.size)return;
    const ally:GuardActor={id:targetId,point:target,alive:target.alive,
      eligible:!target.flying && onMapGround(target) && !this.pendingItemUses.has(targetId) &&
        !this.pendingRewards.has(targetId) && !this.pendingCharacterLeaves.has(targetId)};
    const attacker:GuardActor={id:monster.id,point:monster,alive:monster.alive,eligible:true};
    const party=this.parties.get(targetId);
    // Self first, followed by the first eligible guard in party order.
    for(const id of new Set([targetId,...(party?.members ?? [])])){
      const state=this.prototypeFirmGuards.get(id),guardian=this.state.players.get(id);
      if(!state?.guard || !guardian)continue;
      const result=firmGuardMultiplier(state,this.simulatedMs,sequence,this.firmGuardActor(id,guardian),guardian.facing,
        ally,attacker,this.sameCombatMap(id,monster.id),(from,to,enemy)=>
          this.bodyPathClear(from.mapId,from,to) && this.bodyPathClear(from.mapId,from,enemy));
      if(result.kind==="protected")return {id,factor:result.factor};
    }
  }

  private finishFirmGuardProtection(id:string,targetId:string):void {
    if(this.state.players.get(id)?.alive)this.sentinelCounters.set(id,this.simulatedMs+3000);
    this.recordSentinelPractice(id,"guard");
    this.prototypeNotice("protected",id,targetId,"firm_guard");
  }

  private prototypeMonsterDamage(monster:Monster,damage:number):number {
    if(!this.prototypeGameplayEnabled())return damage;
    const mark=this.prototypeDebuffs.get(monster.id);
    if(!mark)return damage;
    if(!this.prototypeGameplayAllowed(mark.sourceId)){
      this.prototypeDebuffs.delete(monster.id);
      return damage;
    }
    const result=consumeChaiyaDebuff(mark,this.simulatedMs,monster.id,"direct_physical",damage);
    if(result.debuff)this.prototypeDebuffs.set(monster.id,result.debuff);else this.prototypeDebuffs.delete(monster.id);
    return result.factor===1?damage:Math.max(1,Math.round(damage*result.factor));
  }
  private prototypeNotice(phase:string,playerId:string,targetId:string,skillId:string):void {
    this.prototypeTransport()?.skill({version:1,phase,playerId,targetId,skillId});
  }
  protected readonly replacementSkillTransport: PrototypeRoomTransport = {
    ready: (client, nonce) => client.send("prototype_protocol_v1_ready", {
      version: 1, gameplayEnabled: nonce !== undefined, ...(nonce ? {nonce} : {}),
    }),
    confirmed: client => client.send("prototype_protocol_v1_confirmed", {version: 1}),
    probeResult: (client, seq) => client.send("prototype_protocol_v1_result", {version: 1, seq, status: "reserved_no_effect"}),
    shadowState: (client, state) => client.send("prototype_shadow_v1_state", state),
    occultState: (client, state) => client.send("prototype_occult_v1_state", state),
    skill: notice => this.publishReplacementSkill(notice),
  };
  protected publishReplacementSkill(notice: PrototypeSkillNotice): void {
    const mapId = notice.origin?.mapId ?? this.state.players.get(notice.playerId)?.mapId;
    if (mapId) this.replacementSkillNotices.push({notice, mapId});
  }
  override broadcastPatch(): boolean {
    const patched = super.broadcastPatch();
    if (!this.replacementSkillNotices.length) return patched;
    // Colyseus flushes per-client patch messages before room-wide hit events.
    // Deliver skill results after the state and hit events, to confirmed viewers only.
    for (const {notice, mapId} of this.replacementSkillNotices.splice(0)) {
      for (const client of this.clients) {
        if (!this.prototypeGameplaySessions.has(client.sessionId) || this.state.players.get(client.sessionId)?.mapId !== mapId) continue;
        try { client.send("prototype_skill_v1", notice); }
        catch { /* Combat is committed. A disconnected observer can request current state on rejoin. */ }
      }
    }
    return patched;
  }
  protected prototypeTransport(): PrototypeRoomTransport | undefined {
    return this.prototypeGameplayEnabled() ? this.replacementSkillTransport : undefined;
  }
  private acknowledgePrototypeProtocol(client: Client, fields: Record<string, unknown>): void {
    const transport=this.prototypeTransport();
    const id=client.sessionId;
    if (!transport || fields.prototypeProtocolVersion !== 1 || this.prototypeSessions.has(id)) return;
    const nonce=this.prototypeGameplayEnabled() && fields.prototypeGameplayVersion===1 ? randomUUID() : undefined;
    try {
      transport.ready(client,nonce);
      if(nonce)this.prototypeGameplayChallenges.set(id,nonce);
      this.prototypeSessions.set(id,new PrototypeCommandGate());
      this.prototypeBuckets.set(id,new CommandBucket(4,1,this.simulatedMs));
    } catch { this.clearPrototypeTransportSession(id); }
  }
  private clearPrototypeTransportSession(id:string):void {
    this.prototypeSessions.delete(id);
    this.prototypeBuckets.delete(id);
    this.prototypeGameplayChallenges.delete(id);
    this.prototypeGameplaySessions.delete(id);
  }
  protected handlePrototypeProtocol(client: Client, message: unknown): void {
    const transport=this.prototypeTransport();
    if (!transport) return;
    const gate = this.prototypeSessions.get(client.sessionId);
    const bucket = this.prototypeBuckets.get(client.sessionId);
    // Count malformed messages too, before any payload inspection, to prevent bypass.
    if (!gate || !bucket || !bucket.consume(this.simulatedMs)) return;
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    const proto = Object.getPrototypeOf(message);
    if (proto !== Object.prototype && proto !== null) return;
    const keys = Reflect.ownKeys(message);
    const action = Object.getOwnPropertyDescriptor(message, "action");
    if(!action || !("value" in action))return;
    if(action.value==="confirm_gameplay"){
      const nonce=Object.getOwnPropertyDescriptor(message,"nonce");
      const id=client.sessionId, challenge=this.prototypeGameplayChallenges.get(id);
      if(keys.length!==2 || !this.prototypeGameplayEnabled() || !challenge || !nonce ||
         !("value" in nonce) || nonce.value!==challenge)return;
      try {transport.confirmed(client);}catch{return;}
      this.prototypeGameplayChallenges.delete(id);
      this.prototypeGameplaySessions.add(id);
      // Admission and initial snapshots leave room for the first cast and its follow-up.
      this.prototypeBuckets.set(id, new CommandBucket(6, 1, this.simulatedMs));
      return;
    }
    if(action.value==="occult_state"){
      if(keys.length===1 && this.prototypeGameplayEnabled() && this.prototypeGameplaySessions.has(client.sessionId))
        this.sendPrototypeOccultState(client,transport);
      return;
    }
    if(action.value==="shadow_state"){
      if(keys.length===1 && this.prototypeGameplayEnabled() && this.prototypeGameplaySessions.has(client.sessionId))
        this.sendPrototypeShadowState(client,transport);
      return;
    }
    const seq = Object.getOwnPropertyDescriptor(message, "seq");
    if(!seq || !("value" in seq))return;
    if(action.value==="probe") {
      if(keys.length!==2 || gate.reserve(seq.value)!=="accepted")return;
      try {transport.probeResult(client,seq.value);}catch{}
      return;
    }
    const skillId=action.value==="shadow_cut_return"?"shadow_cut":action.value;
    const family=replacementSkillFamily(skillId);
    if(!family || !this.prototypeGameplayAllowed(client.sessionId))return;
    if(action.value==="firm_guard" || action.value==="shadow_cut_return" || action.value==="mender_deep_circle"){
      if(keys.length===2 && gate.reserve(seq.value)==="accepted")
        this.dispatchAdvancedSkill(client,{skillId},family,seq.value);
      return;
    }
    const target=Object.getOwnPropertyDescriptor(message,"targetId");
    if(keys.length!==3 || !target || !("value" in target) || typeof target.value!=="string" || !target.value || target.value.length>256)return;
    if(gate.reserve(seq.value)==="accepted")this.dispatchAdvancedSkill(client,{skillId,targetId:target.value},family,seq.value);
  }

  private dispatchAdvancedSkill(client:Client,message:unknown,family:AdvancedSkillFamily,sequence?:number):void {
    const skillId=(message as {skillId?:unknown}|null)?.skillId;
    const replacement=replacementSkillFamily(skillId)===family;
    if(sequence===undefined){
      const id = client.sessionId;
      if (replacement && this.prototypeGameplayEnabled() &&
        (this.requireAllPrototypeClients() || this.prototypeGameplaySessions.has(id) || this.prototypeGameplayChallenges.has(id)))
        return this.reject(client, "prototype_protocol_required");
    } else if(!replacement || !this.prototypeGameplayAllowed(client.sessionId))return;
    if(this.blockMounted(client) || !this.hotbarCastAllowed(client,message,"advanced"))return;
    switch(family){
      case "sword": return this.castSwordSkill(client,message,sequence);
      case "muay": return this.castMuaySkill(client,message,sequence);
      case "blade": return this.castBladeSkill(client,message,sequence);
      case "sentinel": return this.castSentinelSkill(client,message,sequence);
      case "occult": return this.castOccultSkill(client,message,sequence);
    }
  }

  private prototypeShadowFor(id:string):ShadowCutState {
    const state=this.prototypeShadows.get(id)??newShadowCutState();
    this.prototypeShadows.set(id,state);
    if(state.mark && this.simulatedMs>=state.mark.until)this.endPrototypeShadow(id,state,"expired");
    return state;
  }

  private returnPrototypeShadow(client:Client,player:Player,state:ShadowCutState,seq:number):void {
    const id=client.sessionId,mark=state.mark;
    const result=returnShadowCut(state,{point:{x:player.x,y:player.y,z:player.z,mapId:player.mapId},alive:player.alive,eligible:true},this.simulatedMs,seq,(from,to)=>this.prototypeShadowPathClear(player,from,to));
    if(!result){
      if(mark && !state.mark)this.publishPrototypeShadowEnd(id,mark,"invalidated");
      return this.reject(client,"prototype_return_unavailable");
    }
    this.startSkillAction(id,player,"idle");this.destinations.delete(id);this.attackTargets.delete(id);player.targetId="";
    this.moveOnSurface(player,result.x,result.z);
    if(mark)this.prototypeShadowNotice("return",id,"",seq,mark,{destination:{x:player.x,y:player.y,z:player.z,mapId:player.mapId}});
  }

  private prototypeShadowView(playerId:string,mark:ShadowMark):PrototypeShadowView {
    return {playerId,markSeq:mark.sequence,origin:{...mark.point},startedAtServerMs:mark.until-SHADOW_CUT_TRIAL.durationMs,
      expiresAtServerMs:mark.until,durationMs:SHADOW_CUT_TRIAL.durationMs};
  }
  /** Timings are in the room simulation clock. */
  private prototypeShadowNotice(phase:"marked"|"return"|"cleared",playerId:string,targetId:string,seq:number,mark:ShadowMark,
    detail:{destination?:ShadowPoint;reason?:PrototypeShadowEndReason}={}):void {
    this.prototypeTransport()?.skill({version:1,phase,targetId,skillId:"shadow_cut",seq,
      ...this.prototypeShadowView(playerId,mark),serverNowMs:this.simulatedMs,...detail});
  }
  private publishPrototypeShadowEnd(id:string,mark:ShadowMark,reason:PrototypeShadowEndReason):void {
    try{this.prototypeShadowNotice("cleared",id,"",mark.sequence,mark,{reason});}catch{/* A later snapshot is authoritative. */}
  }
  private endPrototypeShadow(id:string,state:ShadowCutState,reason:PrototypeShadowEndReason):void {
    const mark=state.mark;if(!mark)return;
    clearShadowCut(state);
    this.publishPrototypeShadowEnd(id,mark,reason);
  }
  private sendPrototypeShadowState(client:Client,transport:PrototypeRoomTransport):void {
    const viewer=this.state.players.get(client.sessionId);if(!viewer)return;
    const marks:PrototypeShadowView[]=[];
    for(const [id,state] of this.prototypeShadows){
      const mark=state.mark,owner=this.state.players.get(id);
      if(mark && mark.until>this.simulatedMs && owner?.alive && owner.pathId==="blade" &&
        owner.mapId===viewer.mapId && mark.point.mapId===viewer.mapId && !this.pendingWarps.has(id))
        marks.push(this.prototypeShadowView(id,mark));
    }
    try{transport.shadowState(client,{version:1,serverNowMs:this.simulatedMs,marks});}catch{}
  }
  /** Full server-owned occupancy, terrain and collision sweep; no client positions. */
  private prototypeShadowPathClear(player:Player,from:ShadowPoint,to:ShadowPoint):boolean {
    const map=getWorldMap(from.mapId);if(!map || from.mapId!==to.mapId || player.mapId!==from.mapId)return false;
    const layer=surfaceLayer(player),expectedY=groundAt(to.mapId,to.x,to.z)+layer;
    if(Math.abs(expectedY-to.y)>0.001 || !this.canOccupy(to.x,to.z,layer,false,to.mapId) || this.isProtectedArea(to.mapId,to) || !this.bodyPathClear(to.mapId,from,to) || !this.combatSegmentClear(to.mapId,from,to))return false;
    const dx=to.x-from.x,dz=to.z-from.z,distance=Math.hypot(dx,dz);if(distance<1e-8)return true;
    const direction={dx:dx/distance,dz:dz/distance};let pos={x:from.x,z:from.z},moved=0;
    while(moved+1e-7<distance){
      const step=advanceDash(pos,direction,distance-moved,(x,z)=>{
        const next={x,y:groundAt(from.mapId,x,z)+layer,z};
        return this.canOccupy(x,z,layer,false,from.mapId) && !this.isProtectedArea(from.mapId,next) && this.bodyPathClear(from.mapId,from,next) && this.combatSegmentClear(from.mapId,from,next);
      },map.bounds);
      if(step.blocked || step.moved<1e-7)return false;pos={x:step.x,z:step.z};moved+=step.moved;
    }
    return Math.hypot(pos.x-to.x,pos.z-to.z)<0.001;
  }
  private prototypeAttack(id:string,player:Player,target:Monster|Player,targetId:string,monster:Monster|undefined,skillId:"flowing_blades"|"chaiya_advanced_counter"):boolean {
    if(!player.alive || !target.alive)return false;
    const sword=skillId==="flowing_blades",tree=this.swordTrees.get(id),book=this.muayBooks.get(id),pvp=!monster;
    player.facing=facingTo(target.x-player.x,target.z-player.z);this.recordCombat(id,targetId);
    const combo=!sword && book ? this.advanceMuaySkillCombo(id,book.school,targetId,skillId,pvp):1;
    if(!sword)this.recordMuayTraining(id,"strikes");
    const skill=sword?SWORD_NODES.flowing_blades:MUAY_SKILLS.chaiya_advanced_counter;
    // Trial keeps the catalog's existing per-hit power and rank/PvP scaling.
    let attack=this.masteryPower(player,pvp?"pvp":"pve","atk",weaponBonuses(this.inventories.get(id),pvp?"pvp":"pve").melee)*skill.power;
    if(sword)attack*=((tree?.learned.includes("rhythm")?1.05:1)*(monster?skillRankMultiplier(tree?.ranks,skillId):SWORD_PVP_DAMAGE_MULTIPLIER));
    else attack*=combo*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:skillRankMultiplier(book?.ranks,skillId));
    const defense=monster?monster.defense:this.masteryPower(target as Player,"pvp","def");
    let damage=calculateDamage(attack,defense,target.level);
    if(monster){this.hitMonsterWithSpell(id,monster,damage,sword?"sword":"muay");if(!sword && book)this.recordMuayMastery(id,book.school,countsMuayTechnique(book.school,skillId,false),combo>1);}
    else {
      const victim=target as Player;damage=this.directGuardDamage(targetId,player,damage);
      if(!this.applyPlayerHit(player,targetId,victim,damage,()=>{
        this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:sword?"sword":"muay"},{afterNextPatch:true});
      },()=>{
        player.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,source:sword?"sword":"muay",kills:player.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});
      }))return false;
    }
    return true;
  }
  private lastMountMs = new Map<string, number>();
  private lastAttackMs = new Map<string, number>();
  private lastCombatMs = new Map<string, number>();
  private lastPvpMs=new Map<string,number>();
  private sentItemCatalog=new Set<string>();
  private resourceView=new WeakMap<Client,{mapId:string;stock:number[]}>();
  private fishing=new Map<string,FishingSession>();
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
  private rebirthStates = new Map<string, RebirthState>();
  private masteryBases=new WeakMap<Player,CombatStats>();
  private masteryHistories=new WeakMap<Player,RebirthState|undefined>();
  private masteryScales=new WeakMap<Player,{hp:number;mana:number;mode:MasteryMode}>();
  private forestObjectives = new Map<string, ForestObjective>();
  private directorClaims = new Map<string,string[]>();
  private nextDirectorSample=0;
  private nextDirectorWarSample=0;
  private directorWarPhases:Record<string,"battle"|"protected"|"open">={};
  private directorLastSignature="";
  private forestDefenses = new Map<string,{id:string;hp:number;nextAttack:number}>();
  private forestEscorts = new Map<string,{id:string;x:number;y:number;z:number;hp:number;nextAttack:number;nextPlan:number;nextSend:number;retryAt:number;waypoint:Vec2|null;nav:MonsterRRTNavigator}>();
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
  private mixedSkillLoadouts = new Map<string,MixedSkillLoadouts>();
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
  private bladeRetreatUntil = new Map<string, number>();
  private bladeMarks = new Map<string,{targetId:string;until:number}>();
  private bladeOpenings = new Map<string,number>();
  private bladeEvades = new Map<string,number>();
  private bladeWindups = new Map<string,{targetId:string;until:number;power:number;ambush:boolean}>();
  private occultMarks = new Map<string,{targetId:string;until:number}>();
  private occultCurses = new Map<string,{ownerId:string;until:number;nextTick:number;damage:number}>();
  private seerBindings = new Map<string,{ownerId:string;rank:number}>();
  private seerPoisons = new Map<string,{ownerId:string;nextTick:number;fraction:number}>();
  private seerBuffaloCasts = new Map<string,{targetId:string;until:number;rank:number;x:number;z:number}>();
  private priestRegens = new Map<string,{ownerId:string;mapId:string;until:number;nextTick:number;fraction:number}>();
  private priestSanctuaries = new Map<string,{mapId:string;x:number;y:number;z:number;radius:number;until:number}>();
  private spiritNavigators = new Map<string,{mapId:string;nav:MonsterRRTNavigator;nextPlan:number;waypoint:{x:number;z:number}|null;forceDetour:boolean;intent:string}>();
  private spiritPlanBudget=0;
  private occultSpiritOrders = new Map<string,{targetId:string;until:number;skillId:"seer_spirit"|"seer_spirit_bind"}>();
  // Base spirit practice counts at most once per summon; commanded strikes count individually.
  private occultSpiritPracticed = new Set<string>();
  private occultHealingFields = new Map<string,OccultHealingField>();
  private muayWrapGranted = new Set<string>();
  private swordCombos = new Map<string, {count:number; until:number}>();
  private swordGuards = new Map<string, {until:number; factor:number; direction:boolean; counterUntil:number}>();
  private readonly sessionGuilds = new Map<string, string>();
  private readonly warBanners = new Map<string, {
    id: string; ownerId: string; guildId: string; mapId: string;
    x: number; y: number; z: number; expiresAt: number; viewers: Map<string, boolean>;
  }>();
  private readonly lastBannerAt = new Map<string, number>();
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
  private flightTransitions = new Map<string, {targetY: number; landing: boolean; meteor?: boolean}>();
  private readonly lastMeteorAt = new Map<string, number>();
  private readonly needs = new Map<string, {hungryAt: number; thirstyAt: number}>();
  private readonly homeClients = new Set<string>();
  private readonly homeWalls = new Map<string, {cell:number;rotation:0|1}[]>();

  private syncPlayerViews():void {
    for(const client of this.clients) {
      if(!client.view) continue;
      const allies=this.parties.get(client.sessionId)?.members;
      const viewerMap=this.state.players.get(client.sessionId)?.mapId;
      for(const [id,player] of this.state.players) {
        const privateMap=isHomeMap(player.mapId) || Boolean(viewerMap && isHomeMap(viewerMap));
        const canSee=id===client.sessionId || (!privateMap && (!this.bladeCloaks.has(id) || Boolean(allies?.includes(id))));
        const visible=client.view.has(player);
        if(canSee && !visible)client.view.add(player);
        else if(!canSee && visible)client.view.remove(player);
      }
    }
  }

  private bladeHiddenFrom(viewerId:string,targetId:string):boolean {
    return this.bladeCloaks.has(targetId) && viewerId!==targetId && !this.parties.get(viewerId)?.members.includes(targetId);
  }

  private priestProtected(targetId:string):boolean {
    const target=this.state.players.get(targetId);if(!target?.alive)return false;
    for(const [ownerId,zone] of this.priestSanctuaries){
      const owner=this.state.players.get(ownerId);
      if(!owner?.alive || owner.pathId!=="mender" || owner.mapId!==zone.mapId || target.mapId!==zone.mapId || this.simulatedMs>=zone.until || distance3d(target,zone)>zone.radius)continue;
      if(targetId!==ownerId){
        if(this.field){
          const side=this.warSeats.get(ownerId)?.side;
          if(!side || side!==this.warSeats.get(targetId)?.side)continue;
        }else if(!this.parties.get(ownerId)?.members.includes(targetId))continue;
      }
      if(!this.combatSegmentClear(zone.mapId,zone,target) || !this.bodyPathClear(zone.mapId,zone,target))continue;
      return true;
    }
    return false;
  }

  private sameCombatMap(ownerId: string, targetId: string, allowConcealed=false, allowProtected=false): boolean {
    const owner = this.state.players.get(ownerId);
    if (!owner || this.pendingWarps.has(ownerId) || this.pendingWarps.has(targetId)) return false;
    if (this.isProtectedArea(owner.mapId, owner)) return false;
    const monster = this.getMonster(targetId);
    if (monster) return owner.mapId === monster.mapId && !this.isProtectedArea(monster.mapId, monster);
    if(!allowProtected && this.priestProtected(targetId))return false;
    if(this.field && (!this.battleActive || this.warSeats.get(ownerId)?.side===this.warSeats.get(targetId)?.side))return false;
    if (!this.field && this.parties.get(ownerId)?.members.includes(targetId)) return false;
    const target = this.state.players.get(targetId);
    if(!allowConcealed && target && this.bladeHiddenFrom(ownerId,targetId)) return false;
    return Boolean(target && target.mapId === owner.mapId && !this.isProtectedArea(target.mapId,target));
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

  private canLearnSkillsNow(client:Client):boolean {
    const id=client.sessionId;
    // Field learning must not turn the durable-save freeze into an escape from
    // pursuit, or capture a position halfway through a vertical/dash transition.
    if(this.climbs.has(id) || this.flightTransitions.has(id) || this.activeDashes.has(id)) {
      this.reject(client,"character_busy");return false;
    }
    const pendingAttack=this.sentinelWindups.has(id) || this.bladeWindups.has(id) ||
      this.muayCoreSequences.has(id) || this.swordCoreSequences.has(id) ||
      [...this.sentinelWindups.values(),...this.bladeWindups.values(),
        ...this.muayCoreSequences.values(),...this.swordCoreSequences.values()].some(attack=>attack.targetId===id);
    const engaged=pendingAttack || this.attackTargets.has(id) || [...this.attackTargets.values()].includes(id) ||
      this.state.monster.targetId===id || this.forest.engaged(id);
    if(engaged || this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs) {
      this.reject(client,"skill_learning_in_combat");return false;
    }
    return true;
  }

  private playerBuild(player: Player): CharacterBuild | null {
    const base = {path: player.pathId, ancestry: player.ancestryId};
    // Keep default talents readable by builds predating the selection.
    const group = player.pathId === "blade" || player.pathId === "sentinel" ? talentGroup(player.pathId) : undefined;
    const id = player.bladeTalentId || player.wardTalentId;
    return parseBuild(group && id && id !== group.defaultId ? {...base, [group.field]:id} : base);
  }

  private learningLevel(id:string, player:Player):number {
    const build=this.playerBuild(player);
    return build ? classLearningLevel(this.rebirthStates.get(id),build.path,player.level) : player.level;
  }

  private sendRebirthState(client:Client):void {
    const player=this.state.players.get(client.sessionId);
    if (!player || !this.persistentCharacters.has(client.sessionId)) return this.reject(client,"rebirth_unavailable");
    const state=this.rebirthStates.get(client.sessionId) ?? newRebirthState();
    client.send("rebirth_state",{state,level:player.level,path:player.pathId,maximum:MAX_REBIRTHS,paths:PATHS,enabled:MASTERY_ENABLED,bonuses:masteryBonuses(state,"pvp"),pveBonuses:masteryBonuses(state,"pve"),
      preview:player.level===100 && state.count<MAX_REBIRTHS ? {before:masteryPreview(state),after:masteryPreview(startNextLife(state,player.pathId as PathId,player.level))}:null});
  }

  private beginRebirth(client:Client,message:unknown):void {
    const id=client.sessionId,player=this.buildPlayer(client);
    if(!player)return;
    if(!WORLD_EXPANSION || this.field)return this.reject(client,"rebirth_unavailable");
    const mentor=serviceNpcsFor(player.mapId).find(npc=>npc.role==="mentor" && Math.hypot(player.x-npc.x,player.z-npc.z)<=npc.radius);
    if(!mentor || player.flying || !onMapGround(player) || this.isFighting(id))return this.reject(client,"rebirth_near_mentor");
    if(!message || typeof message!=="object" || Array.isArray(message) || Object.keys(message).length!==1 ||
       typeof (message as {path?:unknown}).path!=="string" || !Object.hasOwn(PATHS,(message as {path:string}).path))return this.reject(client,"rebirth_invalid_class");
    const snapshot=this.captureCharacterSnapshot(id);if(!snapshot)return this.reject(client,"rebirth_unavailable");
    let next:CharacterSnapshot;
    try {next=prepareRebirth(snapshot,(message as {path:PathId}).path);} catch(error) {
      const reason=error instanceof Error ? error.message : "rebirth_unavailable";
      return this.reject(client,reason.startsWith("rebirth_")?reason:"rebirth_unavailable");
    }
    this.pendingWarps.add(id);
    const task=characterStore.save(next).then(()=>{
      // Apply only after the complete character snapshot has reached disk.
      this.endPossession(id,"class_changed");this.despawnSummon(id,"class_changed");
      this.effects.forget(id);this.buffs.forget(id);
      this.sentinelAnchors.delete(id);this.sentinelCounters.delete(id);this.sentinelWindups.delete(id);this.sentinelCoreStances.delete(id);
      for(const [member,link] of this.sentinelInterceptions)if(link.ownerId===id)this.sentinelInterceptions.delete(member);
      this.endBladeCloak(id,"class_changed");this.clearBladeMark(id);this.bladeOpenings.delete(id);this.bladeEvades.delete(id);this.bladeWindups.delete(id);this.bladeCasts.delete(id);this.bladeRetreatUntil.delete(id);
      this.occultMarks.delete(id);this.occultSpiritOrders.delete(id);this.occultSpiritPracticed.delete(id);this.clearOccultHealingField(id);
      for(const [target,curse] of this.occultCurses)if(curse.ownerId===id)this.clearOccultCurse(target,"class_changed");
      this.clearPrototypeTransient(id);this.swordGuards.delete(id);this.swordCoreStances.delete(id);this.swordCoreSequences.delete(id);this.swordCombos.delete(id);
      this.clearMuayDefense(id,"cancelled");this.clearMuayCombo(id);this.muayCoreStances.delete(id);this.muayCoreFollowups.delete(id);this.muayCoreSequences.delete(id);
      this.destinations.delete(id);this.endAttack(id,player);
      this.rebirthStates.set(id,next.rebirth!);this.inventories.set(id,next.inventory!);this.statAllocations.set(id,emptyAllocations());
      if(next.muayWrapGranted)this.muayWrapGranted.add(id);
      player.level=next.level;player.experience=next.experience;player.pathId=next.build!.path;player.ancestryId=next.build!.ancestry;
      player.wardTalentId=player.pathId==="sentinel" ? next.build!.wardTalent ?? DEFAULT_WARD_TALENT : "";
      player.bladeTalentId=player.pathId==="blade" ? next.build!.bladeTalent ?? talentGroup("blade")!.defaultId : "";
      player.equippedWeaponId=equippedWeaponId(next.inventory) ?? "";
      if(player.pathId==="blade" && !this.bladeBooks.has(id))this.bladeBooks.set(id,newBladeBook());
      if(player.pathId==="sentinel" && !this.sentinelBooks.has(id))this.sentinelBooks.set(id,newSentinelBook());
      this.lastPvpMs.delete(id);this.hpRegenRemainder.delete(id);this.masteryScales.delete(player);
      this.applyStats(id,player,emptyAllocations());player.hp=player.maxHp;player.stamina=player.maxStamina;player.mana=player.maxMana;
      this.syncSkillHotbar(id);
      try {client.send("inventory_state",next.inventory);client.send("rebirth_complete",{});this.sendRebirthState(client);} catch { /* already disconnected */ }
    },error=>{console.error("MONTRA rebirth save failed",error);this.reject(client,"rebirth_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private sendForestObjective(client:Client):void {
    const player=this.state.players.get(client.sessionId),active=this.forestObjectives.get(client.sessionId) ?? null;
    const options=Object.fromEntries(Object.entries(FOREST_OBJECTIVES).filter(([key,def])=>def.mapId===player?.mapId && objectiveAvailable(key)));
    if(active)options[active.id]=FOREST_OBJECTIVES[active.id];
    const event=worldDirector.snapshot();
    const localEvent=event && event.mapId===player?.mapId ? event : null;
    client.send("forest_objective_state",{active,options,keeper:player?objectiveRanger(player.mapId):null,event:localEvent,serverNow:Date.now(),
      eventClaimed:localEvent ? (this.directorClaims.get(client.sessionId) ?? []).includes(localEvent.id):false});
  }

  private askNpcGuide(client:Client,message:unknown):void {
    const order=parseGuideQuestion(message),id=client.sessionId,player=this.state.players.get(id),character=this.persistentCharacters.get(id);
    if(!order)return this.reject(client,"npc_guide_invalid");
    const respond=(payload:Record<string,unknown>)=>{try{client.send("npc_guide_result",{requestId:order.requestId,...payload});}catch{/* disconnected */}};
    if(!WORLD_EXPANSION || this.field || !player?.alive || !character || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id))return respond({error:"unavailable"});
    const ranger=objectiveRanger(player.mapId);
    const npc=serviceNpcsFor(player.mapId).find(item=>item.id===order.npcId && (item.role==="guide" || item.role==="strategy")) ??
      (ranger && order.npcId===`${player.mapId}_ranger`?ranger:undefined);
    if(!npc || player.flying || !onMapGround(player) || Math.hypot(player.x-npc.x,player.z-npc.z)>npc.radius)return respond({error:"near_npc"});
    const gate=guideGate.begin(character,Date.now());if(gate!=="ok")return respond({error:gate});
    const sites:GuideSite[]=Object.keys(warSites).flatMap(site=>{const map=getWorldMap(site);return map?[{id:site,name:map.name}]:[];});
    let quests:QuestChoice[];
    try{quests=fallbackGuideSelection(order.question,sites,player.mapId).intent==="quest" && !this.forestObjectives.has(id)?questChoices(player.mapId,player.level):[];}
    catch{guideGate.end(character);return respond({error:"unavailable"});}
    void selectGuideIntent(order.question,sites,{currentMapId:player.mapId,quests}).then(selection=>{
      if(this.state.players.get(id)!==player || this.persistentCharacters.get(id)!==character || this.pendingCharacterLeaves.has(id))return;
      const now=Date.now(),war=guildStore().war;
      const wars:GuideWar[]=sites.map(site=>{
        const status=war.inspect(site.id,now),phase=status.phase;
        if(phase!=="battle" && phase!=="protected" && phase!=="open")throw Error("invalid_war_phase");
        return {...site,phase,owner:status.owner,phaseEndsAt:status.phaseEndsAt};
      });
      const guild=guildStore().view(character,guildOnline),map=getWorldMap(player.mapId),event=worldDirector.snapshot(now);
      const localTasks=Object.entries(FOREST_OBJECTIVES).filter(([key,def])=>def.mapId===player.mapId && !def.kind && objectiveAvailable(key)).slice(0,3).map(([,def])=>`${def.name} (${def.levels})`);
      const path=Object.hasOwn(PATHS,player.pathId)?PATHS[player.pathId as PathId].name:"นักเดินทาง";
      const answer=guideAnswer(selection,{mapName:map?.name ?? "พื้นที่ปัจจุบัน",level:player.level,pathName:path,
        rebirthCount:this.rebirthStates.get(id)?.count ?? 0,guildName:guild?.name ?? null,wars,
        event:event?{name:event.name,mapName:event.mapName,endsAt:event.endsAt}:null,localTasks,
        ...(selection.intent==="quest"?{questAdvice:questAdvice(player.mapId,player.level,this.forestObjectives.get(id) ?? null,
          preferredQuestId(order.question,quests) ?? selection.questId)}:{})},now);
      respond({answer,asOf:now,source:selection.source});
    }).catch(()=>respond({error:"unavailable"})).finally(()=>guideGate.end(character));
  }

  private directorReward(snapshot:CharacterSnapshot,objective:ForestObjective|null|undefined,level:number,monsterLevel:number,tier:MonsterTier,
    event:DirectorEvent|null=worldDirector.snapshot(),at=Date.now()):{bonus:number;claims:string[]} {
    const claims=snapshot.directorClaims ?? [];
    if(!objective || level>=PROGRESSION.maxLevel || !event || objective.directorEventId!==event.id || objective.id!==event.objectiveId ||
      claims.includes(event.id) || at<event.startsAt || at>=event.endsAt)return {bonus:0,claims};
    const bonus=cycleExperience(monsterExperience(level,monsterLevel,tier),snapshot.rebirth?.count ?? 0);
    return bonus>0 ? {bonus,claims:[...claims,objective.directorEventId!].slice(-16)} : {bonus:0,claims};
  }

  private updateWorldDirector():void {
    if(!WORLD_EXPANSION || this.field || process.env.MONTRA_DIRECTOR_ENABLED==="0" || this.simulatedMs<this.nextDirectorSample)return;
    this.nextDirectorSample=this.simulatedMs+1000;
    const players=[...this.state.players.entries()].flatMap(([id,p])=>p.alive && this.persistentCharacters.has(id)?[{mapId:p.mapId,level:p.level}]:[]);
    const now=Date.now();
    if(this.simulatedMs>=this.nextDirectorWarSample){
      this.nextDirectorWarSample=this.simulatedMs+10_000;
      try{
        const war=guildStore().war,phases:Record<string,"battle"|"protected"|"open">={};
        for(const mapId of new Set(players.map(p=>p.mapId)))if(Object.hasOwn(warSites,mapId)){
          const phase=war.inspect(mapId,now).phase;if(phase==="battle" || phase==="protected" || phase==="open")phases[mapId]=phase;
        }
        this.directorWarPhases=phases;
      }catch{this.directorWarPhases={};console.warn("MONTRA Director: war context unavailable");}
    }
    worldDirector.observe(this.roomId,players,now,this.directorWarPhases);
    const event=worldDirector.snapshot(),signature=event?.id ?? "none";
    if(signature===this.directorLastSignature)return;
    this.directorLastSignature=signature;
    for(const client of this.clients)try{client.send("director_event_state",{event,serverNow:Date.now()});this.sendForestObjective(client);}catch{/* disconnected */}
  }

  private changeForestObjective(client:Client,message:unknown):void {
    const id=client.sessionId,player=this.buildPlayer(client);
    if(!player)return;
    if(!WORLD_EXPANSION || this.field)return this.reject(client,"forest_objective_unavailable");
    const ranger=objectiveRanger(player.mapId);
    if(!ranger || player.flying || !onMapGround(player) || Math.hypot(player.x-ranger.x,player.z-ranger.z)>ranger.radius)
      return this.reject(client,"forest_objective_near_ranger");
    if(!message || typeof message!=="object" || Array.isArray(message) || Object.keys(message).some(key=>!["id","eventId"].includes(key)) || !Object.hasOwn(message,"id"))return this.reject(client,"forest_objective_invalid");
    const request=message as {id:unknown;eventId?:unknown},requested=request.id,objective=requested===null?null:parseForestObjectiveId(requested);
    if(requested!==null && !objective)return this.reject(client,"forest_objective_invalid");
    if(objective && FOREST_OBJECTIVES[objective].mapId!==player.mapId)return this.reject(client,"forest_objective_near_ranger");
    if(objective && !objectiveAvailable(objective))return this.reject(client,"forest_objective_unavailable");
    let directorEventId:string|undefined;
    if(request.eventId!==undefined){
      const event=worldDirector.snapshot();
      if(typeof request.eventId!=="string" || !objective || !event || event.id!==request.eventId || event.objectiveId!==objective || event.mapId!==player.mapId)
        return this.reject(client,"director_event_unavailable");
      if((this.directorClaims.get(id) ?? []).includes(event.id))return this.reject(client,"director_event_claimed");
      directorEventId=event.id;
    }
    if(objective && player.level>=PROGRESSION.maxLevel)return this.reject(client,"forest_objective_level_cap");
    if(objective && this.forestObjectives.has(id))return this.reject(client,"forest_objective_active");
    const snapshot=this.captureCharacterSnapshot(id);if(!snapshot)return this.reject(client,"build_unavailable");
    const next=objective?{id:objective,progress:0,...(directorEventId?{directorEventId}:{})}:null;
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,forestObjective:next,updatedAt:new Date().toISOString()}).then(()=>{
      if(next)this.forestObjectives.set(id,next);else this.forestObjectives.delete(id);
      this.forestDefenses.delete(id);
      this.forestEscorts.delete(id);
      try{this.sendForestObjective(client);}catch{/* disconnected after save */}
    },error=>{console.error("MONTRA forest objective save failed",error);this.reject(client,"forest_objective_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private startForestDefense(client:Client,message:unknown):void {
    const id=client.sessionId,player=this.buildPlayer(client);if(!player)return;
    if(!parseEmptyCommand(message) || !WORLD_EXPANSION || this.field)return this.reject(client,"forest_objective_unavailable");
    const active=this.forestObjectives.get(id),def=active && FOREST_OBJECTIVES[active.id],area=def?.defense;
    if(!active || def?.kind!=="defense" || !area)return this.reject(client,"forest_objective_invalid");
    if(this.forestDefenses.has(id))return this.reject(client,"forest_objective_defense_active");
    if(player.mapId!==def.mapId || player.flying || !onMapGround(player) || Math.hypot(player.x-area.x,player.z-area.z)>4)
      return this.reject(client,"forest_objective_defense_near");
    const snapshot=this.captureCharacterSnapshot(id);if(!snapshot)return this.reject(client,"forest_objective_unavailable");
    const reset={...active,progress:0};this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,forestObjective:reset,updatedAt:new Date().toISOString()}).then(()=>{
      this.forestObjectives.set(id,reset);this.forestDefenses.set(id,{id:active.id,hp:120,nextAttack:this.simulatedMs+3000});
      try{client.send("forest_defense_state",{id:active.id,hp:120,maxHp:120});this.sendForestObjective(client);}catch{/* disconnected */}
    },error=>{console.error("MONTRA defense save failed",error);this.reject(client,"forest_objective_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private updateForestDefenses():void {
    for(const [id,state] of this.forestDefenses){
      const player=this.state.players.get(id),active=this.forestObjectives.get(id),def=active && FOREST_OBJECTIVES[active.id],area=def?.defense;
      if(!player?.alive || !active || active.id!==state.id || !area || player.mapId!==def.mapId){
        this.forestDefenses.delete(id);try{this.clients.find(c=>c.sessionId===id)?.send("forest_defense_state",{id:state.id,hp:0,maxHp:120,ended:true});}catch{}continue;
      }
      if(this.pendingWarps.has(id) || this.simulatedMs<state.nextAttack)continue;
      state.nextAttack=this.simulatedMs+3000;
      let attackers=0;
      this.state.monsters.forEach(monster=>{if(monster.alive && monster.mapId===def.mapId && monster.id.startsWith(def.prefix ?? "\u0000") && Math.hypot(monster.x-area.x,monster.z-area.z)<=area.radius)attackers++;});
      state.hp=Math.max(0,state.hp-Math.min(8,attackers)*2);
      const client=this.clients.find(c=>c.sessionId===id);
      if(state.hp===0)this.forestDefenses.delete(id);
      try{client?.send("forest_defense_state",{id:state.id,hp:state.hp,maxHp:120,attackers,...(state.hp===0?{failed:true}:{})});}catch{}
    }
  }

  private startForestEscort(client:Client,message:unknown):void {
    const id=client.sessionId,player=this.buildPlayer(client);if(!player)return;
    if(!parseEmptyCommand(message) || !WORLD_EXPANSION || this.field)return this.reject(client,"forest_objective_unavailable");
    const active=this.forestObjectives.get(id),def=active && FOREST_OBJECTIVES[active.id],keeper=objectiveRanger(player.mapId),map=getWorldMap(player.mapId);
    if(!active || def?.kind!=="escort" || !def.escort)return this.reject(client,"forest_objective_invalid");
    if(this.forestEscorts.has(id))return this.reject(client,"forest_objective_escort_active");
    if(!keeper || !map || player.mapId!==def.mapId || player.flying || !onMapGround(player) || Math.hypot(player.x-keeper.x,player.z-keeper.z)>keeper.radius)
      return this.reject(client,"forest_objective_near_ranger");
    const trees=map.obstacles.map(o=>({x:o.x-o.radius,z:o.z-o.radius,width:o.radius*2,length:o.radius*2}));
    const escort={id:active.id,x:keeper.x,y:keeper.y,z:keeper.z,hp:100,nextAttack:this.simulatedMs+2000,nextPlan:0,nextSend:0,retryAt:0,
      waypoint:null as Vec2|null,nav:new MonsterRRTNavigator([...trees,...(map.walls ?? [])],map.bounds,180)};
    this.forestEscorts.set(id,escort);
    try{client.send("forest_escort_state",{id:active.id,mapId:map.id,x:escort.x,y:escort.y,z:escort.z,hp:escort.hp,maxHp:100});}catch{}
  }

  private completeForestEscort(id:string,active:ForestObjective):void {
    const player=this.state.players.get(id),escort=this.forestEscorts.get(id),def=FOREST_OBJECTIVES[active.id],snapshot=this.captureCharacterSnapshot(id);
    if(!player || !escort || !snapshot || this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return;
    const bonus=player.level>=PROGRESSION.maxLevel?0:cycleExperience(monsterExperience(player.level,def.rewardLevel ?? 1,"normal")*3,snapshot.rebirth?.count ?? 0);
    const eventReward=this.directorReward(snapshot,active,player.level,def.rewardLevel ?? 1,"normal");
    const next=addExperience(player.level,player.experience,bonus+eventReward.bonus),build=this.playerBuild(player);
    const rebirth=build?recordClassLevel(snapshot.rebirth ?? newRebirthState(),build.path,Math.min(100,next.level)):snapshot.rebirth;
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,...next,rebirth,directorClaims:eventReward.claims,forestObjective:null,updatedAt:new Date().toISOString()}).then(()=>{
      this.forestObjectives.delete(id);this.forestEscorts.delete(id);if(rebirth)this.rebirthStates.set(id,rebirth);
      this.directorClaims.set(id,eventReward.claims);
      const leveled=player.level!==next.level;player.level=next.level;player.experience=next.experience;
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      const client=this.clients.find(c=>c.sessionId===id);
      try{client?.send("forest_escort_state",{id:active.id,completed:true});
        if(leveled && client && this.sentItemCatalog.has(id))this.sendHuntGuide(client,player);
        client?.send("experience_gained",{amount:bonus+eventReward.bonus,level:next.level,experience:next.experience,forestObjectiveCompleted:active.id,forestObjectiveBonus:bonus,...(eventReward.bonus?{directorBonus:eventReward.bonus}:{})});
        if(client)this.sendForestObjective(client);
      }catch{/* saved even if disconnected */}
    },error=>{escort.retryAt=this.simulatedMs+5000;console.error("MONTRA escort save failed",error);try{this.clients.find(c=>c.sessionId===id)?.send("command_rejected",{reason:"forest_objective_save_failed"});}catch{}})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private updateForestEscorts(dt:number):void {
    for(const [id,npc] of this.forestEscorts){
      const player=this.state.players.get(id),active=this.forestObjectives.get(id),def=active && FOREST_OBJECTIVES[active.id],goal=def?.escort;
      const client=this.clients.find(c=>c.sessionId===id);
      if(!player?.alive || !active || active.id!==npc.id || !goal || player.mapId!==def.mapId){
        this.forestEscorts.delete(id);try{client?.send("forest_escort_state",{id:npc.id,ended:true});}catch{}continue;
      }
      if(this.pendingWarps.has(id) || this.pendingItemUses.has(id))continue;
      const distance=Math.hypot(player.x-npc.x,player.z-npc.z),map=getWorldMap(player.mapId)!;
      if(!player.flying && onMapGround(player) && distance>2.5 && distance<=18){
        if(this.combatSegmentClear(player.mapId,npc,player) && this.bodyPathClear(player.mapId,npc,player))npc.waypoint={x:player.x,z:player.z};
        else if(this.simulatedMs>=npc.nextPlan){npc.nextPlan=this.simulatedMs+500;npc.waypoint=npc.nav.nextWaypoint(npc,player,this.simulatedMs,"escort");}
        if(npc.waypoint){
          const next=stepTowards(npc,npc.waypoint,RULES.summonMoveSpeed*dt),y=groundAt(player.mapId,next.x,next.z);
          if(this.canOccupy(next.x,next.z,0,false,player.mapId) && Math.abs(y-npc.y)<=.6 && this.combatSegmentClear(player.mapId,npc,{x:next.x,y,z:next.z}) && this.bodyPathClear(player.mapId,npc,{x:next.x,y,z:next.z})){
            npc.x=next.x;npc.y=y;npc.z=next.z;
          }else{npc.waypoint=null;npc.nav.clear();}
        }
      }
      if(this.simulatedMs>=npc.nextAttack){
        npc.nextAttack=this.simulatedMs+2000;let attackers=0;
        this.state.monsters.forEach(m=>{if(m.alive && m.mapId===player.mapId && Math.hypot(m.x-npc.x,m.z-npc.z)<=4)attackers++;});
        npc.hp=Math.max(0,npc.hp-Math.min(6,attackers)*3);
        if(npc.hp===0){this.forestEscorts.delete(id);try{client?.send("forest_escort_state",{id:npc.id,failed:true});}catch{}continue;}
      }
      if(Math.hypot(npc.x-goal.x,npc.z-goal.z)<=goal.radius && distance<=8 && !player.flying && this.simulatedMs>=npc.retryAt){this.completeForestEscort(id,active);continue;}
      if(this.simulatedMs>=npc.nextSend){npc.nextSend=this.simulatedMs+500;try{client?.send("forest_escort_state",{id:npc.id,mapId:player.mapId,x:npc.x,y:npc.y,z:npc.z,hp:npc.hp,maxHp:100,waiting:distance>18});}catch{}}
    }
  }

  private completeForestDelivery(client:Client,message:unknown):void {
    const id=client.sessionId,player=this.buildPlayer(client);
    if(!player)return;
    if(!parseEmptyCommand(message) || !WORLD_EXPANSION || this.field)return this.reject(client,"forest_objective_unavailable");
    const active=this.forestObjectives.get(id),def=active && FOREST_OBJECTIVES[active.id],ranger=objectiveRanger(player.mapId);
    if(!active || def?.kind!=="delivery" || active.progress!==def.goal-1)return this.reject(client,"forest_objective_delivery_not_ready");
    if(player.mapId!==def.destinationMapId || !ranger || player.flying || !onMapGround(player) || Math.hypot(player.x-ranger.x,player.z-ranger.z)>ranger.radius)
      return this.reject(client,"forest_objective_delivery_destination");
    const snapshot=this.captureCharacterSnapshot(id);if(!snapshot)return this.reject(client,"forest_objective_unavailable");
    const bonus=player.level>=PROGRESSION.maxLevel?0:cycleExperience(monsterExperience(player.level,def.rewardLevel ?? 1,"normal")*2,snapshot.rebirth?.count ?? 0);
    const eventReward=this.directorReward(snapshot,active,player.level,def.rewardLevel ?? 1,"normal");
    const next=addExperience(player.level,player.experience,bonus+eventReward.bonus),build=this.playerBuild(player);
    const rebirth=build?recordClassLevel(snapshot.rebirth ?? newRebirthState(),build.path,Math.min(100,next.level)):snapshot.rebirth;
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,...next,rebirth,directorClaims:eventReward.claims,forestObjective:null,updatedAt:new Date().toISOString()}).then(()=>{
      this.forestObjectives.delete(id);if(rebirth)this.rebirthStates.set(id,rebirth);
      this.directorClaims.set(id,eventReward.claims);
      const leveled=player.level!==next.level;player.level=next.level;player.experience=next.experience;
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      try{
        if(leveled && this.sentItemCatalog.has(id))this.sendHuntGuide(client,player);
        client.send("experience_gained",{amount:bonus+eventReward.bonus,level:next.level,experience:next.experience,forestObjectiveCompleted:active.id,forestObjectiveBonus:bonus,...(eventReward.bonus?{directorBonus:eventReward.bonus}:{})});
        this.sendForestObjective(client);
      }catch{/* saved even if disconnected */}
    },error=>{console.error("MONTRA delivery save failed",error);this.reject(client,"forest_objective_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
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
        this.clearBladeMark(id);this.bladeOpenings.delete(id);this.bladeEvades.delete(id);this.bladeWindups.delete(id);this.bladeCasts.delete(id);this.bladeRetreatUntil.delete(id);
        this.effects.remove(id,"blade_focus",id);this.effects.remove(id,"blade_veil_guard",id);this.effects.remove(id,"blade_core_fury",id);
        this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
        this.occultMarks.delete(id);
        this.occultSpiritOrders.delete(id);
        this.occultSpiritPracticed.delete(id);
        this.clearOccultHealingField(id);
        for (const [target,curse] of this.occultCurses) if (curse.ownerId===id) this.clearOccultCurse(target,"class_changed");
      }
      if (!isOccultPath(build.path)) {
        this.endPossession(id, "class_changed");
        this.despawnSummon(id, "class_changed");
      }
      this.clearPrototypeTransient(id);
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
      this.syncSkillHotbar(id);
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
    if(!this.spendSkillMana(client,player,skill.stamina,[],targets.map(([member])=>member)))return;
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


  private hotbarBooks(id:string):HotbarBooks {return {swordTree:this.swordTrees.get(id),muayBook:this.muayBooks.get(id),bladeBook:this.bladeBooks.get(id),sentinelBook:this.sentinelBooks.get(id),occultBook:this.occultBooks.get(id)};}
  private syncSkillHotbar(id:string):void {
    const player=this.state.players.get(id);if(!player)return;
    const books=this.hotbarBooks(id),saved=this.mixedSkillLoadouts.get(id);
    if(saved)this.mixedSkillLoadouts.set(id,validateMixedSkillLoadouts(saved,books));
    player.skillHotbarVersion=MIXED_SKILLS_ENABLED?1:0;
    player.skillHotbarData=JSON.stringify({...hotbarState(player.pathId,books,MIXED_SKILLS_ENABLED?this.mixedSkillLoadouts.get(id):undefined),version:player.skillHotbarVersion});
  }
  private configuredHotbar(id:string) {
    if(!MIXED_SKILLS_ENABLED)return undefined;
    const player=this.state.players.get(id);if(!player)return undefined;
    return this.mixedSkillLoadouts.get(id)?.loadouts[player.pathId+':'+hotbarSchool(player.pathId,this.hotbarBooks(id))];
  }
  private advancedEquipped(id:string,skill:string,legacy:boolean):boolean {
    const slots=this.configuredHotbar(id);return slots?slots.some(s=>s?.kind==='advanced'&&s.id===skill):legacy;
  }
  private hotbarCastAllowed(client:Client,message:unknown,kind:'core'|'advanced'):boolean {
    const slots=this.configuredHotbar(client.sessionId);if(!slots)return true;
    const skill=(message as {skillId?:unknown}|null)?.skillId;
    if(slots.some(s=>s?.kind===kind&&s.id===skill))return true;
    this.reject(client,'skill_hotbar_locked');return false;
  }
  private changeSkillHotbar(client:Client,message:unknown):void {
    if(!MIXED_SKILLS_ENABLED)return this.reject(client,"skill_hotbar_unavailable");
    if(!message||typeof message!=='object'||Array.isArray(message))return this.reject(client,'invalid_skill_hotbar');
    const input=message as Record<string,unknown>;
    if(Object.keys(input).length!==4||input.version!==1||typeof input.pathId!=='string'||typeof input.school!=='string')return this.reject(client,'invalid_skill_hotbar');
    const id=client.sessionId,player=this.buildPlayer(client,'swordTree');if(!player)return;
    const books=this.hotbarBooks(id);
    if(input.pathId!==player.pathId||input.school!==hotbarSchool(player.pathId,books))return this.reject(client,'skill_hotbar_locked');
    let slots;try{slots=validateHotbarSlots(input.slots,player.pathId);}catch{return this.reject(client,'invalid_skill_hotbar');}
    if(slots.some(slot=>!availableHotbarSlot(player.pathId,input.school as string,slot,books)))return this.reject(client,'skill_hotbar_locked');
    if(player.pathId!=='phutthaisawan'&&(player.mapId!==DEFAULT_MAP_ID||!onMapGround(player)||Math.hypot(player.x,player.z)>6||this.simulatedMs-(this.lastCombatMs.get(id)??-Infinity)<PROGRESSION.combatQuietMs))return this.reject(client,'skill_hotbar_needs_shrine');
    const snapshot=this.captureCharacterSnapshot(id);if(!snapshot)return this.reject(client,'build_unavailable');
    const next:MixedSkillLoadouts={version:1,loadouts:{...this.mixedSkillLoadouts.get(id)?.loadouts,[player.pathId+':'+input.school]:slots}};
    const freezes=player.pathId!=='phutthaisawan';if(freezes)this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,mixedSkillLoadouts:next}).then(()=>{
      this.mixedSkillLoadouts.set(id,next);this.syncSkillHotbar(id);
      if(isOccultPath(player.pathId)){if(player.possessionActive&&!this.canPrepareSpirit(id,player.pathId,true))this.endPossession(id,'loadout_changed');if(this.state.summons.has(id)&&!this.canPrepareSpirit(id,player.pathId,false))this.despawnSummon(id,'loadout_changed');}
      try{client.send('skill_hotbar_changed',JSON.parse(player.skillHotbarData));}catch(error){console.warn('MONTRA hotbar confirmation not delivered',error);}
    },error=>{console.error('MONTRA hotbar save failed',error);this.reject(client,'skill_hotbar_save_failed');}).finally(()=>{if(freezes)this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private changeSwordTree(client: Client, message: unknown, action: "learn" | "upgrade" | "school" | "reset" | "equip"): void {
    if (!message || typeof message !== "object" || Array.isArray(message)) return this.reject(client, "invalid_sword_tree");
    const field = action === "learn" || action === "upgrade" ? "skillId" : "school";
    const input = message as Record<string, unknown>;
    const keys=Object.keys(input);
    if (action === "equip" && this.configuredHotbar(client.sessionId)) return this.reject(client,"skill_hotbar_use_unified");
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
    const learning=action==="learn" || action==="upgrade";
    if(learning && !this.canLearnSkillsNow(client))return;
    if (!learning && action !== "equip" && (player.mapId !== DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
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
      if (this.learningLevel(client.sessionId,player) < SWORD_SCHOOLS[school].level) return this.reject(client,"sword_tree_level");
      if (school!=="phutthaisawan" && (tree.training.strikes<10 || tree.training.blocks<1)) return this.reject(client,"sword_trial_incomplete");
      if (next.school === school) return this.reject(client,"sword_tree_already_selected");
      next.school=school;
    } else if(action==="upgrade") {
      if(typeof value!=="string" || !SWORD_RANKABLE_SKILLS.some(id=>id===value) || !next.learned.includes(value))return this.reject(client,"sword_skill_locked");
      const node=SWORD_NODES[value],rank=next.ranks?.[value] ?? 0;
      if(node.school!=="common" && node.school!==next.school)return this.reject(client,"sword_tree_wrong_school");
      if(rank>=SKILL_RANK_LEVELS.length || this.learningLevel(client.sessionId,player)<SKILL_RANK_LEVELS[rank])return this.reject(client,"sword_tree_level");
      if(Object.values(next.training).reduce((sum,count)=>sum+count,0)<SKILL_RANK_PRACTICE[rank])return this.reject(client,"sword_trial_incomplete");
      if(next.learned.length+skillRankCost(next.ranks)>=swordPoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"sword_tree_no_points");
      next.ranks={...next.ranks,[value]:rank+1};
    } else {
      if (typeof value!=="string" || !Object.hasOwn(SWORD_NODES,value)) return this.reject(client,"invalid_sword_tree");
      const skill=SWORD_NODES[value];
      if (next.learned.includes(value)) return this.reject(client,"sword_tree_already_learned");
      if (this.learningLevel(client.sessionId,player) < skill.level) return this.reject(client,"sword_tree_level");
      if (skill.school !== "common" && skill.school !== next.school) return this.reject(client,"sword_tree_wrong_school");
      if (skill.requires.some(required=>!next.learned.includes(required))) return this.reject(client,"sword_tree_prerequisite");
      if (skill.training && tree.training[skill.training.id]<skill.training.count) return this.reject(client,"sword_trial_incomplete");
      if (next.learned.length+skillRankCost(next.ranks) >= swordPoints(this.learningLevel(client.sessionId,player))) return this.reject(client,"sword_tree_no_points");
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
      if (action === "school" || action === "reset") { this.clearPrototypeTransient(id);this.swordGuards.delete(id); this.swordCombos.delete(id); }
      player.swordTreeData=JSON.stringify(committed);this.syncSkillHotbar(id);
      try {
        client.send("sword_tree_changed",{action,id:value});
        if(player.level>=26 && (action==="learn" || action==="upgrade" || action==="reset"))
          this.sendFieldPractice(client,player,action,value,{},SWORD_NODES);
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
    this.syncSkillHotbar(id);player.muayBookData=JSON.stringify(book);
  }
  private recordMuayMastery(id:string,school:MuaySchool,technique:boolean,sequence:boolean):void {
    const player=this.state.players.get(id),book=this.muayBooks.get(id);
    if(!player || player.pathId!=="muay_boran" || !book || book.school!==school || (!technique && !sequence))return;
    const mastery=book.mastery[school];
    if(technique)mastery.technique=Math.min(1_000_000,mastery.technique+1);
    if(sequence)mastery.sequences=Math.min(1_000_000,mastery.sequences+1);
    this.syncSkillHotbar(id);player.muayBookData=JSON.stringify(book);
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
    if(!this.spendSkillMana(client,player,MUAY_GRAPPLE_ESCAPE_STAMINA,[holderId],[]))return;
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
    if(!this.spendSkillMana(client,player,MUAY_GRAPPLE_COUNTER_STAMINA,[window.targetId],[]))return;this.clearGrappleCounter(id,"used");
    player.facing=facingTo(opponent.x-player.x,opponent.z-player.z);this.recordCombat(id,window.targetId);
    const attack=(this.masteryPower(player,"pvp","atk",weaponBonuses(this.inventories.get(id),"pvp").melee))*MUAY_PVP_DAMAGE_MULTIPLIER;
    const damage=this.directGuardDamage(window.targetId,player,calculateDamage(attack,this.masteryPower(opponent,"pvp","def"),opponent.level));
    this.applyPlayerHit(player,window.targetId,opponent,damage,()=>{
      this.broadcast("pvp_hit",{attackerId:id,targetId:window.targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"grapple_counter"},{afterNextPatch:true});
    },()=>{
      player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(window.targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:window.targetId,source:"grapple_counter",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
    });
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
    if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(target),false,target.mapId) || this.isProtectedArea(target.mapId,next) || !this.bodyPathClear(target.mapId,target,next) ||
      (monster && (monster.id===RULES.monsterId ? !isMonsterSegmentClear(monster,next) : !this.forest.canDisplace(monster.id,next))))return this.reject(client,"muay_throw_blocked");
    const sweep=advanceDash(target,{dx:nx,dz:nz},1.5,(x,z)=>this.canOccupy(x,z,surfaceLayer(target),false,target.mapId) && !this.isProtectedArea(target.mapId,{x,z}),map.bounds);
    if(sweep.blocked || sweep.moved<1.4999)return this.reject(client,"muay_throw_blocked");
    this.moveOnSurface(target,next.x,next.z);
    this.releaseMuayGrapple(id,"thrown");this.recordCombat(id,hold.targetId);this.recordMuayTraining(id,"strikes");
    const pvp=!monster,attack=(this.masteryPower(player,pvp?"pvp":"pve","atk",weaponBonuses(this.inventories.get(id),pvp?"pvp":"pve").melee))*MUAY_SKILLS.grapple.power*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:1);
    if(monster)this.hitMonsterWithSpell(id,monster,calculateDamage(attack,monster.defense,monster.level),"muay");
    else {
      const opponent=target as Player,damage=this.directGuardDamage(hold.targetId,player,calculateDamage(attack,this.masteryPower(opponent,"pvp","def"),opponent.level));
      if(!this.applyPlayerHit(player,hold.targetId,opponent,damage,()=>{
        this.broadcast("pvp_hit",{attackerId:id,targetId:hold.targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"muay"},{afterNextPatch:true});
      },()=>{
        player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(hold.targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:hold.targetId,source:"muay",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
      })){void this.saveCharacter(id);return;}
    }
    this.broadcast("muay_skill_used",{playerId:id,skillId:"grapple",targetId:hold.targetId},{afterNextPatch:true});void this.saveCharacter(id);
  }

  private sendBladeBook(client:Client):void {
    this.syncSkillHotbar(client.sessionId);
    const player=this.state.players.get(client.sessionId),book=this.bladeBooks.get(client.sessionId);
    if (!player || !book || player.pathId!=="blade") return;
    try { client.send("blade_book_state",{book,core:BLADE_CORE,coreLevels:MUAY_CORE_LEVELS,corePointLevels:MUAY_CORE_POINT_LEVELS,coreProgress:Array.from({length:MUAY_CORE_LEVELS.length+1},(_,rank)=>bladeCoreProgress(rank)),lessons:BLADE_LESSONS,practiceLabels:BLADE_PRACTICE_LABELS,points:bladePoints(this.learningLevel(client.sessionId,player)),rankLevels:SKILL_RANK_LEVELS,rankPractice:SKILL_RANK_PRACTICE,rankable:BLADE_RANKABLE_SKILLS}); }
    catch(error) { console.warn("MONTRA blade book notice was not delivered",error); }
  }

  private sendSentinelBook(client:Client):void {
    this.syncSkillHotbar(client.sessionId);
    const player=this.state.players.get(client.sessionId),book=this.sentinelBooks.get(client.sessionId);
    if(!player || player.pathId!=="sentinel" || !book)return;
    try{client.send("sentinel_book_state",{book,core:SENTINEL_CORE,coreLevels:MUAY_CORE_LEVELS,corePointLevels:MUAY_CORE_POINT_LEVELS,coreProgress:Array.from({length:MUAY_CORE_LEVELS.length+1},(_,rank)=>sentinelCoreProgress(rank)),lessons:SENTINEL_LESSONS,practiceLabels:SENTINEL_PRACTICE_LABELS,points:sentinelPoints(this.learningLevel(client.sessionId,player)),rankLevels:SKILL_RANK_LEVELS,rankPractice:SKILL_RANK_PRACTICE,rankable:SENTINEL_RANKABLE_SKILLS});}
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
    if((message as {action?:unknown}).action==="equip" && this.configuredHotbar(client.sessionId))return this.reject(client,"skill_hotbar_use_unified");
    if(action==="learn" || action==="upgrade" || action==="core_upgrade") {if(keys.length!==2 || typeof input.skillId!=="string")return this.reject(client,"invalid_sentinel_book");}
    else if(action==="equip") {if(keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 || (input.skillId!==null && typeof input.skillId!=="string"))return this.reject(client,"invalid_sentinel_book");}
    else if(action==="reset" || action==="core_reset") {if(keys.length!==1)return this.reject(client,"invalid_sentinel_book");}
    else return this.reject(client,"invalid_sentinel_book");
    const id=client.sessionId,player=this.buildPlayer(client,"occult"),book=this.sentinelBooks.get(id);
    if(!player)return;
    if(player.pathId!=="sentinel")return this.reject(client,"sentinel_class_required");
    if(!book)return this.reject(client,"build_unavailable");
    const learning=action==="learn" || action==="upgrade" || action==="core_upgrade";
    if(learning && !this.canLearnSkillsNow(client))return;
    if(!learning && (player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs))
      return this.reject(client,"sentinel_book_needs_shrine");
    const next=validateSentinelBook(book,this.learningLevel(client.sessionId,player));
    if(action==="core_upgrade"){
      const skillId=input.skillId as SentinelCoreId;
      if(!Object.hasOwn(SENTINEL_CORE,skillId))return this.reject(client,"invalid_sentinel_book");
      const rank=next.coreRanks?.[skillId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || this.learningLevel(client.sessionId,player)<MUAY_CORE_LEVELS[rank])return this.reject(client,"sentinel_level");
      if(Object.values(next.coreRanks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"sentinel_no_points");
      next.coreRanks={...next.coreRanks,[skillId]:rank+1};
    }else if(action==="core_reset"){
      if(!Object.keys(next.coreRanks ?? {}).length)return this.reject(client,"sentinel_book_empty");
      delete next.coreRanks;
    }else if(action==="learn"){
      const id=input.skillId as SentinelSkillId;if(!Object.hasOwn(SENTINEL_LESSONS,id))return this.reject(client,"invalid_sentinel_book");
      const lesson:SentinelLesson=SENTINEL_LESSONS[id];
      if(next.learned.includes(id))return this.reject(client,"sentinel_already_learned");
      if(this.learningLevel(client.sessionId,player)<lesson.level)return this.reject(client,"sentinel_level");
      if(next.learned.length+skillRankCost(next.ranks)>=sentinelPoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"sentinel_no_points");
      if(lesson.requires.some(req=>!next.learned.includes(req as SentinelSkillId)))return this.reject(client,"sentinel_prerequisite");
      if(Object.entries(lesson.practice).some(([category,needed])=>next.practice[category as keyof typeof next.practice]<(needed ?? 0)))return this.reject(client,"sentinel_practice");
      next.learned.push(id);
    }else if(action==="upgrade"){
      const id=input.skillId as SentinelSkillId;
      if(!SENTINEL_RANKABLE_SKILLS.some(skill=>skill===id) || !next.learned.includes(id))return this.reject(client,"sentinel_skill_locked");
      const rank=next.ranks?.[id] ?? 0;
      if(rank>=SKILL_RANK_LEVELS.length || this.learningLevel(client.sessionId,player)<SKILL_RANK_LEVELS[rank])return this.reject(client,"sentinel_level");
      if(Object.values(next.practice).reduce((sum,count)=>sum+count,0)<SKILL_RANK_PRACTICE[rank])return this.reject(client,"sentinel_practice");
      if(next.learned.length+skillRankCost(next.ranks)>=sentinelPoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"sentinel_no_points");
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
        this.sentinelAnchors.delete(id);this.sentinelCounters.delete(id);this.swordGuards.delete(id);this.prototypeFirmGuards.delete(id);
        this.effects.remove(id,"sentinel_step",id);this.effects.remove(id,"sentinel_anchor",id);
        for(const [member,link] of this.sentinelInterceptions)if(link.ownerId===id)this.sentinelInterceptions.delete(member);
      }
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      try {
        client.send("sentinel_book_changed",{action});
        this.sendFieldPractice(client,player,action,input.skillId,SENTINEL_CORE,SENTINEL_LESSONS);
      } catch(error){console.warn("MONTRA sentinel book confirmation was not delivered",error);}
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
    const attack=(this.masteryPower(actor,monster?"pve":"pvp","atk",weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee))*power*(monster?1:0.75);
    if(monster)this.hitMonsterWithSpell(id,monster,calculateDamage(attack,monster.defense,monster.level),"sword");
    else {
      const victim=target as Player,damage=this.directGuardDamage(targetId,actor,calculateDamage(attack,this.masteryPower(victim,"pvp","def"),victim.level));
      if(!this.applyPlayerHit(actor,targetId,victim,damage,()=>{
        this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"sentinel"},{afterNextPatch:true});
      },()=>{
        actor.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:actor.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});
      }))return false;
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
    if(actor.flying || !onMapGround(actor) || this.isProtectedArea(actor.mapId,actor))return this.reject(client,"sentinel_location");
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
    let shockTargets:string[]|undefined;
    if(skillId==="shock"){
      const candidates:Array<{target:Monster|Player;id:string}>=[...[this.state.monster,...this.state.monsters.values()].map(target=>({target,id:target.id})),...[...this.state.players.entries()].map(([id,target])=>({target,id}))];
      const targets=candidates
        .filter(entry=>entry.id && entry.id!==id && entry.target.alive && distance3d(actor,entry.target)<=p.shock.range && Math.abs(actor.y-entry.target.y)<=1.1 && this.sameCombatMap(id,entry.id) && !this.pendingItemUses.has(entry.id) && !this.pendingRewards.has(entry.id) && !this.pendingCharacterLeaves.has(entry.id) && this.bodyPathClear(actor.mapId,actor,entry.target))
        .sort((a,b)=>distance3d(actor,a.target)-distance3d(actor,b.target) || a.id.localeCompare(b.id));
      shockTargets=targets.slice(0,5).map(entry=>entry.id);
    }
    if(!this.spendSkillMana(client,actor,cost,shockTargets??[],ally?[targetId]:[]))return;book.cooldowns[skillId]=Date.now()+skill.cooldownMs;
    this.startSkillAction(id,actor,"idle");
    if(skillId==="shock"){
      for(const target of shockTargets??[])if(this.sentinelInterrupt(id,target,p.shock.monsterStunMs)==="applied")this.recordCombat(id,target);
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
    this.broadcast("sentinel_core_used",{playerId:id,skillId,targetId,...(shockTargets?{targetIds:shockTargets}:{}),durationMs:skillId==="riposte"?p.riposte.durationMs:skillId==="protect"?p.protect.durationMs:0},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castSentinelSkill(client:Client,message:unknown,prototypeSequence?:number):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_sentinel_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(SENTINEL_LESSONS,input.skillId) ||
      Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))
      return this.reject(client,"invalid_sentinel_skill");
    const id=client.sessionId,skillId=input.skillId as SentinelSkillId,skill:SentinelLesson=SENTINEL_LESSONS[skillId];
    const actor=this.spellCaster(client),book=this.sentinelBooks.get(id);
    if(!actor || !book)return;
    if(actor.pathId!=="sentinel" || !this.persistentCharacters.has(id))return this.reject(client,"sentinel_class_required");
    if(!book.learned.includes(skillId) || !this.advancedEquipped(id,skillId,book.slots.includes(skillId)) || skill.effect==="passive")return this.reject(client,"sentinel_skill_locked");
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    if(actor.flying || !onMapGround(actor) || this.isProtectedArea(actor.mapId,actor))return this.reject(client,"sentinel_location");
    if(Date.now()<(book.cooldowns[skillId] ?? 0))return this.reject(client,"sentinel_cooldown");
    if(actor.mana<skill.stamina)return this.reject(client,"insufficient_mana");
    let firmGuard:FirmGuardState|undefined;
    if(prototypeSequence!==undefined){
      if(this.field)return this.reject(client,"prototype_unavailable");
      const state=this.prototypeFirmGuards.get(id);
      firmGuard=state?{...state}:newFirmGuardState();
      if(!activateFirmGuard(firmGuard,this.firmGuardActor(id,actor),this.simulatedMs,prototypeSequence,actor.facing))return this.reject(client,"prototype_unavailable");
    }
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
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(actor),false,actor.mapId) || this.isProtectedArea(actor.mapId,next) || !this.bodyPathClear(actor.mapId,actor,next))return this.reject(client,"sentinel_blocked");
      if(travel>0.00001){const sweep=advanceDash(actor,{dx:vx,dz:vz},travel,(x,z)=>this.canOccupy(x,z,surfaceLayer(actor),false,actor.mapId) && !this.isProtectedArea(actor.mapId,{x,z}),map.bounds);
        if(sweep.blocked || sweep.moved+0.00001<travel)return this.reject(client,"sentinel_blocked");}
    }
    if(!this.spendSkillMana(client,actor,skill.stamina,offensive?[targetId]:[],allies.map(([member])=>member)))return;book.cooldowns[skillId]=Date.now()+skill.cooldownMs;
    if(allies.length)this.markSupportManaCombat(id,allies);
    if(offensive && target)actor.facing=facingTo(target.x-actor.x,target.z-actor.z);
    if(next){this.startSkillAction(id,actor,"idle");this.moveOnSurface(actor,next.x,next.z);}
    if(firmGuard)this.prototypeFirmGuards.set(id,firmGuard);
    else if(skill.effect==="guard")this.swordGuards.set(id,{until:this.simulatedMs+2500,factor:skill.power,direction:true,counterUntil:0});
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
    if(firmGuard)this.prototypeNotice("braced",id,id,skillId);
    else this.broadcast("sentinel_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castBladeCloak(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message) ||
        Object.keys(message).length!==1 || (message as Record<string,unknown>).skillId!=="cloak")
      return this.reject(client,"invalid_blade_skill");
    const id=client.sessionId,player=this.spellCaster(client),book=this.bladeBooks.get(id);
    if(!player || !book) return;
    if(player.pathId!=="blade" || !this.persistentCharacters.has(id)) return this.reject(client,"blade_class_required");
    if(!book.learned.includes("cloak") || !this.advancedEquipped(id,"cloak",book.slots.includes("cloak"))) return this.reject(client,"blade_skill_locked");
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id)) return this.reject(client,"character_busy");
    if(this.bladeCloaks.has(id)) return this.reject(client,"blade_cloak_active");
    if(player.flying || !onMapGround(player) || this.isProtectedArea(player.mapId,player)) return this.reject(client,"blade_cloak_location");
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
    const attack=(this.masteryPower(player,monster?"pve":"pvp","atk",weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee))*power*(monster?1:0.75);
    if(monster) this.hitMonsterWithSpell(id,monster,calculateDamage(attack,monster.defense,monster.level),"sword");
    else {
      const victim=target as Player,damage=this.directGuardDamage(targetId,player,calculateDamage(attack,this.masteryPower(victim,"pvp","def"),victim.level));
      if(!this.applyPlayerHit(player,targetId,victim,damage,()=>{
        this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"blade"},{afterNextPatch:true});
      },()=>{
        player.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:player.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});
      }))return false;
    }
    return true;
  }

  private castBladeCore(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_blade_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(BLADE_CORE,input.skillId) || Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))return this.reject(client,"invalid_blade_skill");
    const id=client.sessionId,skillId=input.skillId as BladeCoreId,skill=BLADE_CORE[skillId];
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const player=this.spellCaster(client),book=this.bladeBooks.get(id);
    if(!player || !book)return;
    if(player.pathId!=="blade" || !this.persistentCharacters.has(id))return this.reject(client,"blade_class_required");
    if(player.flying || !onMapGround(player) || this.isProtectedArea(player.mapId,player))return this.reject(client,"blade_cloak_location");
    if(this.bladeWindups.has(id) || this.bladeCasts.has(id))return this.reject(client,"blade_windup_active");
    if(Date.now()<(book.cooldowns[skillId] ?? 0))return this.reject(client,"blade_cooldown");
    const rank=book.coreRanks?.[skillId] ?? 0,p=bladeCoreProgress(rank),cost=skill.stamina+rank;
    if(player.mana<cost)return this.reject(client,"insufficient_mana");
    if(skillId==="blade_vanish" && this.bladeCloaks.has(id))return this.reject(client,"blade_cloak_active");
    if(skillId==="blade_fury" && this.effects.modifiers(id).length>=STACKING_RULES.maxModifiers && !this.effects.modifiers(id).some(effect=>effect.id==="blade_core_fury" && effect.sourceId===id))return this.reject(client,"blade_effect_limit");
    const targeted=skillId==="blade_heavy" || skillId==="blade_withdraw";
    let targetId="",target:Monster|Player|undefined,monster:Monster|undefined;
    if(targeted){
      const order=parseAttackCommand({targetId:input.targetId}) ?? parsePkTargetCommand({targetId:input.targetId});
      if(!order)return this.reject(client,"invalid_blade_target");
      targetId=order.targetId;monster=this.getMonster(targetId);target=monster ?? this.state.players.get(targetId);
      if(!target?.alive || targetId===id || !this.sameCombatMap(id,targetId) || (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))))return this.reject(client,"target_unavailable");
      if(distance3d(player,target)>3 || meleeHeightBlocked(player,target,1.1))return this.reject(client,"blade_out_of_range");
      if(!this.bodyPathClear(player.mapId,player,target))return this.reject(client,"blade_blocked");
    }else if(input.targetId!==undefined)return this.reject(client,"invalid_blade_skill");
    if(!this.spendSkillMana(client,player,cost,[targetId],[]))return;book.cooldowns[skillId]=Date.now()+skill.cooldownMs;
    if(skillId==="blade_vanish"){
      this.endAttack(id,player);this.destinations.delete(id);this.activeDashes.delete(id);
      for(const [attackerId,victimId] of [...this.attackTargets])if(victimId===id){const attacker=this.state.players.get(attackerId);if(attacker)this.endAttack(attackerId,attacker);}
      if(this.state.monster.targetId===id)this.state.monster.targetId="";
      this.forest.clearTarget(id);this.bladeCloaks.set(id,this.simulatedMs+p.blade_vanish.durationMs);this.syncPlayerViews();
      this.sendSwordNotice(client,"blade_cloak_changed",{active:true,skillId,durationMs:p.blade_vanish.durationMs});
    }else if(skillId==="blade_fury"){
      this.startSkillAction(id,player,"idle");
      this.effects.grant(id,{id:"blade_core_fury",sourceId:id,group:"blade_attack",bonuses:{atk:p.blade_fury.bonus}},this.simulatedMs+p.blade_fury.durationMs);
      this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
    }else if(target){
      this.startSkillAction(id,player,"attacking");player.facing=facingTo(target.x-player.x,target.z-player.z);const ambush=this.endBladeCloak(id,"attack");
      const power=skillId==="blade_heavy"?p.blade_heavy.power:p.blade_withdraw.power;
      const pvpPower=skillId==="blade_heavy"?p.blade_heavy.pvpPower:p.blade_withdraw.pvpPower;
      const hit=this.bladeDamage(id,targetId,(monster?power:pvpPower)*(ambush?(monster?1.5:1.2):1));
      if(hit && ambush)this.recordBladeOpening(id,Boolean(monster));
      if(hit && skillId==="blade_withdraw" && player.alive){
        const dx=player.x-target.x,dz=player.z-target.z,length=Math.hypot(dx,dz),map=getWorldMap(player.mapId);
        if(map){const direction=length>.001?{dx:dx/length,dz:dz/length}:{dx:-Math.sin(player.facing),dz:-Math.cos(player.facing)};
          const sweep=advanceDash(player,direction,p.blade_withdraw.distance,(x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !this.isProtectedArea(player.mapId,{x,z}) && this.bodyPathClear(player.mapId,player,{x,y:player.y,z}),map.bounds);
          if(sweep.moved>0){this.moveOnSurface(player,sweep.x,sweep.z);this.bladeRetreatUntil.set(id,this.simulatedMs+500);}
        }
      }
    }
    this.sendBladeBook(client);
    if(skillId!=="blade_vanish")this.broadcast("blade_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castBladeSkill(client:Client,message:unknown,prototypeSequence?:number):void {
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
    if(!book.learned.includes(skillId) || !this.advancedEquipped(id,skillId,book.slots.includes(skillId)) || skill.effect==="passive")return this.reject(client,"blade_skill_locked");
    if(player.flying || !onMapGround(player) || this.isProtectedArea(player.mapId,player))return this.reject(client,"blade_cloak_location");
    if(this.bladeWindups.has(id))return this.reject(client,"blade_windup_active");
    const shadow=prototypeSequence===undefined?undefined:this.prototypeShadowFor(id);
    if(shadow && prototypeSequence!==undefined){
      if(input.targetId===undefined)return this.returnPrototypeShadow(client,player,shadow,prototypeSequence);
      if(shadow.mark)return this.reject(client,"prototype_shadow_active");
    }
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
    if(!this.spendSkillMana(client,player,skill.stamina,[targetId],[],true))return;
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
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || this.isProtectedArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"blade_blocked");
      if(travel>0.00001){const sweep=advanceDash(player,{dx:vx,dz:vz},travel,(x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !this.isProtectedArea(player.mapId,{x,z}),map.bounds);
        if(sweep.blocked || sweep.moved+0.00001<travel)return this.reject(client,"blade_blocked");}
      this.startSkillAction(id,player,"idle");this.moveOnSurface(player,next.x,next.z);
    }
    if(!this.spendSkillMana(client,player,skill.stamina,[targetId],[]))return;book.cooldowns[skillId]=now+skill.cooldownMs;
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
      const origin=shadow?{x:player.x,y:player.y,z:player.z,mapId:player.mapId}:undefined;
      const ambush=this.endBladeCloak(id,"attack");
      const hit=this.bladeDamage(id,targetId,skill.power*(monster?skillRankMultiplier(book.ranks,skillId):1)*(ambush?(monster?1.5:1.2):1));
      if(hit && (!origin || (player.alive && player.pathId==="blade" && player.mapId===origin.mapId && !this.pendingWarps.has(id)))){
        if(ambush)this.recordBladeOpening(id,Boolean(monster));
        if(shadow && origin && prototypeSequence!==undefined &&
          markShadowCut(shadow,{point:origin,alive:true,eligible:true},this.simulatedMs,prototypeSequence) && shadow.mark)
          this.prototypeShadowNotice("marked",id,targetId,prototypeSequence,shadow.mark);
        if(skillId==="hidden_edge"){this.bladeMarks.set(id,{targetId,until:this.simulatedMs+8000});this.sendSwordNotice(client,"blade_mark_state",{active:true,targetId,durationMs:8000});if(monster)this.recordBladePractice(id,"mark");}
        if(skill.effect==="consume"){this.clearBladeMark(id);if(monster){this.recordBladePractice(id,"mark");this.recordBladePractice(id,"combo");}}
        if(skill.effect==="counter" && guard)guard.counterUntil=0;
      }
    }
    this.sendBladeBook(client);
    if(!shadow){
      if(skill.effect!=="approach" || !cloaked)this.broadcast("blade_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
      else this.sendSwordNotice(client,"blade_skill_used",{playerId:id,skillId});
    }
    void this.saveCharacter(id);
  }

  private updateBladeEffects():void {
    for(const [id,until] of this.bladeRetreatUntil)if(this.simulatedMs>=until)this.bladeRetreatUntil.delete(id);
    for(const [id,until] of this.bladeCasts)if(this.simulatedMs>=until){
      this.bladeCasts.delete(id);
      const player=this.state.players.get(id),client=this.clients.find(c=>c.sessionId===id);
      if(!player?.alive || player.pathId!=="blade" || !client || this.pendingWarps.has(id) || this.isProtectedArea(player.mapId,player)){
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
    if((message as {action?:unknown}).action==="equip" && this.configuredHotbar(client.sessionId))return this.reject(client,"skill_hotbar_use_unified");
    if (action==="learn" || action==="upgrade" || action==="core_upgrade") {
      if(keys.length!==2 || typeof input.skillId!=="string") return this.reject(client,"invalid_blade_book");
    } else if(action==="equip") {
      if(keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 ||
          (input.skillId!==null && typeof input.skillId!=="string")) return this.reject(client,"invalid_blade_book");
    } else if(action==="reset" || action==="core_reset") {
      if(keys.length!==1) return this.reject(client,"invalid_blade_book");
    } else return this.reject(client,"invalid_blade_book");
    const id=client.sessionId,player=this.buildPlayer(client,"occult"),book=this.bladeBooks.get(id);
    if(!player) return;
    if(player.pathId!=="blade") return this.reject(client,"blade_class_required");
    if(!book) return this.reject(client,"build_unavailable");
    if(this.bladeCloaks.has(id) || this.bladeWindups.has(id) || this.bladeCasts.has(id)) return this.reject(client,"character_busy");
    const learning=action==="learn" || action==="upgrade" || action==="core_upgrade";
    if(learning && !this.canLearnSkillsNow(client))return;
    if(!learning && (player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs))
      return this.reject(client,"blade_book_needs_shrine");
    const next=validateBladeBook(book,this.learningLevel(client.sessionId,player));
    if(action==="core_upgrade") {
      const skillId=input.skillId as string;
      if(!Object.hasOwn(BLADE_CORE,skillId))return this.reject(client,"invalid_blade_book");
      const rank=next.coreRanks?.[skillId as BladeCoreId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || this.learningLevel(client.sessionId,player)<MUAY_CORE_LEVELS[rank])return this.reject(client,"blade_level");
      if(Object.values(next.coreRanks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"blade_no_points");
      next.coreRanks={...next.coreRanks,[skillId]:rank+1};
    } else if(action==="core_reset") {
      if(!Object.keys(next.coreRanks ?? {}).length)return this.reject(client,"blade_book_empty");
      delete next.coreRanks;
    } else if(action==="learn") {
      const skillId=input.skillId as BladeSkillId;
      if(!Object.hasOwn(BLADE_LESSONS,skillId)) return this.reject(client,"invalid_blade_book");
      const lesson:BladeLesson=BLADE_LESSONS[skillId];
      if(next.learned.includes(skillId)) return this.reject(client,"blade_already_learned");
      if(this.learningLevel(client.sessionId,player)<lesson.level) return this.reject(client,"blade_level");
      if(next.learned.length+skillRankCost(next.ranks)>=bladePoints(this.learningLevel(client.sessionId,player))) return this.reject(client,"blade_no_points");
      if(lesson.requires.some(req=>!next.learned.includes(req as BladeSkillId))) return this.reject(client,"blade_prerequisite");
      if(Object.entries(lesson.practice).some(([category,needed])=>next.practice[category as keyof typeof next.practice]<(needed ?? 0)))
        return this.reject(client,"blade_practice");
      next.learned.push(skillId);
    } else if(action==="upgrade") {
      const skillId=input.skillId as BladeSkillId;
      if(!BLADE_RANKABLE_SKILLS.some(id=>id===skillId) || !next.learned.includes(skillId))return this.reject(client,"blade_skill_locked");
      const rank=next.ranks?.[skillId] ?? 0;
      if(rank>=SKILL_RANK_LEVELS.length || this.learningLevel(client.sessionId,player)<SKILL_RANK_LEVELS[rank])return this.reject(client,"blade_level");
      if(Object.values(next.practice).reduce((sum,count)=>sum+count,0)<SKILL_RANK_PRACTICE[rank])return this.reject(client,"blade_practice");
      if(next.learned.length+skillRankCost(next.ranks)>=bladePoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"blade_no_points");
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
      try {
        client.send("blade_book_changed",{action});
        this.sendFieldPractice(client,player,action,input.skillId,BLADE_CORE,BLADE_LESSONS);
      } catch(error) {console.warn("MONTRA blade book confirmation was not delivered",error);}
    },error=>{console.error("MONTRA blade book save failed",error);this.reject(client,"blade_book_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private sendOccultBook(client:Client):void {
    this.syncSkillHotbar(client.sessionId);
    const player=this.state.players.get(client.sessionId),book=this.occultBooks.get(client.sessionId);
    if (!player || !book || !isOccultPath(player.pathId)) return;
    try {
      client.send("occult_book_state",{path:player.pathId,book,core:player.pathId==="seer"?SEER_CORE:MENDER_CORE,coreLevels:MUAY_CORE_LEVELS,corePointLevels:MUAY_CORE_POINT_LEVELS,coreProgress:Array.from({length:MUAY_CORE_LEVELS.length+1},(_,rank)=>player.pathId==="seer"?seerCoreProgress(rank):menderCoreProgress(rank)),lessons:OCCULT_LESSONS,points:occultPoints(this.learningLevel(client.sessionId,player)),
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
  private cleanseOccultDebuffs(targetId:string):boolean {
    const curse=this.clearOccultCurse(targetId,"cleansed"),poison=this.seerPoisons.delete(targetId);
    if(poison)this.broadcast("seer_poison_visual",{targetId,active:false},{afterNextPatch:true});
    return curse || poison;
  }
  private priestCleanse(targetId:string):boolean {
    let cleared=this.cleanseOccultDebuffs(targetId);
    if(this.sentinelStuns.delete(targetId)){
      const target=this.state.players.get(targetId);if(target)target.stunned=false;
      this.broadcast("seer_binding_visual",{targetId,active:false},{afterNextPatch:true});cleared=true;
    }
    if(this.muayHeldBy.has(targetId)){this.releaseMuayFor(targetId,"cleansed");cleared=true;}
    return cleared;
  }
  private endPriestSanctuary(ownerId:string):void {
    if(this.priestSanctuaries.delete(ownerId))this.broadcast("mender_sanctuary_end",{playerId:ownerId},{afterNextPatch:true});
  }

  private changeOccultBook(client:Client,message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_occult_book");
    const input=message as Record<string,unknown>,keys=Object.keys(input),action=input.action;
    if((message as {action?:unknown}).action==="equip" && this.configuredHotbar(client.sessionId))return this.reject(client,"skill_hotbar_use_unified");
    if (action==="learn" || action==="upgrade" || action==="core_upgrade") {
      if (keys.length!==2 || typeof input.skillId!=="string") return this.reject(client,"invalid_occult_book");
    } else if (action==="equip") {
      if (keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 ||
          (input.skillId!==null && typeof input.skillId!=="string")) return this.reject(client,"invalid_occult_book");
    } else if (action==="reset" || action==="core_reset") {
      if (keys.length!==1) return this.reject(client,"invalid_occult_book");
    } else return this.reject(client,"invalid_occult_book");
    const id=client.sessionId,player=this.buildPlayer(client,"occult"),book=this.occultBooks.get(id);
    if (!player || !book) return;
    if (!isOccultPath(player.pathId)) return this.reject(client,"occult_class_required");
    const learning=action==="learn" || action==="upgrade" || action==="core_upgrade";
    if(learning && !this.canLearnSkillsNow(client))return;
    if(!learning && (player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs))
      return this.reject(client,"occult_book_needs_shrine");
    const path=player.pathId,next=validateOccultBook(book,Math.max(classLearningLevel(this.rebirthStates.get(client.sessionId),"seer",player.level),classLearningLevel(this.rebirthStates.get(client.sessionId),"mender",player.level)));
    if(action==="core_upgrade") {
      const skillId=input.skillId as string,core=path==="seer"?SEER_CORE:MENDER_CORE,ranks=path==="seer"?next.coreRanks:next.menderCoreRanks;
      if(!Object.hasOwn(core,skillId))return this.reject(client,"invalid_occult_book");
      const rank=(ranks as Record<string,number>|undefined)?.[skillId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || this.learningLevel(client.sessionId,player)<MUAY_CORE_LEVELS[rank])return this.reject(client,"occult_level");
      if(Object.values(ranks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"occult_no_points");
      if(path==="seer")next.coreRanks={...next.coreRanks,[skillId as SeerCoreId]:rank+1};
      else next.menderCoreRanks={...next.menderCoreRanks,[skillId as MenderCoreId]:rank+1};
    } else if(action==="core_reset") {
      const ranks=path==="seer"?next.coreRanks:next.menderCoreRanks;
      if(!Object.keys(ranks ?? {}).length)return this.reject(client,"occult_book_empty");
      if(path==="seer")delete next.coreRanks;else delete next.menderCoreRanks;
    } else if (action==="learn") {
      const skillId=input.skillId as string;
      if (!Object.hasOwn(OCCULT_LESSONS,skillId)) return this.reject(client,"invalid_occult_book");
      const lesson:OccultLesson=OCCULT_LESSONS[skillId as OccultSkillId];
      if (lesson.path!==path) return this.reject(client,"occult_wrong_path");
      if (next.learned[path].includes(skillId as OccultSkillId)) return this.reject(client,"occult_already_learned");
      if (this.learningLevel(client.sessionId,player)<lesson.level) return this.reject(client,"occult_level");
      if (next.learned[path].length+occultRankCost(next.ranks,path)>=occultPoints(this.learningLevel(client.sessionId,player))) return this.reject(client,"occult_no_points");
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
      if(rank>=SKILL_RANK_LEVELS.length || this.learningLevel(client.sessionId,player)<SKILL_RANK_LEVELS[rank])return this.reject(client,"occult_level");
      if(next.training[path]<SKILL_RANK_PRACTICE[rank])return this.reject(client,"occult_training");
      if(next.learned[path].length+occultRankCost(next.ranks,path)>=occultPoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"occult_no_points");
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
      try {
        client.send("occult_book_changed",{action});
        this.sendFieldPractice(client,player,action,input.skillId,path==="seer"?SEER_CORE:MENDER_CORE,OCCULT_LESSONS);
      } catch(error) {console.warn("MONTRA occult book confirmation was not delivered",error);}
    },error=>{console.error("MONTRA occult book save failed",error);this.reject(client,"occult_book_save_failed");})
      .finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }

  private releaseSeerBinding(targetId:string,reason:string):boolean {
    const binding=this.seerBindings.get(targetId);if(!binding)return false;
    this.seerBindings.delete(targetId);
    this.sendSwordNotice(this.clients.find(c=>c.sessionId===binding.ownerId),"seer_binding_state",{active:false,targetId,reason});
    this.broadcast("seer_binding_visual",{targetId,active:false},{afterNextPatch:true});return true;
  }

  private castSeerCore(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_occult_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(SEER_CORE,input.skillId) || Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))return this.reject(client,"invalid_occult_skill");
    const id=client.sessionId,skillId=input.skillId as SeerCoreId,skill=SEER_CORE[skillId];
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const caster=this.spellCaster(client),book=this.occultBooks.get(id);
    if(!caster || !book)return;
    if(caster.pathId!=="seer")return this.reject(client,"occult_wrong_path");
    if(this.isProtectedArea(caster.mapId,caster))return this.reject(client,"occult_blocked");
    if(skillId==="seer_binding"){
      const previous=[...this.seerBindings].find(([,binding])=>binding.ownerId===id);
      if(previous){this.releaseSeerBinding(previous[0],"released");return;}
    }
    if(Date.now()<(book.cooldowns[skillId] ?? 0))return this.reject(client,"occult_cooldown");
    const rank=book.coreRanks?.[skillId] ?? 0,p=seerCoreProgress(rank),cost=skill.stamina+rank;
    if(caster.mana<cost)return this.reject(client,"insufficient_mana");
    if(skillId==="seer_pot"){
      this.summonSpirit(client,{},"pot_spirit");
      return;
    }
    const targetId=typeof input.targetId==="string"?input.targetId:"",monster=this.getMonster(targetId),target=monster ?? this.state.players.get(targetId);
    const range=skillId==="seer_binding"?p.seer_binding.range:skillId==="seer_poison"?p.seer_poison.range:monster?p.seer_buffalo.range:seerCoreProgress(0).seer_buffalo.range;
    if(!target?.alive || targetId===id || !this.sameCombatMap(id,targetId) || (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))) || distance3d(caster,target)>range || !this.bodyPathClear(caster.mapId,caster,target))return this.reject(client,"occult_out_of_range");
    if(skillId==="seer_binding"){
      if(monster && (monster.tier!=="normal" || this.seerBindings.has(targetId)))return this.reject(client,"seer_binding_immune");
      if(!monster && (this.simulatedMs<(this.sentinelStunResists.get(targetId) ?? 0) || (target as Player).flying || !onMapGround(target as Player) || this.climbs.has(targetId) || this.flightTransitions.has(targetId)))return this.reject(client,"seer_binding_immune");
    }
    if(skillId==="seer_poison" && this.seerPoisons.has(targetId) && this.seerPoisons.get(targetId)?.ownerId!==id)return this.reject(client,"seer_poison_busy");
    if(!this.spendSkillMana(client,caster,cost,[targetId],[]))return;book.cooldowns[skillId]=Date.now()+skill.cooldownMs;this.startSkillAction(id,caster,"idle");
    caster.facing=facingTo(target.x-caster.x,target.z-caster.z);this.recordCombat(id,targetId);
    if(skillId==="seer_binding"){
      if(monster){
        this.seerBindings.set(targetId,{ownerId:id,rank});
        if(this.attackTargets.get(id)===targetId)this.endAttack(id,caster);
        this.sendSwordNotice(client,"seer_binding_state",{active:true,targetId});
        this.broadcast("seer_binding_visual",{targetId,active:true},{afterNextPatch:true});
      }else{
        const result=this.sentinelInterrupt(id,targetId);
        if(result==="applied"){
          const until=this.simulatedMs+p.seer_binding.pvpDurationMs;
          this.sentinelStuns.set(targetId,until);this.sentinelStunResists.set(targetId,this.simulatedMs+p.seer_binding.pvpImmunityMs);
          this.broadcast("seer_binding_visual",{targetId,active:true,durationMs:p.seer_binding.pvpDurationMs},{afterNextPatch:true});
        }
      }
    } else if(skillId==="seer_poison"){
      for(const [other,poison] of this.seerPoisons)if(poison.ownerId===id){this.seerPoisons.delete(other);this.broadcast("seer_poison_visual",{targetId:other,active:false},{afterNextPatch:true});}
      this.seerPoisons.set(targetId,{ownerId:id,nextTick:this.simulatedMs+p.seer_poison.intervalMs,fraction:monster?p.seer_poison.pveFraction:p.seer_poison.pvpFraction});
      this.broadcast("seer_poison_visual",{targetId,active:true},{afterNextPatch:true});
    } else {
      this.seerBuffaloCasts.set(id,{targetId,until:this.simulatedMs+p.seer_buffalo.castMs,rank:monster?rank:0,x:target.x,z:target.z});
    }
    this.sendOccultBook(client);
    this.broadcast("seer_core_used",{playerId:id,skillId,targetId,castMs:skillId==="seer_buffalo"?p.seer_buffalo.castMs:0},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castMenderCore(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_occult_skill");
    const input=message as Record<string,unknown>;
    if(typeof input.skillId!=="string" || !Object.hasOwn(MENDER_CORE,input.skillId) || Object.keys(input).some(k=>k!=="skillId" && k!=="targetId") || (input.targetId!==undefined && typeof input.targetId!=="string"))return this.reject(client,"invalid_occult_skill");
    const id=client.sessionId,skillId=input.skillId as MenderCoreId,skill=MENDER_CORE[skillId];
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const caster=this.spellCaster(client),book=this.occultBooks.get(id);
    if(!caster || !book)return;
    if(caster.pathId!=="mender")return this.reject(client,"occult_wrong_path");
    if(Date.now()<(book.cooldowns[skillId] ?? 0))return this.reject(client,"occult_cooldown");
    const rank=book.menderCoreRanks?.[skillId] ?? 0,p=menderCoreProgress(rank),cost=skill.stamina+rank;
    if(caster.mana<cost)return this.reject(client,"insufficient_mana");
    const side=this.field ? this.warSeats.get(id)?.side : undefined;
    const party=(this.parties.get(id)?.members ?? [id]).filter(member=>!this.field || member===id || Boolean(side && this.warSeats.get(member)?.side===side));
    const range=p[skillId].range,targetId=typeof input.targetId==="string"?input.targetId:id;
    if(skillId==="mender_core_heal" && !party.includes(targetId))return this.reject(client,"occult_party_required");
    const members=skillId==="mender_core_heal"?[targetId]:this.field && side ? [...new Set([id,...[...this.warSeats].filter(([,seat])=>seat.side===side).map(([member])=>member)])] : party;
    let targets=members.map(member=>[member,this.state.players.get(member)] as const).filter((entry):entry is [string,Player]=>Boolean(entry[1]?.alive && entry[1].mapId===caster.mapId &&
      !this.pendingWarps.has(entry[0]) && !this.pendingItemUses.has(entry[0]) && !this.pendingRewards.has(entry[0]) && !this.pendingCharacterLeaves.has(entry[0]) &&
      distance3d(caster,entry[1])<=range && (entry[0]===id || (this.combatSegmentClear(caster.mapId,caster,entry[1]) && this.bodyPathClear(caster.mapId,caster,entry[1])))));
    if(skillId==="mender_core_circle")targets=targets.filter(([,target])=>target.hp<target.maxHp);
    if(skillId==="mender_core_cleanse")targets=targets.filter(([member])=>{const effects=this.effects.modifiers(member);return effects.length<STACKING_RULES.maxModifiers || effects.some(effect=>effect.id===skillId && effect.sourceId===id);});
    if(!targets.length)return this.reject(client,skillId==="mender_core_cleanse"?"occult_effect_limit":"class_skill_no_target");
    if(!this.spendSkillMana(client,caster,cost,[],targets.map(([member])=>member)))return;book.cooldowns[skillId]=Date.now()+skill.cooldownMs;this.startSkillAction(id,caster,"idle");
    this.markSupportManaCombat(id,targets);
    let healed=false,cleansed=false;
    for(const [member,target] of targets){
      if(skillId==="mender_core_heal"){
        const removed=this.priestCleanse(member);if(removed)this.markWarSupport(id,member,false);cleansed=removed || cleansed;
        const existing=this.priestRegens.get(member);
        if(!existing || existing.until<=this.simulatedMs || existing.fraction<=p.mender_core_heal.tickFraction)
          this.priestRegens.set(member,{ownerId:id,mapId:target.mapId,until:this.simulatedMs+p.mender_core_heal.durationMs+100,nextTick:this.simulatedMs+p.mender_core_heal.intervalMs,fraction:p.mender_core_heal.tickFraction});
      }else if(skillId==="mender_core_cleanse"){
        const bonus=p.mender_core_cleanse.bonus;
        this.effects.grant(member,{id:skillId,sourceId:id,group:"priest_all",bonuses:{atk:bonus,def:bonus,magicAtk:bonus,magicDef:bonus}},this.simulatedMs+p.mender_core_cleanse.durationMs);
        this.applyStats(member,target,this.statAllocations.get(member) ?? emptyAllocations());
      }else if(skillId==="mender_core_circle"){
        if(target.hp<target.maxHp){target.hp=Math.min(target.maxHp,target.hp+this.healAmount(id,member,target.maxHp*p.mender_core_circle.fraction));healed=true;void this.saveCharacter(member);}
      }
    }
    if(skillId==="mender_core_ward"){
      this.priestSanctuaries.set(id,{mapId:caster.mapId,x:caster.x,y:caster.y,z:caster.z,radius:p.mender_core_ward.range,until:this.simulatedMs+p.mender_core_ward.durationMs});
      for(const [member,target] of this.state.players)if(member!==id && target.alive && target.mapId===caster.mapId && distance3d(caster,target)<=p.mender_core_ward.range && this.combatSegmentClear(caster.mapId,caster,target) && this.bodyPathClear(caster.mapId,caster,target))this.markWarSupport(id,member,false);
    }
    if(healed)this.recordOccultTraining(id,"mender",["healing"]);
    if(cleansed)this.recordOccultTraining(id,"mender",["cleanse"]);
    this.sendOccultBook(client);
    this.broadcast("mender_core_used",{playerId:id,skillId,targetId:skillId==="mender_core_heal"?targetId:id,targets:targets.length,...(skillId==="mender_core_ward"?{area:{x:caster.x,y:caster.y,z:caster.z,radius:p.mender_core_ward.range,durationMs:p.mender_core_ward.durationMs}}:{})},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castOccultSkill(client:Client,message:unknown,prototypeSequence?:number):void {
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
    if (lesson.path!==path || !book.learned[path].includes(skillId) || !this.advancedEquipped(id,skillId,book.loadouts[path].includes(skillId)))
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
        if (spirit?.kind === "captured_ghost") return this.reject(client, "occult_skill_locked");
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
      if (prototypeSequence===undefined && (lesson.effect==="heal" || lesson.effect==="spirit_heal")) targets=targets.filter(([,target])=>target.hp<target.maxHp);
      if (!targets.length) return this.reject(client,"class_skill_no_target");
      if (lesson.effect==="cleanse" && !this.occultCurses.has(targetId) && !this.seerPoisons.has(targetId)) return this.reject(client,"occult_no_curse");
      if (lesson.effect==="cleanse_area" && !targets.some(([member])=>this.occultCurses.has(member) || this.seerPoisons.has(member))) return this.reject(client,"occult_no_curse");
      if (lesson.effect==="ward" || lesson.effect==="ward_area" || lesson.effect==="spirit_ward" || lesson.effect==="trance") {
        for (const [member] of targets) {
          const active=this.effects.modifiers(member);
          if (active.length>=STACKING_RULES.maxModifiers && !active.some(effect=>effect.id===skillId && effect.sourceId===id))
            return this.reject(client,"occult_effect_limit");
        }
      }
    }

    if(prototypeSequence!==undefined && skillId==="mender_deep_circle"){
      if(!this.movingHealingOwner(id))return this.reject(client,"prototype_unavailable");
      const field:MovingHealingField={kind:"moving",castId:id+"/"+prototypeSequence,mapId:caster.mapId,
        startedAt:this.simulatedMs,until:this.simulatedMs+HEALING_FIELD_DURATION_MS,
        nextTick:this.simulatedMs+HEALING_FIELD_INTERVAL_MS,range:lesson.range,
        power:lesson.power*MOVING_CIRCLE_POWER_FACTOR*supportRankMultiplier(book.ranks,skillId)};
      if(!this.spendSkillMana(client,caster,lesson.stamina,[],targets.map(([member])=>member)))return;
      book.cooldowns[skillId]=Date.now()+lesson.cooldownMs;
      this.clearOccultHealingField(id);
      this.occultHealingFields.set(id,field);
      void this.saveCharacter(id);
      this.sendOccultBook(client);
      this.movingCircleNotice(id,field,"placed");
      return;
    }
    if(prototypeSequence!==undefined && skillId==="mender_deep_heal"){
      if(this.field || caster.flying || !onMapGround(caster) || !this.persistentCharacters.has(id) ||
        this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
        [...this.prototypeRescues.values()].some(talisman=>talisman.ownerId===id))return this.reject(client,"prototype_unavailable");
      const talisman=createRescueTalisman(this.prototypeRescues.get(targetId)??null,{castId:id+"/"+prototypeSequence,
        ownerId:id,targetId,mapId:caster.mapId,now:this.simulatedMs,durationMs:5000,
        healFraction:lesson.power*supportRankMultiplier(book.ranks,skillId)});
      if(!talisman)return this.reject(client,"prototype_unavailable");
      if(!this.spendSkillMana(client,caster,lesson.stamina,[],[targetId]))return;
      book.cooldowns[skillId]=Date.now()+lesson.cooldownMs;
      this.prototypeRescues.set(targetId,talisman);
      this.markSupportManaCombat(id,targets);
      void this.saveCharacter(id);
      this.sendOccultBook(client);
      this.rescueNotice(talisman,"placed");
      return;
    }
    if(prototypeSequence!==undefined && skillId==="seer_spirit_rain"){
      const mark=this.occultMarks.get(id);
      if(mark?.targetId!==targetId || mark.until<=this.simulatedMs)return this.reject(client,"occult_mark_required");
      if(!monster || monster.hp<=0 || this.field || caster.flying || !onMapGround(caster) || !this.persistentCharacters.has(id) ||
        this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))
        return this.reject(client,"prototype_unavailable");

      const targets=[monster];
      const candidates=[this.state.monster,...this.state.monsters.values()].filter(candidate=>
        candidate.alive && candidate.hp>0 && candidate.mapId===caster.mapId && this.sameCombatMap(id,candidate.id));
      while(targets.length<SPIRIT_RAIN_HIT_FACTORS.length){
        const from=targets[targets.length-1];
        const next=candidates.filter(candidate=>!targets.some(hit=>hit.id===candidate.id) &&
          distance3d(from,candidate)<=SPIRIT_RAIN_HOP_RANGE && this.bodyPathClear(caster.mapId,from,candidate))
          .sort((a,b)=>distance3d(from,a)-distance3d(from,b) || (a.id<b.id?-1:a.id>b.id?1:0))[0];
        if(!next)break;
        targets.push(next);
      }
      if(!this.spendSkillMana(client,caster,lesson.stamina,[targetId],[]))return;
      book.cooldowns[skillId]=Date.now()+lesson.cooldownMs;
      this.occultMarks.delete(id);
      caster.facing=facingTo(monster.x-caster.x,monster.z-caster.z);
      const power=this.masteryPower(caster,"pve","magicAtk",weaponBonuses(this.inventories.get(id),"pve").ranged)*
        lesson.power*skillRankMultiplier(book.ranks,skillId);
      const targetIds:string[]=[];
      for(const [index,target] of targets.entries()){
        if(!target.alive || target.hp<=0)break;
        const before=target.hitSeq;
        this.recordCombat(id,target.id);
        this.hitMonsterWithSpell(id,target,calculateDamage(power*SPIRIT_RAIN_HIT_FACTORS[index],target.defense,target.level),"talisman");
        if(target.hitSeq===before)break;
        targetIds.push(target.id);
      }
      if(targetIds.length)this.recordOccultTraining(id,"seer",["rice"]);
      void this.saveCharacter(id);
      this.sendOccultBook(client);
      if(targetIds.length)this.prototypeTransport()?.skill({version:1,phase:"chained",skillId,playerId:id,targetId,
        seq:prototypeSequence,targetIds,serverNowMs:this.simulatedMs});
      return;
    }
    if(prototypeSequence!==undefined && skillId==="seer_ash_rice"){
      if(!monster)return this.reject(client,"target_unavailable");
      const position={x:monster.x,y:groundAt(caster.mapId,monster.x,monster.z),z:monster.z};
      if(this.field || caster.flying || !onMapGround(caster) || !this.persistentCharacters.has(id) ||
        this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
        !this.canOccupy(position.x,position.z,0,false,caster.mapId) || !this.bodyPathClear(caster.mapId,caster,position))
        return this.reject(client,"prototype_unavailable");
      const trap=createAshTrap(this.prototypeAshTraps.get(id)??null,{castId:id+"/"+prototypeSequence,
        ownerId:id,mapId:caster.mapId,position,now:this.simulatedMs,armDelayMs:1000,durationMs:5000,radius:2});
      if(!trap)return this.reject(client,"prototype_unavailable");
      if(!this.spendSkillMana(client,caster,lesson.stamina,[targetId],[]))return;
      book.cooldowns[skillId]=Date.now()+lesson.cooldownMs;
      this.prototypeAshTraps.set(id,trap);
      void this.saveCharacter(id);
      this.sendOccultBook(client);
      this.ashTrapNotice(trap,"placed",targetId);
      return;
    }
    if(!this.spendSkillMana(client,caster,lesson.stamina,offensive?[targetId]:[],targets.map(([member])=>member)))return;
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
        const attack=this.masteryPower(caster,monster?"pve":"pvp","magicAtk",weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").ranged);
        const damage=calculateDamage(attack*power*(opponent?0.65:1),monster?.defense ?? this.masteryPower(opponent!,"pvp","magicDef"),target.level);
        this.occultDamage(id,targetId,damage,false,"direct");
        if (lesson.effect==="rice_area" && monster) {
          const others=[this.state.monster,...this.state.monsters.values()]
            .filter(other=>other.id!==targetId && other.alive && other.mapId===caster.mapId &&
              distance3d(other,monster!)<=3 && this.sameCombatMap(id,other.id) &&
              this.bodyPathClear(caster.mapId,caster,other) && this.bodyPathClear(caster.mapId,monster!,other))
            .sort((a,b)=>distance3d(a,monster!)-distance3d(b,monster!)).slice(0,2);
          for (const other of others) {this.recordCombat(id,other.id);this.occultDamage(id,other.id,calculateDamage(attack*power,other.defense,other.level),false,"direct");}
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
          const removed=this.cleanseOccultDebuffs(member);if(removed)this.markWarSupport(id,member,false);trained=removed || trained;
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
      if(lesson.effect==="heal_area"){
        this.clearOccultHealingField(id);
        this.occultHealingFields.set(id,{kind:"fixed",mapId:caster.mapId,x:caster.x,y:caster.y,z:caster.z,
          until:this.simulatedMs+HEALING_FIELD_DURATION_MS,nextTick:this.simulatedMs+HEALING_FIELD_INTERVAL_MS,
          power:0.03*supportRankMultiplier(book.ranks,skillId),range:lesson.range});
      }
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

  private occultDamage(ownerId:string,targetId:string,damage:number,percentDamage:boolean,source:"direct"|"dot"):void {
    const monster=this.getMonster(targetId);
    if (monster?.alive) {this.hitMonsterWithSpell(ownerId,monster,damage,"talisman");return;}
    const owner=this.state.players.get(ownerId),victim=this.state.players.get(targetId);
    if (!owner?.alive || !victim?.alive || !this.sameCombatMap(ownerId,targetId,true)) return;
    this.endBladeCloak(targetId,"damaged");
    damage=this.swordGuardDamage(targetId,owner,damage,0,undefined,percentDamage,source);
    if(!this.applyPlayerHit(owner,targetId,victim,damage,()=>{
      this.broadcast("pvp_hit",{attackerId:ownerId,targetId,damage,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"occult"},{afterNextPatch:true});
    },()=>{
      owner.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",ownerId);
      this.broadcast("pvp_kill",{winnerId:ownerId,loserId:targetId,source:"occult",kills:owner.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});
      void this.saveCharacter(ownerId);
    }))return;
  }

  private updateOccultEffects():void {
    for(const [targetId,regen] of this.priestRegens){
      const target=this.state.players.get(targetId);
      if(!target?.alive || target.mapId!==regen.mapId || this.simulatedMs>=regen.until){this.priestRegens.delete(targetId);continue;}
      if(this.simulatedMs<regen.nextTick)continue;
      regen.nextTick=this.simulatedMs+2000;
      this.supportMastery(regen.ownerId,[targetId]);
      if(this.pendingWarps.has(targetId) || this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))continue;
      if(target.hp<target.maxHp){target.hp=Math.min(target.maxHp,target.hp+this.healAmount(regen.ownerId,targetId,target.maxHp*regen.fraction));this.recordOccultTraining(regen.ownerId,"mender",["healing"]);void this.saveCharacter(targetId);}
    }
    for(const [ownerId,zone] of this.priestSanctuaries){
      const owner=this.state.players.get(ownerId);
      if(this.simulatedMs>=zone.until || !owner?.alive || owner.pathId!=="mender" || owner.mapId!==zone.mapId)this.endPriestSanctuary(ownerId);
    }
    for(const [targetId,binding] of this.seerBindings){
      const owner=this.state.players.get(binding.ownerId),target=this.getMonster(targetId);
      if(!owner?.alive || owner.pathId!=="seer" || !target?.alive || !this.sameCombatMap(binding.ownerId,targetId,true))this.releaseSeerBinding(targetId,"expired");
    }
    for(const [targetId,poison] of this.seerPoisons){
      const owner=this.state.players.get(poison.ownerId),target=this.getMonster(targetId) ?? this.state.players.get(targetId);
      if(!owner?.alive || owner.pathId!=="seer" || !target?.alive || target.hp<=1 || !this.sameCombatMap(poison.ownerId,targetId,true,true)){
        this.seerPoisons.delete(targetId);this.broadcast("seer_poison_visual",{targetId,active:false},{afterNextPatch:true});continue;
      }
      if(this.simulatedMs>=poison.nextTick){
        poison.nextTick=this.simulatedMs+2500;
        const binding=this.seerBindings.get(targetId);
        const bonus=binding?.ownerId===poison.ownerId ? seerCoreProgress(binding.rank).seer_binding.poisonBonus : 0;
        this.recordCombat(poison.ownerId,targetId);
        const amount=Math.min(target.hp-1,Math.max(1,Math.round(target.maxHp*(poison.fraction+bonus))));
        if(amount>0){this.recordCombat(poison.ownerId,targetId);this.occultDamage(poison.ownerId,targetId,amount,true,"dot");}
      }
    }
    for(const [id,cast] of this.seerBuffaloCasts){
      const caster=this.state.players.get(id),monster=this.getMonster(cast.targetId),target=monster ?? this.state.players.get(cast.targetId);
      if(!caster?.alive || caster.pathId!=="seer" || this.sentinelStuns.has(id) || this.pendingWarps.has(id) || this.muayControlled(id)){this.seerBuffaloCasts.delete(id);continue;}
      if(this.simulatedMs<cast.until)continue;
      this.seerBuffaloCasts.delete(id);
      const p=seerCoreProgress(cast.rank).seer_buffalo;
      if(!target?.alive || !this.sameCombatMap(id,cast.targetId) || Math.hypot(target.x-cast.x,target.z-cast.z)>3 || distance3d(caster,target)>p.range || !this.bodyPathClear(caster.mapId,caster,target)){
        this.sendSwordNotice(this.clients.find(c=>c.sessionId===id),"seer_buffalo_result",{result:"miss"});continue;
      }
      const attack=this.masteryPower(caster,monster?"pve":"pvp","magicAtk",weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").ranged);
      const damage=calculateDamage(attack*(monster?p.power:2*.65),monster?.defense ?? this.masteryPower(target as Player,"pvp","magicDef"),target.level);
      this.occultDamage(id,cast.targetId,damage,false,"direct");
      this.broadcast("seer_buffalo_hit",{playerId:id,targetId:cast.targetId,from:{x:caster.x,y:caster.y+.8,z:caster.z},to:{x:target.x,y:target.y+.8,z:target.z}},{afterNextPatch:true});
    }
    for (const [owner,mark] of this.occultMarks) {
      const target=this.getMonster(mark.targetId);
      if (this.simulatedMs>=mark.until || !target?.alive || !this.sameCombatMap(owner,mark.targetId)) this.occultMarks.delete(owner);
    }
    for (const [targetId,curse] of this.occultCurses) {
      const owner=this.state.players.get(curse.ownerId),target=this.getMonster(targetId) ?? this.state.players.get(targetId);
      if (this.simulatedMs>=curse.until || !owner?.alive || owner.pathId!=="seer" || !target?.alive ||
          !this.sameCombatMap(curse.ownerId,targetId,true,true)) {this.clearOccultCurse(targetId,"expired");continue;}
      if (this.simulatedMs>=curse.nextTick) {
        curse.nextTick=Math.max(curse.nextTick+2000,this.simulatedMs+1);
        this.recordCombat(curse.ownerId,targetId);
        this.occultDamage(curse.ownerId,targetId,curse.damage,false,"dot");
      }
    }
    for (const [owner,order] of this.occultSpiritOrders)
      if (this.simulatedMs>=order.until || !this.state.summons.has(owner)) this.occultSpiritOrders.delete(owner);
    for (const [ownerId,field] of this.occultHealingFields) {
      const owner=field.kind==="moving"?this.movingHealingOwner(ownerId):this.state.players.get(ownerId);
      if(!owner?.alive || owner.pathId!=="mender" || owner.mapId!==field.mapId){
        this.clearOccultHealingField(ownerId);continue;
      }
      if(this.simulatedMs>=field.until){this.clearOccultHealingField(ownerId,"expired");continue;}
      if(this.simulatedMs<field.nextTick)continue;
      // A delayed moving pulse skips missed intervals and cannot burst on catch-up.
      field.nextTick=(field.kind==="moving"?this.simulatedMs:field.nextTick)+HEALING_FIELD_INTERVAL_MS;
      const center=field.kind==="moving"?owner:field;
      const party=this.parties.get(ownerId)?.members ?? [ownerId];
      const targets:Array<[string,Player]>=[];
      for(const member of party){
        const target=this.state.players.get(member);
        if(!target?.alive || target.mapId!==field.mapId || target.hp>=target.maxHp ||
          this.pendingWarps.has(member) || this.pendingItemUses.has(member) || this.pendingCharacterLeaves.has(member) ||
          this.pendingRewards.has(member) ||
          (this.field && member!==ownerId && this.warSeats.get(member)?.side!==this.warSeats.get(ownerId)?.side) ||
          (field.kind==="moving" && (target.hp<=0 || target.flying || target.mounted || !onMapGround(target))) ||
          distance3d(target,center)>field.range || !isWorldSegmentClear(field.mapId,center,target) ||
          !this.bodyPathClear(field.mapId,center,target))continue;
        targets.push([member,target]);
      }
      if(field.kind==="moving"){
        targets.sort(([,a],[,b])=>a.hp/a.maxHp-b.hp/b.maxHp);
        targets.splice(MOVING_CIRCLE_MAX_TARGETS);
      }
      let amount=0;
      for(const [member,target] of targets){
        this.supportMastery(ownerId,[member]);
        const before=target.hp;
        target.hp=Math.min(target.maxHp,target.hp+this.healAmount(ownerId,member,target.maxHp*field.power));
        amount+=target.hp-before;
        void this.saveCharacter(member);
      }
      if(targets.length){
        this.recordOccultTraining(ownerId,"mender",["healing"]);void this.saveCharacter(ownerId);
        if(field.kind==="moving")this.movingCircleNotice(ownerId,field,"pulse",{amount,targetIds:targets.map(([member])=>member)});
      }
    }
  }

  private movingHealingOwner(id:string):Player|undefined {
    const owner=this.state.players.get(id),book=this.occultBooks.get(id);
    if(this.field || !owner?.alive || owner.hp<=0 || owner.pathId!=="mender" || owner.flying || owner.mounted ||
      !onMapGround(owner) || this.climbs.has(id) || this.flightTransitions.has(id) || this.pendingWarps.has(id) ||
      this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
      !this.persistentCharacters.has(id) || !this.prototypeGameplayAllowed(id) || !book?.learned.mender.includes("mender_deep_circle") ||
      !this.advancedEquipped(id,"mender_deep_circle",book.loadouts.mender.includes("mender_deep_circle")))return;
    return owner;
  }

  private clearOccultHealingField(id:string,phase:"cleared"|"expired"="cleared"):void {
    const field=this.occultHealingFields.get(id);
    this.occultHealingFields.delete(id);
    if(field?.kind==="moving")this.movingCircleNotice(id,field,phase);
  }

  private movingCircleNotice(id:string,field:MovingHealingField,phase:"placed"|"pulse"|"cleared"|"expired",
    result?:{amount:number;targetIds:string[]}):void {
    try{
      this.prototypeTransport()?.skill({version:1,phase,skillId:"mender_deep_circle",playerId:id,targetId:id,
        castId:field.castId,serverNowMs:this.simulatedMs,startedAtServerMs:field.startedAt,
        expiresAtServerMs:field.until,durationMs:HEALING_FIELD_DURATION_MS,...result});
    }catch{/* Room state and occult_state remain authoritative. */}
  }

  private changeMuayBook(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_muay_book");
    const input=message as Record<string,unknown>, keys=Object.keys(input), action=input.action;
    if((message as {action?:unknown}).action==="equip" && this.configuredHotbar(client.sessionId))return this.reject(client,"skill_hotbar_use_unified");
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
    const learning=action==="learn" || action==="upgrade" || action==="core_upgrade";
    if(learning && !this.canLearnSkillsNow(client))return;
    if(!learning && (player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs))
      return this.reject(client,"muay_book_needs_shrine");
    const next:MuayBook={learned:[...book.learned],training:{...book.training},mastery:{chaiya:{...book.mastery.chaiya},korat:{...book.mastery.korat},lopburi:{...book.mastery.lopburi},thasao:{...book.mastery.thasao}},school:book.school,slots:[...book.slots],
      loadouts:{chaiya:[...book.loadouts.chaiya],korat:[...book.loadouts.korat],lopburi:[...book.loadouts.lopburi],thasao:[...book.loadouts.thasao]},...(book.ranks?{ranks:{...book.ranks}}:{}),...(book.coreRanks?{coreRanks:{...book.coreRanks}}:{})};
    if(action==="core_upgrade") {
      const skillId=input.skillId as MuayCoreId;
      if(!Object.hasOwn(MUAY_CORE,skillId))return this.reject(client,"invalid_muay_book");
      const rank=next.coreRanks?.[skillId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || this.learningLevel(client.sessionId,player)<MUAY_CORE_LEVELS[rank])return this.reject(client,"muay_book_level");
      if(Object.values(next.coreRanks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"muay_book_no_points");
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
      if(this.learningLevel(client.sessionId,player)<lesson.level)return this.reject(client,"muay_book_level");
      if(next.learned.length+skillRankCost(next.ranks)>=muayPoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"muay_book_no_points");
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
      if(rank>=SKILL_RANK_LEVELS.length || this.learningLevel(client.sessionId,player)<SKILL_RANK_LEVELS[rank])return this.reject(client,"muay_book_level");
      if(next.training.strikes+next.training.blocks<SKILL_RANK_PRACTICE[rank])return this.reject(client,"muay_book_training");
      if(next.learned.length+skillRankCost(next.ranks)>=muayPoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"muay_book_no_points");
      next.ranks={...next.ranks,[skillId]:rank+1};
    } else if(action==="school") {
      const school=input.school as string;
      if(!Object.hasOwn(MUAY_SCHOOLS,school))return this.reject(client,"invalid_muay_book");
      const selected=school as MuaySchool, requirements=MUAY_SCHOOLS[selected];
      if(next.school===selected)return this.reject(client,"muay_school_selected");
      if(this.learningLevel(client.sessionId,player)<requirements.level)return this.reject(client,"muay_book_level");
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
      this.muayBooks.set(id,next);this.syncSkillHotbar(id);player.muayBookData=JSON.stringify(next);
      if(action==="school" || action==="reset") {this.clearPrototypeTransient(id);this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");this.clearMuayCombo(id);this.sendSwordNotice(client,"muay_counter_cleared",{});}
      try {
        client.send("muay_book_changed",{action});
        this.sendFieldPractice(client,player,action,input.skillId,MUAY_CORE,MUAY_SKILLS);
      } catch(error) {console.warn("MONTRA Muay book confirmation was not delivered",error);}
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

  /** Server-owned source class; unknown sources cannot trigger experimental effects. */
  private directGuardDamage(id:string,attacker:{x:number;z:number},damage:number,guardPierce=0,summonOwnerId?:string,percentDamage=false):number {
    return this.swordGuardDamage(id,attacker,damage,guardPierce,summonOwnerId,percentDamage,"direct");
  }
  private swordGuardDamage(id:string, attacker:{x:number;z:number}, damage:number,guardPierce=0, summonOwnerId?:string,percentDamage=false,source:"direct"|"dot"|"unknown"="unknown"):number {
    const player=this.state.players.get(id);
    if((player && (!player.alive || player.hp<=0)) || this.priestProtected(id))return 0;
    if(this.field && this.battleActive && !percentDamage){
      const defender=this.state.players.get(id),defenderSide=this.warSeats.get(id)?.side;
      const summoner=summonOwnerId && this.state.summons.get(summonOwnerId)===attacker ? this.state.players.get(summonOwnerId) : undefined;
      const aggressor=summoner ? [summonOwnerId!,summoner] as const : [...this.state.players.entries()].find(([,p])=>p===attacker);
      if(defender && defenderSide && aggressor && this.warSeats.get(aggressor[0])?.side && this.warSeats.get(aggressor[0])?.side!==defenderSide)
        damage=Math.max(1,Math.round(damage*warEntryDamageFactor(aggressor[1].level,defender.level)));
    }
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
    const stance=this.muayCoreStances.get(id);
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
    if(source==="direct" && player && this.prototypeGameplayAllowed(id)) {
      const dx=attacker.x-player.x,dz=attacker.z-player.z,length=Math.hypot(dx,dz);
      const front=length<0.001 || (-Math.sin(player.facing)*dx-Math.cos(player.facing)*dz)/length>=0;
      const flow=this.prototypeFlowing.get(id);
      if(flow) {const r=consumeFlowingGuard(flow,this.simulatedMs,front,damage);this.prototypeFlowing.set(id,r.state);
        if(r.factor!==1){this.recordSwordTraining(id,"blocks");return this.sentinelShareDamage(id,attacker,Math.max(1,Math.round(damage*(r.factor+(1-r.factor)*guardPierce))),summonOwnerId);}}
    }
    if (!guard || !player || this.simulatedMs>=guard.until) return this.sentinelShareDamage(id,attacker,damage,summonOwnerId);
    const dx=attacker.x-player.x, dz=attacker.z-player.z, length=Math.hypot(dx,dz);
    const front=length<0.001 || (-Math.sin(player.facing)*dx-Math.cos(player.facing)*dz)/length>=0;
    if (guard.direction && !front) return this.sentinelShareDamage(id,attacker,damage,summonOwnerId);
    const defense=this.muayDefenseWindows.get(id);
    const kind=defense && defense.until===guard.until && this.simulatedMs<defense.until ? defense.kind : undefined;
    guard.counterUntil=this.simulatedMs+3000;
    if(source==="direct" && player.pathId==="muay_boran" && this.prototypeGameplayAllowed(id)) {
      const monster=attacker===this.state.monster ? this.state.monster : [...this.state.monsters.values()].find(m=>m===attacker);
      const opponent=monster?.id ?? [...this.state.players.entries()].find(([,p])=>p===attacker)?.[0];
      const opportunity=opponent && recordChaiyaBlock(opponent,this.simulatedMs);
      if(opportunity)this.prototypeOpportunities.set(id,opportunity);else this.prototypeOpportunities.delete(id);
    }
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
    if(!link || !victim?.alive || victim.hp<=0)return damage;
    const owner=this.state.players.get(link.ownerId),party=this.parties.get(id);
    if(this.simulatedMs>=link.until || !owner?.alive || owner.hp<=0 || owner.pathId!=="sentinel" || !party?.members.includes(link.ownerId) ||
       owner.mapId!==victim.mapId || distance3d(owner,victim)>6 || this.isProtectedArea(owner.mapId,owner) ||
       this.pendingWarps.has(link.ownerId) || this.pendingItemUses.has(link.ownerId) || this.pendingRewards.has(link.ownerId) ||
       this.pendingCharacterLeaves.has(link.ownerId)){
      this.sentinelInterceptions.delete(id);return damage;
    }
    const monster=attacker===this.state.monster ? this.state.monster : [...this.state.monsters.values()].find(m=>m===attacker);
    const summonOwner=summonOwnerId && this.state.summons.get(summonOwnerId)===attacker ? this.state.players.get(summonOwnerId) : undefined;
    const aggressor=summonOwner ? [summonOwnerId!,summonOwner] as const : [...this.state.players.entries()].find(([,p])=>p===attacker);
    if(monster ? !this.sameCombatMap(link.ownerId,monster.id) : !aggressor || !aggressor[1].alive || aggressor[1].hp<=0 ||
      !this.sameCombatMap(aggressor[0],link.ownerId,false,true))return damage;
    const shared=Math.min(damage-1,Math.floor(damage*link.fraction));
    if(shared<=0)return damage;
    if(aggressor)this.markWarSupport(link.ownerId,id,true);
    if(this.priestProtected(link.ownerId))return damage-shared;
    if(this.sentinelWindups.delete(link.ownerId)){
      owner.combatState="idle";
      this.sendSwordNotice(this.clients.find(client=>client.sessionId===link.ownerId),"sentinel_windup_result",{result:"interrupted"});
    }
    if(aggressor)this.touchPvp([aggressor[0],link.ownerId]);
    if(!this.applyPlayerHit(aggressor?.[1],link.ownerId,owner,shared,()=>{
      this.lastCombatMs.set(link.ownerId,this.simulatedMs);
      if(monster)this.recordSentinelPractice(link.ownerId,"assist");
      this.broadcast("sentinel_intercept",{playerId:link.ownerId,targetId:id,damage:shared,hp:owner.hp,maxHp:owner.maxHp,hitSeq:owner.hitSeq,attackerId:aggressor?.[0] ?? monster?.id,source:summonOwner?"summon":monster?"monster":"player"},{afterNextPatch:true});
    },()=>{
      this.sentinelInterceptions.delete(id);
      if(aggressor){aggressor[1].pkKills++;owner.pkDeaths++;this.knockoutPlayer(link.ownerId,"pk",aggressor[0]);
        void this.saveCharacter(aggressor[0]);
        this.broadcast("pvp_kill",{winnerId:aggressor[0],loserId:link.ownerId,kills:aggressor[1].pkKills,deaths:owner.pkDeaths},{afterNextPatch:true});}
      else this.knockoutPlayer(link.ownerId,"monster",monster!.id);
    }))return damage;
    return damage-shared;
  }

  private muayCoreHit(id:string,targetId:string,power:number,pvpPower=power):boolean {
    const actor=this.state.players.get(id),monster=this.getMonster(targetId);
    const target=monster ?? this.state.players.get(targetId);
    if(!actor?.alive || actor.pathId!=="muay_boran" || !wearsWraps(equippedWeaponId(this.inventories.get(id))) ||
      actor.flying || !onMapGround(actor) || this.sentinelStuns.has(id) || this.muayControlled(id) ||
      !target?.alive || !this.sameCombatMap(id,targetId) ||
      distance3d(actor,target)>3 || !this.bodyPathClear(actor.mapId,actor,target))return false;
    const damage=calculateDamage((this.masteryPower(actor,monster?"pve":"pvp","atk",weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee))*(monster?power:pvpPower*MUAY_PVP_DAMAGE_MULTIPLIER),
      monster?.defense ?? this.masteryPower(target as Player,"pvp","def"),target.level);
    actor.facing=facingTo(target.x-actor.x,target.z-actor.z);
    this.recordCombat(id,targetId);
    if(monster)this.hitMonsterWithSpell(id,monster,damage,"muay");
    else {
      const victim=target as Player,actual=this.directGuardDamage(targetId,actor,damage);
      if(!this.applyPlayerHit(actor,targetId,victim,actual,()=>{
        this.broadcast("pvp_hit",{attackerId:id,targetId,damage:actual,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"muay"},{afterNextPatch:true});
      },()=>{
        actor.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);void this.saveCharacter(id);
        this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:actor.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});
      }))return false;
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
    if(actor.flying || !onMapGround(actor) || this.isProtectedArea(actor.mapId,actor))return this.reject(client,"muay_safe_area");
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
    if(!this.spendSkillMana(client,actor,manaCost,skill.kind==="target"?[targetId]:[],[],true))return;
    if(skillId==="lopburi" || skillId==="thasao") {
      const intent=skillId==="lopburi" ? this.muayMoveIntent.get(id) ?? {x:-Math.sin(actor.facing),z:-Math.cos(actor.facing)}
        : {x:target!.x-actor.x,z:target!.z-actor.z};
      const length=Math.hypot(intent.x,intent.z);
      if(length<.001)return this.reject(client,"muay_blocked");
      const travel=skillId==="lopburi"?progress.lopburi.distance:Math.max(0,length-1.8);
      const dir={dx:intent.x/length,dz:intent.z/length},map=getWorldMap(actor.mapId)!;
      let position={x:actor.x,z:actor.z},total=0;
      while(total+.00001<travel) {
        const step=advanceDash(position,dir,travel-total,(x,z)=>this.canOccupy(x,z,surfaceLayer(actor),false,actor.mapId) && !this.isProtectedArea(actor.mapId,{x,z}),map.bounds);
        position={x:step.x,z:step.z};total+=step.moved;
        if(step.blocked || step.moved<.00001)break;
      }
      if((travel>.05 && total<Math.min(.25,travel)) || (skillId==="thasao" && total+.05<travel))return this.reject(client,"muay_blocked");
      this.destinations.delete(id);this.moveOnSurface(actor,position.x,position.z);actor.facing=facingTo(dir.dx,dir.dz);
    }
    if(!this.spendSkillMana(client,actor,manaCost,skill.kind==="target"?[targetId]:[],[]))return;cooldowns[skillId]=Date.now()+skill.cooldownMs;actor.muayData=JSON.stringify(cooldowns);
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
    this.broadcast("muay_core_used",{playerId:id,skillId,...(skill.kind==="target"?{targetId}:{}),durationMs:skillId==="chaiya"?progress.chaiya.durationMs:0},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private updateMuayCore():void {
    for(const [id,sequence] of this.muayCoreSequences) {
      if(!sequence.remaining || this.simulatedMs<sequence.next)continue;
      const heavy=muayCoreProgress(sequence.rank).korat;
      const power=sequence.skillId==="korat" ? [.42,.53,heavy.finalPower][3-sequence.remaining]*heavy.scale : sequence.power;
      sequence.remaining--;
      sequence.next=Math.max(sequence.next+sequence.interval,this.simulatedMs+1);
      let hit=false;
      try{hit=this.muayCoreHit(id,sequence.targetId,power);}
      finally{if((!hit || !sequence.remaining) && this.muayCoreSequences.get(id)===sequence)this.muayCoreSequences.delete(id);}
    }
    for(const [id,stance] of this.muayCoreStances)if(this.simulatedMs>=stance.until)this.muayCoreStances.delete(id);
    for(const [id,follow] of this.muayCoreFollowups)if(this.simulatedMs>=follow.until)this.muayCoreFollowups.delete(id);
  }

  private castMuaySkill(client:Client, message:unknown,prototypeSequence?:number):void {
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
    if (!this.advancedEquipped(id,skillId,book.slots.includes(skillId)) || !book.learned.includes(skillId as MuayLessonId) || (!isMuayFoundation(skillId) && MUAY_LESSONS[skillId as MuayLessonId].school!==book.school)) return this.reject(client,"muay_skill_locked");
    if (player.flying || !onMapGround(player)) return this.reject(client,"flying");
    if (this.isProtectedArea(player.mapId,player)) return this.reject(client,"muay_safe_area");
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
    if(prototypeSequence!==undefined){
      if(!target)return this.reject(client,"invalid_muay_target");
      const opportunity=this.prototypeOpportunities.get(id);
      if(!guard || !validChaiyaOpportunity(opportunity,targetId,this.simulatedMs))return this.reject(client,"muay_counter_required");
      if(!this.spendSkillMana(client,player,skill.stamina,[targetId],[]))return;
      this.prototypeOpportunities.delete(id);guard.counterUntil=0;
      cooldowns[skillId]=now+skill.cooldownMs;player.muayData=JSON.stringify(cooldowns);
      if(this.prototypeAttack(id,player,target,targetId,monster,"chaiya_advanced_counter")){
        const granted=grantChaiyaDebuff(this.prototypeCounters.get(id)??newCounterCursor(),this.prototypeDebuffs.get(targetId),this.simulatedMs,prototypeSequence,id,targetId,monster?.tier==="normal"?"normal_monster":monster?"boss":"player",true,target.alive,opportunity);
        this.prototypeCounters.set(id,granted.cursor);if(granted.debuff)this.prototypeDebuffs.set(targetId,granted.debuff);
        this.prototypeNotice("counter",id,targetId,skillId);
      }
      void this.saveCharacter(id);return;
    }
    const followup=MUAY_FOLLOWUPS[book.school],opening=this.muayFollowups.get(id);
    if(skillId===followup.finisher && (!opening || opening.school!==book.school || opening.targetId!==targetId || this.simulatedMs>=opening.until))
      return this.reject(client,"muay_followup_required");
    if(!this.spendSkillMana(client,player,skill.stamina,[targetId],[],true))return;
    if(skill.effect==="evade") {
      const dx=Math.sin(player.facing),dz=Math.cos(player.facing),distance=1.2;
      const next={x:player.x+dx*distance,y:player.y,z:player.z+dz*distance},map=getWorldMap(player.mapId);
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || this.isProtectedArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"muay_blocked");
      const sweep=advanceDash(player,{dx,dz},distance,(x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !this.isProtectedArea(player.mapId,{x,z}),map.bounds);
      if(sweep.blocked || sweep.moved+0.00001<distance)return this.reject(client,"muay_blocked");
      this.startSkillAction(id,player,"idle");
      this.moveOnSurface(player,next.x,next.z);
    }
    let retreatPoint:{x:number;y:number;z:number}|undefined,muayMoved=false;
    if(skill.effect==="retreat_strike" && target) {
      const dx=player.x-target.x,dz=player.z-target.z,length=Math.hypot(dx,dz),vx=length>0.001?dx/length:Math.sin(player.facing),vz=length>0.001?dz/length:Math.cos(player.facing),travel=1.2;
      const next={x:player.x+vx*travel,y:player.y,z:player.z+vz*travel},map=getWorldMap(player.mapId);
      if(!map || !this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || this.isProtectedArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"muay_blocked");
      const sweep=advanceDash(player,{dx:vx,dz:vz},travel,(x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !this.isProtectedArea(player.mapId,{x,z}),map.bounds);
      if(sweep.blocked || sweep.moved+0.00001<travel)return this.reject(client,"muay_blocked");
      retreatPoint=next;
    }
    if ((skill.effect==="step" || skill.effect==="sidestep" || skill.effect==="step_flurry" || skill.effect==="counter_sidestep") && target) {
      const dx=target.x-player.x,dz=target.z-player.z,distance=Math.hypot(dx,dz),move=Math.max(0,distance-1.7);
      const side=skill.effect==="sidestep" || skill.effect==="counter_sidestep" ? (skillId==="lopburi_reverse" ? -0.8 : 0.8) : 0, divisor=Math.max(distance,0.001);
      const next={x:player.x+(dx*move-dz*side)/divisor,y:player.y,z:player.z+(dz*move+dx*side)/divisor};
      if (!this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || this.isProtectedArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next)) return this.reject(client,"muay_blocked");
      const vx=next.x-player.x,vz=next.z-player.z,travel=Math.hypot(vx,vz);
      if (travel>0.00001) {
        const sweep=advanceDash(player,{dx:vx/travel,dz:vz/travel},travel,
          (x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !this.isProtectedArea(player.mapId,{x,z}),getWorldMap(player.mapId)!.bounds);
        if (sweep.blocked || sweep.moved+0.00001<travel) return this.reject(client,"muay_blocked");
      }
      muayMoved=travel>0.1;
      this.destinations.delete(id); this.moveOnSurface(player,next.x,next.z);
    }
    if(skill.effect==="grapple" && target && !this.startMuayGrapple(client,player,target,monster,targetId))return;
    if(opening && (skillId===followup.finisher || (targetId && opening.targetId!==targetId)))this.clearMuayFollowup(id);
    if(!this.spendSkillMana(client,player,skill.stamina,[targetId],[]))return;
    cooldowns[skillId]=now+skill.cooldownMs;
    player.muayData=JSON.stringify(cooldowns);
    if (skill.effect==="guard" || skill.effect==="parry" || skill.effect==="evade") {
      this.clearMuayDefense(id,"cancelled");
      const duration=skill.effect==="guard" ? (skillId==="chaiya_cover" ? 1800 : 1200) : skill.effect==="parry" ? 600 : 450;
      const until=this.simulatedMs+duration;
      this.prototypeOpportunities.delete(id);
      this.swordGuards.set(id,{until,factor:skill.power,direction:true,counterUntil:0});
      if(skill.effect!=="guard") {
        this.muayDefenseWindows.set(id,{kind:skill.effect,until});
        this.sendSwordNotice(client,"muay_defense",{kind:skill.effect,phase:"start",durationMs:duration});
      }
      this.sendSwordNotice(client,"muay_counter_cleared",{});
    } else if (target && skill.effect!=="grapple") {
      player.facing=facingTo(target.x-player.x,target.z-player.z);
      if (isCounter && guard) {
        guard.counterUntil=0;
        this.prototypeOpportunities.delete(id);
        this.sendSwordNotice(client,"muay_counter_cleared",{});
      }
      this.recordCombat(id,targetId);
      this.recordMuayTraining(id,"strikes");
      const pvp=!monster,comboMultiplier=this.advanceMuaySkillCombo(id,book.school,targetId,skillId as Exclude<MuaySkillId,"guard"|"parry"|"evade"|"grapple"|"chaiya_cover">,pvp);
      const attack=(this.masteryPower(player,pvp?"pvp":"pve","atk",weaponBonuses(this.inventories.get(id),pvp?"pvp":"pve").melee))*skill.power*comboMultiplier*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:skillRankMultiplier(book.ranks,skillId));
      const hits=skill.effect==="flurry" || skill.effect==="step_flurry" ? 2 : 1;
      for(let hit=0;hit<hits && target.alive;hit++) {
        if(monster) {
          const damage=calculateDamage(attack,monster.defense,monster.level);
          this.hitMonsterWithSpell(id,monster,damage,"muay");
        } else {
          const opponent=target as Player;
          const damage=this.directGuardDamage(targetId,player,calculateDamage(attack,this.masteryPower(opponent,"pvp","def"),opponent.level),skillId==="korat_pierce" ? 0.25 : 0);
          if(!this.applyPlayerHit(player,targetId,opponent,damage,()=>{
            this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"muay"},{afterNextPatch:true});
          },()=>{
            player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.clearMuayCombo(id);
            this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,source:"muay",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
          })){void this.saveCharacter(id);return;}
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
    if(action==="upgrade" && !this.canLearnSkillsNow(client))return;
    if(action!=="upgrade" && (player.mapId!==DEFAULT_MAP_ID || !onMapGround(player) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs))
      return this.reject(client,"sword_tree_needs_shrine");
    const next:SwordTree={...tree,cooldowns:{...tree.cooldowns},coreRanks:{...tree.coreRanks}};
    if(action==="upgrade") {
      const skillId=input.skillId as SwordCoreId;
      if(!Object.hasOwn(SWORD_CORE,skillId))return this.reject(client,"invalid_sword_tree");
      const rank=next.coreRanks?.[skillId] ?? 0;
      if(rank>=MUAY_CORE_LEVELS.length || this.learningLevel(client.sessionId,player)<MUAY_CORE_LEVELS[rank])return this.reject(client,"sword_tree_level");
      if(Object.values(next.coreRanks ?? {}).reduce((sum,n)=>sum+n,0)>=muayCorePoints(this.learningLevel(client.sessionId,player)))return this.reject(client,"sword_tree_no_points");
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
      try {client.send("sword_tree_changed",{action});this.sendFieldPractice(client,player,action,input.skillId,SWORD_CORE);}catch(error){console.warn("MONTRA sword confirmation was not delivered",error);}
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
    const damage=calculateDamage((this.masteryPower(actor,monster?"pve":"pvp","atk",weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee))*(monster?power:pvpPower*SWORD_PVP_DAMAGE_MULTIPLIER),monster?.defense ?? this.masteryPower(target as Player,"pvp","def"),target.level);
    actor.facing=facingTo(target.x-actor.x,target.z-actor.z);this.recordCombat(id,targetId);
    if(monster)this.hitMonsterWithSpell(id,monster,damage,"sword");
    else {
      const victim=target as Player,actual=this.directGuardDamage(targetId,actor,damage);
      if(!this.applyPlayerHit(actor,targetId,victim,actual,()=>{
        this.broadcast("pvp_hit",{attackerId:id,targetId,damage:actual,hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"sword"},{afterNextPatch:true});
      },()=>{
        actor.pkKills++;victim.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);void this.saveCharacter(id);this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,kills:actor.pkKills,deaths:victim.pkDeaths},{afterNextPatch:true});
      }))return false;
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
    if(actor.flying || !onMapGround(actor) || this.isProtectedArea(actor.mapId,actor))return this.reject(client,"sword_blocked");
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
    if(!this.spendSkillMana(client,actor,mana,skillId==="chumphon_core"?[]:[targetId],supportTargets.map(([member])=>member),true))return;
    if(skillId==="phuttha_core" && target) {
      const dx=target.x-actor.x,dz=target.z-actor.z,length=Math.hypot(dx,dz),travel=Math.max(0,length-1.8);
      if(travel>.001) {
        const direction={dx:dx/length,dz:dz/length},map=getWorldMap(actor.mapId)!;
        let position={x:actor.x,z:actor.z},total=0;
        while(total+.00001<travel){const step=advanceDash(position,direction,travel-total,(x,z)=>this.canOccupy(x,z,surfaceLayer(actor),false,actor.mapId) && !this.isProtectedArea(actor.mapId,{x,z}),map.bounds);position={x:step.x,z:step.z};total+=step.moved;if(step.blocked || step.moved<.00001)break;}
        if(total+.05<travel)return this.reject(client,"sword_blocked");
        this.moveOnSurface(actor,position.x,position.z);
      }
    }
    if(!this.spendSkillMana(client,actor,mana,skillId==="chumphon_core"?[]:[targetId],supportTargets.map(([member])=>member)))return;tree.cooldowns[skillId]=Date.now()+skill.cooldownMs;actor.swordTreeData=JSON.stringify(tree);
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
    const prototypeFlow=this.prototypeFlowing.get(id);if(prototypeFlow)this.prototypeFlowing.set(id,clearFlowing(prototypeFlow));
    this.broadcast("sword_skill_used",{playerId:id,skillId,targetId,durationMs:skillId==="sritra_core"?progress.sritra_core.durationMs:0},{afterNextPatch:true});void this.saveCharacter(id);
  }

  private updateSwordCore():void {
    for(const [id,sequence] of this.swordCoreSequences) {
      if(!sequence.remaining || this.simulatedMs<sequence.next)continue;
      const p=swordCoreProgress(sequence.rank).phuttha_core,hit=3-sequence.remaining;
      sequence.remaining--;
      sequence.next=Math.max(sequence.next+280,this.simulatedMs+1);
      let landed=false;
      try{landed=this.swordCoreHit(id,sequence.targetId,[.36,.46,p.finalPower][hit]*p.scale,[.36,.46,.65][hit]);}
      finally{if((!landed || !sequence.remaining) && this.swordCoreSequences.get(id)===sequence)this.swordCoreSequences.delete(id);}
    }
    for(const [id,stance] of this.swordCoreStances)if(this.simulatedMs>=stance.until || !this.state.players.get(id)?.alive)this.swordCoreStances.delete(id);
  }

  private castSwordSkill(client:Client, message:unknown,prototypeSequence?:number):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_sword_skill");
    const input=message as Record<string,unknown>, keys=Object.keys(input);
    if (typeof input.skillId!=="string" || !Object.hasOwn(SWORD_NODES,input.skillId) ||
        keys.some(key=>key!=="skillId" && key!=="targetId") ||
        (input.targetId!==undefined && typeof input.targetId!=="string")) return this.reject(client,"invalid_sword_skill");
    const id=client.sessionId, skillId=input.skillId, skill=SWORD_NODES[skillId];
    if(prototypeSequence!==undefined && (this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id)))
      return this.reject(client,"character_busy");
    const player=this.spellCaster(client), tree=this.swordTrees.get(id);
    if (!player || !tree) return;
    if (player.pathId!=="phutthaisawan" || !wearsTwinSwords(equippedWeaponId(this.inventories.get(id))))
      return this.reject(client,"sword_weapon_required");
    if (!tree.learned.includes(skillId) || (skill.school!=="common" && skill.school!==tree.school) || skill.effect==="passive")
      return this.reject(client,"sword_skill_locked");
    const replacementFlow=prototypeSequence===undefined?undefined:advanceFlowing(this.prototypeFlowing.get(id)??newFlowingState(),this.simulatedMs);
    if(replacementFlow && !this.advancedEquipped(id,skillId,tree.loadouts[tree.school].includes(skillId)))
      return this.reject(client,"sword_skill_locked");
    if (player.flying) return this.reject(client,"flying");
    if(replacementFlow && (!onMapGround(player) || this.isProtectedArea(player.mapId,player)))return this.reject(client,"prototype_unavailable");
    const now=Date.now();
    if (!replacementFlow?.pending && now<(tree.cooldowns[skillId] ?? 0)) return this.reject(client,"sword_skill_cooldown");
    if (!replacementFlow && player.mana<skill.stamina) return this.reject(client,"insufficient_mana");
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
      if(replacementFlow && !monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId)))
        return this.reject(client,"target_unavailable");
      if (skill.effect==="area" && !monster) return this.reject(client,"invalid_sword_target");
      if (distance3d(player,target)>skill.range || Math.abs(player.y-target.y)>1.1) return this.reject(client,"sword_out_of_range");
      if (!this.bodyPathClear(player.mapId,player,target)) return this.reject(client,"sword_blocked");
    }
    if(prototypeSequence!==undefined){
      if(!replacementFlow || !target)return this.reject(client,"invalid_sword_target");
      const result=useFlowing(replacementFlow,this.simulatedMs,prototypeSequence,targetId,true);
      if(result.action==="none"){
        this.prototypeFlowing.set(id,result.state);
        return this.reject(client,result.reason??"prototype_unavailable");
      }
      if(result.action==="first"){
        if(!this.spendSkillMana(client,player,skill.stamina,[targetId],[]))return;
        tree.cooldowns[skillId]=now+skill.cooldownMs;player.swordTreeData=JSON.stringify(tree);
      }
      this.prototypeFlowing.set(id,result.state);
      if(this.prototypeAttack(id,player,target,targetId,monster,"flowing_blades"))this.prototypeNotice(result.action,id,targetId,skillId);
      void this.saveCharacter(id);return;
    }
    const supportTargets:Array<[string,Player]>=skill.effect==="support"?(this.parties.get(id)?.members??[id]).map(member=>[member,this.state.players.get(member)] as const)
      .filter((entry):entry is [string,Player]=>Boolean(entry[1]?.alive && entry[1].mapId===player.mapId && !this.pendingWarps.has(entry[0]) && distance3d(player,entry[1])<=skill.range && this.bodyPathClear(player.mapId,player,entry[1]) && (this.effects.modifiers(entry[0]).length<STACKING_RULES.maxModifiers || this.effects.modifiers(entry[0]).some(effect=>effect.id===skillId && effect.sourceId===id)))):[];
    if(!this.spendSkillMana(client,player,skill.stamina,[targetId],supportTargets.map(([member])=>member),true))return;
    if ((skill.effect==="step" || skillId==="riposte") && target) {
      const dx=target.x-player.x,dz=target.z-player.z,distance=Math.hypot(dx,dz);
      const move=Math.max(0,distance-1.7);
      const side=skillId==="circle_step" || skillId==="riposte" ? 0.8 : 0;
      const next={x:player.x+(dx*move-dz*side)/Math.max(distance,0.001),y:player.y,z:player.z+(dz*move+dx*side)/Math.max(distance,0.001)};
      if (!this.canOccupy(next.x,next.z,surfaceLayer(player),false,player.mapId) || this.isProtectedArea(player.mapId,next) ||
          !this.bodyPathClear(player.mapId,player,next)) return this.reject(client,"sword_blocked");
      const travelX=next.x-player.x, travelZ=next.z-player.z, travel=Math.hypot(travelX,travelZ);
      if (travel>0.00001) {
        const sweep=advanceDash(player,{dx:travelX/travel,dz:travelZ/travel},travel,
          (x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId) && !this.isProtectedArea(player.mapId,{x,z}),
          getWorldMap(player.mapId)!.bounds);
        if (sweep.blocked || sweep.moved+0.00001<travel) return this.reject(client,"sword_blocked");
      }
      this.destinations.delete(id);
      this.moveOnSurface(player,next.x,next.z);
    }
    if(!this.spendSkillMana(client,player,skill.stamina,[targetId],supportTargets.map(([member])=>member)))return;
    tree.cooldowns[skillId]=now+skill.cooldownMs;
    player.swordTreeData=JSON.stringify(tree);
    if (skill.effect==="guard") {
      this.swordGuards.set(id,{until:this.simulatedMs+1200,factor:skill.power,direction:skillId!=="circle_guard",counterUntil:0});
      this.sendSwordNotice(client,"sword_counter_cleared",{});
    } else if (skill.effect==="support") {
      const members=supportTargets.map(([member])=>member);
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
          const defense=victim.monster ? (victim.target as Monster).defense : this.masteryPower(victim.target as Player,"pvp","def");
          const base=this.masteryPower(player,victim.monster?"pve":"pvp","atk",weaponBonuses(this.inventories.get(id),victim.monster?"pve":"pvp").melee)*(tree.learned.includes("rhythm")?1.05:1);
          let damage=calculateDamage(base*skill.power*(victim.monster?skillRankMultiplier(tree.ranks,skillId):SWORD_PVP_DAMAGE_MULTIPLIER),defense,victim.target.level);
          if (victim.monster) this.hitMonsterWithSpell(id,victim.target as Monster,damage,"sword");
          else {
            const opponent=victim.target as Player;
            damage=this.directGuardDamage(victim.id,player,damage);
            if(!this.applyPlayerHit(player,victim.id,opponent,damage,()=>{
              this.broadcast("pvp_hit",{attackerId:id,targetId:victim.id,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"sword"},{afterNextPatch:true});
            },()=>{
              player.pkKills++; opponent.pkDeaths++; this.knockoutPlayer(victim.id,"pk",id);
              void this.saveCharacter(id);
              this.broadcast("pvp_kill",{winnerId:id,loserId:victim.id,source:"sword",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
            })){void this.saveCharacter(id);return;}
          }
        }
      }
    }
    const prototypeFlow=this.prototypeFlowing.get(id);if(prototypeFlow)this.prototypeFlowing.set(id,clearFlowing(prototypeFlow));
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
      const change = gearOrder ? equipBody(inventory,gearOrder.position,gearOrder.slot,gearOrder.expected,player.pathId,player.level,gearOrder.stamp) : equipInventoryWeapon(inventory,order.slot,player.pathId,player.level);
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
          if(!body)this.clearPrototypeTransient(id);
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

  private masteryMode(id:string):MasteryMode {
    return this.field || this.simulatedMs-(this.lastPvpMs.get(id)??-Infinity)<PROGRESSION.combatQuietMs ? "pvp":"pve";
  }
  private refreshMastery(id:string):void {
    const player=this.state.players.get(id),prior=player && this.masteryScales.get(player);
    if(player && prior && prior.mode!==this.masteryMode(id))this.applyStats(id,player,this.statAllocations.get(id)??emptyAllocations());
  }
  private touchPvp(ids:readonly string[]):void {
    for(const id of new Set(ids)){if(!this.state.players.has(id))continue;this.lastPvpMs.set(id,this.simulatedMs);this.refreshMastery(id);}
  }
  private supportMastery(owner:string,targets:readonly string[]):void {
    if([owner,...targets].some(id=>this.masteryMode(id)==="pvp"))this.touchPvp([owner,...targets]);
  }
  private masteryPower(player:Player,mode:MasteryMode,stat:"atk"|"magicAtk"|"def"|"magicDef",extra=0):number {
    return ((this.masteryBases.get(player)?.[stat]??player[stat])+extra)*(1+masteryBonuses(this.masteryHistories.get(player),mode)[stat]);
  }
  private spendSkillMana(client:Client,player:Player,cost:number,opponents:readonly string[]=[],allies:readonly string[]=[],preview=false):boolean {
    const id=client.sessionId;
    const hostile=opponents.filter(other=>other!==id && this.state.players.get(other)?.alive);
    const pvp=hostile.length>0 || [id,...allies].some(other=>this.masteryMode(other)==="pvp");
    // Preflight the post-transition pool before changing combat state or charging.
    let available=player.mana;
    const prior=this.masteryScales.get(player);
    if(MASTERY_ENABLED && pvp && prior?.mode==="pve"){
      const baseMax=player.maxMana/prior.mana;
      const nextMax=masteryCapacity(baseMax,masteryBonuses(this.masteryHistories.get(player),"pvp").mana);
      available=scaleResource(player.mana,player.maxMana,nextMax);
    }
    if(available+1e-9<cost){this.reject(client,"insufficient_mana");return false;}
    if(preview)return true;
    if(pvp)this.touchPvp([id,...hostile,...allies]);
    player.mana=Math.max(0,player.mana-cost);return true;
  }
  private recordCombat(ownerId: string, targetId: string): void {
    this.lastCombatMs.set(ownerId, this.simulatedMs);
    if (!this.getMonster(targetId)) {this.lastCombatMs.set(targetId,this.simulatedMs);this.touchPvp([ownerId,targetId]);}
  }

  private healAmount(owner:string,target:string,base:number):number {
    const amount=Math.max(1,Math.round(base));
    const recent=Math.max(this.lastPvpMs.get(owner)??-Infinity,this.lastPvpMs.get(target)??-Infinity);
    const result=this.field || this.simulatedMs-recent<PROGRESSION.combatQuietMs ? amount : amount+gearHealing(this.inventories.get(owner),amount);
    const ally=this.state.players.get(target);
    if(ally && Math.min(result,ally.maxHp-ally.hp)>0)this.markWarSupport(owner,target,false);
    return result;
  }

  private applyStats(id:string, player: Player, allocations: Allocations): void {
    const base=calculateStats(player.level,allocations),bag=this.inventories.get(id);
    player.gearLook=gearLook(bag);
    this.extraStaminaRegen.set(player,overflowStaminaRegen(base,bag));
    const modifiers=this.effects.modifiers(id),stats=calculateModifiedStats(equippedStats(base,bag),modifiers);
    this.masteryBases.set(player,stats);this.masteryHistories.set(player,this.rebirthStates.get(id));
    const mode=this.masteryMode(id),bonus=masteryBonuses(this.rebirthStates.get(id),mode),prior=this.masteryScales.get(player);
    const blessings=modifiers.filter(effect=>effect.id==="mender_core_cleanse" && effect.group==="priest_all").map(effect=>effect.bonuses.atk ?? 0).sort((a,b)=>b-a);
    const allStatMultiplier=1+Math.min(STACKING_RULES.maxGroupBonus,blessings.reduce((sum,value,index)=>sum+value*STACKING_RULES.sameGroupFalloff**index,0));
    const baseHp=Math.min(PROGRESSION.maxHp,Math.round(stats.maxHp*allStatMultiplier));
    player.maxHp=masteryCapacity(baseHp,bonus.hp);
    player.atk=this.masteryPower(player,mode,"atk");player.def=this.masteryPower(player,mode,"def");
    player.magicAtk=this.masteryPower(player,mode,"magicAtk");player.magicDef=this.masteryPower(player,mode,"magicDef");
    player.maxStamina = Math.min(PROGRESSION.maxStamina,Math.round(stats.maxStamina*allStatMultiplier));
    const mana=gearMana(player.level,bag),baseMana=Math.min(PROGRESSION.maxMana,Math.round(mana.max*allStatMultiplier));
    player.maxMana=masteryCapacity(baseMana,bonus.mana);this.extraRestManaRegen.set(player,mana.restRegen);
    if(prior && prior.mode!==mode){
      player.hp=Math.min(player.maxHp,player.hp/prior.hp*(player.maxHp/baseHp));
      player.mana=Math.min(player.maxMana,player.mana/prior.mana*(player.maxMana/baseMana));
      this.hpRegenRemainder.set(id,(this.hpRegenRemainder.get(id)??0)/prior.hp*(player.maxHp/baseHp));
    }
    this.masteryScales.set(player,{hp:player.maxHp/baseHp,mana:player.maxMana/baseMana,mode});
    player.mana = Math.min(player.mana, player.maxMana);
    player.hp = Math.min(player.hp, player.maxHp);
    player.stamina = Math.min(player.stamina, player.maxStamina);
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

  private coreTrainingAtLevel(id:string,path:string,oldLevel:number,level:number){
    if(muayCorePoints(level)<=muayCorePoints(oldLevel))return;
    const schools:Record<string,readonly [Readonly<Record<string,{name:string}>>,Partial<Record<string,number>>|undefined]>={
      muay_boran:[MUAY_CORE,this.muayBooks.get(id)?.coreRanks],
      phutthaisawan:[SWORD_CORE,this.swordTrees.get(id)?.coreRanks],
      seer:[SEER_CORE,this.occultBooks.get(id)?.coreRanks],mender:[MENDER_CORE,this.occultBooks.get(id)?.menderCoreRanks],
      blade:[BLADE_CORE,this.bladeBooks.get(id)?.coreRanks],sentinel:[SENTINEL_CORE,this.sentinelBooks.get(id)?.coreRanks],
    };
    if(!Object.hasOwn(schools,path))return;
    const [skills,ranks]=schools[path];
    const player=this.state?.players?.get(id);
    const learning=player?this.learningLevel(id,player):level;
    const points=muayCorePoints(learning)-Object.values(ranks??{}).reduce<number>((sum,n)=>sum+(n??0),0);
    if(points<1)return;
    const choices=Object.entries(skills).flatMap(([key,skill])=>{
      const rank=ranks?.[key]??0;
      return rank<MUAY_CORE_LEVELS.length && MUAY_CORE_LEVELS[rank]<=learning?[{name:skill.name,rank:rank+1}]:[];
    });
    return choices.length?{points,choices}:undefined;
  }

  private sendHuntGuide(client:Client,player:Player){
    const id=client.sessionId, learningLevel=this.learningLevel(id,player);
    const guide=personalGearGuides(player.pathId,player.level,learningLevel);
    const training=player.level>=13?this.coreTrainingAtLevel(id,player.pathId,1,player.level):undefined;
    const history=this.rebirthStates.get(id)??newRebirthState();
    const rebirthPreview=player.level===100 && history.count<15 && this.playerBuild(player)
      ? {before:masteryPreview(history),after:masteryPreview(startNextLife(history,this.playerBuild(player)!.path,100))}:null;
    client.send("gear_guides",guide && {...guide,learningLevel,cycle:history.count,training:training??null,rebirthPreview});
  }

  private sendFieldPractice(client:Client,player:Player,action:unknown,skillId:unknown,
    core:Readonly<Record<string,{name:string;effect?:string}>>,
    lessons?:Readonly<Record<string,{name:string;effect?:string}>>){
    if(player.level<13)return;
    const deep=!!lessons && (action==="learn" || action==="upgrade" || action==="reset");
    if(deep && player.level<26)return;
    const training=this.coreTrainingAtLevel(client.sessionId,player.pathId,1,player.level);
    if(action==="reset" || action==="core_reset"){
      client.send("field_practice",{reset:true,deep,training});return;
    }
    const catalog=deep?lessons!:core;
    if((action==="learn" || action==="upgrade" || action==="core_upgrade") && typeof skillId==="string" && Object.hasOwn(catalog,skillId)){
      const skill=catalog[skillId];
      if(skill.effect!=="passive")client.send("field_practice",{skillId,name:skill.name,training,deep,effect:skill.effect});
    }
  }

  private grantMonsterExperience(id: string, sharedAmount?: number, monsterLevel: number = PROGRESSION.monsterLevel, tier:MonsterTier = "normal", bossLoot = false, monsterId="", defeated:RewardPrey|undefined=this.getMonster(monsterId)): void {
    const player = this.state.players.get(id);
    const victim=defeated && {x:defeated.x,z:defeated.z};
    const directorAt=Date.now(),directorEvent=worldDirector.snapshot(directorAt);
    const huntEvent=huntEventDirector.snapshot(directorAt);
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
        const killAmount = current.level >= PROGRESSION.maxLevel ? 0 : cycleExperience(sharedAmount ?? monsterExperience(current.level, monsterLevel, tier),snapshot.rebirth?.count ?? 0);
        const savedObjective=snapshot.forestObjective ?? null,def=savedObjective && FOREST_OBJECTIVES[savedObjective.id],defense=def?.defense;
        const guard=this.forestDefenses.get(id);
        const canAdvance=def?.kind!=="defense" || Boolean(defense && guard && guard.id===savedObjective?.id && guard.hp>0 && victim &&
          current.mapId===def.mapId && Math.hypot(current.x-defense.x,current.z-defense.z)<=defense.radius && Math.hypot(victim.x-defense.x,victim.z-defense.z)<=defense.radius);
        // Quest credit follows the accepted kill, even when the level gap or cap awards no EXP.
        const objective=canAdvance ? advanceForestObjective(savedObjective,monsterId,current.mapId) : {active:savedObjective,completed:null};
        const objectiveAdvanced=Boolean(objective.completed || objective.active && objective.active.progress!==savedObjective?.progress);
        const bonus=objective.completed ? cycleExperience(monsterExperience(current.level,monsterLevel,tier)*2,snapshot.rebirth?.count ?? 0) : 0;
        const eventReward=objective.completed ? this.directorReward(snapshot,savedObjective,current.level,monsterLevel,tier,directorEvent,directorAt) : {bonus:0,claims:snapshot.directorClaims ?? []};
        const huntEventBonus=this.field || process.env.MONTRA_HUNT_EVENTS==='0' ? 0 : huntBonus(huntEvent,current.mapId,tier,killAmount,directorAt);
        const amount=killAmount+bonus+eventReward.bonus+huntEventBonus;
        const personalEligible=this.accountSessions.has(id) && current.alive && Boolean(current.pathId);
        if (amount <= 0 && !objectiveAdvanced && tier !== "boss" && !bossLoot && !personalEligible) return;
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
        const build=this.playerBuild(current),rebirth=build ? recordClassLevel(snapshot.rebirth ?? newRebirthState(),build.path,Math.min(100,next.level)) : snapshot.rebirth;
        await characterStore.save({ ...snapshot, ...next, rebirth,directorClaims:eventReward.claims, forestObjective:objective.active, inventory:loot ?? snapshot.inventory, updatedAt: new Date().toISOString() },"monster_reward");
        this.directorClaims.set(id,eventReward.claims);
        if(rebirth)this.rebirthStates.set(id,rebirth);
        if(objective.active)this.forestObjectives.set(id,objective.active);else this.forestObjectives.delete(id);
        if(objective.completed && this.forestDefenses.delete(id))try{this.clients.find(c=>c.sessionId===id)?.send("forest_defense_state",{id:objective.completed,hp:0,maxHp:120,completed:true});}catch{}
        if (loot) this.inventories.set(id,loot);
        const leveled=next.level!==current.level;
        current.level = next.level; current.experience = next.experience;
        this.applyStats(id,current, this.statAllocations.get(id) ?? emptyAllocations());
        try {
          const recipient = this.clients.find(client => client.sessionId === id);
          if(leveled && recipient && this.sentItemCatalog.has(id))this.sendHuntGuide(recipient,current);
          if (loot) recipient?.send("inventory_state",loot);
          recipient?.send("experience_gained", {amount,level:next.level,experience:next.experience,...(huntEventBonus?{huntEventBonus}:{}),
            ...(objective.completed ? {forestObjectiveCompleted:objective.completed,forestObjectiveBonus:bonus} : {}),...(eventReward.bonus?{directorBonus:eventReward.bonus}:{}),
            ...(current.level>=13 && (current.level<=25 || tier==="normal")?{fieldPrey:practiceSite(monsterId)}:{}),
            ...(leveled?{training:this.coreTrainingAtLevel(id,current.pathId,snapshot.level,next.level)}:{}),
            ...(fieldDrop?.starterCopy?{starterCopy:fieldDrop.starterCopy}:{}),
            ...(fragment===SHRINE_SHARD ? {shrineShard:fragmentBag?"granted":"bag_full"} : {}),
            ...(fragment && fragment!==SHRINE_SHARD ? {bossFragment:fragment,fragmentGranted:Boolean(fragmentBag)} : {}),
            ...(accessory ? {bossAccessory:accessory.id,accessoryGranted:accessory.granted,bossCopy:!!accessory.banked} : {}),
            ...(monsterId==="atlas_rift_warden" ? {riftVictory:true} : {}),
            ...(fieldDrop?.id!==undefined ? {personalDrop:fieldDrop.id ?? "bag_full",dropQuantity:fieldDrop.quantity??1,lootMisses:fieldDrop.bag.lootMisses??0,forgeCopy:!!fieldDrop.banked} : {}),
            ...(fieldDrop?.blockedId ? {blockedItem:fieldDrop.blockedId,missedQuantity:fieldDrop.missedQuantity} : {}),
            ...(card ? {cardDrop:card,cardReceived:Boolean(cardBag)} : {}),
            ...(dropsPotion ? {elitePotion:prize ? "granted" : "bag_full"} : {})});
          if(snapshot.forestObjective && recipient)this.sendForestObjective(recipient);
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

  private awardMonsterExperience(winnerId:string, monster:RewardPrey = this.state.monster, tier:MonsterTier = "normal"): void {
    const winner=this.state.players.get(winnerId), party=this.parties.get(winnerId);
    const bossLoot=characterStore.economyEnabled && !!bossTreasure(monster.id) && (tier==="elite" || tier==="boss");
    if (!winner) return;
    if (!party) {
      this.grantMonsterExperience(winnerId, undefined, monster.level, tier,
        bossLoot && winner.alive && winner.mapId === monster.mapId && distance3d(winner,monster) <= PARTY_XP_RADIUS, monster.id,monster);
      return;
    }
    const members:PartyRewardMember[]=[];
    for(const id of party.members){
      const player=this.state.players.get(id);
      if(player)members.push({sessionId:id,mapId:player.mapId,x:player.x,y:player.y,z:player.z,alive:player.alive,
        persistent:this.persistentCharacters.has(id),level:player.level,hasObjective:this.forestObjectives.has(id),
        inTransit:this.pendingWarps.has(id) && !this.pendingRewards.has(id)});
    }
    const shares=partyMonsterShares(winner.level,{mapId:monster.mapId,level:monster.level,tier,x:monster.x,y:monster.y,z:monster.z},members,PARTY_XP_RADIUS,bossLoot || this.accountSessions.has(winnerId));
    for(const share of shares)this.grantMonsterExperience(share.sessionId,share.amount,monster.level,tier,bossLoot,monster.id,monster);
  }

  private guildAction(client:Client, action:(character:string)=>void):void {
    const character=this.persistentCharacters.get(client.sessionId);
    if(!character || this.pendingCharacterLeaves.has(client.sessionId))return this.reject(client,"guild_unavailable");
    if(!this.gates.get(client.sessionId)?.guild.consume(this.simulatedMs))return this.reject(client,"guild_rate_limited");
    try { action(character); }
    catch(error){
      const reasons=["guild_already_member","guild_name_taken","guild_leader_only","guild_full",
        "guild_not_member","guild_transfer_first","guild_invalid_member","guild_invite_expired","guild_invalid_target",
        "guild_officer_required","guild_invalid_assignment","guild_squad_required","guild_squad_full","guild_squad_leader_exists",
        "guild_not_found","guild_application_exists","guild_applications_full","guild_application_missing",
        "guild_city_assets","guild_city_disband_pending"];
      const reason=error instanceof Error && reasons.includes(error.message)?error.message:"guild_error";
      if(reason==="guild_error")console.error("MONTRA guild action failed",error);
      client.send("guild_error",{reason});
    }
  }
  private tickFishing():void {
    const now=Date.now();
    for(const [id,s] of this.fishing){
      const p=this.state.players.get(id),client=this.clients.find(c=>c.sessionId===id);
      const interrupted=!p || !p.alive || p.mounted || p.flying || p.mapId!==s.mapId ||
        Math.hypot(p.x-s.originX,p.z-s.originZ)>1.5 || (this.lastCombatMs.get(id)??-1)>s.combatAt;
      const escaped=!interrupted && advanceFishing(s,now)==="escaped";
      if(interrupted || escaped){
        this.fishing.delete(id);
        try{client?.send("fish_result",{result:interrupted?"interrupted":"escaped"});}catch{/* disconnected */}
      }
    }
  }
  private sendGuild(client:Client,character:string):void {
    const view = guildStore().view(character,guildOnline), id = client.sessionId;
    if (this.sessionGuilds.get(id) !== view?.id) {
      if (view) this.sessionGuilds.set(id, view.id);
      else this.sessionGuilds.delete(id);
      this.updateWarBanners();
    }
    client.send("guild_state",view);
    client.send("guild_recruitment",{pending:guildStore().pending(character) ?? null,applications:guildStore().applications(character)});
  }

  private isGuildPartyLeader(id: string): boolean {
    return this.sessionGuilds.has(id) && this.parties.get(id)?.leader === id;
  }

  private plantWarBanner(client: Client): void {
    const id = client.sessionId, player = this.state.players.get(id);
    const party = this.parties.get(id), guildId = this.sessionGuilds.get(id);
    if (party?.leader !== id || !guildId) return this.reject(client, "war_banner_leader_required");
    if (!player?.alive || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) ||
        player.flying || player.mounted || !onMapGround(player) ||
        (this.field && !this.warSeats.has(id))) return this.reject(client, "war_banner_unavailable");
    if (this.warBanners.has(party.id)) return this.reject(client, "war_banner_active");
    if (this.simulatedMs - (this.lastBannerAt.get(id) ?? -Infinity) < WAR_BANNER.cooldownMs) {
      return this.reject(client, "war_banner_cooldown");
    }
    this.lastBannerAt.set(id, this.simulatedMs);
    this.warBanners.set(party.id, {
      id: randomUUID(), ownerId: id, guildId, mapId: player.mapId, x: player.x, y: player.y, z: player.z,
      expiresAt: this.simulatedMs + WAR_BANNER.durationMs, viewers: new Map(),
    });
    this.updateWarBanners();
  }

  private sendWarBanner(client: Client): void {
    const id = client.sessionId, party = this.parties.get(id);
    const banner = party && this.warBanners.get(party.id);
    const visible = banner?.viewers.has(id) ? banner : undefined;
    const canPlant = party?.leader === id && this.sessionGuilds.has(id);
    try {
      client.send("war_banner_state", {canPlant, buffed: visible?.viewers.get(id) ?? false,
        banner: visible ? {id: visible.id, ownerId: visible.ownerId, mapId: visible.mapId,
          x: visible.x, y: visible.y, z: visible.z, radius: WAR_BANNER.radius,
          remainingMs: Math.max(0, visible.expiresAt - this.simulatedMs)} : null});
    } catch { /* disconnected */ }
  }

  private updateWarBanners(): void {
    for (const [partyId, banner] of this.warBanners) {
      const party = this.parties.get(banner.ownerId), owner = this.state.players.get(banner.ownerId);
      const ownerSide = this.warSeats.get(banner.ownerId)?.side;
      const valid = party?.id === partyId && party.leader === banner.ownerId && owner?.alive &&
        owner.mapId === banner.mapId && this.sessionGuilds.get(banner.ownerId) === banner.guildId &&
        !this.pendingWarps.has(banner.ownerId) && !this.pendingCharacterLeaves.has(banner.ownerId) &&
        (!this.field || ownerSide) && this.simulatedMs < banner.expiresAt;
      const next = new Map<string, boolean>();
      if (valid) for (const id of party.members) {
        const player = this.state.players.get(id);
        if (!player?.alive || player.mapId !== banner.mapId || this.sessionGuilds.get(id) !== banner.guildId ||
            this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) ||
            (this.field && this.warSeats.get(id)?.side !== ownerSide)) continue;
        const effects = this.effects.modifiers(id);
        const active = effects.some(effect => effect.id === "war_banner" && effect.sourceId === banner.id);
        const buffed = distance3d(banner, player) <= WAR_BANNER.radius &&
          (active || effects.length < STACKING_RULES.maxModifiers);
        if (buffed && !active) {
          this.effects.grant(id, {id: "war_banner", sourceId: banner.id, group: "war_banner",
            bonuses: {def: WAR_BANNER.defenseBonus, magicDef: WAR_BANNER.defenseBonus}}, banner.expiresAt);
          this.applyStats(id, player, this.statAllocations.get(id) ?? emptyAllocations());
        }
        next.set(id, buffed);
      }

      const previous = banner.viewers;
      banner.viewers = next;
      if (!valid) this.warBanners.delete(partyId);
      for (const id of new Set([...previous.keys(), ...next.keys()])) {
        if (previous.get(id) && !next.get(id) && this.effects.remove(id, "war_banner", banner.id)) {
          const player = this.state.players.get(id);
          if (player) this.applyStats(id, player, this.statAllocations.get(id) ?? emptyAllocations());
        }
        if (previous.get(id) !== next.get(id)) {
          const client = this.clients.find(peer => peer.sessionId === id);
          if (client) this.sendWarBanner(client);
        }
      }
    }
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
    this.updateWarBanners();
  }
  private parsePartyInvitation(message:unknown):string|null {
    if (!message || typeof message!=="object" || Array.isArray(message)) return null;
    const value=message as Record<string,unknown>;
    return Object.keys(value).length===1 && typeof value.inviteId==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.inviteId) ? value.inviteId : null;
  }

  private economyId(client: Client, reject = (reason: string) => this.reject(client, reason)): string | null {
    const id=client.sessionId, player=this.state.players.get(id), characterId=this.persistentCharacters.get(id);
    if (!characterStore.economyEnabled || !player || !player.alive || !characterId) { reject("economy_unavailable"); return null; }
    if (this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id)) { reject("character_busy"); return null; }
    return characterId;
  }
  private economyAction(client: Client, action: (id:string)=>void): void {
    if (!this.gates.get(client.sessionId)?.economy.consume(this.simulatedMs)) return this.reject(client,"economy_rate_limited");
    const id=this.economyId(client); if (!id) return;
    try { action(id); } catch (error) {
      const allowed=["invalid_amount","invalid_slot","item_unavailable","item_equipped","inventory_full","duplicate_weapon","accessory_limit","listing_unavailable","listing_limit","cannot_buy_own_listing","insufficient_gold","invalid_trade","invalid_gold","invalid_request_id","request_id_conflict","salvage_changed","forge_max_rank","forge_item_changed","forge_missing_copy","forge_risk_unconfirmed","forge_downgrade_unconfirmed","forge_remove_card","forge_donor_changed","forge_stock_full","forge_stock_changed","craft_missing_shard","craft_missing_material","craft_queue_full","craft_job_unavailable","craft_job_not_ready","market_favorite_limit","cooking_level_required","cooking_kitchen_required",
        "home_level_unavailable","home_required","home_unavailable","home_village_required","home_build_location","home_wall_blocked","home_cell_invalid","home_cell_occupied","home_furniture_unavailable",
        "garden_plot_invalid","garden_occupied","garden_water_unavailable","garden_not_ready",
        "needs_full","water_unavailable","water_cooldown","item_bound","socket_changed","card_unavailable","drill_missing_metal","item_level_required","card_gear_level","starter_supply_limit","invalid_auction_duration","auction_limit","auction_bid_limit","auction_unavailable","cannot_bid_own_auction","auction_bid_too_low","auction_claim_unavailable","auction_cancel_unavailable","auction_credit_unavailable"];
      const reason=error instanceof Error && (allowed.includes(error.message)||["resource_ground","resource_range","resource_cooldown","resource_empty","fish_water","fish_ground","fish_range","fish_blocked","fish_interrupted","fish_expired","fish_pending","fish_no_pending"].includes(error.message)) ? error.message : "economy_failed";
      if(reason==="fish_pending")client.send("fish_pending",{item:characterStore.economy.pendingFish(id)});
      if(reason==="fish_no_pending")client.send("fish_pending",{item:null});
      if(reason==="forge_stock_changed")this.syncEconomy(client,id);
      if (reason==="economy_failed") console.error("MONTRA economy failed",error);
      client.send("economy_error",{reason});
    }
  }
  private cityProductionAction(client: Client, order?: Exclude<CityOrder, CityPurchaseOrder | CityMissionOrder | CityPolicyOrder |
    CityHaulOrder | CitySupplyOrder | CityMarketOrder | CityContractOrder | CityNeutralMarketOrder | CityNeutralReturnOrder | CityMarketContributionOrder>,
    claimsOnly = false): void {
    const id = client.sessionId;
    const fail = (reason: string) => client.send("city_production_error", {reason, requestId: order?.requestId ?? null});
    const recovery = claimsOnly || order?.action === "disband" || order?.action === "claim_disband";
    const needsCity = order && !recovery && order.action !== "cancel" && order.action !== "reclaim" && order.action !== "workshop_claim";
    const construction = order && isWarehouseOrder(order);
    if (this.field || (needsCity && (!CITY_PRODUCTION_ENABLED || !WORLD_EXPANSION))) return fail("city_unavailable");
    if (order?.action === "workshop_start" && !CITY_WORKSHOP_ENABLED) return fail("city_workshop_disabled");
    if (!this.gates.get(id)?.economy.consume(this.simulatedMs)) return fail("economy_rate_limited");
    const actor = this.economyId(client, fail);
    if (!actor) return;
    const player = this.state.players.get(id)!;
    const miningAvailable = this.state.cityProductionAvailable && CITY_MINING_ENABLED;
    const site = miningAvailable && player.mapId === CITY_MINING_SITE ? CITY_MINING_SITE : CITY_PRODUCTION_SITE;
    const moonConstruction = site === CITY_MINING_SITE;
    const constructionEnabled = moonConstruction ? CITY_MINING_CONSTRUCTION_ENABLED : CITY_CONSTRUCTION_ENABLED;
    if (construction && !constructionEnabled) return fail("city_construction_unavailable");
    const grounded = !player.flying && !this.climbs.has(id) && onMapGround(player);
    const atCity = player.mapId === site && grounded;
    const atRiverCity = player.mapId === CITY_PRODUCTION_SITE && grounded;
    const plot = RIVER_WAREHOUSE_PLOT;
    const atPlot = moonConstruction ? atCity : atRiverCity && Math.hypot(player.x - plot.x, player.z - plot.z) <= plot.radius;
    if (needsCity && !atCity) return fail("city_location");
    if (order?.action === "workshop_start" && !atRiverCity) return fail("city_workshop_location");
    if (construction && !atPlot) return fail("city_construction_location");
    try {
      const now = Date.now(), store = characterStore.economy, guilds = guildStore();
      if (recovery) {
        if (order?.action === "disband") {
          store.startCityProductionSweeper(sweepCityProduction);
          if (guilds.cityDisbandPending(order.guildId) || guilds.war.member(actor)?.id === order.guildId ||
              !store.cityDisbandClosed(actor, order.guildId)) {
            const disband = guilds.beginCityDisband(actor, order.guildId, now);
            guilds.settleCityDisband(store, disband);
            notifyGuilds();
          }
          client.send("city_production_result", {requestId: order.requestId, action: order.action, guildId: order.guildId});
        } else if (order?.action === "claim_disband") {
          if (guilds.cityDisbandPending(order.guildId)) return fail("city_disband_pending");
          const result = store.claimCityDisband(actor, order);
          this.syncEconomy(client, actor);
          client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result});
        }
        const assets = store.cityDisbandClaims(actor).filter(asset => !guilds.cityDisbandPending(asset.guildId));
        client.send("city_disband_claims", {assets});
        return;
      }
      if (order?.action === "workshop_claim") {
        const result = store.claimCityWorkshop(actor, order, now);
        this.syncEconomy(client, actor);
        client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result});
      }
      const ownership = syncCityProduction(now, site);
      if (order?.action === "workshop_start") {
        const result = store.startCityWorkshop(actor, order, ownership, now);
        this.syncEconomy(client, actor);
        client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result});
      }
      const member = guilds.war.member(actor);
      const guildOrder = order && order.action !== "workshop_start" && order.action !== "workshop_claim";
      if (guildOrder) {
        if (!member) return fail("city_not_member");
        const result = store.cityOrder(actor, member, order, ownership, now, site);
        if (order.action === "deposit" || order.action === "reclaim" || order.action === "warehouse_contribute")
          this.syncEconomy(client, actor);
        client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result});
      }
      const workshopEnabled = this.state.cityProductionAvailable && CITY_WORKSHOP_ENABLED;
      if (workshopEnabled || order?.action === "workshop_claim" || store.hasCityWorkshopJob(actor)) {
        const riverOwnership = site === CITY_PRODUCTION_SITE ? ownership : syncCityProduction(now);
        const workshop = store.viewCityWorkshop(actor, riverOwnership, now);
        client.send("city_workshop_state", {...workshop, site: CITY_PRODUCTION_SITE, enabled: workshopEnabled, atCity: atRiverCity, serverNow: now});
      }
      if (!member) return;
      const view = store.viewCity(member, ownership, site);
      const constructionOpen = constructionEnabled && this.state.cityProductionAvailable;
      client.send("city_production_state", {site, atCity, guildId: member.id, serverNow: now,
        cityName: WORLD_MAPS[site].name, miningSite: miningAvailable ? CITY_MINING_SITE : null,
        canDisband: member.commander && guilds.canDisbandCityGuild(actor, member.id),
        ...view, construction: constructionOpen ? {...view.construction,
          plot: moonConstruction ? "ด่านผนึกจันทรา" : plot.name, atPlot} : null});
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      const expected = ["invalid_slot", "invalid_amount", "item_unavailable", "item_equipped", "item_bound",
        "inventory_full", "listing_unavailable", "listing_limit", "request_id_conflict", "invalid_request_id"];
      if (reason === "city_ownership_unavailable" || (!reason.startsWith("city_") && !expected.includes(reason))) {
        console.error("MONTRA city production action failed", error);
        return fail("city_unavailable");
      }
      fail(reason);
    }
  }
  private cityBoardAction(client: Client, board: "purchase" | "mission",
    order?: CityPurchaseOrder | CityMissionOrder | CityHaulOrder | CityContractOrder): void {
    const fail = (reason: string) => client.send("city_production_error", {reason, requestId: order?.requestId ?? null});
    const purchase = board === "purchase", enabled = purchase ? cityPurchaseIntake : cityMissionIntake;
    const supported = purchase ? this.state.cityPurchaseSupported : this.state.cityMissionSupported;
    const haulOrder = order && isCityHaulOrder(order);
    const contractOrder = order && isCityContractOrder(order);
    const cleanup = order?.action === "purchase_cancel" || order?.action === "mission_cancel" || order?.action === "mission_abandon" ||
      order?.action === "haul_cancel" || order?.action === "haul_decline" || order?.action === "haul_abandon" ||
      order?.action === "contract_cancel" || order?.action === "contract_abandon" || order?.action === "contract_deliver";
    if (!supported || (order && !cleanup && !(contractOrder ? cityContractIntake : haulOrder ? cityHaulIntake : enabled)))
      return fail(contractOrder ? "city_contract_disabled" : haulOrder ? "city_haul_disabled" :
        purchase ? "city_purchase_disabled" : "city_mission_disabled");
    const id = client.sessionId;
    if (!this.gates.get(id)?.economy.consume(this.simulatedMs)) return fail("economy_rate_limited");
    const actor = this.economyId(client, fail);
    if (!actor) return;
    const player = this.state.players.get(id)!;
    const site = CITY_SITES.find(city => city === player.mapId);
    const atCity = site && !player.flying && !this.climbs.has(id) && onMapGround(player) ? site : null;
    const atMarket = cityBrokerAt(atCity, player.x, player.z);
    const atMoon = atCity === CITY_MINING_SITE;
    if (order?.action === "purchase_open" && !atMoon) return fail("city_purchase_location");
    if (order?.action === "mission_open" && !atMoon) return fail("city_mission_location");
    if (order?.action === "mission_open" && order.purpose === "warehouse" && !CITY_MINING_CONSTRUCTION_ENABLED)
      return fail("city_construction_unavailable");
    try {
      const now = Date.now(), store = characterStore.economy;
      const ownership = syncCityProduction(now, CITY_MINING_SITE);
      const withHauls = !purchase && (cityHaulIntake || haulOrder || store.hasOpenCityHaul());
      const withContracts = !purchase && (cityContractIntake || contractOrder || store.hasOpenTradeContract());
      const cities = withHauls || withContracts ? {
        [CITY_MINING_SITE]: ownership, [CITY_PRODUCTION_SITE]: syncCityProduction(now, CITY_PRODUCTION_SITE),
      } : null;
      const member = guildStore().war.member(actor);
      if (order) {
        let result;
        if (isCityPurchaseOrder(order)) result = store.cityPurchaseOrder(actor, member, order, ownership, now);
        else if (isCityMissionOrder(order)) result = store.cityMissionOrder(actor, member, order, ownership, now);
        else if (cities && isCityHaulOrder(order)) result = store.cityHaulOrder(actor, member, order, cities, atCity, now);
        else if (cities && isCityContractOrder(order)) result = store.tradeContractOrder(actor, member, order, cities, atCity, atMarket, now);
        else return fail("city_mission_disabled");
        if (order.action === "purchase_fill" || order.action === "mission_submit" || order.action === "haul_deliver" ||
            order.action === "contract_accept" || order.action === "contract_deliver")
          this.syncEconomy(client, actor);
        client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result});
      }
      const location = {enabled, atMoon, serverNow: now};
      if (purchase) client.send("city_purchase_state", {...store.viewCityPurchase(member, ownership), ...location});
      else client.send("city_mission_state", {...store.viewCityMissions(actor, member, ownership),
        ...location, warehouseMissions: CITY_MINING_CONSTRUCTION_ENABLED,
        hauls: cities && withHauls ? {...store.viewCityHauls(actor, member, cities, atCity), enabled: cityHaulIntake} : null,
        tradeContracts: cities && withContracts ? store.viewTradeContracts(actor, member, cities, atCity, atMarket, cityContractIntake) : null});
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      const expected = ["invalid_slot", "invalid_amount", "item_unavailable", "item_equipped", "item_bound",
        "request_id_conflict", "invalid_request_id", "insufficient_gold", "inventory_full"];
      if (reason === "city_ownership_unavailable" || (!reason.startsWith("city_") && !expected.includes(reason))) {
        console.error("MONTRA city board action failed", board, error);
        return fail("city_unavailable");
      }
      fail(reason);
    }
  }
  private cityMarketAction(client: Client, order?: CityMarketOrder | CityNeutralMarketOrder | CityNeutralReturnOrder | CityMarketContributionOrder): void {
    const fail = (reason: string) => client.send("city_production_error", {reason, requestId: order?.requestId ?? null});
    const cleanup = order?.action === "neutral_market_withdraw" || order?.action === "neutral_return_cancel" ||
      order?.action === "neutral_return_claim" || (order?.action === "local_market_config" ? !order.open :
      (order?.action === "local_market_stock" || order?.action === "local_market_budget") && order.amount < 0);
    const intake = !order ? cityMarketIntake : order.action === "market_contribute" ? cityMarketContributionIntake :
      isCityNeutralMarketOrder(order) ? cityNeutralMarketIntake :
      isCityNeutralReturnOrder(order) ? cityNeutralReturnMarketIntake :
      order.item === CITY_MINING_PRODUCT ? cityReturnMarketIntake : cityMarketIntake;
    if (!this.state.cityMarketSupported || (order && !cleanup && !intake))
      return fail(order?.action === "market_contribute" ? "city_contribution_disabled" : "city_market_disabled");
    const id = client.sessionId;
    if (!this.gates.get(id)?.economy.consume(this.simulatedMs)) return fail("economy_rate_limited");
    const actor = this.economyId(client, fail);
    if (!actor) return;
    const player = this.state.players.get(id)!;
    const site = CITY_SITES.find(city => city === player.mapId);
    const atSite = site && !player.flying && !this.climbs.has(id) && onMapGround(player) ? site : null;
    const atMarket = cityBrokerAt(atSite, player.x, player.z);
    try {
      const now = Date.now(), store = characterStore.economy, member = guildStore().war.member(actor);
      const cities = {[CITY_PRODUCTION_SITE]: syncCityProduction(now), [CITY_MINING_SITE]: syncCityProduction(now, CITY_MINING_SITE)};
      if (order) {
        try {
          let result;
          if (order.action === "market_contribute") {
            result = store.marketContributionOrder(actor, member, order, cities[CITY_MINING_SITE], atSite, now);
            this.syncEconomy(client, actor);
          } else if (isCityNeutralMarketOrder(order)) {
            result = store.neutralMarketOrder(actor, order, cities[CITY_PRODUCTION_SITE], atMarket, now);
            this.syncEconomy(client, actor);
          } else if (isCityNeutralReturnOrder(order)) {
            result = store.neutralReturnOrder(actor, order, cities[CITY_PRODUCTION_SITE], atMarket, now);
            this.syncEconomy(client, actor);
          } else {
            const trade = order.action === "local_market_trade";
            if (order.site !== (trade ? atMarket : atSite)) throw Error("city_market_location");
            result = store.cityMarketOrder(actor, member, order, cities[order.site], now);
            if (trade) this.syncEconomy(client, actor);
          }
          client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result});
        } catch (error) {
          const reason = error instanceof Error ? error.message : "";
          if (reason !== "city_ownership_unavailable" && (reason.startsWith("city_") ||
              ["request_id_conflict", "insufficient_gold", "inventory_full", "item_unavailable", "item_bound",
                "invalid_amount", "invalid_slot"].includes(reason))) fail(reason);
          else throw error;
        }
      }
      client.send("city_markets_state", {...store.viewCityMarkets(actor, member, cities, cityMarketIntake,
        cityReturnMarketIntake, cityNeutralMarketIntake, cityNeutralReturnMarketIntake),
        tradeRoute: cityMarketIntake ? store.viewCityTradeRoute(actor, member, cities,
          {atCity:atSite, atMarket, contractsEnabled:cityContractIntake, now}) : null,
        contribution: cityMarketContributionIntake ? store.viewMarketContribution(actor, member, cities[CITY_MINING_SITE]) : null,
        atSite, atMarket, enabled: cityMarketIntake, serverNow: now});
    } catch (error) {
      console.error("MONTRA city market action failed", error);
      fail("city_unavailable");
    }
  }
  private cityGovernanceAction(client: Client, order?: CityPolicyOrder | CitySupplyOrder): void {
    const fail = (reason: string) => client.send("city_production_error", {reason, requestId: order?.requestId ?? null});
    if (!this.state.cityGovernanceAvailable) return fail("city_policy_disabled");
    if (order && isCitySupplyOrder(order) && order.action !== "supply_cancel" && !CITY_SUPPLY_ENABLED)
      return fail("city_supply_disabled");
    const id = client.sessionId;
    if (!this.gates.get(id)?.economy.consume(this.simulatedMs)) return fail("economy_rate_limited");
    const actor = this.economyId(client, fail);
    if (!actor) return;
    const player = this.state.players.get(id)!;
    const atMoon = player.mapId === CITY_MINING_SITE && !player.flying && !this.climbs.has(id) && onMapGround(player);
    if (order && !atMoon) return fail(order.action === "policy_set" ? "city_policy_location" : "city_supply_location");
    try {
      const member = guildStore().war.member(actor);
      if (!member) return fail("city_not_member");
      const now = Date.now(), store = characterStore.economy;
      let ownership = syncCityProduction(now, CITY_MINING_SITE);
      if (order?.action === "policy_set") {
        const result = store.setCityPolicy(actor, member, order, ownership, now);
        client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result});
      } else if (order) {
        const result = store.citySupplyOrder(actor, member, order, ownership, now);
        let repaired: boolean | undefined;
        if (order.action === "supply_repair") {
          ownership = syncCityProduction(now, CITY_MINING_SITE);
          repaired = store.citySupplyRepairSucceeded(order.supplyId);
        }
        client.send("city_production_result", {requestId: order.requestId, action: order.action, ...result, repaired});
      }
      client.send("city_governance_state", {...store.viewCityGovernance(member, ownership),
        atMoon, serverNow: now, supplyEnabled: CITY_SUPPLY_ENABLED});
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (reason !== "city_ownership_unavailable" &&
          (reason.startsWith("city_") || reason === "request_id_conflict" || reason === "invalid_request_id")) return fail(reason);
      console.error("MONTRA city governance action failed", error);
      fail("city_unavailable");
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
    try {
      client.send("inventory_state", account.inventory);
      client.send("economy_state", {gold: account.gold, craftBatchMax: MAX_CRAFT_QUANTITY,
        craftQueueMax: CRAFT_QUEUE_LIMIT, craftQueueMsPerItem: CRAFT_QUEUE_MS_PER_ITEM});
    } catch { /* disconnect does not roll back committed assets */ }
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

  private isProtectedArea(mapId:string,point:{x:number;z:number}):boolean {
    const arena=this.field?.site===mapId?getWarDefinition(mapId)?.isolated:undefined;
    return arena?[arena.attack,arena.defend].some(spawn=>planarDistance(point,spawn)<=4):isRestArea(mapId,point);
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
    const rules=getWarDefinition(p.mapId);
    if(!rules || !p.alive || p.flying || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) ||
       this.attackTargets.has(id) || [...this.attackTargets.values()].includes(id) ||
       this.simulatedMs-(this.lastCombatMs.get(id)??-Infinity)<WARP_COMBAT_LOCK_MS)
      return client.send("territory_error",{reason:"war_busy"});
    try{
      const war=guildStore().war,member=war.member(character);
      if(!member)throw Error("war_guild");
      if(start && planarDistance(p,rules.entry)>WAR_ENTRY_RADIUS)throw Error("war_flag");
      const now=Date.now();
      if(!start)war.openScheduled(p.mapId,now);
      const field=start?war.start(p.mapId,member,now):{site:p.mapId,seq:war.inspect(p.mapId,now).seq};
      const side=war.side(field,member,now,false,character);
      const roomId=await battleRoom(field);
      if(!this.clients.includes(client) || !p.alive || p.mapId!==field.site)return;
      const ticket=randomUUID();
      for(const [who,entry] of admissions)if(entry.expires<=Date.now())admissions.delete(who);
      const target=matchMaker.getLocalRoomById(roomId);
      if(!(target instanceof MyRoom))throw Error("war_unavailable");
      if(rules.seatsPerSide!==null){
        const occupied=[...target.warSeats.values()].filter(s=>s.side===side).length;
        const reserved=[...admissions].filter(([who,s])=>who!==character && s.roomId===roomId && s.side===side).length;
        if(occupied+reserved>=rules.seatsPerSide)throw Error("war_side_full");
      }
      admissions.set(character,{roomId,ticket,side,point,guild:member.id,expires:Date.now()+30_000});
      client.send("territory_transfer",{roomId,ticket});
    }catch(error){
      const reason=error instanceof Error?error.message:"";
      if(!reason.startsWith("war_"))console.error("MONTRA territory entry",error);
      client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});
    }
  }
  private useCityGate(client:Client,message:unknown){
    if(!this.field || getWarDefinition(this.field.site)?.isolated)return;
    const castle=this.field.site===CASTLE_ID;
    const req=message as {gateId?:string;repair?:boolean}|null;
    const river=this.field.site===RIVER_CITY;
    if(castle || river){
      if(!req || typeof req!=="object" || typeof req.gateId!=="string" || !req.gateId)return client.send("territory_error",{reason:"war_gate_id"});
      if(req.repair!==undefined && (!castle || req.repair!==true))return;
    }else if(!parseEmptyCommand(message))return;
    const id=client.sessionId,p=this.state.players.get(id),seat=this.warSeats.get(id),character=this.persistentCharacters.get(id);
    if(!p?.alive || p.flying || !seat || !character || !onMapGround(p) || this.climbs.has(id) || this.pendingCharacterLeaves.has(id))return;
    const now=Date.now();
    if(now-(this.gateActions.get(id)??-Infinity)<1000)return;
    const war=guildStore().war,gates=WORLD_MAPS[this.field.site].strategic!.rampart!.gates;
    // Ordinary territory commands have no gate ID: use the closest gate center.
    // Castle/river-city commands continue to require an explicit gate ID.
    const gate=castle || river?gates.find(g=>g.id===req!.gateId):gates.reduce<typeof gates[number]|undefined>((nearest,g)=>{
      const distance=(candidate:typeof g)=>Math.hypot(p.x-candidate.box.x-candidate.box.width/2,p.z-candidate.box.z-candidate.box.length/2);
      return !nearest || distance(g)<distance(nearest)?g:nearest;
    },undefined);
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
      }else{
        // Other rooms pick the per-gate state up from the database on their next territory sample.
        const states=war.gate(this.field,seat.side,occupied,now,this.fieldCensus().relaySide,gate.id);
        this.closedFieldGates=new Set(Object.keys(states).filter(key=>states[key].closed));
      }
      this.markWarAction(id,true);
      this.nextWarSample=0;
    }catch(e){const reason=e instanceof Error?e.message:"";if(!reason.startsWith("war_"))console.error("MONTRA gate",e);client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});}
  }
  private markWarAction(id:string,objective=false):void {
    if(!this.field || !this.warSeats.has(id))return;
    const progress=this.warParticipation.get(id) ?? {sample:this.simulatedMs,activeMs:0,supplyMs:0,lastAction:-Infinity,lastObjective:-Infinity};
    progress.lastAction=this.simulatedMs;if(objective)progress.lastObjective=this.simulatedMs;
    this.warParticipation.set(id,progress);
  }
  private nearWarObjective(p:Player):boolean {
    const field=this.field;if(!field)return false;
    const rules=getWarDefinition(field.site),relay=rules?.relay;
    if(!rules?.isolated && WORLD_MAPS[field.site]?.strategic?.rampart?.gates.some(gate=>segmentIntersectsExpandedWall(p,p,gate.box,3.5)))return true;
    return field.site===CASTLE_ID ? castleObjectives.some(node=>planarDistance(p,node)<=CAPTURE_RADIUS) || forwardCamps.some(camp=>planarDistance(p,camp)<=CAPTURE_RADIUS)
      : field.site===RIVER_CITY ? riverPosts.some(post=>planarDistance(p,post)<=4)
      : Boolean(warSites[field.site] && planarDistance(p,warSites[field.site])<=5 || relay && planarDistance(p,relay)<=relay.radius);
  }
  /** Credit only real assistance to an allied player involved in a battle. */
  private markWarSupport(ownerId:string,targetId:string,underAttack:boolean):void {
    if(!this.field || !this.battleActive || ownerId===targetId)return;
    const owner=this.state.players.get(ownerId),target=this.state.players.get(targetId),a=this.warSeats.get(ownerId),b=this.warSeats.get(targetId);
    if(!owner?.alive || !target?.alive || !a || !b || a.side!==b.side || owner.mapId!==this.field.site || target.mapId!==this.field.site ||
       !this.persistentCharacters.has(ownerId) || !this.persistentCharacters.has(targetId) || !this.nearWarObjective(target))return;
    if(!underAttack && this.simulatedMs-(this.lastPvpMs.get(targetId) ?? -Infinity)>15_000)return;
    const progress=this.warParticipation.get(ownerId) ?? {sample:this.simulatedMs,activeMs:0,supplyMs:0,lastAction:-Infinity,lastObjective:-Infinity};
    progress.lastAction=this.simulatedMs;progress.lastSupport=this.simulatedMs;this.warParticipation.set(ownerId,progress);
  }
  private awardWarExperience(id:string,amount:number,progress:{activeMs:number;supplyMs:number}):void {
    if(this.pendingRewards.has(id) || this.pendingItemUses.has(id) || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id))return;
    const supplyDue=progress.supplyMs>=WAR_SUPPLY_INTERVAL_MS;
    if(amount<=0 && !supplyDue){progress.activeMs-=WAR_PARTICIPATION_INTERVAL_MS;return;}
    this.pendingWarps.add(id);progress.activeMs-=WAR_PARTICIPATION_INTERVAL_MS;
    let task:Promise<void>;
    task=Promise.resolve().then(async()=>{
      let committed=false;
      try{
        const current=this.state.players.get(id),snapshot=this.captureCharacterSnapshot(id);
        if(!current || !snapshot)throw Error("war_character_unavailable");
        const next=addExperience(current.level,current.experience,amount),leveled=next.level!==current.level;
        const material=supplyDue ? `mat_fiber_${materialTier(current.level)}` as MaterialId : undefined;
        const bag=material && snapshot.inventory ? grantStackReward(snapshot.inventory,material) : null;
        const build=this.playerBuild(current),rebirth=build ? recordClassLevel(snapshot.rebirth ?? newRebirthState(),build.path,Math.min(100,next.level)) : snapshot.rebirth;
        await characterStore.save({...snapshot,...next,rebirth,inventory:bag ?? snapshot.inventory,updatedAt:new Date().toISOString()});
        committed=true;
        if(rebirth)this.rebirthStates.set(id,rebirth);
        if(bag){this.inventories.set(id,bag);progress.supplyMs-=WAR_SUPPLY_INTERVAL_MS;}
        current.level=next.level;current.experience=next.experience;
        this.applyStats(id,current,this.statAllocations.get(id) ?? emptyAllocations());
        const client=this.clients.find(c=>c.sessionId===id);
        try{
          if(leveled && client && this.sentItemCatalog.has(id))this.sendHuntGuide(client,current);
          if(bag)client?.send("inventory_state",bag);
          client?.send("experience_gained",{amount,level:next.level,experience:next.experience,source:"war",...(material?{personalDrop:bag?material:"bag_full"}: {})});
        }catch(error){console.warn("MONTRA war EXP notice was not delivered",error);}
      }catch(error){
        if(!committed && this.warParticipation.get(id)===progress)progress.activeMs+=WAR_PARTICIPATION_INTERVAL_MS;
        console.error("MONTRA war EXP save failed:",id,error);
        try{this.clients.find(c=>c.sessionId===id)?.send("character_save_error",{reason:"disk_write_failed"});}catch{/* disconnected */}
      }finally{
        if(this.pendingRewards.get(id)===task){this.pendingRewards.delete(id);this.pendingWarps.delete(id);}
      }
    });
    this.pendingRewards.set(id,task);
  }
  private updateWarParticipation():void {
    const field=this.field;if(!field || !this.battleActive)return;
    const war=guildStore().war;
    for(const [id,seat] of this.warSeats){
      const p=this.state.players.get(id),character=this.persistentCharacters.get(id);
      const progress=this.warParticipation.get(id) ?? {sample:this.simulatedMs,activeMs:0,supplyMs:0,lastAction:-Infinity,lastObjective:-Infinity};
      const elapsed=Math.max(0,Math.min(1000,this.simulatedMs-progress.sample));progress.sample=this.simulatedMs;
      this.warParticipation.set(id,progress);
      if(!p?.alive || !character || war.member(character)?.id!==seat.guild || p.mapId!==field.site || p.flying || !onMapGround(p) || this.climbs.has(id) || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id))continue;
      const nearby=this.nearWarObjective(p);
      const involved=this.simulatedMs-Math.max(progress.lastAction,this.lastCombatMs.get(id) ?? -Infinity)<=45_000;
      const workedGate=this.simulatedMs-progress.lastObjective<=15_000;
      const supported=this.simulatedMs-(progress.lastSupport ?? -Infinity)<=10_000;
      if((nearby && involved) || workedGate || supported){progress.activeMs+=elapsed;progress.supplyMs+=elapsed;}
      if(progress.activeMs>=WAR_PARTICIPATION_INTERVAL_MS)
        this.awardWarExperience(id,cycleExperience(warParticipationExperience(p.level<PROGRESSION.maxLevel?xpForNextLevel(p.level):0),this.rebirthStates.get(id)?.count ?? 0),progress);
    }
  }
  private fieldCensus(){
    let attack=0,defend=0;
    const field=this.field,relay=field && getWarDefinition(field.site)?.relay;
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
  private cargoAtDestination(id:string):boolean {
    const player=this.state.players.get(id),cargo=this.warCargo.get(id),field=this.field;
    return Boolean(player?.alive && cargo && field && cargo.seq===field.seq && player.mapId===field.site && !player.flying && onMapGround(player) &&
      !this.climbs.has(id) && !this.activeDashes.has(id) && !this.pendingWarps.has(id) && !this.pendingItemUses.has(id) &&
      this.simulatedMs-cargo.started>=8000 && Math.hypot(player.x-cargo.x,player.z-cargo.z)>=15 && this.nearWarObjective(player));
  }
  private orderWarCargo(client:Client,message:unknown):void {
    const id=client.sessionId,field=this.field,seat=this.warSeats.get(id),character=this.persistentCharacters.get(id),p=this.state.players.get(id);
    if(!this.gates.get(id)?.guild.consume(this.simulatedMs))return this.reject(client,"guild_rate_limited");
    if(!message || typeof message!=="object" || Array.isArray(message) || Object.keys(message).length!==1 ||
      typeof (message as {action?:unknown}).action!=="string" || !["pickup","deliver"].includes((message as {action:string}).action))return this.reject(client,"invalid_request");
    if(!field || !this.battleActive || !seat || !character || !p?.alive || p.mapId!==field.site || this.pendingCharacterLeaves.has(id))return client.send("territory_error",{reason:"war_supply_unavailable"});
    const war=guildStore().war,now=Date.now();
    try{
      const member=war.member(character);
      if(!member || member.id!==seat.guild || war.side(field,member,now,false,character)!==seat.side)throw Error("war_supply_side");
      if((message as {action:string}).action==="pickup"){
        if(this.warCargo.has(id))throw Error("war_supply_carrying");
        if(now<war.supplyReadyAt(field,character))throw Error("war_supply_cooldown");
        if(!this.canMarch(id))throw Error("war_supply_base");
        this.warCargo.set(id,{seq:field.seq,token:randomUUID(),x:p.x,z:p.z,started:this.simulatedMs});
        client.send("war_supply_notice",{action:"pickup"});
      }else{
        const cargo=this.warCargo.get(id);
        if(!cargo || cargo.seq!==field.seq)throw Error("war_supply_missing");
        if(!this.cargoAtDestination(id))throw Error("war_supply_destination");
        war.deliverSupply(field,character,seat.side,cargo.token,now);
        this.warCargo.delete(id);
        const progress=this.warParticipation.get(id) ?? {sample:this.simulatedMs,activeMs:0,supplyMs:0,lastAction:-Infinity,lastObjective:-Infinity};
        progress.lastAction=this.simulatedMs;progress.lastObjective=this.simulatedMs;
        progress.activeMs+=WAR_PARTICIPATION_INTERVAL_MS;progress.supplyMs+=WAR_SUPPLY_INTERVAL_MS;this.warParticipation.set(id,progress);
        this.awardWarExperience(id,cycleExperience(warParticipationExperience(p.level<PROGRESSION.maxLevel?xpForNextLevel(p.level):0),this.rebirthStates.get(id)?.count ?? 0),progress);
        try{client.send("war_supply_notice",{action:"delivered",count:war.supplyCount(field,seat.guild)});}catch{/* delivery already committed */}
      }
      this.warSent.delete(id);this.nextWarSample=0;
    }catch(error){const reason=error instanceof Error && error.message.startsWith("war_")?error.message:"war_supply_unavailable";client.send("territory_error",{reason});}
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
      if(this.warCargo.has(id))return error("war_supply_march");
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
    const states=Object.fromEntries(Object.keys(warSites).map(site=>{
      war.openScheduled(site,now);
      return [site,war.inspect(site,now)];
    }));
    if(this.field){
      const s=states[this.field.site], wasActive=this.battleActive;
      this.battleActive=s.seq===this.field.seq && s.phase==="battle";
      if (this.ghostConfig && wasActive !== this.battleActive) {
        for (const client of this.clients) {
          const id = client.sessionId;
          if (!this.warSeats.has(id)) continue;
          if (!this.battleActive && this.activeGhosts.has(id)) this.despawnSummon(id, "ghost_war_ended");
          else this.sendGhostPot(client, "ready");
        }
      }
      const gates=s.river?.gates ?? s.pilot?.gates ?? s.gates;
      if(gates)this.closedFieldGates=new Set(Object.entries(this.battleActive?gates:{}).filter(([,g])=>g.closed).map(([id])=>id));
      if(this.battleActive)this.updateWarParticipation();
      else if(this.warCargo.size){for(const id of this.warCargo.keys())try{this.clients.find(client=>client.sessionId===id)?.send("war_supply_notice",{action:"ended"});}catch{}this.warCargo.clear();}
    }
    const owners=Object.fromEntries(Object.entries(states).map(([site,s])=>[site,s.owner]));
    const warTimes=Object.fromEntries(Object.entries(states).map(([site,s])=>[site,{phase:s.phase,phaseEndsAt:s.phaseEndsAt}]));
    const teams=this.field?Object.fromEntries([...this.warSeats].map(([id,seat])=>[id,seat.side])):undefined;
    const pilot=this.field && states[this.field.site].pilot;
    const supplies=this.battleActive && counts && campCounts && pilot?.throne?{
      attack:castleLogistics(pilot,counts,campCounts,"attack"),defend:castleLogistics(pilot,counts,campCounts,"defend")
    }:undefined;
    for(const c of this.clients){
      if(!this.warClients.has(c.sessionId))continue;
      const p=this.state.players.get(c.sessionId);if(!p)continue;
      const s=states[p.mapId],character=this.persistentCharacters.get(c.sessionId),member=character?war.member(character):null;
      const inField=Boolean(this.field),ownBattle=!inField || this.field?.seq===s?.seq;
      const seat=this.warSeats.get(c.sessionId);
      const supply=seat && member?.id===seat.guild && supplies?.[seat.side];
      const view=ownBattle?s?.pilot:undefined;
      const visiblePilot=view?.throne && s.phase==="battle"?{...view,points:view.points.map(point=>
        point.id>=4 && (!inField || !p.alive || planarDistance(p,castleObjectives[point.id-1])>18)?{...point,progress:0}:point)}:view;
      const rules=getWarDefinition(p.mapId),arena=rules?.isolated;
      const local=s?{site:p.mapId,civic:arena && {flag:arena.flag,relay:arena.relay,
        durationMs:rules.durationMs,seatsPerSide:rules.seatsPerSide},phase:ownBattle?s.phase:"finished",owner:s.owner,attackName:s.attackName,defendName:s.defendName,
        progress:Math.trunc(s.progress),goal:s.goal,seconds:s.seconds,attack,defend,inField,side:this.warSeats.get(c.sessionId)?.side,
        pilot:visiblePilot,river:inField && ownBattle && s.river?{...s.river,supplied:seat && riverSupplied(s.river,seat.side)}:undefined,
        supply:supply?{...supply,selected:seat!.camp,atBase:this.canMarch(c.sessionId)}:undefined,
        cargo:inField && this.battleActive && seat && character && member?.id===seat.guild?{
          carrying:this.warCargo.has(c.sessionId),atBase:this.canMarch(c.sessionId),canDeliver:this.cargoAtDestination(c.sessionId),
          base:this.playerSpawn.get(c.sessionId),readyAt:war.supplyReadyAt(this.field!,character),cooldown:Math.max(0,Math.ceil((war.supplyReadyAt(this.field!,character)-now)/1000)),
          delivered:war.supplyCount(this.field!,seat.guild),treasuryPerDelivery:5,treasuryCap:120}:undefined,
        participation:inField && this.battleActive && seat && character && member?.id===seat.guild?{
          progressSeconds:Math.floor((this.warParticipation.get(c.sessionId)?.activeMs ?? 0)/1000),
          supportActive:this.simulatedMs-(this.warParticipation.get(c.sessionId)?.lastSupport ?? -Infinity)<=10_000,
          goalSeconds:WAR_PARTICIPATION_INTERVAL_MS/1000}:undefined,
        relay:inField && ownBattle && this.battleActive && getWarDefinition(p.mapId)?.relay?{side:relaySide,contested}:undefined,
        government:!inField && member && member.id===s.ownerId?war.government.view(p.mapId,member,now):undefined,
        gateHp:s.gateHp,gateClosed:inField && this.battleActive && !s.river && !s.pilot && this.closedFieldGates.size>0,
        gates:inField && !s.river && !s.pilot?s.gates:undefined,
        canStart:!inField && s.phase==="open" && member?.officer===true && member.id!==s.ownerId,
        canJoin:!inField && s.phase==="battle" && !!member && war.rosterAllows(s.seq,member,character) && (member.id===s.attacker || member.id===s.defender || (!s.owner && !s.defendName && member.officer))}:null;
      const engagements=!inField && member ? Object.entries(states).filter(([,state])=>state.phase==="battle" && war.rosterAllows(state.seq,member,character) && (state.attacker===member.id || state.defender===member.id)).map(([site,state])=>({site,side:state.attacker===member.id?"attack":"defend"})) : [];
      const schedule=!inField && SCHEDULED_WARS_ENABLED?Object.fromEntries(Object.keys(warSites)
        .map(site=>[site,war.scheduleView(site,now,member)])):undefined;
      const routes=!inField && character?war.routeView(character,p.mapId,now):undefined;
      const payload={owners,local,teams,engagements,warTimes,schedule,routes,serverNow:now};
      const signature=JSON.stringify({owners,local,teams,engagements,warTimes,schedule,routes});
      if(signature!==this.warSent.get(c.sessionId)){c.send("territory_state",payload);this.warSent.set(c.sessionId,signature);}
    }
  }
  private sendGhostPot(client: Client, status: string, capturedInstanceId?: string) {
    const id = client.sessionId;
    const pool = this.ghostPools.get(id) ?? makeGhostPool();
    const active = this.activeGhosts.get(id);
    const guardian = active && this.state.summons.get(id);
    const activeInstanceId = active?.instanceId ?? null;
    client.send("ghost_pot_state", {
      ghost: findPoolGhost(pool, activeInstanceId ?? pool.slots[pool.selectedSlot]) ?? null,
      active: activeInstanceId !== null,
      status,
      pool,
      capacity: GHOST_POOL_CAPACITY,
      activeInstanceId,
      captureAvailable: !this.field,
      combatAvailable: this.ghostBattleAllows(id),
      combatRange: RULES.capturedGhostEngageDistance,
      combatId: active?.combatId ?? null,
      combatTarget: active?.order ? {targetId: active.order.targetId, targetName: active.order.targetName} : null,
      combatHealth: guardian ? {hp: guardian.hp, maxHp: guardian.maxHp} : null,
      skills: active?.skills.map(skill => {
        const usage = this.ghostSkillUsage.get(id)?.get(`${active.instanceId}:${skill.skillId}`);
        return {skillId: skill.skillId, remainingMs: Math.max(0, (usage?.readyAt ?? 0) - this.simulatedMs),
          usesLeft: skill.maxUses - (usage?.uses ?? 0)};
      }) ?? [],
      fainted: [...(this.ghostHealth.get(id) ?? [])].filter(([,hp]) => hp === 0).map(([instanceId]) => instanceId),
      capturedInstanceId,
    });
  }

  private resetGhostWorker(worker: LegacyGhostWorker) {
    if (this.ghostWorker !== worker) return;
    this.ghostWorker = undefined;
    worker.close();
    for (const owner of this.activeGhosts.keys()) this.despawnSummon(owner, "ghost_worker_unavailable");
  }

  private ghostBattleAllows(id: string) {
    return !this.field || (this.battleActive && this.warSeats.has(id) && this.state.players.get(id)?.mapId === this.field.site);
  }

  private combatGhost(targetId: string): GhostCombatActor | undefined {
    if (!targetId.startsWith("ghost:")) return;
    const ownerId = targetId.split(":")[1];
    const owner = this.state.players.get(ownerId), guardian = this.state.summons.get(ownerId);
    const active = this.activeGhosts.get(ownerId);
    if (!active || guardian?.combatTargetId !== targetId || guardian.hp <= 0 || !owner?.alive || !this.ghostBattleAllows(ownerId) ||
        owner.mapId !== guardian.mapId || this.pendingWarps.has(ownerId) || this.pendingCharacterLeaves.has(ownerId) ||
        this.isProtectedArea(owner.mapId, owner) || this.isProtectedArea(owner.mapId, guardian)) return;
    return {ownerId, guardian, active};
  }

  private canPlayerHitGhost(attackerId: string, ghost: GhostCombatActor) {
    return attackerId !== ghost.ownerId && this.ghostBattleAllows(attackerId) && this.sameCombatMap(attackerId, ghost.ownerId);
  }

  private hitGhost(ghost: GhostCombatActor, attackerId: string, damage: number, ranged = false) {
    const {ownerId, guardian, active} = ghost;
    const applied = Math.min(guardian.hp, damage);
    guardian.hp -= applied;
    let health = this.ghostHealth.get(ownerId);
    if (!health) this.ghostHealth.set(ownerId, health = new Map());
    health.set(active.instanceId, guardian.hp);
    this.lastCombatMs.set(ownerId, this.simulatedMs);
    try {
      this.broadcast("ghost_damaged", {
        ownerId, combatId: active.combatId, targetId: guardian.combatTargetId, attackerId, ranged,
        damage: applied, hp: guardian.hp, maxHp: guardian.maxHp,
      }, {afterNextPatch: true});
    } finally {
      if (guardian.hp === 0) this.despawnSummon(ownerId, "ghost_defeated");
    }
  }

  private recoverParkedGhosts(id: string, owner: Player) {
    const health = this.ghostHealth.get(id);
    const skills = this.ghostSkillUsage.get(id);
    if ((!health && !skills) || !owner.alive || !this.isProtectedArea(owner.mapId, owner) || this.isFighting(id)) return;
    const active = this.activeGhosts.get(id)?.instanceId;
    if (health) {
      for (const instanceId of health.keys()) if (instanceId !== active) health.delete(instanceId);
      if (!health.size) this.ghostHealth.delete(id);
    }
    if (skills) {
      for (const key of skills.keys()) if (!active || !key.startsWith(active + ":")) skills.delete(key);
      if (!skills.size) this.ghostSkillUsage.delete(id);
    }
  }

  private getGhostTarget(id: string, owner: Player, guardian: SummonedGuardian, targetId: string) {
    if (id === targetId || !this.ghostBattleAllows(id) || !this.sameCombatMap(id, targetId) ||
        this.isProtectedArea(owner.mapId, guardian) || distance3d(owner, guardian) > RULES.capturedGhostLeashDistance) return null;
    const monster = this.getMonster(targetId);
    const target = monster ?? this.state.players.get(targetId);
    if (!target?.alive || target.hp <= 0 || this.seerBindings.get(targetId)?.ownerId === id ||
        (!monster && !this.ghostBattleAllows(targetId)) ||
        (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))) ||
        distance3d(owner, target) > RULES.capturedGhostEngageDistance || !this.bodyPathClear(owner.mapId, guardian, target) ||
        !this.combatSegmentClear(owner.mapId, guardian, target)) return null;
    return target;
  }

  private orderGhost(client: Client, owner: Player, input: GhostCombatCommand, active?: ActiveGhost) {
    const id = client.sessionId, guardian = this.state.summons.get(id);
    if (!active || active.combatId !== input.combatId || guardian?.kind !== "captured_ghost")
      return this.reject(client, "ghost_combat_inactive");
    if (input.action === "follow") {
      active.order = undefined;
      guardian.targetId = "";
      guardian.action = "follow";
      return client.send("ghost_combat_state", {combatId: active.combatId, status: "following"});
    }
    const targetId = input.targetId, target = this.getGhostTarget(id, owner, guardian, targetId);
    if (!target) return this.reject(client, "ghost_combat_target");
    const targetName = ("displayName" in target ? target.displayName : target.characterName) || targetId;
    active.order = {targetId, target, targetName};
    client.send("ghost_combat_state", {combatId: active.combatId, status: "ordered", targetId, targetName});
  }

  private ghostParty(pool: GhostPool) {
    return pool.slots.flatMap((instanceId, slot) => {
      const entry = findPoolGhost(pool, instanceId);
      return entry ? [{instanceId: entry.instanceId, level: entry.level, slot, speciesId: POT_CAPTURE_PROFILE}] : [];
    });
  }

  private async castGhostSkill(client: Client, owner: Player, input: GhostSkillCommand, pool: GhostPool, active?: ActiveGhost) {
    const id = client.sessionId, guardian = this.state.summons.get(id), worker = this.ghostWorker;
    if (!active || active.combatId !== input.combatId || guardian?.kind !== "captured_ghost" || !worker)
      return this.reject(client, "ghost_combat_inactive");
    const skill = active.skills.find(candidate => candidate.skillId === input.skillId);
    if (!skill) return this.reject(client, "ghost_skill_unlearned");
    const key = `${active.instanceId}:${skill.skillId}`;
    const usage = this.ghostSkillUsage.get(id)?.get(key);
    if ((usage?.uses ?? 0) >= skill.maxUses) return this.reject(client, "ghost_skill_exhausted");
    if ((usage?.readyAt ?? 0) > this.simulatedMs) return this.reject(client, "ghost_skill_cooldown");

    const targetId = input.targetId, target = this.getGhostTarget(id, owner, guardian, targetId);
    if (!target || distance3d(guardian, target) > skill.range) return this.reject(client, "ghost_combat_target");
    const zone = owner.mapId, hitSeq = target.hitSeq, level = target.level;
    const defense = "defense" in target ? target.defense : this.masteryPower(target, "pvp", "def");
    this.ghostControlPending.add(id);
    try {
      const reply = await worker.send({
        owner: id, position: {x: owner.x, y: owner.y, z: owner.z}, party: this.ghostParty(pool),
        command: {commandId: randomUUID(), kind: "skill", instanceId: active.instanceId, zone,
          expectedActiveGeneration: active.generation, skillId: skill.skillId, targetActorId: targetId},
        skill: {origin: {x: guardian.x, y: guardian.y, z: guardian.z}, targetId,
          targetPosition: {x: target.x, y: target.y, z: target.z}, targetLevel: level,
          targetHp: target.hp, targetMaxHp: target.maxHp, targetDefenseScale: defense / PROGRESSION.baseDef},
      });
      if (this.ghostWorker !== worker) return;
      if (!reply.accepted) return this.reject(client, "ghost_skill_unavailable");
      const strike = reply.skill;
      if (reply.replay || strike?.targetId !== targetId || strike.skillId !== skill.skillId ||
          typeof strike.hit !== "boolean" || typeof strike.critical !== "boolean" ||
          !Number.isFinite(strike.damageScale) || strike.damageScale < 0)
        throw new Error("invalid_ghost_skill_result");
      if (this.activeGhosts.get(id) !== active || this.state.summons.get(id) !== guardian ||
          !owner.alive || owner.mapId !== zone || this.pendingCharacterLeaves.has(id) || guardian.hp <= 0 ||
          this.getGhostTarget(id, owner, guardian, targetId) !== target || target.hitSeq !== hitSeq ||
          distance3d(guardian, target) > skill.range || target.level !== level ||
          ("defense" in target ? target.defense : this.masteryPower(target, "pvp", "def")) !== defense)
        return this.reject(client, "ghost_combat_target");

      let skills = this.ghostSkillUsage.get(id);
      if (!skills) this.ghostSkillUsage.set(id, skills = new Map());
      const uses = (usage?.uses ?? 0) + 1;
      skills.set(key, {uses, readyAt: this.simulatedMs + skill.cooldownMs});
      this.ghostAttackAt.set(id, this.simulatedMs);
      const mode = "defense" in target ? "pve" : "pvp";
      const power = RULES.summonAttackDamage * (1 + masteryBonuses(this.rebirthStates.get(id), mode).atk);
      const damage = strike.hit && strike.damageScale > 0 ? Math.max(1, Math.round(strike.damageScale * power)) : 0;
      this.landGhostStrike(id, owner, guardian, targetId, target, damage, applied => {
        client.send("ghost_combat_state", {combatId: active.combatId, status: "skill", skillId: skill.skillId,
          targetId, targetName: ("displayName" in target ? target.displayName : target.characterName) || targetId,
          damage: applied, hp: target.hp, hit: strike.hit, critical: strike.critical,
          remainingMs: skill.cooldownMs, usesLeft: skill.maxUses - uses});
      });
    } catch (error) {
      if (error instanceof GhostWorkerBusy) return this.reject(client, "ghost_pot_busy");
      console.error("MONTRA ghost skill failed", error);
      this.resetGhostWorker(worker);
      this.reject(client, "ghost_skill_unavailable");
    } finally {
      this.ghostControlPending.delete(id);
    }
  }

  private endGhostOrder(ownerId: string, active: ActiveGhost, order: GhostOrder) {
    active.order = undefined;
    this.clients.find(client => client.sessionId === ownerId)?.send("ghost_combat_state", {
      combatId: active.combatId, status: "ended", targetId: order.targetId, targetName: order.targetName,
    });
  }

  private async handleGhostPot(client: Client, message: unknown) {
    const config = this.ghostConfig, id = client.sessionId, owner = this.state.players.get(id);
    if (!config || !characterStore.economyEnabled || !owner || !this.persistentCharacters.has(id) ||
        (this.field && !this.warSeats.has(id)))
      return this.reject(client, "ghost_pot_unavailable");
    const input = parseGhostCommand(message);
    if (!input) return this.reject(client, "invalid_ghost_pot");
    if (input.action === "read") {
      this.recoverParkedGhosts(id, owner);
      return this.sendGhostPot(client, "ready");
    }
    if (this.field && input.action === "capture") return this.reject(client, "ghost_capture_unavailable");
    if (!("revision" in input) && !this.ghostBattleAllows(id)) return this.reject(client, "ghost_combat_war");
    if (!owner.alive || owner.mounted || owner.possessionActive || this.pendingWarps.has(id) ||
        this.pendingCharacterLeaves.has(id) || this.pendingItemUses.has(id) || this.pendingRewards.has(id) ||
        this.ghostControlPending.has(id)) return this.reject(client, "ghost_pot_busy");
    if (!this.gates.get(id)?.summon.consume(this.simulatedMs)) return this.reject(client, "ghost_pot_busy");

    const current = this.activeGhosts.get(id);
    if (input.action === "attack" || input.action === "follow") return this.orderGhost(client, owner, input, current);
    const pool = this.ghostPools.get(id) ?? makeGhostPool();
    if (input.action === "skill") return this.castGhostSkill(client, owner, input, pool, current);
    if ("revision" in input) {
      const placement = placePoolGhost(pool, input, current?.instanceId);
      if (placement.pool === pool) return this.sendGhostPot(client, placement.status);
      const snapshot = this.captureCharacterSnapshot(id);
      if (!snapshot) return this.sendGhostPot(client, "unavailable");
      const task = characterStore.save({...snapshot, ghostPool: placement.pool})
        .then(() => {
          this.ghostPools.set(id, placement.pool);
          this.sendGhostPot(client, placement.status);
        })
        .catch(error => {
          console.error("MONTRA ghost pool placement failed", error);
          this.sendGhostPot(client, "unavailable");
        })
        .finally(() => this.pendingItemUses.delete(id));
      this.pendingItemUses.set(id, task);
      await task;
      return;
    }

    if (input.action === "capture") {
      if (this.state.summons.has(id)) return this.reject(client, "ghost_pot_occupied");
      if (pool.collection.length >= GHOST_POOL_CAPACITY) return this.sendGhostPot(client, "pool_full");
      const targetId = input.targetId, target = this.getMonster(targetId);
      if (!target?.alive || target.hp <= 0 || target.tier !== "normal" || target.level > 60 ||
          target.mapId !== owner.mapId || distance3d(owner, target) > 8 || !this.bodyPathClear(owner.mapId, owner, target))
        return this.reject(client, "ghost_target_unavailable");
      if (this.ghostCaptureTargets.has(targetId) || this.simulatedMs < (this.ghostCaptureReadyAt.get(id) ?? 0))
        return this.reject(client, "ghost_pot_busy");
      this.ghostCaptureReadyAt.set(id, this.simulatedMs + 3000);
      this.ghostCaptureTargets.add(targetId);
      const task = (async () => {
        try {
          const hp = target.hp, hitSeq = target.hitSeq;
          const caught = await rollPotCapture(config.capture, {hp, maxHp: target.maxHp, level: target.level}, owner.level);
          if (!owner.alive || !target.alive || target.hitSeq !== hitSeq || target.hp !== hp ||
              this.getMonster(targetId) !== target || this.pendingCharacterLeaves.has(id) ||
              owner.mapId !== target.mapId || distance3d(owner, target) > 8 ||
              !this.bodyPathClear(owner.mapId, owner, target)) return this.sendGhostPot(client, "target_changed");
          if (!caught) return this.sendGhostPot(client, "escaped");
          const snapshot = this.captureCharacterSnapshot(id);
          if (!snapshot) return this.sendGhostPot(client, "unavailable");
          const captured = {instanceId: randomUUID(), name: (target.displayName || "ผี").slice(0, 80), level: target.level,
            source: {monsterId: target.id, mapId: target.mapId}};
          const nextPool = addCapturedGhost(pool, captured);
          await characterStore.save({...snapshot, ghostPool: nextPool});
          this.ghostPools.set(id, nextPool);
          this.retireMonster(target);
          this.sendGhostPot(client, "captured", captured.instanceId);
        } catch (error) {
          console.error("MONTRA ghost capture failed", error);
          this.sendGhostPot(client, "unavailable");
        } finally {
          this.ghostCaptureTargets.delete(targetId);
          this.pendingItemUses.delete(id);
        }
      })();
      this.pendingItemUses.set(id, task);
      return task;
    }

    const kind = input.action;
    if (kind !== "summon" && kind !== "recall" && kind !== "switch")
      return this.reject(client, "invalid_ghost_pot");
    const ghost = findPoolGhost(pool, kind === "recall" ? current?.instanceId : pool.slots[pool.selectedSlot]);
    if (!ghost) return this.reject(client, "ghost_pot_empty");
    this.recoverParkedGhosts(id, owner);
    const parkedHp = this.ghostHealth.get(id)?.get(ghost.instanceId);
    if (parkedHp === 0) return this.sendGhostPot(client, "fainted");
    const priorSummon = this.state.summons.get(id);
    if (kind === "summon" ? priorSummon : !current || priorSummon?.kind !== "captured_ghost")
      return this.reject(client, "ghost_pot_busy");
    if (kind === "switch" && ghost.instanceId === current?.instanceId) return this.sendGhostPot(client, "ready");
    const zone = owner.mapId, position = {x: owner.x, y: owner.y, z: owner.z};
    const party = this.ghostParty(pool);
    const worker = this.ghostWorker ??= new LegacyGhostWorker(config.worker);
    this.ghostControlPending.add(id);
    try {
      const reply = await worker.send({owner: id, position, party, command: {
        commandId: randomUUID(), instanceId: ghost.instanceId, zone, kind,
        ...(kind !== "recall" && {targetPoint: position}),
        ...(current && {expectedActiveGeneration: current.generation}),
        ...(kind === "switch" && current && {expectedActiveInstanceId: current.instanceId}),
      }});
      if (this.ghostWorker !== worker) return;
      if (!reply.accepted) return this.sendGhostPot(client, "unavailable");
      if (kind === "recall") {
        this.despawnSummon(id, "ghost_recalled");
        return this.sendGhostPot(client, "recalled");
      }
      const active = reply.active;
      if (!active || active.instanceId !== ghost.instanceId || !Number.isSafeInteger(active.generation) ||
          ![active.x, active.y, active.z, active.hpScale, active.defenseScale, active.magicDefenseScale,
            active.attackScale, active.basicRange, active.basicCooldownMs].every(Number.isFinite) ||
          active.hpScale <= 0 || active.defenseScale < 0 || active.magicDefenseScale < 0 ||
          active.attackScale <= 0 || active.basicRange <= 0 || active.basicCooldownMs <= 0 ||
          !Array.isArray(active.skills) || active.skills.some(skill => typeof skill.skillId !== "string" ||
            !Number.isFinite(skill.range) || skill.range <= 0 || !Number.isFinite(skill.cooldownMs) || skill.cooldownMs <= 0 ||
            !Number.isInteger(skill.maxUses) || skill.maxUses <= 0))
        throw new Error("invalid_ghost_worker_actor");
      if (this.state.players.get(id) !== owner || !owner.alive || owner.mapId !== zone ||
          this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) || owner.mounted ||
          owner.possessionActive || !this.ghostBattleAllows(id) || this.state.summons.get(id) !== priorSummon) {
        if (this.state.summons.get(id)?.kind === "captured_ghost") this.despawnSummon(id, "ghost_owner_unavailable");
        else await worker.send({owner: id, disconnect: true});
        return this.sendGhostPot(client, "unavailable");
      }
      const combatId = randomUUID();
      const villageGhost = this.state.monster;
      const source = ghost.source ?? (ghost.name === villageGhost.displayName && ghost.level === villageGhost.level
        ? {monsterId: RULES.monsterId, mapId: DEFAULT_MAP_ID}
        : legacyCapturedGhostSource(ghost.name, ghost.level));
      // Keep the legacy level curve in Montra's combat units.
      const maxHp = Math.round(active.hpScale * RULES.monsterMaxHp);
      this.activeGhosts.set(id, {instanceId: ghost.instanceId, generation: active.generation, combatId,
        level: ghost.level, defense: active.defenseScale * PROGRESSION.baseDef, magicDefense: active.magicDefenseScale * PROGRESSION.baseMagicDef,
        attackPower: active.attackScale * RULES.summonAttackDamage, basicRange: active.basicRange,
        basicCooldownMs: active.basicCooldownMs, skills: active.skills});
      this.state.summons.set(id, new SummonedGuardian({
        ownerId: id, kind: "captured_ghost", x: active.x, y: active.y, z: active.z, facing: owner.facing,
        combatTargetId: `ghost:${id}:${combatId}`, hp: Math.min(parkedHp ?? maxHp, maxHp), maxHp, mapId: zone,
        ...(source && {sourceMonsterId: source.monsterId, sourceMapId: source.mapId, sourceLevel: ghost.level}),
      }));
      this.broadcast("summon_spawn", {ownerId: id, kind: "captured_ghost"}, {afterNextPatch: true});
      this.sendGhostPot(client, kind === "switch" ? "switched" : "summoned");
    } catch (error) {
      if (error instanceof GhostWorkerBusy) return this.reject(client, "ghost_pot_busy");
      console.error("MONTRA ghost worker failed", error);
      this.resetGhostWorker(worker);
      this.sendGhostPot(client, "unavailable");
    } finally {
      this.ghostControlPending.delete(id);
    }
  }

  private boatIntent(client: Client, message: unknown) {
    const id = client.sessionId, player = this.state.players.get(id);
    const intent = parseBoatIntent(message);
    if (!intent) return this.reject(client,"invalid_boat_intent");
    if (!this.state.boatsAvailable || !player?.alive || !BOAT_SHORES[player.mapId] ||
        this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) ||
        this.activeDashes.has(id) || this.climbs.has(id) || this.flightTransitions.has(id) ||
        player.flying || player.mounted || this.basicAttackPaused(id)) return this.reject(client,"boat_unavailable");
    if ((intent.action === "launch" || intent.action === "board") && !onMapGround(player)) {
      return this.reject(client,"boat_unavailable");
    }
    if (!this.gates.get(id)?.move.consume(this.simulatedMs)) return this.reject(client,"move_rate_limited");
    if(intent.action==="warp")return this.warpBoat(client,player,intent.gateId);
    if (!this.boatWorld.act(id,player,intent,this.simulatedMs)) {
      return this.reject(client,intent.action==="walk" ? "boat_deck_only" : "boat_action_unavailable");
    }
    if (intent.action === "walk") this.endAttack(id,player);
    if (intent.action === "board" || intent.action === "exit" || intent.action === "helm") {
      this.destinations.delete(id);
      this.crestTurns.delete(id);
      this.fishing.delete(id);
      if (!player.targetId) player.combatState = "idle";
    }
  }

  private warpBoat(client:Client,player:Player,gateId:string) {
    const transit=this.boatWorld.prepareTransit(client.sessionId,player,gateId);
    if("reason" in transit)return this.reject(client,transit.reason);
    const crew=new Map<string,Player>(),saves:CharacterSnapshot[]=[];
    for(const id of transit.boat.passengerIds){
      const rider=this.state.players.get(id);
      if(!rider?.alive || rider.boatId!==transit.boat.entityId || rider.mapId!==transit.boat.islandId ||
          this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) || this.pendingItemUses.has(id) ||
          this.pendingRewards.has(id) || this.ghostControlPending.has(id) || this.bladeCloaks.has(id) || this.basicAttackPaused(id))
        return this.reject(client,"boat_gate_crew_busy");
      if(!this.canEnterWorldMap(id,transit.mapId))return this.reject(client,"boat_gate_crew_version");
      if(this.simulatedMs-(this.lastWarpMs.get(id)??-Infinity)<WARP_COOLDOWN_MS)
        return this.reject(client,"boat_gate_cooldown");
      if(this.simulatedMs-this.warpCombatTime(id)<WARP_COMBAT_LOCK_MS)
        return this.reject(client,"boat_gate_combat");
      const snapshot=this.captureCharacterSnapshot(id);
      if(!snapshot)return this.reject(client,"boat_gate_crew_busy");
      crew.set(id,rider);
      // Water maps store the ground layer. Disconnected riders return to the destination bank.
      saves.push({...snapshot,mapId:transit.mapId,x:transit.shore.x,y:0,z:transit.shore.z});
    }
    try {characterStore.saveTravelGroup(saves);}
    catch(error){
      console.error("MONTRA water gate save failed",error);
      return this.reject(client,"boat_gate_save_failed");
    }
    this.boatWorld.commitTransit(transit,crew,this.simulatedMs);
    this.updateBoats(0);
    for(const [id,rider] of crew){
      const connection=this.clients.find(peer=>peer.sessionId===id);
      this.finishWorldWarp(id,rider,connection);
      try {connection?.send("warp_complete",{mapId:rider.mapId});} catch { /* disconnected */ }
    }
  }

  private updateBoats(dt: number) {
    const boats = this.boatWorld.tick(this.simulatedMs,dt,this.state.players,id=>!this.basicAttackPaused(id));
    for (const [id,boat] of boats) {
      const state = {mapId:boat.islandId, x:boat.x, z:boat.z, heading:boat.heading, speed:boat.speed,
        hp:boat.hp, maxHp:boat.maxHp, anchored:boat.anchor, sunk:boat.state==="sunk" || boat.state==="respawning",
        helmId:boat.helmId ?? "",passage:boat.passage};
      const previous = this.state.boats.get(id);
      if (previous) Object.assign(previous,state);
      else this.state.boats.set(id,new SailingBoat(state));
    }
    for (const id of this.state.boats.keys()) if (!boats.has(id)) this.state.boats.delete(id);
  }

  messages = {
    prototype_protocol_v1: (client: Client, message: unknown) => this.handlePrototypeProtocol(client, message),
    boat_intent: (client: Client, message: unknown) => this.boatIntent(client,message),
    ghost_pot: (client: Client, message: unknown) => this.handleGhostPot(client, message),
    // A distinct message type does not alter the existing commands or their payloads.
    ask_npc_guide:(client:Client,message:unknown)=>this.askNpcGuide(client,message),
    get_director_event:(client:Client,message:unknown)=>{
      if(!parseEmptyCommand(message) || !WORLD_EXPANSION || this.field || !this.persistentCharacters.has(client.sessionId) || process.env.MONTRA_DIRECTOR_ENABLED==="0")return;
      client.send("director_event_state",{event:worldDirector.snapshot(),serverNow:Date.now()});
    },
    get_rebirth:(client:Client,message:unknown)=>{if(parseEmptyCommand(message))this.sendRebirthState(client);},
    start_rebirth:(client:Client,message:unknown)=>this.beginRebirth(client,message),
    get_forest_objective:(client:Client,message:unknown)=>{
      if(!parseEmptyCommand(message) || !WORLD_EXPANSION || this.field || !this.persistentCharacters.has(client.sessionId))return this.reject(client,"forest_objective_unavailable");
      this.sendForestObjective(client);
    },
    set_forest_objective:(client:Client,message:unknown)=>this.changeForestObjective(client,message),
    finish_forest_delivery:(client:Client,message:unknown)=>this.completeForestDelivery(client,message),
    start_forest_defense:(client:Client,message:unknown)=>this.startForestDefense(client,message),
    start_forest_escort:(client:Client,message:unknown)=>this.startForestEscort(client,message),
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
    territory_supply:(client:Client,message:unknown)=>this.orderWarCargo(client,message),
    get_city_production:(client:Client,message:unknown)=>{
      if (parseEmptyCommand(message)) this.cityProductionAction(client);
    },
    get_city_disband_claims:(client:Client,message:unknown)=>{
      if (parseEmptyCommand(message)) this.cityProductionAction(client, undefined, true);
    },
    get_city_purchase_orders:(client:Client,message:unknown)=>{
      if (parseEmptyCommand(message)) this.cityBoardAction(client, "purchase");
    },
    get_city_missions:(client:Client,message:unknown)=>{
      if (parseEmptyCommand(message)) this.cityBoardAction(client, "mission");
    },
    get_city_governance:(client:Client,message:unknown)=>{
      if (parseEmptyCommand(message)) this.cityGovernanceAction(client);
    },
    get_city_markets:(client:Client,message:unknown)=>{
      if (parseEmptyCommand(message)) this.cityMarketAction(client);
    },
    city_production:(client:Client,message:unknown)=>{
      const order = parseCityOrder(message);
      if (!order) return client.send("city_production_error", {reason: "city_invalid_request", requestId: null});
      if (isCityPurchaseOrder(order)) this.cityBoardAction(client, "purchase", order);
      else if (isCityMissionOrder(order) || isCityHaulOrder(order) || isCityContractOrder(order)) this.cityBoardAction(client, "mission", order);
      else if (isCityMarketOrder(order) || isCityNeutralMarketOrder(order) || isCityNeutralReturnOrder(order) || order.action === "market_contribute")
        this.cityMarketAction(client, order);
      else if (order.action === "policy_set" || isCitySupplyOrder(order)) this.cityGovernanceAction(client, order);
      else this.cityProductionAction(client, order);
    },
    get_territories:(client:Client,message:unknown)=>{
      if(parseEmptyCommand(message) && this.warClients.has(client.sessionId) && this.gates.get(client.sessionId)?.guild.consume(this.simulatedMs))this.warSent.delete(client.sessionId);
    },
    territory_route:(client:Client,message:unknown)=>{
      const id=client.sessionId,p=this.state.players.get(id),character=this.persistentCharacters.get(id),order=parseRouteOrder(message);
      if(!order)return this.reject(client,"invalid_request");
      if(!WORLD_EXPANSION || this.field || !character || !p?.alive || p.flying || !onMapGround(p) ||
        this.climbs.has(id) || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) || !this.warClients.has(id))
        return client.send("territory_error",{reason:"war_route_unavailable"});
      if(!this.gates.get(id)?.guild.consume(this.simulatedMs))return this.reject(client,"guild_rate_limited");
      try{
        const route=guildStore().war.routeOrder(character,p.mapId,order,Date.now());
        client.send("territory_route_result",route);
        this.warSent.delete(id);this.nextWarSample=0;
        notifyGuilds();
      }catch(error){
        const reason=error instanceof Error?error.message:"";
        if(!reason.startsWith("war_"))console.error("MONTRA route",error);
        client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});
      }
    },
    territory_register:(client:Client,message:unknown)=>{
      const id=client.sessionId,character=this.persistentCharacters.get(id),order=parseWarRegistration(message);
      if(!order)return this.reject(client,"invalid_request");
      if(!WORLD_EXPANSION || this.field || !character || this.pendingCharacterLeaves.has(id) || !this.warClients.has(id))
        return client.send("territory_error",{reason:"war_schedule_unavailable"});
      if(!this.gates.get(id)?.guild.consume(this.simulatedMs))return this.reject(client,"guild_rate_limited");
      try{
        const schedule=guildStore().war.register(character,order,Date.now());
        client.send("territory_registered",{site:order.site,schedule});
        this.warSent.delete(id);this.nextWarSample=0;
      }catch(error){
        const reason=error instanceof Error?error.message:"";
        if(!reason.startsWith("war_"))console.error("MONTRA registration",error);
        client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});
      }
    },
    territory_start:(client:Client,message:unknown)=>{void this.enterTerritory(client,true,message);},
    territory_join:(client:Client,message:unknown)=>{void this.enterTerritory(client,false,message);},
    get_guild: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>this.sendGuild(client,character));
    },
    guild_search: (client:Client,message:unknown) => {
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"guild_invalid_request");
      const value=message as Record<string,unknown>;
      if(Object.keys(value).length!==1 || typeof value.query!=="string" || value.query.length>48)return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>client.send("guild_directory",{query:value.query,guilds:guildStore().directory(character,(value.query as string).normalize("NFC").trim())}));
    },
    guild_apply: (client:Client,message:unknown) => {
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"guild_invalid_request");
      const value=message as Record<string,unknown>;
      if(Object.keys(value).length!==1 || typeof value.guildId!=="string" || !/^[a-f0-9-]{36}$/.test(value.guildId))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{
        const player=this.state.players.get(client.sessionId);if(!player)throw new Error("guild_invalid_target");
        guildStore().apply(character,player.characterName,value.guildId as string);notifyGuilds();
        client.send("guild_notice",{reason:"application_sent"});
      });
    },
    guild_application_cancel: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{guildStore().cancelApplication(character);notifyGuilds();client.send("guild_notice",{reason:"application_cancelled"});});
    },
    guild_application_decide: (client:Client,message:unknown) => {
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"guild_invalid_request");
      const value=message as Record<string,unknown>;
      if(Object.keys(value).length!==2 || typeof value.id!=="string" || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.accept!=="boolean")return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{guildStore().decideApplication(character,value.id as string,value.accept as boolean);notifyGuilds();client.send("guild_notice",{reason:"application_decided"});});
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
      this.guildAction(client,character=>{
        guildStore().leave(character, guild => characterStore.economyEnabled && characterStore.economy.hasCityAssets(guild));
        notifyGuilds();
      });
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
    get_war_banner: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_war_banner");
      this.partyAction(client, () => this.sendWarBanner(client));
    },
    plant_war_banner: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_war_banner");
      this.partyAction(client, () => this.plantWarBanner(client));
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
        this.updateWarBanners();
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
      this.economyAction(client,id=>{this.syncEconomy(client,id);client.send("market_features",{version:1,history:true,favoriteLimit:MARKET_FAVORITE_LIMIT,baseStatFilter:true});});
    },
    market_overview: (client:Client,message:unknown)=>{
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{
        const store=characterStore.economy;store.settleExpiredAuctions();this.syncEconomy(client,id);
        client.send("market_overview",{...store.myAuctions(id),supply:store.starterSupplyStatus(id)});
      });
    },
    market_browse: (client:Client,message:unknown)=>{
      const order=parseMarketBrowse(message);if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{
        const store=characterStore.economy;
        const page=order.market==="fixed"?store.browseMarket(id,order.query,order.category,order.before,order.ownOnly,order.filters):store.browseAuctions(id,order.query,order.category,order.before,order.filters);
        client.send("market_page",{market:order.market,tag:order.tag,...page});
      });
    },
    market_history: (client: Client, message: unknown) => {
      const order = parseMarketHistory(message);
      if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,() => client.send("market_history",{
        ...order, sales: characterStore.economy.marketHistory(order.itemId),
      }));
    },
    market_favorites: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id => client.send("market_favorites",{items: characterStore.economy.marketFavorites(id)}));
    },
    market_favorite_set: (client: Client, message: unknown) => {
      const order = parseMarketFavorite(message);
      if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id => {
        const store = characterStore.economy;
        store.setMarketFavorite(id,order.requestId,order.itemId,order.favorite);
        client.send("market_favorites",{items: store.marketFavorites(id), requestId: order.requestId});
      });
    },
    auction_create: (client:Client,message:unknown)=>{
      const order=parseAuctionCreate(message);if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const r=characterStore.economy.createAuction(id,order.requestId,order.slot,order.amount,order.opening,order.durationHours,order.stamp);this.syncEconomy(client,id);client.send("market_action_result",{action:"auction_create",...r,requestId:order.requestId});});
    },
    auction_bid: (client:Client,message:unknown)=>{
      const order=parseAuctionBid(message);if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const r=characterStore.economy.bidAuction(id,order.requestId,order.auctionId,order.amount);this.syncEconomy(client,id);client.send("market_action_result",{action:"auction_bid",...r,requestId:order.requestId});});
    },
    auction_claim: (client:Client,message:unknown)=>{
      const order=parseAuctionAction(message);if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const r=characterStore.economy.claimAuctionItem(id,order.requestId,order.auctionId);this.syncEconomy(client,id);client.send("market_action_result",{action:"auction_claim",...r,requestId:order.requestId});});
    },
    auction_cancel: (client:Client,message:unknown)=>{
      const order=parseAuctionAction(message);if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const r=characterStore.economy.cancelAuction(id,order.requestId,order.auctionId);this.syncEconomy(client,id);client.send("market_action_result",{action:"auction_cancel",...r,requestId:order.requestId});});
    },
    auction_credit: (client:Client,message:unknown)=>{
      const order=parseAuctionCredit(message);if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const r=characterStore.economy.claimAuctionCredit(id,order.requestId);this.syncEconomy(client,id);client.send("market_action_result",{action:"auction_credit",...r,requestId:order.requestId});});
    },
    starter_supply_buy: (client:Client,message:unknown)=>{
      const order=parseStarterSupply(message);if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const r=characterStore.economy.buyStarterSupply(id,order.requestId,order.item,order.quantity);this.syncEconomy(client,id);client.send("market_action_result",{action:"starter_supply_buy",...r,requestId:order.requestId});});
    },
    market_list: (client:Client, message:unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>client.send("market_state",{listings:characterStore.economy.list(id).map(x=>({id:x.id,
        seller:x.sellerGuild?x.seller:x.seller.slice(0,12),...(x.sellerGuild?{sellerGuild:x.sellerGuild}:{}),item:x.item,price:x.price}))}));
    },
    market_create: (client:Client, message:unknown) => {
      const order=parseMarketCreate(message); if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const result=characterStore.economy.listItem(id,order.requestId,order.slot,order.amount,order.price,order.stamp); this.syncEconomy(client,id); client.send("market_result",{action:"create",...result,requestId:order.requestId});});
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
    enter_home: (client: Client, message: unknown) => this.travelHome(client, message, true),
    leave_home: (client: Client, message: unknown) => this.travelHome(client, message, false),
    get_home: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => client.send("home_state", characterStore.economy.homeState(id)));
    },
    home_action: (client: Client, message: unknown) => {
      const order = parseHomeAction(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        if (!this.homeClients.has(client.sessionId) || this.field) throw Error("home_unavailable");
        const player = this.state.players.get(client.sessionId)!;
        if (order.action === "buy") {
          if (player.mapId !== DEFAULT_MAP_ID || !isRestArea(player.mapId, player) || !onMapGround(player)) throw Error("home_village_required");
        } else if (!this.inOwnedHome(client.sessionId,id)) throw Error("home_build_location");
        const store = characterStore.economy;
        store.homeAction(id, order, Date.now(), (cell,rotation) =>
          !homeWallBlocks(cell,rotation,player) && !homeWallBlocks(cell,rotation,HOME_MAP.spawn));
        const home = store.homeState(id);
        if (isHomeMap(player.mapId)) this.cacheHomeWalls(player.mapId,home.parts);
        this.syncEconomy(client, id);
        client.send("home_state", {...home, requestId: order.requestId});
      });
    },
    get_needs: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const state = characterStore.economy.needsState(id);
        this.needs.set(client.sessionId, state);
        client.send("needs_state", state);
      });
    },
    collect_water: (client: Client, message: unknown) => this.collectWater(client, message),
    get_craft_queue: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => client.send("craft_queue", characterStore.economy.craftQueue(id)));
    },
    craft_enqueue: (client: Client, message: unknown) => {
      const order = parseCraft(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const store = characterStore.economy;
        const level = this.state.players.get(client.sessionId)!.level;
        this.requireHomeRecipe(client.sessionId,id,order.recipeId);
        const {jobId} = store.enqueueCraft(id, order.requestId, order.recipeId, level, order.quantity);
        this.syncEconomy(client, id);
        client.send("craft_queue", {...store.craftQueue(id), requestId: order.requestId, jobId});
      });
    },
    craft_claim: (client: Client, message: unknown) => {
      const order = parseCraftClaim(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const store = characterStore.economy;
        const claimed = store.claimCraft(id, order.requestId, order.jobId);
        this.syncEconomy(client, id);
        client.send("craft_queue", {...store.craftQueue(id), requestId: order.requestId, claimed});
      });
    },
    craft_weapon: (client: Client, message: unknown) => {
      const order = parseCraft(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const store = characterStore.economy;
        this.requireHomeRecipe(client.sessionId,id,order.recipeId);
        const result = order.recipeId === SHRINE_GLAIVE
          ? store.craftShrineGlaive(id, order.requestId, order.quantity)
          : store.craftPersonal(id, order.requestId, order.recipeId, this.state.players.get(client.sessionId)!.level, order.quantity);
        this.syncEconomy(client, id);
        client.send("craft_result", {requestId: order.requestId, ...result});
      });
    },
    get_resource_atlas: (client:Client,message:unknown)=>{
      if(!parseEmptyCommand(message) || this.field)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,()=>client.send("resource_atlas",characterStore.economy.resourceAtlas()));
    },
    fish_start: (client:Client,message:unknown)=>{
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_economy_request");
      const m=message as Record<string,unknown>;
      if(Object.keys(m).length!==2 || typeof m.x!=="number" || typeof m.z!=="number" || !Number.isFinite(m.x) || !Number.isFinite(m.z))return this.reject(client,"invalid_economy_request");
      this.economyAction(client,character=>{
        const player=this.state.players.get(client.sessionId)!;validateFishingPosition(player,m.x as number,m.z as number);
        if(characterStore.economy.pendingFish(character))throw Error("fish_pending");
        const now=Date.now(),id="fish_"+randomUUID().replaceAll("-",""),distance=Math.max(3,Math.ceil(Math.hypot(player.x-(m.x as number),player.z-(m.z as number))));
        const session:FishingSession={id,mapId:player.mapId,x:m.x as number,z:m.z as number,originX:player.x,originZ:player.z,
          combatAt:this.lastCombatMs.get(client.sessionId)??-1,biteAt:now+FISH_BITE_DELAY,lastReel:0,lastDriftAt:now+FISH_BITE_DELAY,distance,initialDistance:distance,strength:100,line:100,item:fishItem(randomInt(100))};
        this.destinations.delete(client.sessionId);this.attackTargets.delete(client.sessionId);this.fishing.set(client.sessionId,session);
        client.send("fish_state",{id,x:session.x,z:session.z,wait:FISH_BITE_DELAY,elapsed:0,duration:FISH_DURATION,distance,initialDistance:distance,strength:100,line:100});
      });
    },
    fish_reel: (client:Client,message:unknown)=>{
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_economy_request");
      const m=message as Record<string,unknown>;
      if(Object.keys(m).length!==1 || typeof m.id!=="string" || !/^fish_[a-f0-9]{32}$/.test(m.id))return this.reject(client,"invalid_economy_request");
      this.economyAction(client,character=>{
        const s=this.fishing.get(client.sessionId),p=this.state.players.get(client.sessionId)!;
        if(!s || s.id!==m.id)throw Error("fish_expired");
        if(p.mapId!==s.mapId || Math.hypot(p.x-s.originX,p.z-s.originZ)>1.5 || (this.lastCombatMs.get(client.sessionId)??-1)>s.combatAt){this.fishing.delete(client.sessionId);throw Error("fish_interrupted");}
        try{validateFishingPosition(p,s.x,s.z);}catch(error){this.fishing.delete(client.sessionId);throw error;}
        const now=Date.now(),result=s.distance<=0?"caught":pullFish(s,now);
        if(result==="caught"){
          const caught=characterStore.economy.catchFish(character,s.id,s.item);
          this.fishing.delete(client.sessionId);this.syncEconomy(client,character);client.send("fish_result",{...caught,result:"caught"});return;
        }
        if(result==="broken" || result==="escaped"){
          this.fishing.delete(client.sessionId);client.send("fish_result",{result});return;
        }
        client.send("fish_state",{id:s.id,x:s.x,z:s.z,wait:Math.max(0,s.biteAt-now),elapsed:Math.max(0,now-s.biteAt),duration:FISH_DURATION,
          distance:s.distance,initialDistance:s.initialDistance,strength:s.strength,line:s.line,result});
      });
    },
    fish_cancel: (client:Client,message:unknown)=>{
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_economy_request");
      this.fishing.delete(client.sessionId);client.send("fish_result",{result:"cancelled"});
    },
    fish_claim: (client:Client,message:unknown)=>{
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_economy_request");
      this.economyAction(client,character=>{
        const caught=characterStore.economy.claimFish(character);this.syncEconomy(client,character);
        client.send("fish_pending",{item:null});client.send("fish_result",{...caught,result:"claimed"});
      });
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
    salvage_gear: (client:Client,message:unknown)=>{
      const order=parseSalvage(message);
      if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{
        const result=characterStore.economy.salvageGear(id,order);
        this.syncEconomy(client,id);client.send("gear_salvaged",result);
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
    claim_forge_copy: (client: Client, message: unknown) => {
      const order=parseClaimForgeCopy(message);
      if(!order)return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{
        const result=characterStore.economy.claimForgeCopy(id,order.requestId,order.gear,order.expectedStock);
        this.syncEconomy(client,id);
        client.send("forge_copy_claimed",{requestId:order.requestId,...result});
      });
    },
    forge_weapon: (client: Client, message: unknown) => {
      const order = parseForge(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const result = characterStore.economy.forgeWeapon(id,order.requestId,order.slot,order.stamp,order.action,this.state.players.get(client.sessionId)!.level,order.donor,order.copies,order);
        this.syncEconomy(client, id);
        client.send("forge_result", { requestId: order.requestId, action: order.action, ...result });
      });
    },
    select_build: (client: Client, message: unknown) => {
      const build = parseBuild(message);
      if (!build) return this.reject(client, "invalid_build");
      this.selectBuild(client, build);
    },
    skill_hotbar_set: (client:Client,message:unknown)=>this.changeSkillHotbar(client,message),
    sword_tree_learn: (client: Client, message: unknown) => this.changeSwordTree(client, message, "learn"),
    sword_tree_upgrade: (client: Client, message: unknown) => this.changeSwordTree(client, message, "upgrade"),
    sword_tree_school: (client: Client, message: unknown) => this.changeSwordTree(client, message, "school"),
    sword_tree_reset: (client: Client, message: unknown) => this.changeSwordTree(client, message, "reset"),
    sword_tree_equip: (client: Client, message: unknown) => this.changeSwordTree(client, message, "equip"),
    sword_core_book: (client: Client, message: unknown) => this.changeSwordCore(client, message),
    sword_core_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.hotbarCastAllowed(client,message,'core')&&this.castSwordCore(client, message);},
    // Keep the legacy protocol for older clients while the current HUD uses four core skills.
    sword_skill: (client:Client,message:unknown) => this.dispatchAdvancedSkill(client,message,"sword"),
    muay_skill: (client:Client,message:unknown) => this.dispatchAdvancedSkill(client,message,"muay"),
    muay_core_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.hotbarCastAllowed(client,message,'core')&&this.castMuayCore(client, message);},
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
    occult_skill: (client:Client,message:unknown) => this.dispatchAdvancedSkill(client,message,"occult"),
    seer_core_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.hotbarCastAllowed(client,message,'core')&&this.castSeerCore(client,message);},
    mender_core_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.hotbarCastAllowed(client,message,'core')&&this.castMenderCore(client,message);},
    blade_book_get: (client: Client, message: unknown) => {
      if(!parseEmptyCommand(message)) return this.reject(client,"invalid_blade_book");
      const player=this.buildPlayer(client,"occult");
      if(!player) return;
      if(player.pathId!=="blade") return this.reject(client,"blade_class_required");
      this.sendBladeBook(client);
    },
    blade_book: (client: Client, message: unknown) => this.changeBladeBook(client,message),
    blade_skill: (client:Client,message:unknown) => this.dispatchAdvancedSkill(client,message,"blade"),
    blade_core_skill: (client: Client, message: unknown) => {if(!this.blockMounted(client))this.hotbarCastAllowed(client,message,'core')&&this.castBladeCore(client,message);},
    sentinel_book_get: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_sentinel_book");
      const player=this.buildPlayer(client,"occult");if(!player)return;
      if(player.pathId!=="sentinel")return this.reject(client,"sentinel_class_required");
      this.sendSentinelBook(client);
    },
    sentinel_book: (client:Client,message:unknown) => this.changeSentinelBook(client,message),
    sentinel_skill: (client:Client,message:unknown) => this.dispatchAdvancedSkill(client,message,"sentinel"),
    sentinel_core_skill: (client:Client,message:unknown) => {if(!this.blockMounted(client))this.hotbarCastAllowed(client,message,'core')&&this.castSentinelCore(client,message);},
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
      if (player.boatId) return this.reject(client,"boat_disembark_first");
      if (this.pendingItemUses.has(id) || this.pendingWarps.has(id)) return this.reject(client, "character_busy");
      const result = checkWarp(message, {
        mapId: player.mapId, position: player, alive: player.alive,
        flying: player.flying, climbing: this.climbs.has(id),
        dashing: this.activeDashes.has(id), changingHeight: this.flightTransitions.has(id),
        lastCombatMs: this.warpCombatTime(id),
        lastWarpMs: this.lastWarpMs.get(id) ?? -Infinity, nowMs: this.simulatedMs,
      });
      if ("reason" in result) return this.reject(client, result.reason);
      const portal = result.portal;
      if(!this.canEnterWorldMap(id,portal.targetMapId))return this.reject(client,"world_client_update_required");
      this.commitWarp(client, portal);
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
        rebirth:this.rebirthStates.get(id),
        mastery:{...masteryPreview(this.rebirthStates.get(id)),mode:this.masteryMode(id),combat:Object.fromEntries((["pve","pvp"] as const).map(mode=>[mode,{atk:this.masteryPower(player,mode,"atk",weaponBonuses(inventory,mode).melee),magicAtk:this.masteryPower(player,mode,"magicAtk",weaponBonuses(inventory,mode).ranged),def:this.masteryPower(player,mode,"def",mode==="pve"?equipmentRatings(inventory).guard:0),magicDef:this.masteryPower(player,mode,"magicDef")}])),current:{hp:player.maxHp,mana:player.maxMana,atk:player.atk,def:player.def,magicAtk:player.magicAtk,magicDef:player.magicDef}},
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
        for(const items of CATALOG_PAGES)client.send("item_catalog_page",{items:catalogPageWithRates(items)});
        const player=this.state.players.get(id);
        if(player)this.sendHuntGuide(client,player);
        this.sentItemCatalog.add(id);
      }
      if(characterStore.economyEnabled && !this.field && this.state.players.has(id))this.sendResourceMap(client,characterStore.economy.resourceMap(this.state.players.get(id)!.mapId));
      client.send("inventory_state",{...inventory,catalogReady:true,workbenchGold:WORKBENCH_GOLD,cardDrill:DRILL_COST,refineInput:REFINE_INPUT});
      const character=this.persistentCharacters.get(id);
      if(characterStore.economyEnabled && character)client.send("fish_pending",{item:characterStore.economy.pendingFish(character)});
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
      const selected = inventory.slots[slot];
      const nutrition = personalItem(selected?.itemId);
      if (characterStore.economyEnabled && selected && nutrition?.nutrition) {
        this.economyAction(client, character => {
          const hp = Math.min(player.maxHp, player.hp + (nutrition.healHp ?? 0));
          const mana = Math.min(player.maxMana, player.mana + (nutrition.healMana ?? 0));
          const healed = hp - player.hp, restoredMana = mana - player.mana;
          const state = characterStore.economy.consumeNutrition(character, slot, selected.itemId, {hp, mana},
            healed > 0 || restoredMana > 0);
          this.needs.set(id, state);
          player.hp = hp;
          player.mana = mana;
          this.itemUseReadyAt.set(id, this.simulatedMs + 14_000);
          this.syncEconomy(client, character);
          client.send("needs_state", state);
          client.send("item_used", {slot, itemId: selected.itemId, healed, restoredMana, hp: player.hp});
        });
        return;
      }
      const result = useInventoryItem(
        inventory, slot, player.hp, player.maxHp, player.alive,player.level,player.mana,player.maxMana);
      // The Windows VPS build uses different TS strictness from CI.
      // An explicit property guard narrows ItemUseResult in both modes.
      if ("reason" in result) return this.reject(client, result.reason);
      const snapshot = this.captureCharacterSnapshot(id, result.inventory, result.hp, player.mana+result.restoredMana);
      if (!snapshot) return this.reject(client, "inventory_unavailable");

      // Durability-first transaction: the server writes the decremented stack
      // atomically BEFORE updating HP or acknowledging the potion. If disk is
      // full, neither HP nor potion count changes for the player.
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
      if(player.boatId)return this.reject(client,"boat_disembark_first");
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
    meteor_slam: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_meteor");
      const id = client.sessionId, player = this.state.players.get(id);
      if (!this.isGuildPartyLeader(id)) return this.reject(client, "meteor_leader_required");
      if (!player?.alive || !player.flying || !isOccultPath(player.pathId) || this.field ||
          this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
          this.flightTransitions.has(id) || isRestArea(player.mapId, player)) return this.reject(client, "meteor_unavailable");
      if (player.stamina < METEOR.stamina) return this.reject(client, "insufficient_stamina");
      if (this.simulatedMs - (this.lastMeteorAt.get(id) ?? -Infinity) < METEOR.cooldownMs) {
        return this.reject(client, "meteor_cooldown");
      }
      this.messages.fly(client, {});
      const transition = this.flightTransitions.get(id);
      if (!transition?.landing) return;
      transition.meteor = true;
      player.stamina -= METEOR.stamina;
      this.lastMeteorAt.set(id, this.simulatedMs);
    },
    fly: (client: Client, message: unknown) => {
      if(this.blockMounted(client))return;
      if(this.state.players.get(client.sessionId)?.boatId)return this.reject(client,"boat_disembark_first");
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
      if(this.warCargo.has(id) && !player.flying)return this.reject(client,"war_supply_flight");
      // Saved characters from earlier releases can always land safely.
      const legacyFlightTest=process.env.MONTRA_ACCOUNTS_REQUIRED==="0" && process.env.NODE_ENV!=="production";
      if (!legacyFlightTest && !player.flying && !isOccultPath(player.pathId)) return this.reject(client, "flight_class_required");
      if (this.climbs.has(id)) return this.reject(client, "climbing");
      if (this.activeDashes.has(id)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(id)) return this.reject(client, "flight_in_progress");
      const flightMap=getWorldMap(player.mapId);
      if (!player.flying && (this.field?.site===player.mapId || flightMap?.region?.noFlight || flightMap?.strategic?.kind==="territory")) return this.reject(client, "flight_forbidden");
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
      if(this.state.players.get(client.sessionId)?.boatId)return this.reject(client,"boat_disembark_first");
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
      if (player.boatId) {
        if (!this.gates.get(id)?.move.consume(this.simulatedMs)) return this.reject(client,"move_rate_limited");
        if (!this.boatWorld.walk(id,destination)) return this.reject(client,"boat_deck_only");
        this.endAttack(id,player);
        return;
      }
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
      if(length>0.75)this.markWarAction(client.sessionId);
      this.bladeRetreatUntil.delete(client.sessionId);
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
      const ghostOrder = monsterOrder || pkOrder ? null : parseGhostTargetCommand(message);
      if (!monsterOrder && !pkOrder && !ghostOrder) return this.reject(client, "invalid_attack");

      const attackerId = client.sessionId;
      const attacker = this.state.players.get(attackerId);
      if (!attacker || !attacker.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(attackerId)) return this.reject(client, "climbing");
      if (this.activeDashes.has(attackerId)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(attackerId)) return this.reject(client, "flight_in_progress");
      if (!this.gates.get(attackerId)?.attack.consume(this.simulatedMs)) {
        return this.reject(client, "attack_rate_limited");
      }

      const targetId = (monsterOrder ?? pkOrder ?? ghostOrder)!.targetId;
      if (targetId === attackerId) return this.reject(client, "self_attack");
      const monster=monsterOrder ? this.getMonster(targetId) : undefined;
      const ghost = ghostOrder ? this.combatGhost(targetId) : undefined;
      const target = monsterOrder ? monster : ghostOrder ? ghost?.guardian : this.state.players.get(targetId);
      if (ghost ? !this.canPlayerHitGhost(attackerId, ghost) : !this.canPursueBasic(attackerId,attacker,targetId,monster))
        return this.reject(client,"target_unavailable");

      if (!target || ("alive" in target && !target.alive)) {
        return this.reject(client, monsterOrder ? "monster_down" : "target_unavailable");
      }

      this.boatWorld.stopWalking(attackerId);
      // Tap to attack: cancel manual travel, then follow the target each tick.
      this.markWarAction(attackerId);
      this.bladeRetreatUntil.delete(attackerId);
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
      if (this.isProtectedArea(attacker.mapId,attacker) || distance3d(attacker, target) > attackRange) {
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
      if((!this.legacyCombatRoom() || this.configuredHotbar(id)) && !this.canPrepareSpirit(id,player.pathId,true))return this.reject(client,"occult_skill_locked");
      if(POSSESSION_BUFF.requiresSummon && (!this.state.summons.has(id) || this.state.summons.get(id)?.kind === "captured_ghost"))return this.reject(client,"possession_needs_summon");
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
      if(this.state.players.get(client.sessionId)?.boatId)return this.reject(client,"boat_disembark_first");
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
    if(this.seerBuffaloCasts.has(id))return this.reject(client,"seer_casting");
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
    this.refreshMastery(id);
    return player;
  }

  private applyMonsterHit(winnerId:string,monster:Monster,damage:number,publish:()=>void,aggressorId=winnerId):void {
    if(!monster.alive || monster.hp<=0 || this.getMonster(monster.id)!==monster)return;
    monster.hp=Math.max(0,monster.hp-damage);
    monster.hitSeq++;
    if(monster.hp>0){
      if(damage>0)this.forest.provoke(monster.id,aggressorId);
      publish();
      return;
    }
    const prey=Object.freeze({id:monster.id,mapId:monster.mapId,level:monster.level,x:monster.x,y:monster.y,z:monster.z});
    const defeat=Object.freeze({winnerId,monster,prey,hitSeq:monster.hitSeq});
    this.pendingMonsterDefeats.add(defeat);
    // Reserve the winner before publishing. Even a failed notification must
    // settle death and release the monster for the next legitimate life.
    try{publish();}finally{this.killMonster(defeat);}
  }

  private hitMonsterWithSpell(id: string, target: Monster, damage: number, source: "ranged" | "talisman" | "sword" | "muay" | "meteor") {
    this.applyMonsterHit(id,target,damage,()=>this.broadcast("combat_hit", {attackerId:id, targetId:target.id, damage, hp:target.hp,
      maxHp:target.maxHp, hitSeq:target.hitSeq, source}, {afterNextPatch:true}));
  }

  private resolveMeteor(id: string, player: Player) {
    const targets = [this.state.monster, ...this.state.monsters.values()]
      .filter(target => target.alive && this.sameCombatMap(id,target.id) && distance3d(player,target) <= METEOR.range &&
        this.bodyPathClear(player.mapId,player,target))
      .sort((a,b) => distance3d(player,a)-distance3d(player,b)).slice(0,METEOR.maxTargets);
    const power = this.masteryPower(player,"pve","magicAtk") * METEOR.power;
    for (const target of targets) {
      this.recordCombat(id,target.id);
      this.hitMonsterWithSpell(id,target,calculateDamage(power,target.defense,target.level),"meteor");
    }
    this.broadcast("meteor_impact",{ownerId:id,mapId:player.mapId,x:player.x,y:player.y,z:player.z,
      targets:targets.map(target=>target.id)},{afterNextPatch:true});
  }

  private warpCombatTime(id:string) {
    const engaged=this.attackTargets.has(id) || this.state.monster.targetId===id || this.forest.engaged(id) ||
      [...this.attackTargets.values()].includes(id);
    return engaged?this.simulatedMs:(this.lastCombatMs.get(id)??-Infinity);
  }

  private canEnterWorldMap(id:string,mapId:string) {
    const map=getWorldMap(mapId),atlas=isAtlasMap(mapId);
    return Boolean(map && (!map.reliefLabels || atlas || this.originalReliefClients.has(id)) &&
      (!atlas || this.atlasClients.has(id) && (!map.terrain || this.reliefClients.has(id))) &&
      (mapId!==RIDGE_PASS || this.terrainClients.has(id)) && (mapId!==RIVER_CITY || this.riverClients.has(id)) &&
      (mapId!==CASTLE_ID || this.castleClients.has(id)) && (!map.strategic || this.provinceClients.has(id)) &&
      (mapId!==TEMPLE_ID || this.templeClients.has(id)));
  }

  private finishWorldWarp(id:string,player:Player,client?:Client) {
    this.clearPrototypeTransient(id);
    player.targetId = ""; player.combatState = "idle"; player.flying = false;
    const swordStance=this.swordCoreStances.delete(id),sentinelStance=this.sentinelCoreStances.delete(id);
    this.swordCoreSequences.delete(id);
    if(player.pathId==="muay_boran"){this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");}
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
    this.playerSpawn.set(id, getSafeMapSpawn(player.mapId));
    this.lastWarpMs.set(id, this.simulatedMs);
    if(client)try {
      if(swordStance)this.sendSwordNotice(client,"sword_stance_end",{});
      if(sentinelStance)this.sendSwordNotice(client,"sentinel_core_end",{});
      if(player.pathId==="muay_boran")this.sendSwordNotice(client,"muay_counter_cleared",{});
    } catch { /* disconnected */ }
  }

  private commitWarp(client: Client, portal: WorldPortal) {
    const id = client.sessionId;
    const snapshot = this.captureCharacterSnapshot(id);
    if (!snapshot) return this.reject(client, "character_not_persistent");
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
        this.boatWorld.leave(id,this.state.players);
        this.dismount(id,"warp");
        // Once the durable write succeeds, commit the destination before
        // any optional notifications so a disconnected client cannot turn
        // a committed warp into a misleading disk-failure result.
        current.mapId = portal.targetMapId;
        current.x = portal.targetSpawn.x; current.y = portal.targetSpawn.y; current.z = portal.targetSpawn.z;
        if (isHomeMap(snapshot.mapId ?? "") || isHomeMap(current.mapId)) this.syncPlayerViews();
        this.finishWorldWarp(id,current,client);
        try { client.send("warp_complete", { mapId: current.mapId }); } catch { /* disconnected */ }
      } finally {
        this.pendingWarps.delete(id);
        this.pendingItemUses.delete(id);
      }
    })();
    this.pendingItemUses.set(id, task);
  }

  private cacheHomeWalls(mapId: string, parts: {itemId:string;cell:number;rotation:0|1}[]) {
    const walls = parts.filter(part=>part.itemId==="furniture_wood_wall");
    if (walls.length) this.homeWalls.set(mapId,walls);
    else this.homeWalls.delete(mapId);
  }

  private inOwnedHome(id: string, character: string) {
    return this.state.players.get(id)?.mapId === homeMapId(character);
  }

  private travelHome(client: Client, message: unknown, entering: boolean) {
    if (!parseEmptyCommand(message)) return this.reject(client, "invalid_portal_request");
    const id = client.sessionId, player = this.state.players.get(id), character = this.persistentCharacters.get(id);
    if (!player || !character || !this.homeClients.has(id) || this.field) return this.reject(client, "home_unavailable");
    if (this.pendingItemUses.has(id) || this.pendingWarps.has(id) || this.pendingRewards.has(id) ||
        this.pendingCharacterLeaves.has(id)) return this.reject(client,"character_busy");
    if (this.bladeWindups.has(id) || this.bladeCasts.has(id) || this.bladeCloaks.has(id) ||
        this.sentinelStuns.has(id) || this.sentinelWindups.has(id) || this.muayControlled(id)) return this.reject(client,"movement_busy");
    if (entering) {
      if (player.mapId !== DEFAULT_MAP_ID || !isRestArea(DEFAULT_MAP_ID,player)) return this.reject(client,"home_village_required");
      const home = characterStore.economy.homeState(character);
      if (!home.level) return this.reject(client,"home_required");
      this.cacheHomeWalls(homeMapId(character),home.parts);
    } else if (!this.inOwnedHome(id,character)) return this.reject(client,"home_unavailable");
    const destination = entering ? homeMapId(character) : DEFAULT_MAP_ID;
    const portal: WorldPortal = {id:entering?"enter_home":"leave_home", x:player.x, z:player.z,
      targetMapId:destination, targetSpawn:entering?HOME_MAP.spawn:getSafeMapSpawn(DEFAULT_MAP_ID)};
    const engaged = this.attackTargets.has(id) || this.state.monster.targetId === id || this.forest.engaged(id) ||
      [...this.attackTargets.values()].includes(id);
    const context: WarpContext = {
      mapId: player.mapId, position:player, alive:player.alive, flying:player.flying, climbing:this.climbs.has(id),
      dashing:this.activeDashes.has(id), changingHeight:this.flightTransitions.has(id),
      lastCombatMs:engaged?this.simulatedMs:(this.lastCombatMs.get(id)??-Infinity),
      lastWarpMs:this.lastWarpMs.get(id)??-Infinity, nowMs:this.simulatedMs,
    };
    const result = checkWarpDestination(portal, context);
    if ("reason" in result) return this.reject(client,result.reason);
    this.commitWarp(client,result.portal);
  }

  private requireHomeRecipe(id: string, character: string, recipeId: string) {
    const item = personalItem(recipeId);
    if ((item?.furniture || (item?.cookingLevel ?? 1) > 1) && !this.inOwnedHome(id,character)) throw Error("home_build_location");
  }

  private collectWater(client: Client, message: unknown) {
    const request = parseEconomyRequest(message);
    if (!request) return this.reject(client,"invalid_economy_request");
    this.economyAction(client,id => {
      const player = this.state.players.get(client.sessionId)!;
      if (this.field || player.flying || player.mounted || !onMapGround(player) ||
          player.mapId !== DEFAULT_MAP_ID || Math.hypot(player.x,player.z)>6) throw Error("water_unavailable");
      const result = characterStore.economy.collectWater(id, request);
      this.syncEconomy(client,id);
      client.send("water_collected",{requestId:request,...result});
    });
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
    const magic = this.masteryPower(caster,"pve","magicAtk",weaponBonuses(this.inventories.get(id),"pve").ranged);
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
    const rangedAttack = this.masteryPower(shooter,monsterOrder?"pve":"pvp","magicAtk",weaponBonuses(this.inventories.get(id),monsterOrder?"pve":"pvp").ranged);
    let rangedDamage = monsterOrder ? calculateDamage(rangedAttack*(shooter.pathId==="mender"?MENDER_PVE_RICE_MULTIPLIER:1), (target as Monster).defense, (target as Monster).level) :
      calculateDamage(rangedAttack, this.masteryPower(target as Player,"pvp","magicDef"), (target as Player).level);

    if (monsterOrder) {
      this.hitMonsterWithSpell(id, target as Monster, rangedDamage, "ranged");
      this.recordOccultTraining(id,"seer",["rice"]);
    } else {
      const victim=target as Player;
      rangedDamage=this.directGuardDamage(targetId,shooter,rangedDamage);
      if(!this.applyPlayerHit(shooter,targetId,victim,rangedDamage,()=>{
        this.broadcast("pvp_hit", {
          attackerId:id,targetId,damage:rangedDamage,
          hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"ranged",
        }, { afterNextPatch:true });
      },()=>{
        shooter.pkKills+=1;
        victim.pkDeaths+=1;
        this.knockoutPlayer(targetId,"pk",id);
        void this.saveCharacter(id);
        this.broadcast("pvp_kill", {
          winnerId:id,loserId:targetId,source:"ranged",
          kills:shooter.pkKills,deaths:victim.pkDeaths,
        }, { afterNextPatch:true });
      }))return;
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
    const mixed=this.configuredHotbar(id);
    if(path==="seer" && !tranceOnly && (!mixed || mixed.some(slot=>slot?.kind==="core"&&slot.id==="seer_pot")))return Boolean(book);
    const slots=mixed?mixed.filter(slot=>slot?.kind==="advanced").map(slot=>slot!.id):book?.loadouts[path];
    return Boolean(slots?.some(skill=>skill && book?.learned[path].some(id=>id===skill) &&
      (tranceOnly ? OCCULT_LESSONS[skill as OccultSkillId].effect==="trance" :
      ["spirit","spirit_bind","spirit_heal","spirit_ward","trance"].includes(OCCULT_LESSONS[skill as OccultSkillId].effect))));
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
    if ((!this.legacyCombatRoom() || this.configuredHotbar(id)) && (kind!=="pot_spirit" || !this.canPrepareSpirit(id,owner.pathId,false))) return this.reject(client,"occult_skill_locked");
    if (owner.possessionActive) return this.reject(client, "possession_active");
    if (this.state.summons.has(id)) return this.reject(client, "summon_limit");
    if (!this.gates.get(id)?.summon.consume(this.simulatedMs)) {
      return this.reject(client, "summon_rate_limited");
    }
    const last = this.lastSummonAt.get(id) ?? -Infinity;
    if (this.simulatedMs - last < RULES.summonCooldownMs) {
      return this.reject(client, "summon_cooldown");
    }
    const coreBook=owner.pathId==="seer" && kind==="pot_spirit" ? this.occultBooks.get(id) : undefined;
    if(coreBook && Date.now()<(coreBook.cooldowns.seer_pot ?? 0))return this.reject(client,"occult_cooldown");
    const cost=coreBook ? SEER_CORE.seer_pot.stamina+(coreBook.coreRanks?.seer_pot ?? 0) : 15;
    if (owner.mana < cost) return this.reject(client, "insufficient_mana");
    owner.mana -= cost;
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
    if(coreBook){coreBook.cooldowns.seer_pot=Date.now()+SEER_CORE.seer_pot.cooldownMs;this.sendOccultBook(client);void this.saveCharacter(id);}
    this.lastSummonAttackAt.delete(id);
    this.broadcast("summon_spawn", { ownerId: id, kind },
      { afterNextPatch: true });
  }

  private despawnSummon(ownerId: string, reason: string) {
    this.spiritNavigators.delete(ownerId);
    this.occultSpiritOrders.delete(ownerId);
    this.occultSpiritPracticed.delete(ownerId);
    const summon = this.state.summons.get(ownerId);
    if (!summon) return;
    if (summon.kind === "captured_ghost") {
      this.activeGhosts.delete(ownerId);
      const worker = this.ghostWorker;
      if (worker) void worker.send({owner: ownerId, disconnect: true}).catch(() => this.resetGhostWorker(worker));
      const client = this.clients.find(candidate => candidate.sessionId === ownerId);
      if (client && reason !== "ghost_recalled")
        this.sendGhostPot(client, reason === "ghost_defeated" ? "defeated" : reason === "ghost_war_ended" ? "war_ended" : "ready");
    }
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
    const botSpirit=fromPot && owner.pathId==="seer";
    const reachable = (target: WorldPoint) => botSpirit ? Math.abs(guardian.y-target.y)<=1.1 : this.bodyPathClear(owner.mapId, owner, target) && this.bodyPathClear(owner.mapId, guardian, target);
    for (const targetId of candidates) {
      if (targetId === ownerId) continue;
      if (!this.sameCombatMap(ownerId, targetId)) continue;
      const target = this.getMonster(targetId) ?? this.state.players.get(targetId);
      if (!target || !target.alive) continue;
      if(this.seerBindings.get(targetId)?.ownerId===ownerId)continue;
      // Guard's combat tether prevents hits across the map even if another
      // client sends a valid but distant target ID.
      if (distance3d(owner, target) > RULES.summonEngageDistance) continue;
      if(!botSpirit && getWorldMap(owner.mapId)?.walls?.length && !this.combatSegmentClear(owner.mapId,owner,target))continue;
      if (fromPot && !reachable(target)) continue;
      return { targetId, target };
    }
    if (!fromPot || this.isProtectedArea(owner.mapId, owner)) return null;

    // With no combat order the pot spirit hunts the nearest reachable monster.
    let nearest: Monster | undefined;
    let bestDistance: number = RULES.summonEngageDistance;
    const consider = (monster: Monster) => {
      if (!monster.alive || this.seerBindings.get(monster.id)?.ownerId===ownerId || !this.sameCombatMap(ownerId, monster.id)) return;
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
    return this.field?.site===mapId?this.closedFieldGates:false;
  }
  private combatSegmentClear(mapId:string,from:WorldPoint,to:WorldPoint){
    return isWorldSegmentClear(mapId,from,to,this.closedGatesFor(mapId));
  }
  private bodyPathClear(mapId: string, from: WorldPoint, target: WorldPoint) {
    return provinceShotClear(getWorldMap(mapId)!,{x:from.x,y:from.y+1,z:from.z},{x:target.x,y:target.y+1,z:target.z},this.closedGatesFor(mapId));
  }

  /** Uses the same bounded RRT navigation family as the player bot, without a bot account. */
  private moveSeerSpirit(ownerId:string,owner:Player,guardian:SummonedGuardian,goal:WorldPoint,dt:number,intent:string):void {
    const map=getWorldMap(owner.mapId);if(!map)return;
    if(owner.flying || !onMapGround(owner))return;
    let state=this.spiritNavigators.get(ownerId);
    if(!state || state.mapId!==owner.mapId){
      const trees=map.obstacles.map(o=>({x:o.x-o.radius,z:o.z-o.radius,width:o.radius*2,length:o.radius*2}));
      state={mapId:owner.mapId,nav:new MonsterRRTNavigator([...trees,...(map.walls ?? [])],map.bounds,220),nextPlan:0,waypoint:null,forceDetour:false,intent};
      this.spiritNavigators.set(ownerId,state);
    }
    if(state.intent!==intent){state.intent=intent;state.forceDetour=false;state.waypoint=null;state.nav.clear();}
    const direct=this.combatSegmentClear(owner.mapId,guardian,goal) && this.bodyPathClear(owner.mapId,guardian,goal);
    if(direct && !state.forceDetour){state.waypoint={x:goal.x,z:goal.z};state.nav.clear();}
    else if(this.simulatedMs>=state.nextPlan && this.spiritPlanBudget>0){
      this.spiritPlanBudget--;state.nextPlan=this.simulatedMs+300;
      state.waypoint=state.nav.nextWaypoint(guardian,goal,this.simulatedMs,intent);
    }
    if(!state.waypoint)return;
    const next=stepTowards(guardian,state.waypoint,RULES.summonMoveSpeed*dt),y=groundAt(owner.mapId,next.x,next.z);
    if(!this.canOccupy(next.x,next.z,0,false,owner.mapId) || (this.isProtectedArea(owner.mapId,next) && !this.isProtectedArea(owner.mapId,owner) && !this.isProtectedArea(owner.mapId,guardian)) || Math.abs(y-guardian.y)>.6 ||
      !this.combatSegmentClear(owner.mapId,guardian,{x:next.x,y,z:next.z}) || !this.bodyPathClear(owner.mapId,guardian,{x:next.x,y,z:next.z})){state.waypoint=null;state.forceDetour=true;state.nav.clear();return;}
    guardian.x=next.x;guardian.y=y;guardian.z=next.z;
  }

  private updateSummons(dt: number) {
    this.spiritPlanBudget=1;
    for (const [ownerId, guardian] of [...this.state.summons]) {
      const owner = this.state.players.get(ownerId);
      if (!owner || !owner.alive) {
        this.despawnSummon(ownerId, "owner_unavailable");
        continue;
      }

      const distanceToOwner = distance3d(guardian, owner);
      const captured = guardian.kind === "captured_ghost";
      const active = captured ? this.activeGhosts.get(ownerId) : undefined;
      const order = active?.order;
      if (active && this.ghostControlPending.has(ownerId)) continue;
      let candidate = !captured && distanceToOwner <= RULES.summonLeashDistance
        ? this.findSummonTarget(ownerId, owner, guardian) : null;
      if (active && order) {
        const target = this.getGhostTarget(ownerId, owner, guardian, order.targetId);
        if (target === order.target) candidate = order;
        else this.endGhostOrder(ownerId, active, order);
      }

      if (candidate) {
        const { targetId, target } = candidate;
        const dx = target.x - guardian.x;
        const dz = target.z - guardian.z;
        const distance = distance3d(guardian,target);
        guardian.targetId = targetId;
        if (distance > 0.001) guardian.facing = facingTo(dx, dz);

        if (distance <= (active?.basicRange ?? RULES.summonAttackRange)) {
          guardian.action = "attack";
          this.trySummonAttack(ownerId, guardian, targetId, active);
        } else {
          guardian.action = "chase";
          if(guardian.kind==="pot_spirit" && owner.pathId==="seer" && onMapGround(owner))this.moveSeerSpirit(ownerId,owner,guardian,target,dt,"chase:"+targetId);
          else {const next = step3d(
            guardian, target, RULES.summonMoveSpeed * dt
          );
          if (active && order && this.isProtectedArea(owner.mapId, next.point)) {
            this.endGhostOrder(ownerId, active, order);
            continue;
          }
          guardian.x = clampToMap(next.point.x, getWorldMap(owner.mapId)!.bounds, "x");
          guardian.y = Math.max(next.point.y,groundAt(owner.mapId,next.point.x,next.point.z));
          guardian.z = clampToMap(next.point.z, getWorldMap(owner.mapId)!.bounds, "z");
          }
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
        if(guardian.kind==="pot_spirit" && owner.pathId==="seer" && onMapGround(owner))this.moveSeerSpirit(ownerId,owner,guardian,desired,dt,"follow");
        else {const next = step3d(
          guardian, desired, RULES.summonMoveSpeed * dt
        );
        guardian.x = clampToMap(next.point.x, getWorldMap(owner.mapId)!.bounds, "x");
        guardian.y = Math.max(next.point.y,groundAt(owner.mapId,next.point.x,next.point.z));
        guardian.z = clampToMap(next.point.z, getWorldMap(owner.mapId)!.bounds, "z");
        if (next.moved) guardian.facing = facingTo(dx, dz);
        }
      } else {
        guardian.facing = owner.facing;
      }
    }
  }

  private trySummonAttack(ownerId: string, guardian: SummonedGuardian, targetId: string, active?: ActiveGhost) {
    const owner = this.state.players.get(ownerId);
    const sameGuardian = this.state.summons.get(ownerId) === guardian;
    if (!owner || !owner.alive || !sameGuardian) return;

    const monster = this.getMonster(targetId);
    if (!this.sameCombatMap(ownerId, targetId)) return;
    const target = monster ?? this.state.players.get(targetId);
    if (!target || !target.alive || targetId === ownerId) return;
    const engageDistance = active ? RULES.capturedGhostEngageDistance : RULES.summonEngageDistance;
    if (distance3d(owner, target) > engageDistance) return;
    if (distance3d(guardian, target) > (active?.basicRange ?? RULES.summonAttackRange) + 0.00001 ||
        !this.combatSegmentClear(owner.mapId,guardian,target)) return;

    const attackClock = active ? this.ghostAttackAt : this.lastSummonAttackAt;
    const last = attackClock.get(ownerId) ?? -Infinity;
    if (this.simulatedMs - last < (active?.basicCooldownMs ?? RULES.summonAttackCooldownMs)) return;
    attackClock.set(ownerId, this.simulatedMs);
    if (active) {
      const order = active.order;
      if (!order) return;
      const mode = monster ? "pve" : "pvp";
      const defense = monster?.defense ?? this.masteryPower(target as Player, "pvp", "def");
      const power = active.attackPower * (1 + masteryBonuses(this.rebirthStates.get(ownerId), mode).atk);
      this.landGhostStrike(ownerId, owner, guardian, targetId, target, calculateDamage(power, defense, target.level), damage => {
        this.clients.find(client => client.sessionId === ownerId)?.send("ghost_combat_state", {
          combatId: active.combatId, status: "hit", targetId, targetName: order.targetName, damage, hp: target.hp,
        });
      });
      return;
    }
    this.recordCombat(ownerId, targetId);
    guardian.hitSeq += 1;

    if (monster) {
      const order=this.occultSpiritOrders.get(ownerId);
      const empowered=order?.targetId===targetId && order.until>this.simulatedMs;
      const gearPower=guardian.kind==="pot_spirit" && owner.pathId==="seer" ? spiritGearPower(this.inventories.get(ownerId)) : 0;
      const spiritRank=guardian.kind==="pot_spirit" && owner.pathId==="seer" ? this.occultBooks.get(ownerId)?.coreRanks?.seer_pot ?? 0 : 0;
      const damage = calculateDamage((RULES.summonAttackDamage+gearPower)*(1+masteryBonuses(this.rebirthStates.get(ownerId),"pve").magicAtk)*(empowered?OCCULT_LESSONS[order.skillId].power:1)*seerCoreProgress(spiritRank).seer_pot.pvePower, monster.defense, monster.level);
      if (empowered) this.occultSpiritOrders.delete(ownerId);
      if (guardian.kind==="pot_spirit" && (empowered || !this.occultSpiritPracticed.has(ownerId))) {
        this.occultSpiritPracticed.add(ownerId);
        if (owner.pathId==="seer") this.recordOccultTraining(ownerId,"seer",["spirit"]);
        else if (owner.pathId==="mender") this.recordOccultTraining(ownerId,"mender",["spirit"]);
      }
      this.applyMonsterHit(ownerId,monster,damage,()=>{
        if (empowered && order.skillId==="seer_spirit_bind" && monster.hp>0) this.interruptMuayTarget(monster,700);
        this.broadcast("summon_hit", {
          ownerId, summonId: ownerId, targetId,
          damage, hp: monster.hp,
          hitSeq: guardian.hitSeq,
        }, { afterNextPatch: true });
      });
      return;
    }

    // Damage and kill attribution belong to the owner.
    const victim = target as Player;
    const damage = calculateDamage(RULES.summonAttackDamage*(1+masteryBonuses(this.rebirthStates.get(ownerId),"pvp").magicAtk),
      this.masteryPower(victim,"pvp","magicDef"), victim.level);
    this.applySummonPlayerHit(ownerId, owner, guardian, targetId, victim, damage);
  }

  private landGhostStrike(ownerId: string, owner: Player, guardian: SummonedGuardian, targetId: string,
    target: Monster | Player, damage: number, publish: (damage: number) => void) {
    this.recordCombat(ownerId, targetId);
    this.markWarAction(ownerId);
    guardian.hitSeq += 1;
    guardian.facing = facingTo(target.x - guardian.x, target.z - guardian.z);
    if (damage <= 0) return publish(0);
    const before = target.hp;
    if ("defense" in target) {
      this.applyMonsterHit(ownerId, target, damage, () => {
        this.broadcast("summon_hit", {ownerId, summonId: ownerId, targetId, damage, hp: target.hp,
          hitSeq: guardian.hitSeq}, {afterNextPatch: true});
        publish(before - target.hp);
      }, guardian.combatTargetId);
    } else if (!this.applySummonPlayerHit(ownerId, owner, guardian, targetId, target, damage, () => publish(before - target.hp))) {
      publish(0);
    }
  }

  private applySummonPlayerHit(ownerId: string, owner: Player, guardian: SummonedGuardian, targetId: string,
    victim: Player, rawDamage: number, publish?: () => void) {
    const damage = this.directGuardDamage(targetId, guardian, rawDamage, 0, ownerId);
    return this.applyPlayerHit(owner,targetId,victim,damage,()=>{
      publish?.();
      this.broadcast("pvp_hit", {
        attackerId: ownerId, source: "summon", summonOwnerId: ownerId,
        targetId, damage,
        hp: victim.hp, maxHp: victim.maxHp, hitSeq: victim.hitSeq,
      }, { afterNextPatch: true });
    },()=>{
      owner.pkKills += 1;
      victim.pkDeaths += 1;
      this.knockoutPlayer(targetId, "pk", ownerId);
      void this.saveCharacter(ownerId);
      this.broadcast("pvp_kill", {
        winnerId: ownerId, loserId: targetId,
        source: "summon",
        kills: owner.pkKills, deaths: victim.pkDeaths,
      }, { afterNextPatch: true });
    });
  }

  private reject(client: Client, reason: string) {
    // Avoid amplifying floods with unlimited rejection responses.
    const previous = this.lastRejectNoticeMs.get(client.sessionId) ?? -Infinity;
    if (this.simulatedMs - previous >= 500) {
      this.lastRejectNoticeMs.set(client.sessionId, this.simulatedMs);
      client.send("command_rejected", { reason });
    }
  }

  private huntNotified=new Map<string,string>();
  private sampleHuntEvent():void {
    if(this.field || !WORLD_EXPANSION || process.env.MONTRA_HUNT_EVENTS==='0')return;
    const monsters=new Map<string,Array<{level:number;normal:boolean;strong:boolean}>>();
    for(const monster of this.state.monsters.values())if(monster.alive && monster.tier!=='boss'){
      const levels=monsters.get(monster.mapId) ?? [];levels.push({level:monster.level,normal:monster.tier==='weak' || monster.tier==='normal',strong:monster.tier==='strong' || monster.tier==='elite'});monsters.set(monster.mapId,levels);
    }
    const maps=new Map<string,HuntMap>();
    for(const [id,p] of this.state.players){
      if(!p.alive || !this.persistentCharacters.has(id) || p.level>=PROGRESSION.maxLevel || !monsters.get(p.mapId)?.some(monster=>Math.abs(monster.level-p.level)<=5))continue;
      const world=getWorldMap(p.mapId);if(!world)continue;
      const entry=maps.get(p.mapId);
      const hasNormal=Boolean(monsters.get(p.mapId)?.some(m=>m.normal && Math.abs(m.level-p.level)<=5));
      const hasStrong=Boolean(monsters.get(p.mapId)?.some(m=>m.strong && Math.abs(m.level-p.level)<=5));
      if(entry){entry.players++;entry.minLevel=Math.min(entry.minLevel,p.level);entry.maxLevel=Math.max(entry.maxLevel,p.level);entry.hasNormal ||= hasNormal;entry.hasStrong ||= hasStrong;}
      else maps.set(p.mapId,{mapId:p.mapId,name:world.name,players:1,minLevel:p.level,maxLevel:p.level,hasNormal,hasStrong});
    }
    huntEventDirector.observe(this.roomId,[...maps.values()]);
    const event=huntEventDirector.snapshot();
    for(const client of this.clients){
      const player=this.state.players.get(client.sessionId),visible=event && player?.mapId===event.mapId?event:null;
      const signature=visible?`${visible.id}:${visible.kills}`:'';
      const previous=this.huntNotified.get(client.sessionId);
      if(previous===signature)continue;
      this.huntNotified.set(client.sessionId,signature);
      try{
        client.send('hunt_event_state',{event:visible,serverNow:Date.now()});
        if(visible){
          const completed=visible.kills>=visible.goal,rate=(visible.kind==='strong_hunt'?20:visible.kind==='normal_hunt'?15:10)+(completed?5:0);
          const bonus=visible.kind==='strong_hunt'?`EXP มอนสเตอร์แข็งแกร่งและชั้นยอด +${rate}%`:visible.kind==='normal_hunt'?`EXP มอนสเตอร์ทั่วไป +${rate}%`:`EXP มอนสเตอร์ +${rate}%`;
          const remaining=Math.max(1,Math.ceil((visible.endsAt-Date.now())/60_000));
          const oldProgress=previous?.startsWith(visible.id+':')?Number(previous.slice(visible.id.length+1)):null;
          const announce=oldProgress===null || (completed && oldProgress<visible.goal) || Math.floor(visible.kills/5)>Math.floor(oldProgress/5);
          if(announce){
            const story=oldProgress===null?`${visible.story} · `:'';
            const objective=completed?'เป้าหมายร่วมสำเร็จ โบนัสเพิ่มอีก 5%':`เป้าหมายร่วม ${visible.kills}/${visible.goal} · ครบแล้วโบนัสเพิ่มอีก 5%`;
            client.send('chat_message',{senderId:'system-hunt-event',name:'ระบบเหตุการณ์',mapId:visible.mapId,channel:'map',text:`${story}${objective} · ${bonus} ยกเว้นบอส · เหลือประมาณ ${remaining} นาที`});
          }
        }
      }catch{/* disconnected */}
    }
  }

  async onCreate(options?:{warRoomKey?:string;field?:Battlefield}) {
    this.state.ghostPotAvailable = Boolean(this.ghostConfig && characterStore.economyEnabled);
    this.state.boatsAvailable = WORLD_EXPANSION && !options?.field && process.env.MONTRA_BOATS_ENABLED!=="0";
    let cardRevision=dynamicBalanceRevision();
    this.clock.setInterval(()=>{
      const next=dynamicBalanceRevision();if(next===cardRevision)return;cardRevision=next;
      const items=cardCatalogWithRates();
      for(const client of this.clients)if(this.sentItemCatalog.has(client.sessionId)){
        try{client.send("item_catalog_page",{items});}catch{/* disconnected */}
      }
    },3000);
    if(options?.warRoomKey===warRoomKey && options.field){
      const rules=getWarDefinition(options.field.site);
      if(!rules)throw Error("war_unknown");
      this.field=options.field;
      guildStore().war.resumeScheduledField(this.field,Date.now());
      this.maxClients=rules.seatsPerSide===null?Infinity:rules.seatsPerSide*2;
      await this.setPrivate(true);
    }
    this.state.territoryWarAvailable=WORLD_EXPANSION;
    if (characterStore.economyEnabled && !this.field && (WORLD_EXPANSION || guildStore().pendingCityDisbands().length))
      characterStore.economy.startCityProductionSweeper(sweepCityProduction);
    this.state.forestObjectivesAvailable=WORLD_EXPANSION && !this.field;
    if(WORLD_EXPANSION && !this.field && process.env.MONTRA_DIRECTOR_ENABLED!=="0")worldDirector.restore();
    if (characterStore.economyEnabled) this.state.craftRecipe = JSON.stringify(SHRINE_RECIPE);
    this.state.forgeCatalog = JSON.stringify(FORGE_CATALOG);
    this.state.buildCatalog = BUILD_CATALOG;
    this.state.economyAvailable = characterStore.economyEnabled;
    this.state.cityRecoveryAvailable = characterStore.economyEnabled && !this.field;
    this.state.cityProductionAvailable = this.state.cityRecoveryAvailable && WORLD_EXPANSION && CITY_PRODUCTION_ENABLED;
    this.state.cityWorkshopSupported = this.state.cityRecoveryAvailable;
    this.state.cityPurchaseSupported = this.state.cityRecoveryAvailable &&
      (cityPurchaseIntake || characterStore.economy.hasOpenCityPurchase());
    this.state.cityMissionSupported = this.state.cityRecoveryAvailable &&
      (cityMissionIntake || characterStore.economy.hasOpenCityMission() || characterStore.economy.hasOpenCityHaul() ||
        characterStore.economy.hasOpenTradeContract());
    this.state.cityMarketSupported = this.state.cityRecoveryAvailable &&
      (cityMarketIntake || characterStore.economy.hasCityMarketAssets());
    this.state.cityGovernanceAvailable = this.state.cityProductionAvailable && CITY_MINING_ENABLED && CITY_GOVERNANCE_ENABLED;
    if(characterStore.economyEnabled && !this.field)this.clock.setInterval(()=>this.sendResources(),5000);
    if(characterStore.economyEnabled)this.clock.setInterval(()=>this.tickFishing(),500);
    if(!this.field || !isolatedBattleWorldDefinitions.has(this.field.site))this.forest.initialize(!this.field);
    if(!this.field && WORLD_EXPANSION)this.clock.setInterval(()=>this.sampleHuntEvent(),10_000);
    this.state.worldDefinition=this.field
      ? isolatedBattleWorldDefinitions.get(this.field.site)??battlefieldWorldDefinition : worldDefinition;
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
      if(!player?.alive || player.pathId!=="blade" || this.isProtectedArea(player.mapId,player))this.endBladeCloak(id,"safe_area");
      else if(this.simulatedMs>=until)this.endBladeCloak(id,"expired");
    }
    this.updateTerritory();
    this.updateWorldDirector();
    this.updateOccultEffects();
    this.updateMuayGrapples();
    this.updatePrototypeEffects();
    this.updateMuayDefense();
    this.updateMuayCore();
    this.updateSwordCore();
    for(const id of this.buffs.expired(this.simulatedMs))this.endPossession(id,"expired");
    for(const id of this.effects.expire(this.simulatedMs)) {const p=this.state.players.get(id);if(p)this.applyStats(id,p,this.statAllocations.get(id) ?? emptyAllocations());}
    this.updateRespawns();
    this.updateClimbs(dt);
    this.updateFlights(dt);
    if (this.state.boatsAvailable) this.updateBoats(dt);
    this.updatePlayerMovement(dt);
    this.updateWarBanners();
    const trapStep=this.prototypeAshTraps.size?{movements:[] as TrapMovement[],attacks:[] as Array<()=>void>}:undefined;
    const walk=trapStep?(monster:Monster,previous:Position)=>{
      if(trapStep.movements.length<=1024)trapStep.movements.push({previousAt:this.simulatedMs-Math.round(dt*1000),
        monsterId:monster.id,mapId:monster.mapId,previous,current:{x:monster.x,y:monster.y,z:monster.z},eligible:true});
    }:undefined;
    const defer=trapStep?(attack:()=>void)=>{trapStep.attacks.push(attack);}:undefined;
    const monsterTargets = this.monsterCombatTargets();
    this.updateMonsterAI(dt,walk,defer,monsterTargets);
    this.forest.update(this.simulatedMs, dt, monsterTargets, this.pendingWarps,
      (id,monster,force,attackAt)=>{
        if(defer)defer(()=>this.resolveForestMonsterHit(id,monster,force ?? 1,attackAt));
        else this.resolveForestMonsterHit(id,monster,force ?? 1,attackAt);
      },
      id => this.broadcast("monster_respawn",{targetId:id}),
    (id,p,m)=>!this.bladeCloaks.has(id) || planarDistance(p,m)<=(m.tier==="normal"?(this.bladeBooks.get(id)?.learned.includes("quiet_step")?0.75:1.5):5),
    id=>this.seerBindings.has(id),walk);
    if(trapStep){
      this.updateAshTraps(trapStep.movements);
      for(const attack of trapStep.attacks)attack();
    }
    this.updatePlayerAttacks();
    this.updateSummons(dt);
    if(this.prototypeRescues.size)this.updateRescues();
    for(const [id,hitSequence] of this.mountHitSequence) {
      const player=this.state.players.get(id);
      if(!player || !player.alive || player.hitSeq!==hitSequence || this.sentinelStuns.has(id) || this.muayControlled(id))this.dismount(id,"hit");
    }
    this.updateForestDefenses();
    this.updateForestEscorts(dt);
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
    this.supportMastery(id,targets.map(([member])=>member));
    if (targets.some(([member]) => this.isFighting(member) ||
      (member!==id && this.simulatedMs < (this.supportManaCombatUntil.get(member) ?? 0))))
      this.supportManaCombatUntil.set(id,this.simulatedMs + PROGRESSION.combatQuietMs);
  }

  private updateResources(dt: number): void {
    const now = Date.now();
    for (const [id, player] of this.state.players) {
      if (!player.alive || this.pendingWarps.has(id)) continue;
      this.refreshMastery(id);
      const recovery=1+masteryBonuses(this.rebirthStates.get(id),this.masteryMode(id)).regen;
      const fighting = this.isFighting(id);
      // HP saves are integer-valued in legacy snapshots. Keep fractional regen
      // in a transient accumulator instead of rounding up on each save/rejoin.
      const pending = (this.hpRegenRemainder.get(id) ?? 0) + (fighting ? PROGRESSION.hpRegenIn : PROGRESSION.hpRegenOut) * recovery * dt;
      const healed = Math.floor(pending + 1e-9);
      player.hp = Math.min(player.maxHp, player.hp + healed);
      this.hpRegenRemainder.set(id, player.hp >= player.maxHp ? 0 : pending - healed);
      const needs = this.needs.get(id);
      const nutritionRegen = needs && (now >= needs.hungryAt || now >= needs.thirstyAt) ? 0.6 : 1;
      const staminaRegen = (fighting ? PROGRESSION.staminaRegenIn : PROGRESSION.staminaRegenOut) +
        (this.extraStaminaRegen.get(player) ?? 0);
      player.stamina = Math.min(player.maxStamina, player.stamina + staminaRegen * nutritionRegen * recovery * dt);
      const manaFighting = fighting || this.simulatedMs < (this.supportManaCombatUntil.get(id) ?? 0);
      const manaRegen = manaFighting ? PROGRESSION.manaRegenIn : Math.max(PROGRESSION.manaRegenOut, player.maxMana / 20)+(this.extraRestManaRegen.get(player)??0);
      player.mana = Math.min(player.maxMana, player.mana + manaRegen * recovery * dt);
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
      if (transition.meteor && this.isGuildPartyLeader(id)) this.resolveMeteor(id, player);
      this.broadcast("flight_finished", {
        playerId: id, altitude: player.y, flying: player.flying,
      }, { afterNextPatch: true });
      void this.saveCharacter(id);
    }
  }

  private canOccupy(x: number, z: number, feetY: number, flying = false, mapId = DEFAULT_MAP_ID): boolean {
    if (this.homeWalls.get(mapId)?.some(wall=>homeWallBlocks(wall.cell,wall.rotation,{x,z}))) return false;
    const map=getWorldMap(mapId);
    if(mapId!==DEFAULT_MAP_ID || map?.terrain || map?.water?.length){
      const r=map?.strategic?.rampart;
      if(r && isOnPlatform(feetY))return onRampart(r,x,z);
      if(r && this.closedFieldGates.size && r.gates.some(g=>this.closedFieldGates.has(g.id) && segmentIntersectsExpandedWall({x,z},{x,z},g.box,.4)))return false;
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

  private moveOnSurface(player:{x:number;y:number;z:number;mapId:string;flying?:boolean;boatId?:string},x:number,z:number){
    if(player.boatId)return;
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
      this.refreshMastery(sessionId);
      // The boat tick carries riders. A target lock must never chase onto the bank.
      if (player.boatId) continue;
      const groundMastery=1+masteryBonuses(this.rebirthStates.get(sessionId),this.masteryMode(sessionId)).movement;
      const moveSpeed=player.flying ? FLIGHT.horizontalSpeed : player.mounted ? RULES.mountedSpeed : RULES.playerSpeed * groundMastery * (this.sentinelAnchors.has(sessionId)?0.6:1) *
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
        if(this.simulatedMs<(this.bladeRetreatUntil.get(sessionId) ?? 0)){player.combatState="idle";continue;}
        const monster = this.getMonster(targetId);
        const isMonster = Boolean(monster);
        const ghost = this.combatGhost(targetId);
        const target = monster ?? ghost?.guardian ?? this.state.players.get(targetId);

        const eligible = ghost ? this.canPlayerHitGhost(sessionId, ghost) : this.canPursueBasic(sessionId,player,targetId,monster);
        if (!target || ("alive" in target && !target.alive) || targetId === sessionId || !eligible) {
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
        const inRestArea=isMonster && this.isProtectedArea(player.mapId,player);
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
      if(this.simulatedMs<(this.bladeRetreatUntil.get(attackerId) ?? 0))continue;
      const monster = this.getMonster(targetId);
      const isMonster = Boolean(monster);
      const ghost = this.combatGhost(targetId);
      const target = monster ?? ghost?.guardian ?? this.state.players.get(targetId);
      const eligible = ghost ? this.canPlayerHitGhost(attackerId, ghost) : this.canPursueBasic(attackerId,attacker,targetId,monster);
      if (!target || ("alive" in target && !target.alive) || targetId === attackerId || !eligible) {
        this.endAttack(attackerId, attacker);
        continue;
      }
      if(!isMonster && this.priestProtected(targetId))continue;

      if (isMonster && this.isProtectedArea(attacker.mapId,attacker)) continue;
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
      this.recordCombat(attackerId, ghost?.ownerId ?? targetId);
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
        const meleeDamage = ranged ? calculateDamage(this.masteryPower(attacker,monster?"pve":"pvp","magicAtk",bonuses.ranged),monster.defense,monster.level)
          : calculateDamage((this.masteryPower(attacker,monster?"pve":"pvp","atk",meleeBonus)) * (dualSword ? DUAL_SWORD.damageMultiplier : 1) * swordMastery, monster.defense, monster.level);
        this.applyMonsterHit(attackerId,monster,meleeDamage,()=>this.broadcast("combat_hit", {
          targetId,
          attackerId, damage: meleeDamage,
          hp: monster.hp, maxHp: monster.maxHp, hitSeq: monster.hitSeq,
        }, { afterNextPatch: true }));
        continue;
      }

      if (ghost) {
        const power = ranged ? this.masteryPower(attacker,"pvp","magicAtk",bonuses.ranged) :
          this.masteryPower(attacker,"pvp","atk",meleeBonus) * (dualSword ? DUAL_SWORD.damageMultiplier : 1) * swordMastery;
        const damage = calculateDamage(power, ranged ? ghost.active.magicDefense : ghost.active.defense, ghost.active.level);
        const owner = this.state.players.get(ghost.ownerId);
        const warFactor = this.field && owner ? warEntryDamageFactor(attacker.level, owner.level) : 1;
        this.hitGhost(ghost, attackerId, Math.max(1,Math.round(damage * warFactor)), ranged);
        continue;
      }

      // FREE PK: health, range, damage, respawn and kill credit are wholly
      // server-owned. The client only submits another session's targetId.
      const victim = target as Player;
      const meleeDamage = this.directGuardDamage(targetId,attacker,ranged
        ? calculateDamage(this.masteryPower(attacker,monster?"pve":"pvp","magicAtk",bonuses.ranged),this.masteryPower(victim,"pvp","magicDef"),victim.level)
        : calculateDamage((this.masteryPower(attacker,monster?"pve":"pvp","atk",meleeBonus)) * (dualSword ? DUAL_SWORD.damageMultiplier : 1) * swordMastery, this.masteryPower(victim,"pvp","def"), victim.level));
      if(!this.applyPlayerHit(attacker,targetId,victim,meleeDamage,()=>{
        this.broadcast("pvp_hit", {
          attackerId, targetId, damage: meleeDamage,
          hp: victim.hp, maxHp: victim.maxHp, hitSeq: victim.hitSeq,
        }, { afterNextPatch: true });
      },()=>{
        attacker.pkKills += 1;
        victim.pkDeaths += 1;
        this.knockoutPlayer(targetId, "pk", attackerId);
        void this.saveCharacter(attackerId);
        this.broadcast("pvp_kill", {
          winnerId: attackerId, loserId: targetId,
          kills: attacker.pkKills, deaths: victim.pkDeaths,
        }, { afterNextPatch: true });
      }))continue;
    }
  }

  private applyPlayerHit(attacker:Player|undefined,id:string,victim:Player,damage:number,publish:()=>void,defeat:()=>void):boolean {
    // A guard can resolve a counter first. HP zero also reserves a defeat
    // while its hit notice is still being published.
    if(!victim.alive || victim.hp<=0 || (attacker && (!attacker.alive || attacker.hp<=0)))return false;
    victim.hp=Math.max(0,victim.hp-damage);victim.hitSeq++;
    const lethal=victim.hp===0;
    try{publish();this.resolveRescueAfterDamage(id,victim,damage);}
    finally{if(lethal)defeat();}
    return true;
  }

  private knockoutPlayer(id: string, cause: "pk" | "monster", attackerId = "") {
    this.clearPrototypeTransient(id);
    if(this.warCargo.delete(id))try{this.clients.find(client=>client.sessionId===id)?.send("war_supply_notice",{action:"lost"});}catch{}
    this.endPriestSanctuary(id);this.priestRegens.delete(id);
    this.muayCoreStances.delete(id);this.muayCoreFollowups.delete(id);this.muayCoreSequences.delete(id);this.swordCoreStances.delete(id);this.swordCoreSequences.delete(id);
    this.seerBuffaloCasts.delete(id);this.sentinelCoreStances.delete(id);this.sentinelStuns.delete(id);this.sentinelWindups.delete(id);this.sentinelCounters.delete(id);this.sentinelAnchors.delete(id);this.sentinelInterceptions.delete(id);
    for(const [member,link] of this.sentinelInterceptions)if(link.ownerId===id)this.sentinelInterceptions.delete(member);
    this.endBladeCloak(id,"dead");this.bladeCasts.delete(id);this.bladeWindups.delete(id);this.bladeRetreatUntil.delete(id);
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
    this.boatWorld.detach(id,victim);
    victim.stunned=false;
    this.endPossession(id,"owner_dead");
    this.effects.forget(id);
    this.applyStats(id, victim, this.statAllocations.get(id) ?? emptyAllocations());
    victim.hp = 0;
    this.hpRegenRemainder.delete(id);
    victim.alive = false;
    this.updateWarBanners();
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

  private killMonster(defeat:MonsterDefeat):void {
    if(!this.pendingMonsterDefeats.delete(defeat))return;
    const {monster,hitSeq}=defeat;
    if(monster.hp!==0 || monster.hitSeq!==hitSeq)return;
    this.retireMonster(monster,defeat);
  }

  private retireMonster(monster:Monster,defeat?:MonsterDefeat):void {
    const targetId=monster.id;
    if(this.getMonster(targetId)!==monster || !monster.alive)return;
    if (targetId !== RULES.monsterId) {
      const profile=this.forest.profile(targetId);
      if(!profile || !this.forest.kill(targetId,this.simulatedMs,this.state.players,this.pendingWarps))return;
      if(defeat){
        const {winnerId,prey}=defeat,winner=this.state.players.get(winnerId);
        const eligible=Boolean(!this.field && process.env.MONTRA_HUNT_EVENTS!=='0' && winner?.alive && this.persistentCharacters.has(winnerId) &&
          !this.pendingWarps.has(winnerId) && winner.mapId===prey.mapId && winner.level<PROGRESSION.maxLevel && Math.abs(winner.level-prey.level)<=5 && distance3d(winner,prey)<=PARTY_XP_RADIUS);
        this.awardMonsterExperience(winnerId,prey,profile.tier);
        huntEventDirector.recordKill(prey.mapId,profile.tier,eligible);
      }
      this.clearPrototypeTransient(targetId);
      this.releaseMuayFor(targetId,"knockout");
      this.clearMuayCombosForTarget(targetId);
      for(const [id,target] of this.attackTargets) if(target===targetId){const p=this.state.players.get(id);if(p)this.endAttack(id,p);}
      return;
    }
    this.monsterInterruptUntil=0;this.monsterInterruptResistUntil=0;
    this.sentinelLegacyTaunt={ownerId:"",until:0,resistUntil:0};
    monster.hp = 0;
    monster.alive = false;
    this.monsterNavigator.clear();
    monster.aiState = "dead";
    monster.targetId = "";
    this.monsterRespawnAt = this.simulatedMs + RULES.monsterRespawnMs;
    this.monsterReturning = false;
    if(defeat)this.awardMonsterExperience(defeat.winnerId,defeat.prey);
    this.clearPrototypeTransient(targetId);
    this.releaseMuayFor(targetId,"knockout");
    this.clearMuayCombosForTarget(targetId);

    // Only cancel PvE attacks on this monster. Concurrent Free PK fights
    // must continue even when someone else defeats the ghost.
    for (const [id, targetId] of [...this.attackTargets]) {
      if (targetId !== RULES.monsterId) continue;
      const player = this.state.players.get(id);
      if (player) this.endAttack(id, player);
      else this.attackTargets.delete(id);
    }
  }

  private monsterCombatTargets(): ReadonlyMap<string, MonsterCombatTarget> {
    if (!this.activeGhosts.size) return this.state.players;
    const targets = new Map<string, MonsterCombatTarget>(this.state.players);
    for (const id of this.activeGhosts.keys()) {
      const guardian = this.state.summons.get(id);
      if (guardian && this.combatGhost(guardian.combatTargetId)) {
        const {x,y,z,mapId} = guardian;
        targets.set(guardian.combatTargetId, {x,y,z,mapId,alive:true,boatId:""});
      }
    }
    return targets;
  }

  private updateMonsterAI(dt:number,walk?:(monster:Monster,previous:Position)=>void,defer?:(attack:()=>void)=>void,
    targets:ReadonlyMap<string,MonsterCombatTarget> = this.state.players) {
    const monster = this.state.monster;
    if (!monster.alive) return;
    if(this.seerBindings.has(monster.id)){monster.aiState="stagger";return;}
    if(this.simulatedMs<this.monsterInterruptUntil){monster.aiState="stagger";return;}

    const spawn = { x: RULES.monsterSpawnX, z: RULES.monsterSpawnZ };
    if (planarDistance(monster, spawn) >= RULES.monsterLeashRadius) {
      this.monsterReturning = true;
    }
    if (this.monsterReturning) {
      monster.targetId = "";
      monster.aiState = "return";
      this.moveMonster(spawn, RULES.monsterChaseSpeed * dt, "return",walk);
      if (planarDistance(monster, spawn) < 0.2) this.monsterReturning = false;
      return;
    }

    // Keep an existing target if it is alive and remains in the combat area.
    let targetId = monster.targetId;
    let target = targetId ? targets.get(targetId) : undefined;
    if (!target || !target.alive || this.pendingWarps.has(targetId) || (this.bladeCloaks.has(targetId) && planarDistance(monster,target)>(this.bladeBooks.get(targetId)?.learned.includes("quiet_step")?0.75:1.5)) || target.mapId !== DEFAULT_MAP_ID || this.isProtectedArea(target.mapId,target) || (!target.boatId && !onMapGround(target)) ||
        planarDistance(monster, target) > RULES.monsterGiveUpRadius) {
      target = undefined;
      targetId = "";
    }
    const taunt=this.sentinelLegacyTaunt,forced=this.state.players.get(taunt.ownerId);
    if(this.simulatedMs<taunt.until && forced?.alive && forced.mapId===DEFAULT_MAP_ID &&
       !this.pendingWarps.has(taunt.ownerId) && !this.isProtectedArea(forced.mapId,forced) &&
       (forced.boatId || onMapGround(forced)) && !this.bladeCloaks.has(taunt.ownerId) && planarDistance(monster,forced)<=RULES.monsterGiveUpRadius){
      target=forced;targetId=taunt.ownerId;
    }else if(this.simulatedMs>=taunt.until || !forced?.alive){taunt.ownerId="";taunt.until=0;}

    // No shared targeting oracle: this NPC sees only characters within aggro.
    if (!target) {
      let nearest: number = RULES.monsterAggroRadius;
      for (const [id, player] of targets) {
        if (!player.alive || this.pendingWarps.has(id) || (this.bladeCloaks.has(id) && planarDistance(monster,player)>(this.bladeBooks.get(id)?.learned.includes("quiet_step")?0.75:1.5)) || player.mapId !== DEFAULT_MAP_ID || this.isProtectedArea(player.mapId,player) || (!player.boatId && !onMapGround(player))) continue;
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
        this.moveMonster(target, RULES.monsterChaseSpeed * dt, "chase:" + targetId,walk);
      } else {
        monster.aiState = "attack";
        if(defer){const victim=target;defer(()=>this.monsterAttack(targetId,victim));}
        else this.monsterAttack(targetId,target);
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
    this.moveMonster(destination, RULES.monsterPatrolSpeed * dt, "patrol",walk);
  }

  /** RRT routes around obstacles; movement speed remains RULES-based.
   * Planning runs roughly once every 1.3 seconds for a moving target, while
   * the server still applies at most one legal movement step per 20Hz tick.
   */
  private moveMonster(target:Vec2,step:number,intent:string,walk?:(monster:Monster,previous:Position)=>void) {
    const monster = this.state.monster;
    const waypoint = this.monsterNavigator.nextWaypoint(
      monster, target, this.simulatedMs, intent
    );
    if (!waypoint) return; // Never fall back to walking through the wall.

    const dx = waypoint.x-monster.x;
    const dz = waypoint.z-monster.z;
    const next = stepTowards(monster, waypoint, step);
    if (!next.moved || this.isProtectedArea(DEFAULT_MAP_ID,next) || !isMonsterSegmentClear(monster, next)) return;

    const previous=walk?{x:monster.x,y:monster.y,z:monster.z}:undefined;
    monster.facing = facingTo(dx,dz);
    monster.x = clampToMap(next.x);
    monster.z = clampToMap(next.z);
    monster.y=groundAt(DEFAULT_MAP_ID,monster.x,monster.z);
    if(previous)walk?.(monster,previous);
  }

  private monsterAttack(targetId: string, target: MonsterCombatTarget) {
    const monster = this.state.monster;
    if (!monster.alive || this.isProtectedArea(DEFAULT_MAP_ID,monster)) return;
    if (this.priestProtected(targetId)) return;
    if (!target.alive || this.pendingWarps.has(targetId) || target.mapId !== DEFAULT_MAP_ID || this.isProtectedArea(target.mapId,target)) return;
    if (distance3d(monster, target) > RULES.monsterAttackRange ||
        (target.boatId && !this.combatSegmentClear(target.mapId,monster,target))) return;
    const ghost = this.combatGhost(targetId);
    const player = this.state.players.get(targetId);
    if (ghost ? !this.sameCombatMap(ghost.ownerId, monster.id) || !this.combatSegmentClear(target.mapId, monster, ghost.guardian) :
        !player || player !== target) return;
    if (this.simulatedMs - this.lastMonsterAttackMs < RULES.monsterAttackCooldownMs) return;
    this.lastMonsterAttackMs = this.simulatedMs;
    if (ghost) {
      const damage = this.prototypeMonsterDamage(monster, calculateDamage(RULES.monsterAttackDamage, ghost.active.defense, ghost.active.level));
      this.hitGhost(ghost, monster.id, damage);
      return;
    }
    if (!player) return;
    this.lastCombatMs.set(targetId, this.simulatedMs);

    const hit:DefaultMonsterHit=Object.freeze({sequence:++this.monsterHitSequence,targetId,target:player});
    this.pendingDefaultMonsterHits.add(hit);
    this.resolveDefaultMonsterHit(hit);
  }

  private resolveDefaultMonsterHit(hit:DefaultMonsterHit):void {
    // The scheduler admits a single delivery. Consume it before any nested
    // counter, transfer, hit notification, or knockout can reenter this path.
    if(!this.pendingDefaultMonsterHits.delete(hit))return;
    const {targetId,target}=hit,monster=this.state.monster;
    const rawDamage=this.prototypeMonsterDamage(monster,calculateDamage(RULES.monsterAttackDamage,
      this.masteryPower(target,"pve","def",equipmentRatings(this.inventories.get(targetId)).guard),target.level));
    const protection=this.protectMonsterHit(hit.sequence,targetId,target,monster);
    const damage=this.directGuardDamage(targetId,monster,protection?Math.max(1,Math.round(rawDamage*protection.factor)):rawDamage);
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
    this.resolveRescueAfterDamage(targetId,target,damage);

    if (target.hp === 0) {
      this.knockoutPlayer(targetId, "monster");
    }
    if(protection)this.finishFirmGuardProtection(protection.id,targetId);
  }

  private resolveForestMonsterHit(id:string,monster:Monster,force:number,attackAt:number):void {
    // A single strike can overlap several players. Commit each target once
    // before guard, counters, interception or damage.
    if(attackAt!==this.simulatedMs || this.state.monsters.get(monster.id)!==monster ||
      !monster.alive)return;
    let strike=this.forestStrikeHits.get(monster);
    if(strike?.at!==attackAt){
      strike={at:attackAt,targets:new Set()};
      this.forestStrikeHits.set(monster,strike);
    }
    if(strike.targets.has(id))return;
    strike.targets.add(id);
    const profile=this.forest.profile(monster.id);if(!profile)return;
    const ghost = this.combatGhost(id);
    if (ghost) {
      if (!this.sameCombatMap(ghost.ownerId, monster.id)) return;
      const damage = this.prototypeMonsterDamage(monster, calculateDamage(profile.attack*force, ghost.active.defense, ghost.active.level));
      this.hitGhost(ghost, monster.id, damage);
      return;
    }
    const player=this.state.players.get(id);
    if(!player?.alive || this.priestProtected(id) || !this.sameCombatMap(id,monster.id))return;
    const rawDamage=this.prototypeMonsterDamage(monster,calculateDamage(profile.attack*force,
      this.masteryPower(player,"pve","def",equipmentRatings(this.inventories.get(id)).guard),player.level));
    const protection=this.protectMonsterHit(++this.monsterHitSequence,id,player,monster);
    const damage=this.directGuardDamage(id,monster,protection?Math.max(1,Math.round(rawDamage*protection.factor)):rawDamage);
    this.endBladeCloak(id,"damaged");
    player.hp=Math.max(0,player.hp-damage);player.hitSeq++;this.lastCombatMs.set(id,this.simulatedMs);
    this.broadcast("monster_hit",{targetId:id,attackerId:monster.id,damage,hp:player.hp,maxHp:player.maxHp,hitSeq:player.hitSeq},{afterNextPatch:true});
    this.resolveRescueAfterDamage(id,player,damage);
    if(player.hp===0)this.knockoutPlayer(id,"monster",monster.id);
    if(protection)this.finishFirmGuardProtection(protection.id,id);
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
    if (!monster || !this.restApproachClients.has(id))return this.sameCombatMap(id,targetId,false,true);
    return !this.pendingWarps.has(id) && player.mapId===monster.mapId && !this.isProtectedArea(monster.mapId,monster);
  }

  private startSkillAction(id:string, player:Player, state:"idle"|"attacking") {
    this.markWarAction(id);
    this.destinations.delete(id);
    const targetId=this.attackTargets.get(id);
    if (!targetId || !this.getMonster(targetId)?.alive) {
      this.endAttack(id,player);
    }
    player.combatState=state;
  }

  private basicAttackPaused(id:string):boolean {
    return this.sentinelStuns.has(id) || this.sentinelWindups.has(id) ||
      this.bladeWindups.has(id) || this.bladeCasts.has(id) || this.muayCoreSequences.has(id) || this.swordCoreSequences.has(id) || this.seerBuffaloCasts.has(id) || this.muayControlled(id);
  }

  private endAttack(id: string, player: Player) {
    this.attackTargets.delete(id);
    player.targetId = "";
    player.combatState = "idle";
  }

  private captureCharacterSnapshot(
    id: string, inventoryOverride?: InventorySnapshot, hpOverride?: number, manaOverride?: number,
  ): CharacterSnapshot | null {
    const characterId = this.persistentCharacters.get(id);
    const player = this.state.players.get(id);
    const inventory = inventoryOverride ?? this.inventories.get(id);
    if (!characterId || !player || !inventory) return null;
    const civilian=this.warCivilianPositions.get(id);
    if(this.field && !civilian)return null;
    const shore = this.boatWorld.safeSave(id);
    const map = getWorldMap(player.mapId), relativeHeight = map?.reliefLabels || map?.waterLevel!==undefined;
    const scales=this.masteryScales.get(player)??{hp:1,mana:1};
    const pvpUntil=this.masteryMode(id)==="pvp"?Date.now()+Math.ceil(this.field?PROGRESSION.combatQuietMs:Math.max(0,PROGRESSION.combatQuietMs-(this.simulatedMs-(this.lastPvpMs.get(id)??-Infinity)))):0;
    const vitals=encodeMasteryVitals(hpOverride??player.hp,manaOverride??player.mana,scales.hp,scales.mana,pvpUntil);
    return {
      version: 1, id: characterId, name: player.characterName,
      level: player.level, experience: player.experience,
      pkKills: player.pkKills, pkDeaths: player.pkDeaths,
      mapId:civilian?.mapId??player.mapId,
      statAllocations: this.statAllocations.get(id) ?? emptyAllocations(),
      build: this.playerBuild(player) ?? undefined,
      rebirth: this.rebirthStates.get(id),
      forestObjective: this.forestObjectives.get(id) ?? null,
      directorClaims: this.directorClaims.get(id),
      classSkillReadyAt: player.classSkillReadyAt,
      talismanReadyAt: player.talismanReadyAt,
      mixedSkillLoadouts: this.mixedSkillLoadouts.get(id),
      swordTree: this.swordTrees.get(id),
      muayCooldowns: this.muayCooldowns.get(id),
      muayBook: this.muayBooks.get(id),
      occultBook: this.occultBooks.get(id),
      bladeBook: this.bladeBooks.get(id),
      sentinelBook: this.sentinelBooks.get(id),
      muayWrapGranted: this.muayWrapGranted.has(id),
      stamina: player.stamina,
      ...vitals,
      x:civilian?.x??shore?.x??player.x,
      // Civilian positions already use the stored height coordinates.
      y:civilian?.y??(shore ? (relativeHeight ? 0 : shore.y) :
        player.flying ? FLIGHT.altitude : relativeHeight ? (isOnPlatform(surfaceLayer(player))?FORT.height:0) : player.y),
      z:civilian?.z??shore?.z??player.z,
      ghostPool: this.ghostPools.get(id),
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
    if (process.env.MONTRA_REQUIRE_INVENTORY_CLIENT === "1" && fields.inventoryVersion !== 1) {
      throw new Error("รีเฟรชหน้าเกมเพื่อใช้กระเป๋า 108 ช่อง");
    }
    if(!this.prototypeGameplayEnabled())this.clearAllPrototypeEffects();
    if(this.prototypeGameplayEnabled() && this.requireAllPrototypeClients() &&
      (fields.prototypeProtocolVersion!==1 || fields.prototypeGameplayVersion!==1))throw new Error("prototype_client_required");
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
      const spawn = this.field ? VILLAGE_ARRIVALS[0] : VILLAGE_ARRIVALS.find(p => !reserved.some(other => other.x === p.x && other.z === p.z));
      if (!spawn) throw new Error("world_room_full");
      this.playerSpawn.set(client.sessionId, spawn);
      const setup = fields.characterSetup && typeof fields.characterSetup === "object" && !Array.isArray(fields.characterSetup)
        ? fields.characterSetup as {name?:unknown; build?:unknown} : undefined;
      const saved = characterId ? (await characterStore.loadOrCreateById(characterId, spawn, setup, required)).character : null;
      if (required && !accounts().resolve(fields.accountSession)) throw new Error("login_required");
      if(saved?.build){
        const credited=recordClassLevel(saved.rebirth??newRebirthState(),saved.build.path,Math.min(100,saved.level));
        if(JSON.stringify(credited)!==JSON.stringify(saved.rebirth)){
          await characterStore.save({...saved,rebirth:credited,updatedAt:new Date().toISOString()});
          saved.rebirth=credited;
        }
      }
      const allocations = saved?.statAllocations ?? emptyAllocations();
      const initialStats = equippedStats(calculateStats(saved?.level ?? 1, allocations),saved?.inventory);
      const initialMaxMana=gearMana(saved?.level??1,saved?.inventory).max;
      const homeReady = WORLD_EXPANSION && characterStore.economyEnabled &&
        (options as {homeVersion?:unknown}|undefined)?.homeVersion === 1;
      const savedMapId = saved?.mapId ?? DEFAULT_MAP_ID;
      const savedHome = isHomeMap(savedMapId) && !this.field && homeReady && characterId &&
        savedMapId === homeMapId(characterId) ? characterStore.economy.homeState(characterId) : null;
      if (savedHome?.level) this.cacheHomeWalls(savedMapId,savedHome.parts);
      const mapId = (isHomeMap(savedMapId) || savedMapId === HOME_MAP.id) && !savedHome?.level ? DEFAULT_MAP_ID : savedMapId;
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
      const relativeHeight=map.reliefLabels || map.waterLevel!==undefined;
      const savedY=saved ? saved.y+(relativeHeight?groundAt(mapId,saved.x,saved.z):0) : 0;
      let validPosition = saved && mapId === savedMapId && (!map.terrain || isSafeWorldPoint(map,{...saved,y:savedY})) && this.canOccupy(
        saved.x, saved.z, savedY-groundAt(mapId,saved.x,saved.z), restoreFlight, mapId);
      let safeSpawn = mapId === DEFAULT_MAP_ID ? { ...spawn, y: 0 } : getSafeMapSpawn(mapId);
      if(this.field){
        const credential=characterId && admissions.get(characterId),war=guildStore().war,member=characterId && war.member(characterId);
        if(!saved || !credential || credential.roomId!==this.roomId || credential.expires<=Date.now() ||
           credential.ticket!==(options as Record<string,unknown>)?.warTicket || !member || mapId!==this.field.site)throw Error("war_admission");
        const side=war.side(this.field,member,Date.now(),false,characterId!);
        if(side!==credential.side || member.id!==credential.guild)throw Error("war_admission");
        const sideSize=[...this.warSeats.values()].filter(s=>s.side===side).length;
        const rules=getWarDefinition(this.field.site)!;
        if(rules.seatsPerSide!==null && sideSize>=rules.seatsPerSide)throw Error("war_side_full");
        war.side(this.field,member,Date.now(),true,characterId!);admissions.delete(characterId!);
        const seat={guild:member.id,side,camp:0};
        this.warSeats.set(client.sessionId,seat);
        this.warCivilianPositions.set(client.sessionId,{mapId,x:saved.x,y:saved.y,z:saved.z});
        if(rules.isolated){
          safeSpawn={...rules.isolated[side],y:0};
        }else if(rules.mode==="castle"){
          const defended=war.inspect(mapId,Date.now()).pilot?.throne?.defended;
          safeSpawn=pilotSpawn(war.muster(this.field,characterId!,credential.point),side,sideSize,defended);
          seat.camp=war.campPreference(this.field,characterId!);
        }else if(rules.mode==="river"){
          const node=side==="attack"?riverNodes.A:riverNodes.D;
          safeSpawn={x:node.x+sideSize*.6-1.2,y:0,z:node.z};
        }else{
          const gate=WORLD_MAPS[mapId].portals.find(p=>p.z===(side==="attack"?26:-58))!;
          // The river-watch defenders start inside their fort, west of the canal.
          // Keep world travel portals (and all other territory bases) unchanged.
          const base=side==="defend"?map.strategic?.defenderSpawn:undefined;
          safeSpawn={x:base?.x??gate.x,y:0,z:base?.z??gate.z};
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

      if(saved?.mixedSkillLoadouts)this.mixedSkillLoadouts.set(client.sessionId,saved.mixedSkillLoadouts);
      this.swordTrees.set(client.sessionId, saved?.swordTree ?? newSwordTree());
      this.muayCooldowns.set(client.sessionId, saved?.muayCooldowns ?? {});
      this.muayBooks.set(client.sessionId, saved?.muayBook ?? newMuayBook());
      this.occultBooks.set(client.sessionId, saved?.occultBook ?? newOccultBook());
      if(saved?.bladeBook || player.pathId==="blade")this.bladeBooks.set(client.sessionId, saved?.bladeBook ?? newBladeBook());
      if(saved?.sentinelBook || player.pathId==="sentinel")this.sentinelBooks.set(client.sessionId, saved?.sentinelBook ?? newSentinelBook());
      if (saved?.muayWrapGranted) this.muayWrapGranted.add(client.sessionId);
      this.statAllocations.set(client.sessionId, allocations);
      if(saved?.build) this.rebirthStates.set(client.sessionId,recordClassLevel(saved.rebirth ?? newRebirthState(),saved.build.path,Math.min(100,saved.level)));
      if(saved?.forestObjective)this.forestObjectives.set(client.sessionId,saved.forestObjective);
      if(saved?.directorClaims)this.directorClaims.set(client.sessionId,saved.directorClaims);
      if (saved?.inventory)this.inventories.set(client.sessionId,saved.inventory);
      const normalizedHp=saved ? saved.hp+(saved.masteryVitals?.hpRemainder??0):initialStats.maxHp;
      if(saved?.masteryVitals?.pvpUntil && saved.masteryVitals.pvpUntil>Date.now())this.lastPvpMs.set(client.sessionId,this.simulatedMs-PROGRESSION.combatQuietMs+Math.min(PROGRESSION.combatQuietMs,saved.masteryVitals.pvpUntil-Date.now()));
      this.applyStats(client.sessionId,player, allocations);
      const restoredScales=this.masteryScales.get(player)!;
      player.hp=Math.min(player.maxHp,normalizedHp>0?normalizedHp*(saved?.masteryVitals?restoredScales.hp:1):player.maxHp);
      player.mana=Math.min(player.maxMana,(saved?.mana??initialMaxMana)*(saved?.masteryVitals?restoredScales.mana:1));
      this.state.players.set(client.sessionId, player);this.syncSkillHotbar(client.sessionId);
      client.view=new StateView();
      this.syncPlayerViews();
      if((options as Record<string,unknown>)?.warVersion===1)this.warClients.add(client.sessionId);
      if(originalReady)this.originalReliefClients.add(client.sessionId);
      if(reliefReady)this.reliefClients.add(client.sessionId);
      if(homeReady)this.homeClients.add(client.sessionId);
      if(terrainReady)this.terrainClients.add(client.sessionId);
      if(riverReady)this.riverClients.add(client.sessionId);
      if(castleReady)this.castleClients.add(client.sessionId);
      if((options as {monsterAutoAttackVersion?:unknown}|undefined)?.monsterAutoAttackVersion===1)this.restApproachClients.add(client.sessionId);
      if(provinceReady)this.provinceClients.add(client.sessionId);
      if(atlasReady)this.atlasClients.add(client.sessionId);
      if(templeReady)this.templeClients.add(client.sessionId);
      if (characterId && accountId && slotIds) {
        if (!saved?.inventory) throw new Error("inventory_migration_missing");
        if (characterStore.economyEnabled) this.needs.set(client.sessionId, characterStore.economy.needsState(characterId));
        this.persistentCharacters.set(client.sessionId, characterId);
        if (saved.ghostPool || saved.ghostPot)
          this.ghostPools.set(client.sessionId, saved.ghostPool ?? makeGhostPool(saved.ghostPot));
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
      if(WORLD_EXPANSION && !this.field && process.env.MONTRA_DIRECTOR_ENABLED!=="0")try{client.send("director_event_state",{event:worldDirector.snapshot(),serverNow:Date.now()});}catch{}
      this.acknowledgePrototypeProtocol(client, fields);
      console.log("MONTRA 3-slot join:", client.sessionId, "room", this.roomId,
        saved ? "persistent" : "transient", "slot", slot);
    } catch (error) {
      this.clearPrototypeTransportSession(client.sessionId);
      this.warSeats.delete(client.sessionId);this.warClients.delete(client.sessionId);
      this.playerSpawn.delete(client.sessionId);
      this.warCivilianPositions.delete(client.sessionId);
      if (accountId) releaseCharacter(accountId, client.sessionId);
      throw error;
    }
  }

  async onLeave(client: Client, code: CloseCode) {
    const id = client.sessionId;
    this.clearPrototypeTransient(id);this.prototypeShadows.delete(id);this.prototypeFlowing.delete(id);this.prototypeCounters.delete(id);
    this.clearPrototypeTransportSession(id);
    this.boatWorld.leave(id,this.state.players);
    this.fishing.delete(id);
    this.huntNotified.delete(id);
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
    this.crestTurns.delete(id);this.gateActions.delete(id);this.warSeats.delete(id);this.warParticipation.delete(id);this.warCargo.delete(id);this.warClients.delete(id);this.warSent.delete(id);
    this.riverClients.delete(id);this.terrainClients.delete(id);this.reliefClients.delete(id);this.originalReliefClients.delete(id);
    this.castleClients.delete(id);
    this.restApproachClients.delete(id);
    this.provinceClients.delete(id);
    this.leaveParty(id);
    this.sessionGuilds.delete(id);
    this.lastBannerAt.delete(id);
    this.needs.delete(id);
    this.homeClients.delete(id);
    const homeOwner = this.persistentCharacters.get(id);
    if (homeOwner) this.homeWalls.delete(homeMapId(homeOwner));
    this.lastMeteorAt.delete(id);
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
      this.rebirthStates.delete(id);
      this.forestObjectives.delete(id);
      this.directorClaims.delete(id);
      this.forestDefenses.delete(id);
      this.forestEscorts.delete(id);
      this.mixedSkillLoadouts.delete(id);
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
      this.bladeCasts.delete(id);this.bladeRetreatUntil.delete(id);
      this.bladeMarks.delete(id);this.bladeOpenings.delete(id);this.bladeEvades.delete(id);this.bladeWindups.delete(id);
      this.occultMarks.delete(id);
      this.occultSpiritOrders.delete(id);
      this.clearOccultHealingField(id);
      this.clearOccultCurse(id,"left");
      for (const [target,curse] of this.occultCurses) if (curse.ownerId===id) this.clearOccultCurse(target,"owner_left");
      this.muayWrapGranted.delete(id);
      this.swordCombos.delete(id);
      this.swordGuards.delete(id);
      this.hpRegenRemainder.delete(id);
      this.inventories.delete(id);
      this.ghostPools.delete(id);
      this.activeGhosts.delete(id);
      this.ghostHealth.delete(id);
      this.ghostSkillUsage.delete(id);
      this.ghostAttackAt.delete(id);
      this.ghostCaptureReadyAt.delete(id);
      this.itemUseReadyAt.delete(id);
      this.lastInventoryReadMs.delete(id);
      this.lastStatusReadMs.delete(id);
      this.lastWeaponEquipMs.delete(id);
      this.playerSpawn.delete(id);
      this.warCivilianPositions.delete(id);
      this.pendingCharacterLeaves.delete(id);
      this.persistentCharacters.delete(id);
      this.guestSlotIds.delete(id);
      this.activeGuestAccounts.delete(id);
      if (accountId) releaseCharacter(accountId, id);
    }
    console.log("MONTRA S2 leave:", id, code);
  }

  async onDispose() {
    const worker = this.ghostWorker;
    this.ghostWorker = undefined;
    worker?.close();
    this.replacementSkillNotices.length = 0;
    this.prototypeSessions.clear(); this.prototypeBuckets.clear();this.prototypeGameplayChallenges.clear();this.prototypeGameplaySessions.clear();this.prototypeFirmGuards.clear();this.prototypeAshTraps.clear();this.prototypeRescues.clear();this.prototypeShadows.clear();this.prototypeFlowing.clear();this.prototypeCounters.clear();this.prototypeOpportunities.clear();this.prototypeDebuffs.clear();
    huntEventDirector.forget(this.roomId);
    if(this.field)battleRooms.delete(this.field.seq);
    this.buffs.clear();
    this.effects.clear();
    this.trades.clear();
    this.parties.clear();
    this.warBanners.clear();
    this.sessionGuilds.clear();
    this.lastBannerAt.clear();
    this.needs.clear();
    this.homeClients.clear();
    this.homeWalls.clear();
    this.lastMeteorAt.clear();
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
    this.rebirthStates.clear();this.forestObjectives.clear();this.directorClaims.clear();this.forestDefenses.clear();this.forestEscorts.clear();worldDirector.forget(this.roomId);
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
    this.bladeCasts.clear();this.bladeRetreatUntil.clear();
    this.bladeMarks.clear();this.bladeOpenings.clear();this.bladeEvades.clear();this.bladeWindups.clear();
    this.warParticipation.clear();this.warCargo.clear();
    this.occultSpiritPracticed.clear();
    this.occultMarks.clear();
    this.occultSpiritOrders.clear();
    this.occultHealingFields.clear();
    this.occultCurses.clear();this.seerBindings.clear();this.seerPoisons.clear();this.seerBuffaloCasts.clear();this.spiritNavigators.clear();this.priestSanctuaries.clear();this.priestRegens.clear();
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
    this.warCivilianPositions.clear();
    this.gates.clear();
    this.lastRejectNoticeMs.clear();
    this.monsterNavigator.clear();
    this.lastSummonAt.clear();
    this.lastSummonAttackAt.clear();
    this.ghostAttackAt.clear();
    this.ghostHealth.clear();
    this.ghostSkillUsage.clear();
    this.state.summons.clear();
    this.climbs.clear();
    this.flightTransitions.clear();
    this.activeDashes.clear();
    this.lastDashMs.clear();
    console.log("MONTRA Elevation room disposed:", this.roomId);
  }
}
