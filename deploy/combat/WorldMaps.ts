/** MONTRA V0.2.8: declarative world geometry. No client coordinates are trusted. */
import { isFlightAltitude, isOnGround, isOnPlatform, isOnTop, touchesWallBody } from "./HeightRules.js";
export type WorldPoint = Readonly<{ x: number; y: number; z: number }>;
export type WorldObstacle = Readonly<{ id: string; x: number; z: number; radius: number }>;
export type WorldPortal = Readonly<{
  id: string; x: number; z: number; targetMapId: string; targetSpawn: WorldPoint;
}>;
export type WorldMapDefinition = Readonly<{
  id: string; name: string;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  spawn: WorldPoint;
  obstacles: readonly WorldObstacle[];
  portals: readonly WorldPortal[];
}>;
export const DEFAULT_MAP_ID = "ritual_village";
export const WORLD_MAPS: Readonly<Record<string, WorldMapDefinition>> = Object.freeze({
  ritual_village: {
    id: "ritual_village", name: "หมู่บ้านอาคม",
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawn: { x: 0, y: 0, z: 0 },
    obstacles: [],
    portals: [{ id: "village_to_forest", x: -4, z: -17,
      targetMapId: "forbidden_forest", targetSpawn: { x: 0, y: 0, z: 12 } }],
  },
  forbidden_forest: {
    id: "forbidden_forest", name: "ป่าต้องห้าม",
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawn: { x: 0, y: 0, z: 12 },
    obstacles: [
      { id: "tree-west-1", x: -6, z: 6, radius: 1.4 },
      { id: "tree-east-1", x: 7, z: 7, radius: 1.4 },
      { id: "tree-west-2", x: -15, z: -15, radius: 1.4 },
      { id: "tree-west-3", x: -16, z: -8, radius: 1.4 },
      { id: "tree-west-4", x: -14, z: 2, radius: 1.4 },
      { id: "tree-west-5", x: -15, z: 12, radius: 1.4 },
      { id: "tree-east-2", x: 15, z: -15, radius: 1.4 },
      { id: "tree-east-3", x: 15, z: -5, radius: 1.4 },
      { id: "tree-east-4", x: 15, z: 3, radius: 1.4 },
      { id: "tree-east-5", x: 15, z: 14, radius: 1.4 },
      { id: "stone-north-1", x: 5, z: -9, radius: 1.8 },
      { id: "stone-west-1", x: -9, z: -3, radius: 1.5 },
    ],
    portals: [{ id: "forest_to_village", x: 0, z: 14,
      targetMapId: "ritual_village", targetSpawn: { x: -4, y: 0, z: -15 } }],
  },
});
export function getWorldMap(mapId: string): WorldMapDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(WORLD_MAPS, mapId) ? WORLD_MAPS[mapId] : undefined;
}
export function isSafeWorldPoint(map: WorldMapDefinition, point: WorldPoint, radius = 0.4): boolean {
  if (![point.x, point.y, point.z, radius].every(Number.isFinite) || radius < 0) return false;
  if (point.x - radius < map.bounds.minX || point.x + radius > map.bounds.maxX ||
      point.z - radius < map.bounds.minZ || point.z + radius > map.bounds.maxZ) return false;
  // A saved height must be an actual walkable level, not just a finite number.
  // Only the village owns the existing watchwall and its elevated crest.
  if (map.id === DEFAULT_MAP_ID) {
    if (isOnGround(point.y)) {
      if (touchesWallBody(point.x, point.z, radius)) return false;
    } else if (isOnPlatform(point.y)) {
      if (!isOnTop(point.x, point.z)) return false;
    } else if (!isFlightAltitude(point.y)) return false;
  } else if (!isOnGround(point.y) && !isFlightAltitude(point.y)) return false;
  return map.obstacles.every(o => Math.hypot(point.x - o.x, point.z - o.z) > o.radius + radius);
}
export function getSafeMapSpawn(mapId: string, saved?: WorldPoint): WorldPoint {
  const map = getWorldMap(mapId);
  if (!map) throw new Error("unknown_character_map");
  if (saved && isSafeWorldPoint(map, saved)) return saved;
  if (!isSafeWorldPoint(map, map.spawn)) throw new Error("unsafe_world_spawn");
  return map.spawn;
}
