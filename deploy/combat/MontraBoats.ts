import { stepTowards, type Vec2 } from "./GameRules.js";
import { groundAt, getWorldMap, isSafeWorldPoint, provinceShotClear, type WorldPoint } from "./WorldMaps.js";
import { BoatSimulation } from "./PirateBoatSimulation.js";
import {
  AUTHORITATIVE_BOAT_DEFINITIONS, BOAT_DOCK_SPAWNS, type BoatWorldSnapshot,
} from "./PirateBoatRules.js";

export const BOAT_SHORES: Readonly<Record<string, Vec2>> = {
  ritual_village: {x: 0, z: 46},
  river_watch: {x: -92.7, z: 24},
};
export const BOAT_LAUNCH_RANGE = 3;
export const BOAT_DECK = {width: 2.1, length: 5.2, y: .88};
const starter = AUTHORITATIVE_BOAT_DEFINITIONS["training-dinghy"]!;
// Pirate Fruit DeckSpace ratios, projected onto Montra's flat authoritative water.
const halfWidth = BOAT_DECK.width * .41 * 1.08;
const halfLength = BOAT_DECK.length * .31 * 1.08;

type BoatIntent =
  | {action: "launch" | "helm" | "release" | "exit"}
  | {action: "board"; boatId: string}
  | {action: "walk"; x: number; z: number}
  | {action: "input"; throttle: number; steer: number; anchor?: boolean};

export function parseBoatIntent(message: unknown): BoatIntent | null {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const input = message as Record<string, unknown>;
  const count = Object.keys(input).length;
  switch (input.action) {
    case "launch": case "helm": case "release": case "exit":
      return count === 1 ? {action: input.action} : null;
    case "board":
      return count === 2 && typeof input.boatId === "string" && /^boat-[\w-]{1,64}$/.test(input.boatId)
        ? {action: "board", boatId: input.boatId} : null;
    case "walk":
      return count === 3 && typeof input.x === "number" && typeof input.z === "number" &&
        Number.isFinite(input.x) && Number.isFinite(input.z) ? {action: "walk", x: input.x, z: input.z} : null;
    case "input":
      if (count !== (input.anchor === undefined ? 3 : 4) ||
          typeof input.throttle !== "number" || !Number.isFinite(input.throttle) || Math.abs(input.throttle) > 1 ||
          typeof input.steer !== "number" || !Number.isFinite(input.steer) || Math.abs(input.steer) > 1 ||
          (input.anchor !== undefined && typeof input.anchor !== "boolean")) return null;
      return {action: "input", throttle: input.throttle, steer: input.steer, anchor: input.anchor as boolean | undefined};
    default: return null;
  }
}

function inWater(mapId: string, x: number, z: number) {
  return Boolean(getWorldMap(mapId)?.water?.some(w => x >= w.x && x <= w.x + w.width && z >= w.z && z <= w.z + w.length));
}

export function boatCanSail(mapId: string, x: number, z: number, radius: number) {
  const map = getWorldMap(mapId);
  if (!map || !BOAT_SHORES[mapId] || x - radius < map.bounds.minX || x + radius > map.bounds.maxX ||
      z - radius < map.bounds.minZ || z + radius > map.bounds.maxZ || !inWater(mapId, x, z)) return false;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
    if (!inWater(mapId, px, pz) || map.walls?.some(w => px >= w.x && px <= w.x+w.width && pz >= w.z && pz <= w.z+w.length)) return false;
  }
  return !map.obstacles.some(o => Math.hypot(x-o.x, z-o.z) < o.radius+radius);
}

function toLocal(boat: BoatWorldSnapshot, point: Vec2): Vec2 {
  const dx = point.x - boat.x, dz = point.z - boat.z;
  const c = Math.cos(boat.heading), s = Math.sin(boat.heading);
  return {x: dx*c - dz*s, z: dx*s + dz*c};
}

function toWorld(boat: BoatWorldSnapshot, point: Vec2): WorldPoint {
  const c = Math.cos(boat.heading), s = Math.sin(boat.heading);
  return {x: boat.x + point.x*c + point.z*s, y: BOAT_DECK.y, z: boat.z - point.x*s + point.z*c};
}

function landNear(boat: BoatWorldSnapshot, point: WorldPoint): WorldPoint | null {
  const map = getWorldMap(boat.islandId)!;
  const eye = {x:point.x,y:point.y+1,z:point.z};
  for (let r = .5; r <= 4.5; r += .5) {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const x = point.x + Math.cos(a)*r, z = point.z + Math.sin(a)*r;
      const y = groundAt(map.id, x, z);
      if (!inWater(map.id, x, z) && isSafeWorldPoint(map, {x,y,z}) &&
          Math.abs(y-point.y) <= 1.3 && provinceShotClear(map, eye, {x,y:y+1,z})) {
        return {x,y,z};
      }
    }
  }
  return null;
}

type Rider = {boatId: string; position: Vec2; shore: WorldPoint; target?: Vec2};
type BoatPlayer = WorldPoint & {mapId: string; boatId: string; facing: number; combatState: string};

export class MontraBoats {
  private readonly sim = new BoatSimulation(boatCanSail);
  private readonly riders = new Map<string, Rider>();

  snapshot() { return this.sim.serialize(); }
  safeSave(id: string) { return this.riders.get(id)?.shore; }

