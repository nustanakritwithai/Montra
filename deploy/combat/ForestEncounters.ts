import { Monster, type MyRoomState, type Player } from "./schema/MyRoomState.js";
import { ATLAS_SPAWNS, FRONTIER_SPAWNS } from "./WorldAtlas.js";
import {REGIONAL_BOSSES} from "./RegionalBosses.js";
import { TEMPLE_MAP, TEMPLE_SPAWNS } from "./TempleMap.js";
import { type WorldMapDefinition, type WorldWall, FOREST_CAMPS, SHRINE_GUARDIAN, WORLD_EXPANSION, WORLD_ROOM_CAPACITY, getWorldMap, groundAt, onMapGround, isRestArea, isWorldSegmentClear } from "./WorldMaps.js";
import { facingTo, planarDistance, stepTowards } from "./GameRules.js";
import { MonsterRRTNavigator, isMonsterSegmentClear, MONSTER_NAV } from "./MonsterRRT.js";
import { distance3d } from "./HeightRules.js";
import { FOREST_MONSTER_TIERS, MONSTER_CONFIG, monsterProfile, monsterRespawnDelay, type MonsterProfile, type MonsterTier } from "./MonsterProfiles.js";

export const FOREST_RESPAWN_MS = MONSTER_CONFIG.respawnMs;
type Navigation = {map:WorldMapDefinition; obstacles:WorldWall[]};
type Life = {actor:Monster;zone:Navigation; windupUntil:number; nextChargeAt:number; interruptUntil:number; interruptResistUntil:number; tauntOwner:string; tauntUntil:number; tauntResistUntil:number; x:number; z:number; profile:MonsterProfile; respawnAt:number; lastAttack:number; returning:boolean; nav:MonsterRRTNavigator};
/** Bounded population, independent clocks and server-owned AI; no player-selected stats. */
export class ForestEncounters {
  private lives = new Map<string,Life>();
  private regionalMaps = new Set<string>();
  private activeRegions = new Set<string>();
  private navigation(map:WorldMapDefinition): Navigation {
    const trees=map.obstacles.map(o=>({x:o.x-o.radius,z:o.z-o.radius,width:o.radius*2,length:o.radius*2}));
    return {map,obstacles:[...trees,...(map.walls ?? []),...(map.water ?? [])]};
  }
  constructor(private monsters: MyRoomState["monsters"], private tiers:Readonly<Record<string,MonsterTier>> = FOREST_MONSTER_TIERS) {}
  initialize(includeRegionalBosses=true):void {
    if(!WORLD_EXPANSION)return;
    const offsets = [[-7,-7],[7,-7],[-7,7],[7,7]];
    const normalSpawns = FOREST_CAMPS.flatMap(camp => camp.levels.map((level, i) => ({
      id: `forest_${camp.id}_${i + 1}`, level,
      name: level < 5 ? "ผีหลงป่า" : level < 9 ? "เงารากไม้" : "วิญญาณอาคม",
      x: camp.x + offsets[i][0], z: camp.z + offsets[i][1],
    })));
    const spawnIds = new Set(normalSpawns.map(spawn => spawn.id));
    // A full world room can populate every atlas hunting region at once.
    const bosses=includeRegionalBosses?REGIONAL_BOSSES.filter(b=>getWorldMap(b.mapId)?.boss?.id===b.id):[];
    const templeSpawns=[...TEMPLE_SPAWNS,...bosses.filter(b=>b.mapId===TEMPLE_MAP.id)];
    const regionalSpawns=[...ATLAS_SPAWNS,...FRONTIER_SPAWNS,...bosses.filter(b=>b.mapId!==TEMPLE_MAP.id)];
    const totalSpawns=normalSpawns.length+templeSpawns.length+regionalSpawns.length+2;
    if (totalSpawns > MONSTER_CONFIG.maxSpawnPointsPerRoom) throw new Error("monster_spawn_cap_exceeded");
    for (const [id, tier] of Object.entries(this.tiers)) {
      if (!spawnIds.has(id)) throw new Error("unknown_monster_spawn_tier");
      monsterProfile(1, tier);
    }
    const forest=this.navigation(getWorldMap("forbidden_forest")!);
    const temple=this.navigation(getWorldMap(TEMPLE_MAP.id)!);
    this.regionalMaps=new Set(regionalSpawns.map(s=>s.mapId));
    const regionalNavigation=new Map([...this.regionalMaps].map(id=>[id,this.navigation(getWorldMap(id)!)]));
    const spawns:{spawn:{id:string;x:number;z:number;level:number;name:string;tier?:MonsterTier};zone:Navigation}[]=[...[...normalSpawns,SHRINE_GUARDIAN].map(spawn=>({spawn,zone:forest})),
      ...templeSpawns.map(spawn=>({spawn,zone:temple})),
      ...regionalSpawns.map(spawn=>({spawn,zone:regionalNavigation.get(spawn.mapId)!}))];
    for (const {spawn,zone} of spawns) {
      const {id, x, z, level, name} = spawn;
      const tier:MonsterTier = spawn.tier ?? (id === SHRINE_GUARDIAN.id ? "elite" : (this.tiers[id] ?? "normal"));
      const base=monsterProfile(level,tier==="boss"?"normal":tier);
      const profile:MonsterProfile=tier==="boss" ? {...base,tier,maxHp:Math.round(base.maxHp*3.5),
        attack:Math.round(base.attack*1.55),defense:Math.round(base.defense*1.3)} : base;
      const actor=new Monster({id,x,y:groundAt(zone.map.id,x,z),z,hp:profile.maxHp,maxHp:profile.maxHp,
        alive:true,mapId:zone.map.id,level,tier,displayName:name,defense:profile.defense});
      if(!this.regionalMaps.has(zone.map.id))this.monsters.set(id,actor);
      this.lives.set(id,{actor,zone,x,z,profile,respawnAt:0,lastAttack:-Infinity,returning:false,
        nextChargeAt:0,windupUntil:0,interruptUntil:0,interruptResistUntil:0,tauntOwner:"",tauntUntil:0,tauntResistUntil:0,nav:new MonsterRRTNavigator(zone.obstacles,zone.map.bounds)});
    }
  }
  profile(id:string):MonsterProfile | null { return this.lives.get(id)?.profile ?? null; }
  interrupt(id:string,now:number,durationMs:number,immunityMs:number):"applied"|"immune"|"resisted"|"unavailable" {
    const life=this.lives.get(id),monster=this.monsters.get(id);
    if(!life || !monster?.alive)return "unavailable";
    if(life.profile.tier==="elite" || life.profile.tier==="boss")return "immune";
    if(now<life.interruptResistUntil)return "resisted";
    life.interruptUntil=now+durationMs;life.interruptResistUntil=now+immunityMs;
    life.nav.clear();monster.aiState="stagger";
    return "applied";
  }
  endInterrupt(id:string,now:number):void {
    const life=this.lives.get(id); if(life)life.interruptUntil=Math.min(life.interruptUntil,now);
  }
  taunt(id:string,owner:string,now:number,durationMs:number,immunityMs:number):"applied"|"immune"|"resisted"|"unavailable" {
    const life=this.lives.get(id),monster=this.monsters.get(id);
    if(!life || !monster?.alive || life.returning || planarDistance(monster,life)>=9)return "unavailable";
    if(life.profile.tier!=="normal")return "immune";
    if(now<life.tauntResistUntil)return "resisted";
    life.tauntOwner=owner;life.tauntUntil=now+durationMs;life.tauntResistUntil=now+immunityMs;
    monster.targetId=owner;life.nav.clear();return "applied";
  }
  canDisplace(id:string,to:{x:number;z:number}):boolean {
    const life=this.lives.get(id), monster=this.monsters.get(id);
    return Boolean(life && monster?.alive && !isRestArea(monster.mapId,to) &&
      isMonsterSegmentClear(monster,to,life.zone.obstacles,MONSTER_NAV.radius,life.zone.map.bounds));
  }
  kill(id:string,now:number,players?:MyRoomState["players"],blocked?:ReadonlySet<string>):boolean {
    const m=this.monsters.get(id),life=this.lives.get(id);
    if(!m||!life||!m.alive)return false;
    let nearby=0;
    if(players) for(const [playerId,player] of players) {
      if(player.alive && player.mapId===m.mapId && !blocked?.has(playerId) && !isRestArea(player.mapId,player) && planarDistance(player,m)<=MONSTER_CONFIG.populationRadius) nearby++;
    }
    m.alive=false;m.hp=0;m.targetId="";m.aiState="dead";
    life.windupUntil=0;life.nextChargeAt=0;life.interruptUntil=0;life.interruptResistUntil=0;life.tauntOwner="";life.tauntUntil=0;life.tauntResistUntil=0;
    // A siege can have more hunters than a world room; use the same minimum delay.
    const boss=life.zone.map.boss??life.zone.map.guardian;
    life.respawnAt=now+(boss?.id===id?boss.respawnMs:monsterRespawnDelay(Math.min(nearby,WORLD_ROOM_CAPACITY)));life.returning=false;life.nav.clear();return true;
  }
  clearTarget(id:string):void {for(const m of this.monsters.values())if(m.targetId===id)m.targetId="";for(const life of this.lives.values())if(life.tauntOwner===id){life.tauntOwner="";life.tauntUntil=0;}}
  engaged(id:string):boolean {return [...this.monsters.values()].some(m=>m.alive&&m.targetId===id);}
  update(now:number,dt:number,players:MyRoomState["players"],blocked:ReadonlySet<string>,
    hit:(targetId:string,monster:Monster,force?:number)=>void,respawn:(id:string)=>void,
    canDetect?:(id:string,player:Player,monster:Monster)=>boolean):void {
    const occupied=new Set(Array.from(players.values(),p=>p.mapId));
    const regions=new Set([...occupied].filter(id=>this.regionalMaps.has(id)));
    if(regions.size!==this.activeRegions.size || [...regions].some(id=>!this.activeRegions.has(id))){
      // Withdraw first, then add. Room-owned life clocks survive the last player leaving.
      for(const [id,life] of this.lives)if(this.activeRegions.has(life.zone.map.id) && !regions.has(life.zone.map.id)){
        life.actor.targetId="";life.windupUntil=0;life.tauntOwner="";life.tauntUntil=0;life.nav.clear();this.monsters.delete(id);
      }
      for(const [id,life] of this.lives)if(regions.has(life.zone.map.id) && !this.activeRegions.has(life.zone.map.id))this.monsters.set(id,life.actor);
      this.activeRegions=regions;
    }
    for(const [id,life] of this.lives){
      const {map,obstacles}=life.zone;
      const m=this.monsters.get(id);
      if(!m)continue;
      if(!m.alive){
        if(now>=life.respawnAt){m.x=life.x;m.z=life.z;m.y=groundAt(map.id,m.x,m.z);m.hp=m.maxHp;m.alive=true;m.aiState="patrol";m.targetId="";
          life.lastAttack=-Infinity;life.returning=false;life.nav.clear();respawn(id);}
        continue;
      }
      if(!occupied.has(m.mapId))continue;
      if(now<life.interruptUntil){m.aiState="stagger";continue;}
      const eligible=(pid:string,p:Player|undefined):p is Player=>Boolean(p&&p.alive&&p.mapId===m.mapId&&
        !blocked.has(pid)&&onMapGround(p)&&!isRestArea(p.mapId,p) && (!canDetect || canDetect(pid,p,m)));
      const boss=map.boss??map.guardian;
      if (life.windupUntil > 0) {
        const target = players.get(m.targetId);
        if (now < life.windupUntil && eligible(m.targetId,target)) continue;
        life.windupUntil = 0;
        life.lastAttack = now;
        if (boss?.id===id && eligible(m.targetId,target) && distance3d(m,target) <= boss.strikeRadius &&
            isMonsterSegmentClear(m,target,obstacles,MONSTER_NAV.radius,map.bounds) && (!map.terrain || isWorldSegmentClear(map.id,m,target))) hit(m.targetId,m,1.6);
        m.aiState="patrol";
        continue;
      }
      if(planarDistance(m,life)>=9)life.returning=true;
      let target=m.targetId?players.get(m.targetId):undefined;
      if(!eligible(m.targetId,target)||planarDistance(m,target)>11){target=undefined;m.targetId="";}
      const forced=life.tauntUntil>now ? players.get(life.tauntOwner) : undefined;
      if(!life.returning && eligible(life.tauntOwner,forced) && planarDistance(m,forced)<=11){target=forced;m.targetId=life.tauntOwner;}
      else if(life.tauntUntil<=now || !eligible(life.tauntOwner,forced)){life.tauntOwner="";life.tauntUntil=0;}
      if(!life.returning&&!target){let closest=6;for(const [pid,p] of players){
        if(!eligible(pid,p))continue;const d=planarDistance(m,p);if(d<closest){closest=d;target=p;m.targetId=pid;}
      }}
      let destination:{x:number;z:number},speed:number;
      if(life.returning){m.targetId="";m.aiState="return";destination=life;speed=2.4;
        if(planarDistance(m,life)<.2){life.returning=false;m.hp=m.maxHp;}}
      else if(target){m.facing=facingTo(target.x-m.x,target.z-m.z);
        if(distance3d(m,target)<=1.65){m.aiState="attack";
          if(now-life.lastAttack>=1500&&isMonsterSegmentClear(m,target,obstacles,MONSTER_NAV.radius,map.bounds) && (!map.terrain || isWorldSegmentClear(map.id,m,target))){
            if(boss?.id===id && now>=life.nextChargeAt) {
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
        m.facing=facingTo(next.x-m.x,next.z-m.z);m.x=next.x;m.z=next.z;m.y=groundAt(map.id,m.x,m.z);
      }
    }
  }
}
