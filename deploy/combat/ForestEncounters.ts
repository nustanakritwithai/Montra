import { Monster, type MyRoomState, type Player } from "./schema/MyRoomState.js";
import { FOREST_CAMPS, WORLD_EXPANSION, getWorldMap, isRestArea } from "./WorldMaps.js";
import { facingTo, planarDistance, stepTowards } from "./GameRules.js";
import { MonsterRRTNavigator, isMonsterSegmentClear, MONSTER_NAV } from "./MonsterRRT.js";
import { isOnGround } from "./HeightRules.js";

export const FOREST_RESPAWN_MS = 25_000;
type Life = {x:number; z:number; respawnAt:number; lastAttack:number; returning:boolean; nav:MonsterRRTNavigator};
/** Bounded population, independent clocks and server-owned AI; no player-selected stats. */
export class ForestEncounters {
  private lives = new Map<string,Life>();
  private map = getWorldMap("forbidden_forest")!;
  private obstacles = this.map.obstacles.map(o=>({x:o.x-o.radius,z:o.z-o.radius,width:o.radius*2,length:o.radius*2}));
  constructor(private monsters: MyRoomState["monsters"]) {}
  initialize():void {
    if(!WORLD_EXPANSION)return;
    const offsets=[[-7,-7],[7,-7],[-7,7],[7,7]];
    for(const camp of FOREST_CAMPS) camp.levels.forEach((level,i)=>{
      const id=`forest_${camp.id}_${i+1}`,x=camp.x+offsets[i][0],z=camp.z+offsets[i][1];
      const hp=120+18*(level-1);
      this.monsters.set(id,new Monster({id,x,y:0,z,hp,maxHp:hp,alive:true,mapId:this.map.id,
        level,displayName:level<5?"ผีหลงป่า":level<9?"เงารากไม้":"วิญญาณอาคม",defense:30+4*level}));
      this.lives.set(id,{x,z,respawnAt:0,lastAttack:-Infinity,returning:false,nav:new MonsterRRTNavigator(this.obstacles,this.map.bounds)});
    });
  }
  kill(id:string,now:number):boolean {
    const m=this.monsters.get(id),life=this.lives.get(id);
    if(!m||!life||!m.alive)return false;
    m.alive=false;m.hp=0;m.targetId="";m.aiState="dead";
    life.respawnAt=now+FOREST_RESPAWN_MS;life.returning=false;life.nav.clear();return true;
  }
  clearTarget(id:string):void {for(const m of this.monsters.values())if(m.targetId===id)m.targetId="";}
  engaged(id:string):boolean {return [...this.monsters.values()].some(m=>m.alive&&m.targetId===id);}
  update(now:number,dt:number,players:MyRoomState["players"],blocked:ReadonlySet<string>,
    hit:(targetId:string,monster:Monster)=>void,respawn:(id:string)=>void):void {
    for(const [id,life] of this.lives){
      const m=this.monsters.get(id)!;
      if(!m.alive){
        if(now>=life.respawnAt){m.x=life.x;m.z=life.z;m.hp=m.maxHp;m.alive=true;m.aiState="patrol";m.targetId="";
          life.lastAttack=-Infinity;life.returning=false;life.nav.clear();respawn(id);}
        continue;
      }
      const eligible=(pid:string,p:Player|undefined):p is Player=>Boolean(p&&p.alive&&p.mapId===m.mapId&&
        !blocked.has(pid)&&isOnGround(p.y)&&!isRestArea(p.mapId,p));
      if(planarDistance(m,life)>=9)life.returning=true;
      let target=m.targetId?players.get(m.targetId):undefined;
      if(!eligible(m.targetId,target)||planarDistance(m,target)>11){target=undefined;m.targetId="";}
      if(!life.returning&&!target){let closest=6;for(const [pid,p] of players){
        if(!eligible(pid,p))continue;const d=planarDistance(m,p);if(d<closest){closest=d;target=p;m.targetId=pid;}
      }}
      let destination:{x:number;z:number},speed:number;
      if(life.returning){m.targetId="";m.aiState="return";destination=life;speed=2.4;
        if(planarDistance(m,life)<.2){life.returning=false;m.hp=m.maxHp;}}
      else if(target){m.facing=facingTo(target.x-m.x,target.z-m.z);
        if(planarDistance(m,target)<=1.65){m.aiState="attack";
          if(now-life.lastAttack>=1500&&isMonsterSegmentClear(m,target,this.obstacles,MONSTER_NAV.radius,this.map.bounds)){
            life.lastAttack=now;hit(m.targetId,m);
          }continue;
        }m.aiState="chase";destination=target;speed=1.9;
      }else{m.aiState="patrol";const phase=now/3000+life.x;
        destination={x:life.x+Math.cos(phase)*1.1,z:life.z+Math.sin(phase)*1.1};speed=.65;}
      const waypoint=life.nav.nextWaypoint(m,destination,now,m.aiState+":"+m.targetId);
      if(!waypoint)continue;
      const next=stepTowards(m,waypoint,speed*dt);
      if(!isRestArea(m.mapId,next)&&isMonsterSegmentClear(m,next,this.obstacles,MONSTER_NAV.radius,this.map.bounds)){
        m.facing=facingTo(next.x-m.x,next.z-m.z);m.x=next.x;m.z=next.z;
      }
    }
  }
}
