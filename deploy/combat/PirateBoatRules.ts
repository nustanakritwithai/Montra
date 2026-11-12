// Adapted from Pirate Fruit 1d931558d7a484a1c321f719f07735195ae95801 (shared/src/world/boats.ts).
/** S17 — canonical naval tuning shared by the authoritative server and render client. */
export interface AuthoritativeBoatDefinition {
  id: string;
  maxSpeed: number;
  acceleration: number;
  reverseSpeed: number;
  turnSpeed: number;
  drag: number;
  maxHp: number;
  collisionRadius: number;
}

export const AUTHORITATIVE_BOAT_DEFINITIONS: Record<string, AuthoritativeBoatDefinition> = {
  'training-dinghy': { id: 'training-dinghy', maxSpeed: 9, acceleration: 4.8, reverseSpeed: 3.2, turnSpeed: 1.35, drag: 0.72, maxHp: 130, collisionRadius: 2.6 },
};

export const BOAT_BOARD_RANGE = 10;
export const BOAT_INPUT_MIN_INTERVAL_MS = 50;
export const BOAT_RESPAWN_MS = 15_000;

/** Server-owned dock positions. A summon intent never contains a client position. */
export const BOAT_DOCK_SPAWNS: Record<string, { x: number; z: number; heading: number }> = {
  ritual_village: { x: 0, z: 51, heading: Math.PI / 2 },
  river_watch: { x: -98, z: 24, heading: 0 },
  drowned_marsh: { x: -109, z: -68, heading: 0 },
};

/** Unit vectors from each harbor into navigable water, independent of visual heading. */
export const BOAT_DOCK_OFFSHORE_DIRECTIONS: Record<string, { x: number; z: number }> = {
  ritual_village: { x: 1, z: 0 },
  river_watch: { x: 0, z: 1 },
  drowned_marsh: { x: 0, z: 1 },
};

export type BoatWorldState = 'docked' | 'sailing' | 'sunk' | 'respawning';

export interface BoatWorldSnapshot {
  entityId: string;
  ownerId: string;
  definitionId: string;
  islandId: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  hp: number;
  maxHp: number;
  anchor: boolean;
  state: BoatWorldState;
  helmId?: string;
  passengerIds: string[];
  respawnAt?: number;
}
