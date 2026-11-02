import { Monster, type MyRoomState, type Player } from "./schema/MyRoomState.js";
import { ATLAS_MAPS, ATLAS_SPAWNS, RIFT_WARDEN, isAtlasMap } from "./WorldAtlas.js";
import { TEMPLE_MAP, TEMPLE_SPAWNS } from "./TempleMap.js";
import { type WorldMapDefinition, type WorldWall, FOREST_CAMPS, SHRINE_GUARDIAN, WORLD_EXPANSION, getWorldMap, isRestArea } from "./WorldMaps.js";
import { facingTo, planarDistance, stepTowards } from "./GameRules.js";
import { MonsterRRTNavigator, isMonsterSegmentClear, MONSTER_NAV } from "./MonsterRRT.js";
import { isOnGround } from "./HeightRules.js";
import { FOREST_MONSTER_TIERS, MONSTER_CONFIG, monsterProfile, monsterRespawnDelay, type MonsterProfile, type MonsterTier } from "./MonsterProfiles.js";

export const FOREST_RESPAWN_MS = MONSTER_CONFIG.respawnMs;
type Navigation = {map:WorldMapDefinition; obstacles:WorldWall[]};
type Life = {actor:Monster;zone:Navigation; windupUntil:number; nextChargeAt:number; x:number; z:number; profile:MonsterProfile; respawnAt:number; lastAttack:number; returning:boolean; nav:MonsterRRTNavigator};
/** Bounded population, independent clocks and server-owned AI; no player-selected stats. */
export class ForestEncounters {
  private lives = new Map<string,Life>();
  private activeRegions = new Set<string>();
  private navigation(map:WorldMapDefinition): Navigation {
    const trees=map.obstacles.map(o=>({x:o.x-o.radius,z:o.z-o.radius,width:o.radius*2,length:o.radius*2}));
    return {map,obstacles:[...trees,...(map.walls ?? []),...(map.water ?? [])]};
  }
  constructor(private monsters: MyRoomState["monsters"], private tiers:Readonly<Record<string,MonsterTier>> = FOREST_MONSTER_TIERS) {}
  initialize():void {
    if(!WORLD_EXPANSION)return;
    const offsets = [[-7,-7],[7,-7],[-7,7],[7,7]];
    const normalSpawns = FOREST_CAMPS.flatMap(camp => camp.levels.map((level, i) => ({
      id: `forest_${camp.id}_${i + 1}`, level,
      name: level < 5 ? "ผีหลงป่า" : level < 9 ? "เงารากไม้" : "วิญญาณอาคม",
      x: camp.x + offsets[i][0], z: camp.z + offsets[i][1],
    })));
    const spawnIds = new Set(normalSpawns.map(spawn => spawn.id));
    // A full world room can populate every atlas hunting region at once.
    const totalSpawns = normalSpawns.length + TEMPLE_SPAWNS.length + ATLAS_SPAWNS.length + 2;
    if (totalSpawns > MONSTER_CONFIG.maxSpawnPointsPerRoom) throw new Error("monster_spawn_cap_exceeded");
    for (const [id, tier] of Object.entries(this.tiers)) {
      if (!spawnIds.has(id)) throw new Error("unknown_monster_spawn_tier");
      monsterProfile(1, tier);
    }
    const forest=this.navigation(getWorldMap("forbidden_forest")!);
    const temple=this.navigation(TEMPLE_MAP);
    const atlasNavigation=new Map(Object.values(ATLAS_MAPS).map(map=>[map.id,this.navigation(map)]));
    const spawns:{spawn:{id:string;x:number;z:number;level:number;name:string;tier?:MonsterTier};zone:Navigation}[]=[...[...normalSpawns,SHRINE_GUARDIAN].map(spawn=>({spawn,zone:forest})),
      ...TEMPLE_SPAWNS.map(spawn=>({spawn,zone:temple})),
      ...ATLAS_SPAWNS.map(spawn=>({spawn,zone:atlasNavigation.get(spawn.mapId)!}))];
    for (const {spawn,zone} of spawns) {
      const {id, x, z, level, name} = spawn;
      const tier:MonsterTier = spawn.tier ?? (id === SHRINE_GUARDIAN.id ? "elite" : (this.tiers[id] ?? "normal"));
      const base=monsterProfile(level,id===RIFT_WARDEN.id?"normal":tier);
      const profile:MonsterProfile=id===RIFT_WARDEN.id ? {...base,tier,maxHp:Math.round(base.maxHp*3.5),
        attack:Math.round(base.attack*1.55),defense:Math.round(base.defense*1.3)} : base;
      const actor=new Monster({id,x,y:0,z,hp:profile.maxHp,maxHp:profile.maxHp,
        alive:true,mapId:zone.map.id,level,tier,displayName:name,defense:profile.defense});
      if(!zone.map.region)this.monsters.set(id,actor);
      this.lives.set(id,{actor,zone,x,z,profile,respawnAt:0,lastAttack:-Infinity,returning:false,
        nextChargeAt:0,windupUntil:0,nav:new MonsterRRTNavigator(zone.obstacles,zone.map.bounds)});
    }
  }
  profile(id:string):MonsterProfile | null { return this.lives.get(id)?.profile ?? null; }
  kill(id:string,now:number,players?:MyRoomState["players"],blocked?:ReadonlySet<string>):boolean {
    const m=this.monsters.get(id),life=this.lives.get(id);
    if(!m||!life||!m.alive)return false;
    let nearby=0;
    if(players) for(const [playerId,player] of players) {
      if(player.alive && player.mapId===m.mapId && !blocked?.has(playerId) && !isRestArea(player.mapId,player) && planarDistance(player,m)<=MONSTER_CONFIG.populationRadius) nearby++;
    }
    m.alive=false;m.hp=0;m.targetId="";m.aiState="dead";
    life.windupUntil=0;life.nextChargeAt=0;
    life.respawnAt=now+(id===RIFT_WARDEN.id ? RIFT_WARDEN.respawnMs : id===SHRINE_GUARDIAN.id ? SHRINE_GUARDIAN.respawnMs : monsterRespawnDelay(nearby));life.returning=false;life.nav.clear();return true;
  }
  clearTarget(id:string):void {for(const m of this.monsters.values())if(m.targetId===id)m.targetId="";}
  engaged(id:string):boolean {return [...this.monsters.values()].some(m=>m.alive&&m.targetId===id);}
  update(now:number,dt:number,players:MyRoomState["players"],blocked:ReadonlySet<string>,
    hit:(targetId:string,monster:Monster,force?:number)=>void,respawn:(id:string)=>void):void {
    const occupied=new Set(Array.from(players.values(),p=>p.mapId));
    const regions=new Set([...occupied].filter(isAtlasMap));
    if(regions.size!==this.activeRegions.size || [...regions].some(id=>!this.activeRegions.has(id))){
      // Withdraw first, then add. Room-owned life clocks survive the last player leaving.
      for(const [id,life] of this.lives)if(life.zone.map.region && this.activeRegions.has(life.zone.map.id) && !regions.has(life.zone.map.id)){
        life.actor.targetId="";life.windupUntil=0;life.nav.clear();this.monsters.delete(id);
      }
      for(const [id,life] of this.lives)if(regions.has(life.zone.map.id) && !this.activeRegions.has(life.zone.map.id))this.monsters.set(id,life.actor);
      this.activeRegions=regions;
    }
    for(const [id,life] of this.lives){
      const {map,obstacles}=life.zone;
      if(map.region && !regions.has(map.id))continue;
      const m=this.monsters.get(id)!;
      if(!m.alive){
        if(now>=life.respawnAt){m.x=life.x;m.z=life.z;m.hp=m.maxHp;m.alive=true;m.aiState="patrol";m.targetId="";
          life.lastAttack=-Infinity;life.returning=false;life.nav.clear();respawn(id);}
        continue;
      }
      if(!occupied.has(m.mapId))continue;
      const eligible=(pid:string,p:Player|undefined):p is Player=>Boolean(p&&p.alive&&p.mapId===m.mapId&&
        !blocked.has(pid)&&isOnGround(p.y)&&!isRestArea(p.mapId,p));
      if (life.windupUntil > 0) {
        const target = players.get(m.targetId);
        if (now < life.windupUntil && eligible(m.targetId,target)) continue;
        life.windupUntil = 0;
        life.lastAttack = now;
        if (eligible(m.targetId,target) && planarDistance(m,target) <= (id===RIFT_WARDEN.id?RIFT_WARDEN:SHRINE_GUARDIAN).strikeRadius &&
            isMonsterSegmentClear(m,target,obstacles,MONSTER_NAV.radius,map.bounds)) hit(m.targetId,m,1.6);
        m.aiState="patrol";
        continue;
      }
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
          if(now-life.lastAttack>=1500&&isMonsterSegmentClear(m,target,obstacles,MONSTER_NAV.radius,map.bounds)){
            if((id===SHRINE_GUARDIAN.id || id===RIFT_WARDEN.id) && now>=life.nextChargeAt) {
              m.aiState="windup";
              life.windupUntil=now+1400;
              life.nextChargeAt=now+8000;
            } else {
              life.lastAttack=now;hit(m.targetId,m);
            }
          }continue;
        }m.aiState="chase";destination=target;speed=1.9;
      }else{m.aiState="patrol";const phase=now/3000+life.x;
        destination={x:life.x+Math.cos(phase)*1.1,z:life.z+Math.sin(phase)*1.1};speed=.65;}
      const waypoint=life.nav.nextWaypoint(m,destination,now,m.aiState+":"+m.targetId);
      if(!waypoint)continue;
      const next=stepTowards(m,waypoint,speed*dt);
      if(!isRestArea(m.mapId,next)&&isMonsterSegmentClear(m,next,obstacles,MONSTER_NAV.radius,map.bounds)){
        m.facing=facingTo(next.x-m.x,next.z-m.z);m.x=next.x;m.z=next.z;
      }
    }
  }
}
