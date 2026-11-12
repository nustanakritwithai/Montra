import { facingTo, stepTowards, type Vec2 } from "./GameRules.js";
import { waterDepthAt } from "./GroundTerrain.js";
import { groundAt, getWorldMap, isSafeWorldPoint, provinceShotClear, WORLD_MAPS, type WorldMapDefinition, type WorldPoint } from "./WorldMaps.js";
import { BoatSimulation } from "./PirateBoatSimulation.js";
import {
  AUTHORITATIVE_BOAT_DEFINITIONS, type BoatBerth, type BoatPort, type BoatWorldSnapshot,
} from "./PirateBoatRules.js";

export const BOAT_SHORES: Readonly<Record<string,Vec2>> = Object.fromEntries(Object.values(WORLD_MAPS)
  .flatMap(map=>map.boatHarbor?[[map.id,map.boatHarbor.shore]]:[]));
export const BOAT_LAUNCH_RANGE = 3;
export const BOAT_DECK = {width: 2.1, length: 5.2, y: .88, helmZ: -1.2};
const PORT_BERTH_RANGE = 2.4;
const starter = AUTHORITATIVE_BOAT_DEFINITIONS["training-dinghy"]!;
// Pirate Fruit DeckSpace ratios, measured from Montra's water level.
const halfWidth = BOAT_DECK.width * .41 * 1.08;
const halfLength = BOAT_DECK.length * .31 * 1.08;
const helmSeat = {x:0,z:BOAT_DECK.helmZ};

type BoatIntent =
  | {action: "launch" | "helm" | "release" | "exit"}
  | {action: "board"; boatId: string}
  | {action: "warp"; gateId: string}
  | {action: "walk"; x: number; z: number}
  | {action: "input"; throttle: number; steer: number; anchor?: boolean; passage?: number};

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
    case "warp":
      return count===2 && typeof input.gateId==="string" && /^water_[a-z_]{1,90}$/.test(input.gateId)
        ? {action:"warp",gateId:input.gateId} : null;
    case "walk":
      return count === 3 && typeof input.x === "number" && typeof input.z === "number" &&
        Number.isFinite(input.x) && Number.isFinite(input.z) ? {action: "walk", x: input.x, z: input.z} : null;
    case "input":
      if (count !== 3+Number(input.anchor!==undefined)+Number(input.passage!==undefined) ||
          typeof input.throttle !== "number" || !Number.isFinite(input.throttle) || Math.abs(input.throttle) > 1 ||
          typeof input.steer !== "number" || !Number.isFinite(input.steer) || Math.abs(input.steer) > 1 ||
          (input.anchor !== undefined && typeof input.anchor !== "boolean") ||
          (input.passage!==undefined && (!Number.isSafeInteger(input.passage) || Number(input.passage)<0))) return null;
      return {action: "input", throttle: input.throttle, steer: input.steer,
        anchor: input.anchor as boolean | undefined, passage:input.passage as number|undefined};
    default: return null;
  }
}

function deckY(mapId:string) {
  return (getWorldMap(mapId)?.waterLevel??0)+BOAT_DECK.y;
}

export function boatCanSail(mapId: string, x: number, z: number, radius: number) {
  const map = getWorldMap(mapId);
  if (!map?.boatHarbor || x - radius < map.bounds.minX || x + radius > map.bounds.maxX ||
      z - radius < map.bounds.minZ || z + radius > map.bounds.maxZ || waterDepthAt(map,x,z)<.45) return false;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
    if (!waterDepthAt(map,px,pz) || map.walls?.some(w => px >= w.x && px <= w.x+w.width && pz >= w.z && pz <= w.z+w.length)) return false;
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
  return {x: boat.x + point.x*c + point.z*s, y: deckY(boat.islandId), z: boat.z - point.x*s + point.z*c};
}

function helmFacing(boat: BoatWorldSnapshot) {
  return facingTo(Math.sin(boat.heading),Math.cos(boat.heading));
}

function nearestPort(ports:readonly BoatPort[]|undefined,point:Vec2,side:"shore"|"berth",range=Infinity) {
  let nearest:BoatPort|undefined;
  for(const port of ports??[]){
    const distance=Math.hypot(point.x-port[side].x,point.z-port[side].z);
    if(distance<=range){nearest=port;range=distance;}
  }
  return nearest;
}

function groundContact(map: WorldMapDefinition, deck: WorldPoint, ground: WorldPoint, allowSubmerged = true) {
  const submerged = waterDepthAt(map,ground.x,ground.z) > .14;
  if ((submerged ? !allowSubmerged : Math.abs(ground.y-deck.y)>1.3) || !isSafeWorldPoint(map,ground) ||
      !provinceShotClear(map,{x:deck.x,y:deck.y+1,z:deck.z},{x:ground.x,y:ground.y+1,z:ground.z})) return null;
  return submerged ? "water" : "shore";
}

function exitGround(boat: BoatWorldSnapshot, point: WorldPoint): WorldPoint | null {
  const map = getWorldMap(boat.islandId)!;
  const port=nearestPort(map.boatPorts,boat,"berth",PORT_BERTH_RANGE);
  if(port){
    const ground={...port.shore,y:groundAt(map.id,port.shore.x,port.shore.z)};
    if(groundContact(map,point,ground,false))return ground;
  }
  let riverbed:WorldPoint|null=null;
  for (let r = 0; r <= 4.5; r += .5) {
    for (let i = 0; i < (r===0?1:16); i++) {
      const a = i * Math.PI / 8;
      const x = point.x + Math.cos(a)*r, z = point.z + Math.sin(a)*r;
      const ground={x,y:groundAt(map.id,x,z),z};
      const contact=groundContact(map,point,ground,riverbed===null);
      if(contact==="shore")return ground;
      if(contact==="water")riverbed??=ground;
    }
  }
  return riverbed;
}

