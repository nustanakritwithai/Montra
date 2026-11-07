import {clampToMap, facingTo} from "./GameRules.js";
import {progressClimb, progressFlightHeight, type WorldPoint} from "./HeightRules.js";
import {getWorldMap, groundAt} from "./WorldMaps.js";

/** Only replicated fields touched by vertical locomotion; no room/combat/save access. */
export interface VerticalPlayer extends WorldPoint {
  mapId: string;
  alive: boolean;
  facing: number;
  combatState: string;
  flying: boolean;
}
export interface VerticalPlayers { get(id: string): VerticalPlayer | undefined; }

/** Owns transient transitions. Admission, cancellation policy and IO stay in the room. */
export class VerticalMovement {
  readonly climbs = new Map<string, WorldPoint>();
  readonly flightTransitions = new Map<string, {targetY: number; landing: boolean}>();
  updateClimbs(dt: number, players: VerticalPlayers, finished: (id: string, height: number) => void) {
    for (const [id,destination] of [...this.climbs]) {
      const player = players.get(id);
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
        finished(id, player.y);
      }
    }
  }

  /** Flight transitions are vertical only; horizontal movement begins on arrival. */
  updateFlights(dt: number, players: VerticalPlayers, finished: (id: string, altitude: number, flying: boolean) => void) {
    for (const [id, transition] of [...this.flightTransitions]) {
      const player = players.get(id);
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
      finished(id, player.y, player.flying);
    }
  }

}
