// Adapted from Pirate Fruit 1d931558d7a484a1c321f719f07735195ae95801 (server/src/world/boatSimulation.ts).
import {
  AUTHORITATIVE_BOAT_DEFINITIONS,
  BOAT_BOARD_RANGE,
  BOAT_INPUT_MIN_INTERVAL_MS,
  BOAT_RESPAWN_MS,
  type BoatBerth,
  type BoatHarbor,
  type BoatWorldSnapshot,
} from './PirateBoatRules.js';

export interface CanonicalBoat {
  entityId: string;
  ownerId: string;
  definitionId: string;
  maxHp: number;
}

interface BoatRuntime extends BoatWorldSnapshot {
  throttle: number;
  steer: number;
  lastInputAt: number;
  launchHarbor?: BoatHarbor;
}

const snapshotOf = (boat: BoatRuntime): BoatWorldSnapshot => ({
  entityId: boat.entityId,
  ownerId: boat.ownerId,
  definitionId: boat.definitionId,
  islandId: boat.islandId,
  x: boat.x,
  z: boat.z,
  heading: boat.heading,
  speed: boat.speed,
  passage: boat.passage,
  hp: boat.hp,
  maxHp: boat.maxHp,
  anchor: boat.anchor,
  state: boat.state,
  helmId: boat.helmId,
  passengerIds: [...boat.passengerIds],
  respawnAt: boat.respawnAt,
});

/** Pure deterministic S17 simulation. No client position, damage, or HP is accepted. */
export class BoatSimulation {
  private readonly boats = new Map<string, BoatRuntime>();

  constructor(private readonly navigable: (mapId: string, x: number, z: number, radius: number) => boolean,
    private readonly harborFor: (mapId:string)=>BoatHarbor|undefined) {}

  serialize(): BoatWorldSnapshot[] {
    return [...this.boats.values()].map(snapshotOf);
  }