type Rider = {boatId: string; position: Vec2; shore: WorldPoint; target?: Vec2};
type BoatPlayer = WorldPoint & {mapId: string; boatId: string; facing: number; combatState: string};
type BoatTransit = {boat:BoatWorldSnapshot;mapId:string;berth:BoatBerth;shore:WorldPoint};

export class MontraBoats {
  private readonly sim = new BoatSimulation(boatCanSail,id=>getWorldMap(id)?.boatHarbor);
  private readonly riders = new Map<string, Rider>();

  snapshot() { return this.sim.serialize(); }
  safeSave(id: string) { return this.riders.get(id)?.shore; }

  prepareTransit(id:string,player:BoatPlayer,gateId:string):BoatTransit|{reason:string} {
    const boat=this.sim.stateOf(player.boatId);
    if(!boat || boat.helmId!==id || boat.islandId!==player.mapId || boat.state==="sunk" || boat.state==="respawning")
      return {reason:"boat_gate_helm"};
    const gate=getWorldMap(boat.islandId)?.waterGates?.find(entry=>entry.id===gateId);
    if(!gate || Math.hypot(boat.x-gate.x,boat.z-gate.z)>gate.range)return {reason:"boat_gate_range"};
    const destination=getWorldMap(gate.targetMapId);
    const berth=destination?.waterGates?.find(entry=>entry.targetMapId===boat.islandId);
    const shore=(berth && nearestPort(destination?.boatPorts,berth,"berth")?.shore) ?? destination?.boatHarbor?.shore;
    if(!destination || !berth || !shore)return {reason:"boat_gate_unavailable"};
    const radius=AUTHORITATIVE_BOAT_DEFINITIONS[boat.definitionId]!.collisionRadius;
    if(!this.sim.berthAvailable(boat.entityId,destination.id,berth,radius))return {reason:"boat_gate_busy"};
    const shorePoint={...shore,y:groundAt(destination.id,shore.x,shore.z)};
    if(!isSafeWorldPoint(destination,shorePoint))return {reason:"boat_gate_unavailable"};
    return {boat,mapId:destination.id,berth:{x:berth.x,z:berth.z,heading:berth.heading},shore:shorePoint};
  }

  commitTransit(transit:BoatTransit,players:ReadonlyMap<string,BoatPlayer>,now:number) {
    const boat=this.sim.transfer(transit.boat.entityId,transit.mapId,transit.berth,now);
    for(const id of boat.passengerIds){
      const player=players.get(id)!,rider=this.riders.get(id)!;
      rider.shore=transit.shore;
      rider.target=undefined;
      player.mapId=boat.islandId;
      player.facing=boat.helmId===id?helmFacing(boat):player.facing+boat.heading-transit.boat.heading;
      Object.assign(player,toWorld(boat,rider.position));
    }
  }

  act(id: string, player: BoatPlayer, intent: Exclude<BoatIntent,{action:"warp"}>, now: number): boolean {
    const rider = this.riders.get(id);
    const boat = rider && this.sim.stateOf(rider.boatId);
    switch (intent.action) {
      case "launch": {
        const map = getWorldMap(player.mapId);
        const port=nearestPort(map?.boatPorts,player,"shore",BOAT_LAUNCH_RANGE);
        const shore=(port??map?.boatHarbor)?.shore;
        const owned = this.sim.stateOf("boat-"+id);
        if (rider || !shore || !map || waterDepthAt(map,player.x,player.z)>.14 ||
            Math.hypot(player.x-shore.x, player.z-shore.z) > BOAT_LAUNCH_RANGE ||
            owned?.passengerIds.length) return false;
        const launched = this.sim.summon({entityId:"boat-"+id,ownerId:id,definitionId:starter.id,
          maxHp:starter.maxHp}, player.mapId, now,port && port!==map.boatPorts?.[0]?port:undefined);
        return Boolean(launched);
      }
      case "board": {
        const target = this.sim.stateOf(intent.boatId);
        const map = getWorldMap(player.mapId), y = deckY(player.mapId);
        if (rider || !target || !map || target.islandId !== player.mapId) return false;
        const port=nearestPort(map.boatPorts,target,"berth",PORT_BERTH_RANGE);
        const atLanding=port && Math.hypot(player.x-port.shore.x,player.z-port.shore.z)<=1.6;
        if (Math.abs(target.speed) > 1 ||
            (!atLanding && Math.hypot(player.x-target.x, player.z-target.z) > 6.5) ||
            !groundContact(map,{x:target.x,y,z:target.z},player) ||
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
        rider.position = helmSeat;
        rider.target = undefined;
        if(player.combatState==="idle")player.facing=helmFacing(boat);
        Object.assign(player, toWorld(boat,rider.position));
        return true;
      case "release":
        return Boolean(boat && this.sim.leaveHelm(id));
      case "exit": {
        const ground = boat && Math.abs(boat.speed) <= 1 ? exitGround(boat,player) : null;
        if (!ground) return false;
        this.detach(id,player,ground);
        return true;
      }
      case "walk":
        return Boolean(boat && boat.helmId!==id && this.walkLocal(id,intent));
      case "input":
        return Boolean(boat && boat.helmId === id && (intent.passage===undefined || intent.passage===boat.passage) &&
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
      if (boat.helmId===id) {
        if(player.combatState==="idle")player.facing=helmFacing(boat);
      } else if (rider.target && canWalk(id)) {
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
