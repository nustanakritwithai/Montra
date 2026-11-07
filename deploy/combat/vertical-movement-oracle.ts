// Frozen pre-extraction tick oracle from 8fb3629; do not update with implementation.
import {clampToMap, facingTo} from "./GameRules.js";
import {progressClimb, progressFlightHeight, type WorldPoint} from "./HeightRules.js";
import {getWorldMap, groundAt} from "./WorldMaps.js";
import {Player} from "./schema/MyRoomState.js";
export class LegacyVerticalMovement {
  state={players:new Map<string,Player>()};
  climbs=new Map<string,WorldPoint>();
  flightTransitions=new Map<string,{targetY:number;landing:boolean}>();
  events:unknown[]=[];
  broadcast(...args:unknown[]){this.events.push(args);}
  saveCharacter(id:string){this.events.push(["save",id]);}
  updateClimbs(dt: number) {
    for (const [id,destination] of [...this.climbs]) {
      const player = this.state.players.get(id);
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
        this.broadcast("climb_finished", {
          playerId:id, height:player.y,
        }, { afterNextPatch:true });
      }
    }
  }

  /** Flight transitions are vertical only; horizontal movement begins on arrival. */
  updateFlights(dt: number) {
    for (const [id, transition] of [...this.flightTransitions]) {
      const player = this.state.players.get(id);
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
      this.broadcast("flight_finished", {
        playerId: id, altitude: player.y, flying: player.flying,
      }, { afterNextPatch: true });
      void this.saveCharacter(id);
    }
  }

}
