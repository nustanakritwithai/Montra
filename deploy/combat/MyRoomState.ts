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

export const MyRoomState = schema({
  players: t.map(Player),
  monster: Monster,
}, "MyRoomState");

export type MyRoomState = SchemaType<typeof MyRoomState>;