  stateOf(entityId: string): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    return boat ? snapshotOf(boat) : null;
  }

  summon(canonical: CanonicalBoat, islandId: string, now = Date.now(), launchHarbor?:BoatHarbor): BoatWorldSnapshot | null {
    const definition = AUTHORITATIVE_BOAT_DEFINITIONS[canonical.definitionId];
    const harbor = launchHarbor ?? this.harborFor(islandId);
    if (!definition || !harbor) return null;
    const previous = this.boats.get(canonical.entityId);
    if (previous && (previous.state === 'sunk' || previous.state === 'respawning')
      && previous.respawnAt !== undefined && now < previous.respawnAt) return null;
    const spawn = this.openDockSpawn(
      islandId,
      canonical.entityId,
      definition.collisionRadius,
      harbor,launchHarbor?0:6,
    );
    if (!spawn) return null;
    const boat: BoatRuntime = {
      entityId: canonical.entityId,
      ownerId: canonical.ownerId,
      definitionId: canonical.definitionId,
      islandId,
      x: spawn.x,
      z: spawn.z,
      heading: harbor.berth.heading,
      speed: 0,
      passage: 0,
      hp: previous && previous.hp > 0
        ? Math.min(canonical.maxHp, previous.hp)
        : canonical.maxHp,
      maxHp: canonical.maxHp,
      anchor: true,
      state: 'docked',
      helmId: undefined,
      passengerIds: [],
      throttle: 0,
      steer: 0,
      lastInputAt: 0,
      launchHarbor,
    };
    this.removePassenger(canonical.ownerId);
    this.boats.set(boat.entityId, boat);
    return snapshotOf(boat);
  }

  berthAvailable(entityId:string,mapId:string,point:{x:number;z:number},radius:number) {
    return this.navigable(mapId,point.x,point.z,radius) && [...this.boats.values()].every(other=>
      other.entityId===entityId || other.islandId!==mapId || other.state==="sunk" || other.state==="respawning" ||
      Math.hypot(point.x-other.x,point.z-other.z)>=radius+AUTHORITATIVE_BOAT_DEFINITIONS[other.definitionId]!.collisionRadius+1);
  }

  // The caller has checked the berth and committed all rider saves in this event turn.
  transfer(entityId:string,mapId:string,berth:BoatBerth,now:number):BoatWorldSnapshot {
    const boat=this.boats.get(entityId)!;
    Object.assign(boat,berth,{islandId:mapId,passage:boat.passage+1,speed:0,anchor:true,state:"docked",
      throttle:0,steer:0,lastInputAt:now,launchHarbor:undefined});
    return snapshotOf(boat);
  }

  /**
   * A world boat exists only while its owner is in the realtime session.
   * Owned-boat inventory/HP remains persistent; the physical entity does not.
   */
  despawnOwnedBy(characterId: string): BoatWorldSnapshot | null {
    for (const boat of this.boats.values()) {
      if (boat.ownerId !== characterId) continue;
      const snapshot = snapshotOf(boat);
      this.boats.delete(boat.entityId);
      return snapshot;
    }
    return null;
  }

  board(entityId: string, characterId: string, islandId: string, x: number, z: number): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    if (!boat || boat.islandId !== islandId || boat.state === 'sunk' || boat.state === 'respawning') return null;
    if (Math.hypot(boat.x - x, boat.z - z) > BOAT_BOARD_RANGE) return null;
    this.removePassenger(characterId);
    if (!boat.passengerIds.includes(characterId)) boat.passengerIds.push(characterId);
    return snapshotOf(boat);
  }

  takeHelm(entityId: string, characterId: string): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    if (!boat || !boat.passengerIds.includes(characterId) || boat.helmId && boat.helmId !== characterId) return null;
    if (boat.state === 'sunk' || boat.state === 'respawning') return null;
    boat.helmId = characterId;
    boat.anchor = false;
    return snapshotOf(boat);
  }

  leaveHelm(characterId: string): BoatWorldSnapshot | null {
    for (const boat of this.boats.values()) {
      if (boat.helmId !== characterId) continue;
      boat.helmId = undefined;
      boat.throttle = 0;
      boat.steer = 0;
      return snapshotOf(boat);
    }
    return null;
  }

  disembark(characterId: string): BoatWorldSnapshot | null {
    for (const boat of this.boats.values()) {
      const index = boat.passengerIds.indexOf(characterId);
      if (index < 0) continue;
      boat.passengerIds.splice(index, 1);
      if (boat.helmId === characterId) {
        boat.helmId = undefined;
        boat.throttle = 0;
        boat.steer = 0;
      }
      return snapshotOf(boat);
    }
    return null;
  }

  removePassenger(characterId: string): void {
    this.disembark(characterId);
  }

  setInput(
    now: number,
    characterId: string,
    entityId: string,
    throttle: number,
    steer: number,
    anchor?: boolean,
  ): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    if (!boat || boat.helmId !== characterId || boat.state === 'sunk' || boat.state === 'respawning') return null;
    if (now - boat.lastInputAt < BOAT_INPUT_MIN_INTERVAL_MS) return snapshotOf(boat);
    boat.lastInputAt = now;
    boat.throttle = Math.max(-1, Math.min(1, Number.isFinite(throttle) ? throttle : 0));
    boat.steer = Math.max(-1, Math.min(1, Number.isFinite(steer) ? steer : 0));
    if (typeof anchor === 'boolean') boat.anchor = anchor;
    return snapshotOf(boat);
  }

  tick(now: number, dtMs: number): void {
    const respawns: BoatWorldSnapshot[] = [];
    const collisionDamage: Array<{ boat: BoatWorldSnapshot; damage: number }> = [];
    const previous = new Map<string, { x: number; z: number }>();
    const dt = Math.max(0, Math.min(dtMs, 250)) / 1_000;

    for (const boat of this.boats.values()) {
      previous.set(boat.entityId, { x: boat.x, z: boat.z });
      if (boat.state === 'sunk' || boat.state === 'respawning') {
        if (boat.respawnAt !== undefined && now >= boat.respawnAt) {
          const harbor = boat.launchHarbor ?? this.harborFor(boat.islandId);
          if(!harbor)continue;
          const spawn = this.openDockSpawn(boat.islandId, boat.entityId, AUTHORITATIVE_BOAT_DEFINITIONS[boat.definitionId]!.collisionRadius, harbor);
          if (!spawn) continue;
          boat.x = spawn.x; boat.z = spawn.z; boat.heading = harbor.berth.heading;
          boat.hp = boat.maxHp; boat.state = 'docked'; boat.anchor = true;
          boat.speed = 0; boat.respawnAt = undefined;
        }
        continue;
      }
      const definition = AUTHORITATIVE_BOAT_DEFINITIONS[boat.definitionId]!;
      if (now - boat.lastInputAt > 400) { boat.throttle = 0; boat.steer = 0; }
      const target = boat.anchor
        ? 0
        : boat.throttle >= 0
          ? boat.throttle * definition.maxSpeed
          : boat.throttle * definition.reverseSpeed;
      const rate = boat.speed < target
        ? definition.acceleration
        : definition.drag * 8;
      const step = Math.max(-rate * dt, Math.min(rate * dt, target - boat.speed));
      boat.speed += step;
      const turnFactor = Math.max(0.12, Math.min(1, Math.abs(boat.speed) / 3));
      boat.heading -= boat.steer * definition.turnSpeed * turnFactor * (boat.speed < 0 ? -1 : 1) * dt;
      boat.x += Math.sin(boat.heading) * boat.speed * dt;
      boat.z += Math.cos(boat.heading) * boat.speed * dt;
      boat.state = Math.abs(boat.speed) > 0.15 ? 'sailing' : 'docked';
      if (!this.navigable(boat.islandId, boat.x, boat.z, definition.collisionRadius)) {
        const old = previous.get(boat.entityId)!;
        const impact = Math.abs(boat.speed);
        boat.x = old.x; boat.z = old.z; boat.speed = 0;
        if (impact < 1.5) continue;
        const damage = Math.min(24, Math.max(1, Math.round(impact * 3)));
        boat.hp = Math.max(0, boat.hp - damage);
        if (boat.hp === 0) this.sink(boat, now);
      }
    }

    const live = [...this.boats.values()].filter((boat) => boat.state !== 'sunk' && boat.state !== 'respawning');
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i]!; const b = live[j]!;
        if (a.islandId !== b.islandId) continue;
        const ar = AUTHORITATIVE_BOAT_DEFINITIONS[a.definitionId]!.collisionRadius;
        const br = AUTHORITATIVE_BOAT_DEFINITIONS[b.definitionId]!.collisionRadius;
        if (Math.hypot(a.x - b.x, a.z - b.z) >= ar + br) continue;
        const ap = previous.get(a.entityId)!; const bp = previous.get(b.entityId)!;
        a.x = ap.x; a.z = ap.z; b.x = bp.x; b.z = bp.z;
        a.speed *= -0.1; b.speed *= -0.1;
      }
    }

  }

  /**
   * Keep concurrent summons out of the same collision circle. Dock headings
   * are visual orientation only, so explicit harbor vectors extend later slots
   * into open water without assuming every legacy dock faces the same way.
   */
  private openDockSpawn(
    islandId: string,
    replacingEntityId: string,
    collisionRadius: number,
    harbor:BoatHarbor,
    maxOffset=6,
  ): { x: number; z: number } | null {
    const {berth:dock,offshore}=harbor;
    for (let distance = 0; distance <= maxOffset; distance += 2) {
      const x = dock.x + offshore.x * distance;
      const z = dock.z + offshore.z * distance;
      if(this.berthAvailable(replacingEntityId,islandId,{x,z},collisionRadius))return {x,z};
    }
    return null;
  }

  private sink(boat: BoatRuntime, now: number): void {
    boat.state = 'sunk';
    boat.speed = 0;
    boat.anchor = true;
    boat.throttle = 0;
    boat.steer = 0;
    boat.respawnAt = now + BOAT_RESPAWN_MS;
    boat.helmId = undefined;
    boat.passengerIds = [];
  }
}
