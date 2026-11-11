import {MIXED_SKILLS_ENABLED} from "../SkillHotbar.js";
import { Encoder, schema, t, type SchemaType } from "@colyseus/schema";

// The initial state carries all atlas and character skill definitions.
Encoder.BUFFER_SIZE = Math.max(Encoder.BUFFER_SIZE, 32 * 1024);

/**
 * Keep the original x/y/z field order so the current Web client retains its
 * expected contract. New fields describe authoritative server state.
 */
export const Player = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  z: t.number().default(0),
  facing: t.number().default(0), // radians; avatar forward points to -Z
  hp: t.number().default(100),
  maxHp: t.number().default(100),
  alive: t.boolean().default(true),
  combatState: t.string().default("idle"), // idle|moving|approaching|attacking|dead
  targetId: t.string().default(""),
  hitSeq: t.number().default(0),
  pkKills: t.number().default(0), // S2 persistent for guest characters
  pkDeaths: t.number().default(0),
  // Append only: keep the preceding Colyseus Schema indexes unchanged.
  characterId: t.string().default(""), // public short digest, never the secret guest token
  characterName: t.string().default("นที"),
  level: t.number().default(1),
  experience: t.number().default(0),
  persistent: t.boolean().default(false),
  characterSlot: t.number().default(1), // append only: preserve all S2 Schema indexes
  flying: t.boolean().default(false), // appended: active in the server-owned 6m air layer
  equippedWeaponId: t.string().default(""), // append-only: visible weapon ID, no private bag data
  mapId: t.string().default("ritual_village"), // logical zone, server-owned
  statPoints: t.number().default(0),
  atk: t.number().default(20),
  def: t.number().default(30),
  magicAtk: t.number().default(15),
  magicDef: t.number().default(20),
  stamina: t.number().default(100),
  maxStamina: t.number().default(100),
  xpToNext: t.number().default(150),
  possessionActive: t.boolean().default(false), // append-only: temporary server-owned buff
  pathId: t.string().default(""),
  ancestryId: t.string().default(""),
  classSkillReadyAt: t.number().default(0),
  wardTalentId: t.string().default(""),
  bladeTalentId: t.string().default(""),
  talismanReadyAt: t.number().default(0),
  swordTreeData: t.string().default(""),
  muayData: t.string().default(""),
  muayBookData: t.string().default(""),
  stunned: t.boolean().default(false), // server-owned, temporary PvP control
  mounted: t.boolean().default(false), // temporary horse mount; never stored in character saves
  mana: t.number().default(120),
  maxMana: t.number().default(120),
  gearLook: t.string().default(""), // append-only: visible worn gear "slot=family:tier;…", never bag contents
  skillHotbarVersion: t.number().default(MIXED_SKILLS_ENABLED?1:0),
  skillHotbarData: t.string().default(""),
  boatId: t.string().default(""),
}, "MontraPlayer");

export type Player = SchemaType<typeof Player>;

/**
 * Keep all existing monster fields in the same order; append AI state.
 */
export const Monster = schema({
  id: t.string().default("possessed-1"),
  x: t.number().default(1.1),
  y: t.number().default(0),
  z: t.number().default(10.4),
  hp: t.number().default(100),
  maxHp: t.number().default(100),
  alive: t.boolean().default(true),
  hitSeq: t.number().default(0),
  facing: t.number().default(0),
  aiState: t.string().default("patrol"), // patrol|chase|attack|return|dead
  targetId: t.string().default(""),
  mapId: t.string().default("ritual_village"),
  level: t.number().default(1),
  displayName: t.string().default("ผีสิง"),
  defense: t.number().default(100),
  tier: t.string().default("normal"),
}, "MontraMonster");

export type Monster = SchemaType<typeof Monster>;

/**
 * Each summon belongs to one room session and is replicated to every player.
 * Map key is the authoritative owner's Colyseus sessionId.
 */
