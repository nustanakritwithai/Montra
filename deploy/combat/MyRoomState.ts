import { schema, t, type SchemaType } from "@colyseus/schema";

// Preserve the existing player schema and its field order.
export const Player = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  z: t.number().default(0),
}, "MontraPlayer");

export type Player = SchemaType<typeof Player>;

// All combat values below are owned and changed by the server.
export const Monster = schema({
  id: t.string().default("possessed-1"),
  x: t.number().default(1.1),
  y: t.number().default(0),
  z: t.number().default(10.4),
  hp: t.number().default(100),
  maxHp: t.number().default(100),
  alive: t.boolean().default(true),
  hitSeq: t.number().default(0),
}, "MontraMonster");

export type Monster = SchemaType<typeof Monster>;

export const MyRoomState = schema({
  players: t.map(Player),
  monster: Monster,
}, "MyRoomState");

export type MyRoomState = SchemaType<typeof MyRoomState>;
