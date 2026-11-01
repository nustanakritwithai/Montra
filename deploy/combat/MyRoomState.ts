import { schema, t, type SchemaType } from "@colyseus/schema";

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

export const MyRoomState = schema({
  players: t.map(Player),
  monster: Monster,
  summons: t.map(SummonedGuardian),
  fortification: Fortification,
  dashAvailable: t.boolean().default(true), // append: live server dash capability
  flightAvailable: t.boolean().default(true), // append: server supports fly/land commands
}, "MyRoomState");

export type MyRoomState = SchemaType<typeof MyRoomState>;