export const SummonedGuardian = schema({
  ownerId: t.string().default(""),
  kind: t.string().default("guardian"),
  x: t.number().default(0),
  y: t.number().default(0),
  z: t.number().default(0),
  facing: t.number().default(0),
  action: t.string().default("follow"), // follow|chase|attack
  targetId: t.string().default(""),
  hitSeq: t.number().default(0),
}, "MontraSummonedGuardian");

export type SummonedGuardian = SchemaType<typeof SummonedGuardian>;

/**
 * The room synchronizes actual climbable geometry to clients. No client may
 * invent a higher wall or choose their player.y.
 */
export const Fortification = schema({
  id: t.string().default("watchwall-1"),
  x: t.number().default(8),
  z: t.number().default(4),
  width: t.number().default(1.4),
  length: t.number().default(8),
  height: t.number().default(4),
  ladderFootX: t.number().default(6.1),
  ladderFootZ: t.number().default(2.5),
  ladderTopX: t.number().default(8),
  ladderTopZ: t.number().default(2.5),
}, "MontraFortification");
export type Fortification = SchemaType<typeof Fortification>;

export const SailingBoat = schema({
  mapId: t.string().default(""),
  x: t.number().default(0),
  z: t.number().default(0),
  heading: t.number().default(0),
  speed: t.number().default(0),
  hp: t.number().default(0),
  maxHp: t.number().default(0),
  anchored: t.boolean().default(true),
  sunk: t.boolean().default(false),
  helmId: t.string().default(""),
}, "MontraSailingBoat");

export const MyRoomState = schema({
  // A per-client view permits server-side concealment without sending hidden positions.
  players: t.map(Player).view(),
  monster: Monster,
  summons: t.map(SummonedGuardian),
  fortification: Fortification,
  dashAvailable: t.boolean().default(true), // append: live server dash capability
  flightAvailable: t.boolean().default(true), // append: server supports fly/land commands
  inventoryAvailable: t.boolean().default(true), // append: server-owned permanent item slots
  weaponsAvailable: t.boolean().default(true), // append: permanent weapon kit + equip commands
  worldMapsAvailable: t.boolean().default(true), // server supports map-aware travel
  chatAvailable: t.boolean().default(true), // append-only: server relays map chat
  progressionAvailable: t.boolean().default(true),
  economyAvailable: t.boolean().default(false),
  partyAvailable: t.boolean().default(true),
  monsters: t.map(Monster),
  worldDefinition: t.string().default(""),
  guildAvailable: t.boolean().default(true),
  guildRolesAvailable: t.boolean().default(true),
  cityProductionAvailable: t.boolean().default(false),
  cityRecoveryAvailable: t.boolean().default(false),
  cityWorkshopSupported: t.boolean().default(false),
  cityPurchaseSupported: t.boolean().default(false),
  cityMissionSupported: t.boolean().default(false),
  cityGovernanceAvailable: t.boolean().default(false),
  extendedChatAvailable: t.boolean().default(true),
  buffsAvailable: t.boolean().default(true),
  forgeCatalog: t.string().default(""),
  buildCatalog: t.string().default(""),
  craftRecipe: t.string().default(""),
  ritualSkillsAvailable: t.boolean().default(true),
  swordTreeCatalog: t.string().default(""),
  territoryWarAvailable: t.boolean().default(false),
  muayBookCatalog: t.string().default(""),
  occultAvailable: t.boolean().default(true), // append-only: protects newer clients connecting to older servers
  bladeAvailable: t.boolean().default(true), // append-only: codeless fallback when the server is older
  sentinelAvailable: t.boolean().default(true), // append-only for staged client/server rollout
  mountAvailable: t.boolean().default(true), // append-only; older servers do not expose horse mounts
  forestObjectivesAvailable: t.boolean().default(false),
  ghostPotAvailable: t.boolean().default(false),
  boatsAvailable: t.boolean().default(false),
  boats: t.map(SailingBoat),
}, "MyRoomState");

export type MyRoomState = SchemaType<typeof MyRoomState>;
