import {RULES, facingTo, stepTowards, type Vec2} from "./GameRules.js";
import {advanceDash, type DashDirection} from "./DashRules.js";
import {isOnPlatform} from "./HeightRules.js";
import {getWorldMap, surfaceLayer} from "./WorldMaps.js";

export interface HorizontalPlayer {
  x:number; y:number; z:number; mapId:string; flying:boolean; mounted:boolean;
  facing:number; combatState:string; targetId:string;
}
export interface HorizontalSurface<P extends HorizontalPlayer> {
  canOccupy(x:number,z:number,layer:number,flying:boolean,mapId:string):boolean;
  moveOnSurface(player:P,x:number,z:number):void;
}
/** Owns transient horizontal locomotion. Admission and combat pursuit stay in the room. */
export class HorizontalMovement<P extends HorizontalPlayer> {
  readonly lastDashMs=new Map<string,number>();
  readonly destinations=new Map<string,Vec2>();
  readonly crestTurns=new Map<string,Vec2[]>();
  readonly activeDashes=new Map<string,DashDirection & {remaining:number}>();
  constructor(private readonly surface:HorizontalSurface<P>, private readonly dashFinished:(id:string,blocked:boolean)=>void){}
  private canOccupy(x:number,z:number,layer:number,flying:boolean,mapId:string){return this.surface.canOccupy(x,z,layer,flying,mapId);}
  private moveOnSurface(player:P,x:number,z:number){this.surface.moveOnSurface(player,x,z);}
  /** Returns true when this tick was consumed by a dash, including completion. */
  updateDash(sessionId:string,player:P,dt:number){
    const dash = this.activeDashes.get(sessionId);
    if (dash) {
      const move = advanceDash(
        player, dash,
        Math.min(dash.remaining, RULES.dashSpeed * dt),
        (x, z) => this.canOccupy(x,z,surfaceLayer(player), player.flying, player.mapId),
        getWorldMap(player.mapId)!.bounds,
      );
      this.moveOnSurface(player,move.x,move.z);
      player.facing = facingTo(dash.dx, dash.dz);
      dash.remaining = Math.max(0, dash.remaining - move.moved);
      if (move.blocked || dash.remaining < 0.0001) {
        this.activeDashes.delete(sessionId);
        player.combatState = "idle";
        this.dashFinished(sessionId, move.blocked);
      } else {
        player.combatState = "dashing";
      }
      return true;
    }

    return false;
  }
  updateDestination(sessionId:string,player:P,dt:number,moveSpeed:number){
    const destination=this.destinations.get(sessionId);
    const turns=destination && isOnPlatform(surfaceLayer(player))?this.crestTurns.get(sessionId):undefined;
    const target=turns?.[0] ?? destination;
    if (!target) {
      player.combatState = "idle";
      player.targetId = "";
      return;
    }
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    if(player.mounted){
      const distance=Math.hypot(dx,dz);
      if(distance<.035){player.combatState="idle";this.destinations.delete(sessionId);return;}
      const move=advanceDash(player,{dx:dx/distance,dz:dz/distance},Math.min(distance,moveSpeed*dt),
        (x,z)=>this.canOccupy(x,z,surfaceLayer(player),false,player.mapId),getWorldMap(player.mapId)!.bounds);
      if(move.moved)player.facing=facingTo(dx,dz);
      this.moveOnSurface(player,move.x,move.z);
      if(move.blocked || Math.hypot(target.x-player.x,target.z-player.z)<.035){this.destinations.delete(sessionId);player.combatState="idle";}
      else player.combatState="moving";
      return;
    }
    const next = stepTowards(player, target,
      moveSpeed * dt);
    if (next.moved) player.facing = facingTo(dx, dz);
    if (this.canOccupy(next.x,next.z,surfaceLayer(player),player.flying,player.mapId)) {
      this.moveOnSurface(player,next.x,next.z);
    } else {
      // Slide on the wall face if a legal axis exists; never tunnel through
      // solid geometry via client destinations or elevated edge tapping.
      if (this.canOccupy(next.x,player.z,surfaceLayer(player),player.flying,player.mapId)) this.moveOnSurface(player,next.x,player.z);
      else if (this.canOccupy(player.x,next.z,surfaceLayer(player),player.flying,player.mapId)) this.moveOnSurface(player,player.x,next.z);
      else {
        this.destinations.delete(sessionId);
        player.combatState = "idle";
        return;
      }
    }
    const arrived = Math.hypot(target.x-player.x,target.z-player.z) < .035;
    player.combatState = arrived ? "idle" : "moving";
    if(arrived){if(turns?.length)turns.shift();else this.destinations.delete(sessionId);}
  }
}
