import {RULES} from "./GameRules.js";
import {DEFAULT_MAP_ID,groundAt} from "./WorldMaps.js";

export interface RespawnPlayer {
  hp:number;maxHp:number;alive:boolean;x:number;y:number;z:number;
  mapId:string;flying:boolean;facing:number;combatState:string;targetId:string;
}
export interface RespawnMonster {
  hp:number;maxHp:number;alive:boolean;x:number;y:number;z:number;
  facing:number;aiState:string;targetId:string;
}
export interface RespawnPorts<P extends RespawnPlayer> {
  now():number;
  clearMonsterNavigation():void;
  monsterRespawned():void;
  player(id:string):P|undefined;
  spawn(id:string):{x:number;z:number};
  clearVertical(id:string):void;
  clearDash(id:string):void;
  playerRespawned(id:string):void;
}
/** Room-local deadline ownership and in-place respawn transitions. Death/rewards,
 * spawn policy, movement ownership, delivery and persistence remain separate.
 * Iteration is deliberately live; callback exceptions and reentry are not hidden.
 */
export class RespawnLifecycle {
  private readonly players=new Map<string,number>();
  private monsterAt=0;
  schedulePlayer(id:string,at:number):void {this.players.set(id,at);}
  forgetPlayer(id:string):void {this.players.delete(id);}
  clearPlayers():void {this.players.clear();}
  scheduleMonster(at:number):void {this.monsterAt=at;}

  update<P extends RespawnPlayer>(monster:RespawnMonster,ports:RespawnPorts<P>):void {
    if (!monster.alive && this.monsterAt && ports.now() >= this.monsterAt) {
      monster.hp = monster.maxHp;
      ports.clearMonsterNavigation();
      monster.x = RULES.monsterSpawnX;
      monster.z = RULES.monsterSpawnZ;
      monster.y=groundAt(DEFAULT_MAP_ID,monster.x,monster.z);
      monster.facing = 0;
      monster.alive = true;
      monster.aiState = "patrol";
      monster.targetId = "";
      this.monsterAt = 0;
      ports.monsterRespawned();
    }
    for (const [id, atMs] of this.players) {
      if (ports.now() < atMs) continue;
      this.players.delete(id);
      const player = ports.player(id);
      if (!player) continue;
      const spawn=ports.spawn(id);
      player.hp = player.maxHp;
      player.alive = true;
      player.x = spawn.x;
      player.y = groundAt(player.mapId,spawn.x,spawn.z);
      player.z = spawn.z;
      ports.clearVertical(id);
      player.flying = false;
      ports.clearDash(id);
      player.facing = 0;
      player.combatState = "idle";
      player.targetId = "";
      ports.playerRespawned(id);
    }
  }
}