  act(id: string, player: BoatPlayer, intent: BoatIntent, now: number): boolean {
    const rider = this.riders.get(id);
    const boat = rider && this.sim.stateOf(rider.boatId);
    switch (intent.action) {
      case "launch": {
        const shore = BOAT_SHORES[player.mapId];
        const owned = this.sim.stateOf("boat-"+id);
        if (rider || !shore || Math.hypot(player.x-shore.x, player.z-shore.z) > BOAT_LAUNCH_RANGE ||
            owned?.passengerIds.length || !BOAT_DOCK_SPAWNS[player.mapId]) return false;
        const launched = this.sim.summon({entityId:"boat-"+id,ownerId:id,definitionId:starter.id,
          maxHp:starter.maxHp}, player.mapId, now);
        return Boolean(launched);
      }
      case "board": {
        const target = this.sim.stateOf(intent.boatId);
        if (rider || !target || target.islandId !== player.mapId || Math.abs(target.speed) > 1 ||
            inWater(player.mapId,player.x,player.z) ||
            !landNear(target, {x:target.x,y:BOAT_DECK.y,z:target.z}) ||
            Math.hypot(player.x-target.x, player.z-target.z) > 6.5 ||
            !provinceShotClear(getWorldMap(player.mapId)!, {x:player.x,y:player.y+1,z:player.z},
              {x:target.x,y:BOAT_DECK.y+1,z:target.z}) ||
            !this.sim.board(intent.boatId, id, player.mapId, player.x, player.z)) return false;
        const shore = {x:player.x,y:player.y,z:player.z};
        const local = toLocal(target, player);
        const position = {x:Math.max(-halfWidth,Math.min(halfWidth,local.x)),z:Math.max(-halfLength,Math.min(halfLength,local.z))};
        this.riders.set(id,{boatId:intent.boatId,position,shore});
        player.boatId = intent.boatId;
        Object.assign(player, toWorld(target, position));
        return true;
      }
      case "helm":
        if (!rider || !boat || !this.sim.takeHelm(rider.boatId,id)) return false;
        rider.position = {x:0,z:-halfLength*.66};
        rider.target = undefined;
        Object.assign(player, toWorld(boat,rider.position));
        return true;
      case "release":
        return Boolean(boat && this.sim.leaveHelm(id));
      case "exit": {
        const land = boat && Math.abs(boat.speed) <= 1 ? landNear(boat,player) : null;
        if (!land) return false;
        this.detach(id,player,land);
        return true;
      }
      case "walk":
        return this.walkLocal(id,intent);
      case "input":
        return Boolean(boat && boat.helmId === id &&
          this.sim.setInput(now,id,boat.entityId,intent.throttle,intent.steer,intent.anchor));
    }
  }

  walk(id: string, point: Vec2) {
    const rider = this.riders.get(id);
    const boat = rider && this.sim.stateOf(rider.boatId);
    if (!rider || !boat || boat.helmId === id) return false;
    return this.walkLocal(id,toLocal(boat,point));
  }

  private walkLocal(id: string, local: Vec2) {
    const rider = this.riders.get(id);
    const boat = rider && this.sim.stateOf(rider.boatId);
    if (!rider || !boat || boat.helmId === id) return false;
    if (Math.abs(local.x) > halfWidth+.18 || Math.abs(local.z) > halfLength+.18) return false;
    rider.target = {x:Math.max(-halfWidth,Math.min(halfWidth,local.x)),z:Math.max(-halfLength,Math.min(halfLength,local.z))};
    return true;
  }

  stopWalking(id: string) {
    const rider = this.riders.get(id);
    if (rider) rider.target = undefined;
  }

  tick(now: number, dt: number, players: Pick<ReadonlyMap<string, BoatPlayer>, "get">, canWalk: (id: string) => boolean) {
    this.sim.tick(now, dt * 1000);
    const boats = new Map(this.snapshot().map(boat => [boat.entityId,boat]));
    for (const [id,rider] of this.riders) {
      const player = players.get(id), boat = boats.get(rider.boatId);
      if (!player || !boat || !boat.passengerIds.includes(id) || boat.islandId !== player.mapId) {
        this.detach(id,player);
        continue;
      }
      if (rider.target && canWalk(id)) {
        const previous = toWorld(boat,rider.position);
        const next = stepTowards(rider.position,rider.target,3.1*dt);
        rider.position = next;
        const position = toWorld(boat,next);
        if (next.moved) player.facing = Math.atan2(position.x-previous.x,position.z-previous.z);
        player.combatState = next.arrived ? "idle" : "moving";
        if (next.arrived) rider.target = undefined;
      }
      Object.assign(player,toWorld(boat,rider.position));
    }
    return boats;
  }

  detach(id: string, player?: BoatPlayer, land?: WorldPoint) {
    const rider = this.riders.get(id);
    if (!rider) return;
    this.sim.disembark(id);
    this.riders.delete(id);
    if (player) {
      player.boatId = "";
      if (land) Object.assign(player,land);
      else if (this.sim.stateOf(rider.boatId)?.islandId === player.mapId) Object.assign(player,rider.shore);
    }
  }

  leave(id: string, players: Pick<ReadonlyMap<string, BoatPlayer>, "get">) {
    this.detach(id,players.get(id));
    const boat = this.sim.stateOf("boat-"+id);
    for (const passenger of boat?.passengerIds ?? []) this.detach(passenger,players.get(passenger));
    this.sim.despawnOwnedBy(id);
  }
}
