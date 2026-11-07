import {RULES} from "./GameRules.js";
import {DEFAULT_MAP_ID,groundAt} from "./WorldMaps.js";
import {Monster,Player} from "./schema/MyRoomState.js";
/** Frozen verbatim updateRespawns body from 6756eca. Never revise to fit runtime. */
export class LegacyRespawns {
  simulatedMs=0;
  state={monster:new Monster(),players:new Map<string,Player>()};
  monsterRespawnAt=0; lastMonsterAttackMs=0;
  playerRespawnAt=new Map<string,number>();
  playerSpawn=new Map<string,{x:number;z:number}>();
  warSeats=new Map<string,{camp:string}>();
  clients:Array<{sessionId:string;send:(type:string,payload:unknown)=>void}>=[];
  monsterNavigator={clear:()=>{}};
  climbs=new Map<string,unknown>(); flightTransitions=new Map<string,unknown>(); activeDashes=new Map<string,unknown>(); lastAttackMs=new Map<string,number>();
  fieldCamp(_id:string,_camp:string):{x:number;z:number}|undefined{return undefined;}
  broadcast(_type:string,_payload:unknown):void{}
  saveCharacter(_id:string):void{}
  updateRespawns() {
    const monster = this.state.monster;
    if (!monster.alive && this.monsterRespawnAt &&
        this.simulatedMs >= this.monsterRespawnAt) {
      monster.hp = monster.maxHp;
      this.monsterNavigator.clear();
      monster.x = RULES.monsterSpawnX;
      monster.z = RULES.monsterSpawnZ;
      monster.y=groundAt(DEFAULT_MAP_ID,monster.x,monster.z);
      monster.facing = 0;
      monster.alive = true;
      monster.aiState = "patrol";
      monster.targetId = "";
      this.monsterRespawnAt = 0;
      this.lastMonsterAttackMs = -Infinity;
      this.broadcast("monster_respawn", { targetId: RULES.monsterId });
    }

    for (const [id, atMs] of this.playerRespawnAt) {
      if (this.simulatedMs < atMs) continue;
      this.playerRespawnAt.delete(id);
      const player = this.state.players.get(id);
      if (!player) continue;
      const camp=this.warSeats.get(id)?.camp;
      const front=camp?this.fieldCamp(id,camp):undefined;
      const spawn=front ?? this.playerSpawn.get(id) ?? {x:0,z:0};
      if(camp && !front)this.clients.find(c=>c.sessionId===id)?.send("territory_error",{reason:"war_camp_fallback"});
      player.hp = player.maxHp;
      player.alive = true;
      player.x = spawn.x;
      player.y = groundAt(player.mapId,spawn.x,spawn.z);
      player.z = spawn.z;
      this.climbs.delete(id);
      this.flightTransitions.delete(id);
      player.flying = false;
      this.activeDashes.delete(id);
      player.facing = 0;
      player.combatState = "idle";
      player.targetId = "";
      this.lastAttackMs.delete(id);
      this.broadcast("player_respawn", { playerId: id });
      void this.saveCharacter(id);
    }
  }

}
