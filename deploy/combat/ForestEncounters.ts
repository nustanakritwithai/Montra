import { Monster, type MyRoomState, type Player } from "./schema/MyRoomState.js";
import { ATLAS_SPAWNS, FRONTIER_SPAWNS, HIMMAPAN_SPAWNS, HIMMAPAN_REPLACED_TARGETS, type HimmapanAttack, type HimmapanPhase } from "./WorldAtlas.js";
import {REGIONAL_BOSSES,TITAN_BOSS} from "./RegionalBosses.js";
import { TEMPLE_MAP, TEMPLE_SPAWNS } from "./TempleMap.js";
import { type WorldMapDefinition, type WorldWall, FOREST_CAMPS, SHRINE_GUARDIAN, WORLD_EXPANSION, WORLD_ROOM_CAPACITY, getWorldMap, groundAt, onMapGround, isRestArea, isSafeWorldPoint, isWorldSegmentClear } from "./WorldMaps.js";
import { facingTo, planarDistance, stepTowards } from "./GameRules.js";
import { MonsterRRTNavigator, isMonsterSegmentClear, MONSTER_NAV } from "./MonsterRRT.js";
import { distance3d } from "./HeightRules.js";
import { FOREST_MONSTER_TIERS, MONSTER_CONFIG, monsterProfile, monsterRespawnDelay, type MonsterProfile, type MonsterTier } from "./MonsterProfiles.js";

export const FOREST_RESPAWN_MS = MONSTER_CONFIG.respawnMs;
/** Observation only. Events describe code execution order, not sub-tick time,
 * attack success, damage, continuous trajectories, or a persistent state stream.
 * Events are buffered internally and can only be drained after control returns.
 * No callbacks are invoked while the simulation is mutating state. This is
 * characterization groundwork: after-the-fact records cannot safely apply a
 * trap before an attack already processed, or establish actionable authority. */
export type ForestTraceEvent = Readonly<{
  kind:"move"|"attack_requested"|"died"|"respawned"|"activated"|"withdrawn";
  now:number; monsterId:string; mapId:string;
  from?:Readonly<{x:number;y:number;z:number}>; to?:Readonly<{x:number;y:number;z:number}>;
  targetId?:string; force?:number;
}>;
export type ForestTraceBatch = Readonly<{events:readonly ForestTraceEvent[];overflow:boolean;incomplete:boolean}>;
const FOREST_TRACE_LIMIT=1024;
type Navigation = {map:WorldMapDefinition; obstacles:WorldWall[]};
type Life = {actor:Monster;zone:Navigation; special?:HimmapanAttack; windupUntil:number; nextChargeAt:number; interruptUntil:number; interruptResistUntil:number; tauntOwner:string; tauntUntil:number; tauntResistUntil:number; x:number; z:number; profile:MonsterProfile; respawnAt:number; lastAttack:number; returning:boolean; nav:MonsterRRTNavigator};
type Spawn = { id:string; x:number; z:number; level:number; name:string; tier?:MonsterTier; special?:HimmapanAttack };
function inSpecialArea(monster:Monster, origin:{x:number;z:number}, player:Player, attack:HimmapanPhase):boolean {
  const dx=player.x-origin.x, dz=player.z-origin.z;
  const distance=Math.hypot(dx,dz);
  const sin=Math.sin(monster.facing), cos=Math.cos(monster.facing);
  const forward=-dx*sin-dz*cos;
  if (attack.halfAngle) return distance<=attack.range && forward>=distance*Math.cos(attack.halfAngle);
  if (!attack.halfWidth) return distance>=(attack.innerRange??0) && distance<=attack.range;
  const lateral=dx*cos-dz*sin;
  return forward>=0 && forward<=attack.range && Math.abs(lateral)<=attack.halfWidth;
}
function canPlaceSpecial(life:Life, to:{x:number;y:number;z:number}):boolean {
  const {actor,zone:{map,obstacles}}=life;
  return !isRestArea(map.id,to) && isSafeWorldPoint(map,to,MONSTER_NAV.radius) &&
    isMonsterSegmentClear(actor,to,obstacles,MONSTER_NAV.radius,map.bounds) &&
    (!map.terrain || isWorldSegmentClear(map.id,actor,to));
}
function specialOrigin(life:Life, phase:HimmapanPhase):{x:number;z:number} {
  const m=life.actor;
  const forward=phase.forward??0, lateral=phase.lateral??0;
  if(forward || lateral){
    const sin=Math.sin(m.facing),cos=Math.cos(m.facing);
    for(const scale of [1,.75,.5,.25]){
      const x=m.x+(lateral*cos-forward*sin)*scale,z=m.z-(lateral*sin+forward*cos)*scale;
      if(canPlaceSpecial(life,{x,y:groundAt(m.mapId,x,z),z}))return {x,z};
    }
  }
  return {x:m.x,z:m.z};
}
function startSpecialPhase(life:Life, phase:HimmapanPhase, stage:number, now:number):void {
  const m=life.actor, offset=(stage-1)*3;
  const origin=stage>0 && m.specialMarks.length>offset
    ? {x:m.specialMarks[offset],z:m.specialMarks[offset+1]} : specialOrigin(life,phase);
  m.specialRange=phase.range;m.specialHalfWidth=phase.halfWidth;
  m.specialInnerRange=phase.innerRange??0;m.specialHalfAngle=phase.halfAngle??0;
  m.specialStage=stage;
  m.specialOriginX=origin.x;m.specialOriginZ=origin.z;
  m.aiState="windup";
  life.windupUntil=now+phase.windupMs;
}
function cancelSpecial(life:Life):void {
  life.windupUntil=0;
  life.actor.specialStage=0;
  if(life.actor.specialMarks.length)life.actor.specialMarks.clear();
}
/** Bounded population, independent clocks and server-owned AI; no player-selected stats. */
export class ForestEncounters {
  private lives = new Map<string,Life>();
  private regionalMaps = new Set<string>();
  private activeRegions = new Set<string>();
  private navigation(map:WorldMapDefinition): Navigation {
    const trees=map.obstacles.map(o=>({x:o.x-o.radius,z:o.z-o.radius,width:o.radius*2,length:o.radius*2}));
    return {map,obstacles:[...trees,...(map.walls ?? []),...(map.water ?? [])]};
  }
  private readonly traceEnabled:boolean;
  private traceEvents:ForestTraceEvent[]=[];
  private traceOverflow=false;
  private traceIncomplete=false;
  private traceUpdateDepth=0;
  constructor(private monsters: MyRoomState["monsters"], private tiers:Readonly<Record<string,MonsterTier>> = FOREST_MONSTER_TIERS,
    traceEnabled=false) {this.traceEnabled=traceEnabled===true;}
  private traceEvent(event:ForestTraceEvent):void {
    if (!this.traceEnabled || this.traceOverflow) return;
    if (this.traceEvents.length>=FOREST_TRACE_LIMIT) {this.traceOverflow=true;this.traceIncomplete=true;return;}
    this.traceEvents.push(Object.freeze({...event,...(event.from?{from:Object.freeze({...event.from})}:{}),...(event.to?{to:Object.freeze({...event.to})}:{})}));
  }
  /** Drain after an update/kill returns. An incomplete batch must not be used
   * for authoritative action. Disabled instances return empty. */
  drainTrace():ForestTraceBatch {
    // Existing hit/respawn callbacks may reenter. Never expose partial records.
    if(this.traceUpdateDepth>0)return Object.freeze({events:Object.freeze([]),overflow:false,incomplete:true});
    const result=Object.freeze({events:Object.freeze(this.traceEvents.slice()),overflow:this.traceOverflow,incomplete:this.traceIncomplete});
    this.traceEvents=[];this.traceOverflow=false;this.traceIncomplete=false;return result;
  }
  initialize(includeWorldEncounters=true):void {
    if(!WORLD_EXPANSION)return;
    const offsets = [[-7,-7],[7,-7],[-7,7],[7,7]];
    const normalSpawns = FOREST_CAMPS.flatMap(camp => camp.levels.map((level, i) => ({
      id: `forest_${camp.id}_${i + 1}`, level,
      name: level < 5 ? "ผีหลงป่า" : level < 9 ? "เงารากไม้" : "วิญญาณอาคม",
      x: camp.x + offsets[i][0], z: camp.z + offsets[i][1],
    })));
    const spawnIds = new Set(normalSpawns.map(spawn => spawn.id));
    // A full world room can populate every atlas hunting region at once.
    const bosses=includeWorldEncounters?REGIONAL_BOSSES.filter(b=>getWorldMap(b.mapId)?.boss?.id===b.id || (b.id===TITAN_BOSS.id && getWorldMap(b.mapId))):[];
    const templeSpawns=[...TEMPLE_SPAWNS,...bosses.filter(b=>b.mapId===TEMPLE_MAP.id)];
    const regionalSpawns=[...[...ATLAS_SPAWNS,...FRONTIER_SPAWNS].filter(s=>!includeWorldEncounters || !HIMMAPAN_REPLACED_TARGETS.has(s.id)),
      ...bosses.filter(b=>b.mapId!==TEMPLE_MAP.id),
      ...(includeWorldEncounters?HIMMAPAN_SPAWNS:[])];
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
    const spawns:{spawn:Spawn;zone:Navigation}[]=[...[...normalSpawns,SHRINE_GUARDIAN].map(spawn=>({spawn,zone:forest})),
      ...templeSpawns.map(spawn=>({spawn,zone:temple})),
      ...regionalSpawns.map(spawn=>({spawn,zone:regionalNavigation.get(spawn.mapId)!}))];
    for (const {spawn,zone} of spawns) {
      const {id, x, z, level, name, special} = spawn;
      const tier:MonsterTier = spawn.tier ?? (id === SHRINE_GUARDIAN.id ? "elite" : (this.tiers[id] ?? "normal"));
      const base=monsterProfile(level,tier==="boss"?"normal":tier);
      const profile:MonsterProfile=tier==="boss" ? {...base,tier,maxHp:Math.round(base.maxHp*(id===TITAN_BOSS.id?5:3.5)),
        attack:Math.round(base.attack*1.55),defense:Math.round(base.defense*1.3)} : base;
      const actor=new Monster({id,x,y:groundAt(zone.map.id,x,z),z,hp:profile.maxHp,maxHp:profile.maxHp,
        alive:true,mapId:zone.map.id,level,tier,displayName:name,defense:profile.defense,
        ...(special?{specialRange:special.range,specialHalfWidth:special.halfWidth,
          specialInnerRange:special.innerRange??0,specialHalfAngle:special.halfAngle??0}:{})});
      if(!this.regionalMaps.has(zone.map.id))this.monsters.set(id,actor);
      this.lives.set(id,{actor,zone,x,z,profile,special,respawnAt:0,lastAttack:-Infinity,returning:false,
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
    if(life.special)cancelSpecial(life);
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
    cancelSpecial(life);life.nextChargeAt=0;life.interruptUntil=0;life.interruptResistUntil=0;life.tauntOwner="";life.tauntUntil=0;life.tauntResistUntil=0;
    // A siege can have more hunters than a world room; use the same minimum delay.
    const boss=id===TITAN_BOSS.id?TITAN_BOSS:life.zone.map.boss??life.zone.map.guardian;
    life.respawnAt=now+(boss?.id===id?boss.respawnMs:monsterRespawnDelay(Math.min(nearby,WORLD_ROOM_CAPACITY)));life.returning=false;life.nav.clear();
    if(this.traceEnabled)this.traceEvent({kind:"died",now,monsterId:id,mapId:m.mapId,to:{x:m.x,y:m.y,z:m.z}});return true;
  }
  clearTarget(id:string):void {for(const m of this.monsters.values())if(m.targetId===id)m.targetId="";for(const life of this.lives.values())if(life.tauntOwner===id){life.tauntOwner="";life.tauntUntil=0;}}
  engaged(id:string):boolean {return [...this.monsters.values()].some(m=>m.alive&&m.targetId===id);}
  update(now:number,dt:number,players:MyRoomState["players"],blocked:ReadonlySet<string>,
    hit:(targetId:string,monster:Monster,force:number|undefined,attackAt:number)=>void,respawn:(id:string)=>void,
    canDetect?:(id:string,player:Player,monster:Monster)=>boolean,isBound?:(id:string)=>boolean,
    walk?:(monster:Monster,previous:Readonly<{x:number;y:number;z:number}>)=>void):void {
    if (!this.traceEnabled) {this.updateImpl(now,dt,players,blocked,hit,respawn,canDetect,isBound,walk);return;}
    this.traceUpdateDepth++;
    try {this.updateImpl(now,dt,players,blocked,hit,respawn,canDetect,isBound,walk);}
    catch(error) {this.traceIncomplete=true;throw error;}
    finally {this.traceUpdateDepth--;}
  }
  private updateImpl(now:number,dt:number,players:MyRoomState["players"],blocked:ReadonlySet<string>,
    hit:(targetId:string,monster:Monster,force:number|undefined,attackAt:number)=>void,respawn:(id:string)=>void,
    canDetect?:(id:string,player:Player,monster:Monster)=>boolean,isBound?:(id:string)=>boolean,
    walk?:(monster:Monster,previous:Readonly<{x:number;y:number;z:number}>)=>void):void {
    const occupied=new Set(Array.from(players.values(),p=>p.mapId));
    const regions=new Set([...occupied].filter(id=>this.regionalMaps.has(id)));
    if(regions.size!==this.activeRegions.size || [...regions].some(id=>!this.activeRegions.has(id))){
      // Withdraw first, then add. Room-owned life clocks survive the last player leaving.
      for(const [id,life] of this.lives)if(this.activeRegions.has(life.zone.map.id) && !regions.has(life.zone.map.id)){
        life.actor.targetId="";cancelSpecial(life);life.tauntOwner="";life.tauntUntil=0;life.nav.clear();this.monsters.delete(id);
        if(this.traceEnabled)this.traceEvent({kind:"withdrawn",now,monsterId:id,mapId:life.actor.mapId,from:{x:life.actor.x,y:life.actor.y,z:life.actor.z}});
      }
      for(const [id,life] of this.lives)if(regions.has(life.zone.map.id) && !this.activeRegions.has(life.zone.map.id)){
        this.monsters.set(id,life.actor);
        if(this.traceEnabled)this.traceEvent({kind:"activated",now,monsterId:id,mapId:life.actor.mapId,to:{x:life.actor.x,y:life.actor.y,z:life.actor.z}});
      }
      this.activeRegions=regions;
    }
    for(const [id,life] of this.lives){
      const {map,obstacles}=life.zone;
      const m=this.monsters.get(id);
      if(!m)continue;
      if(!m.alive){
        if(now>=life.respawnAt){m.x=life.x;m.z=life.z;m.y=groundAt(map.id,m.x,m.z);m.hp=m.maxHp;m.alive=true;m.aiState="patrol";m.targetId="";
          life.lastAttack=-Infinity;life.returning=false;life.nav.clear();
          if(this.traceEnabled)this.traceEvent({kind:"respawned",now,monsterId:id,mapId:m.mapId,to:{x:m.x,y:m.y,z:m.z}});respawn(id);}
        continue;
      }
      if(!occupied.has(m.mapId))continue;
      const special=life.special;
      if(isBound?.(id)){if(special)cancelSpecial(life);m.aiState="stagger";continue;}
      if(now<life.interruptUntil){m.aiState="stagger";continue;}
      const eligible=(pid:string,p:Player|undefined):p is Player=>Boolean(p&&p.alive&&p.mapId===m.mapId&&
        !blocked.has(pid)&&(p.boatId || onMapGround(p))&&!isRestArea(p.mapId,p) && (!canDetect || canDetect(pid,p,m)));
      const clear=(target:Player,origin:{x:number;y:number;z:number}=m)=>
        isMonsterSegmentClear(origin,target,obstacles,MONSTER_NAV.radius,map.bounds) &&
        (!map.terrain || isWorldSegmentClear(map.id,origin,target));
      const titan=id===TITAN_BOSS.id;
      const boss=titan?TITAN_BOSS:map.boss??map.guardian;
      if (life.windupUntil > 0) {
        if (special) {
          if (now < life.windupUntil) continue;
          const stage=m.specialStage;
          const phase=special.followups?.[stage-2]??special;
          const x=m.specialOriginX,z=m.specialOriginZ;
          const origin=stage?{x,y:groundAt(map.id,x,z),z}:m;
          const validOrigin=!(phase.forward || phase.lateral) || canPlaceSpecial(life,origin);
          const next=stage?special.followups?.[stage-1]:undefined;
          const force=phase.force??1.25;
          life.windupUntil=0;life.lastAttack=now;m.aiState="special_recovery";
          if(validOrigin && phase.leap){
            const from={x:m.x,y:m.y,z:m.z};
            m.x=origin.x;m.y=origin.y;m.z=origin.z;life.nav.clear();
            if(this.traceEnabled)this.traceEvent({kind:"move",now,monsterId:id,mapId:m.mapId,from,to:origin});
            walk?.(m,from);
          }
          if(validOrigin && !phase.cueOnly)for(const [pid,player] of players){
            if(!m.alive || m.aiState!=="special_recovery")break;
            if(eligible(pid,player) && inSpecialArea(m,origin,player,phase) && clear(player,origin)){
              if(this.traceEnabled)this.traceEvent({kind:"attack_requested",now,monsterId:id,mapId:m.mapId,targetId:pid,force,to:{x:origin.x,y:origin.y,z:origin.z}});
              hit(pid,m,force,now);
            }
          }
          if(next && m.alive && m.aiState==="special_recovery")startSpecialPhase(life,next,stage+1,now);
          continue;
        }
        const target = players.get(m.targetId);
        if (now < life.windupUntil && (titan || eligible(m.targetId,target))) continue;
        life.windupUntil = 0;
        life.lastAttack = now;
        if (titan) {
          for (const [playerId,player] of players) {
            if (eligible(playerId,player) && distance3d(m,player)<=TITAN_BOSS.strikeRadius && clear(player)) {
              if(this.traceEnabled)this.traceEvent({kind:"attack_requested",now,monsterId:id,mapId:m.mapId,targetId:playerId,force:1.6,to:{x:m.x,y:m.y,z:m.z}});
              hit(playerId,m,1.6,now);
            }
          }
        } else if (boss?.id===id && eligible(m.targetId,target) && distance3d(m,target) <= boss.strikeRadius && clear(target)) {
          if(this.traceEnabled)this.traceEvent({kind:"attack_requested",now,monsterId:id,mapId:m.mapId,targetId:m.targetId,force:1.6,to:{x:m.x,y:m.y,z:m.z}});hit(m.targetId,m,1.6,now);
        }
        m.aiState="patrol";
        continue;
      }
      if(special && m.aiState==="special_recovery"){
        if(now-life.lastAttack<(special.recoveryMs??650))continue;
        m.specialStage=0;
        if(m.specialMarks.length)m.specialMarks.clear();
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
        if(special && now>=life.nextChargeAt && now-life.lastAttack>=1500 &&
          planarDistance(m,target)<=(special.triggerRange??special.range) && clear(target)){
          if(special.markFollowups){
            for(const phase of [special,...(special.followups??[])]){
              const origin=specialOrigin(life,phase);
              m.specialMarks.push(origin.x,origin.z,phase.range);
            }
          }
          startSpecialPhase(life,special,special.followups?1:0,now);
          life.nextChargeAt=now+8000;
          continue;
        }
        if(distance3d(m,target)<=1.65){m.aiState="attack";
          if(now-life.lastAttack>=1500&&clear(target)){
            if(boss?.id===id && now>=life.nextChargeAt) {
              m.aiState="windup";
              life.windupUntil=now+1400;
              life.nextChargeAt=now+8000;
            } else {
              life.lastAttack=now;if(this.traceEnabled)this.traceEvent({kind:"attack_requested",now,monsterId:id,mapId:m.mapId,targetId:m.targetId,force:1,to:{x:m.x,y:m.y,z:m.z}});hit(m.targetId,m,undefined,now);
            }
          }continue;
        }m.aiState="chase";destination=target;speed=1.9;
      }else{m.aiState="patrol";const phase=now/3000+life.x;
        destination={x:life.x+Math.cos(phase)*1.1,z:life.z+Math.sin(phase)*1.1};speed=.65;}
      const waypoint=life.nav.nextWaypoint(m,destination,now,m.aiState+":"+m.targetId);
      if(!waypoint)continue;
      const next=stepTowards(m,waypoint,speed*dt);
      if(!isRestArea(m.mapId,next)&&isMonsterSegmentClear(m,next,obstacles,MONSTER_NAV.radius,map.bounds)){
        const from=(this.traceEnabled || walk) ? {x:m.x,y:m.y,z:m.z} : undefined;
        m.facing=facingTo(next.x-m.x,next.z-m.z);m.x=next.x;m.z=next.z;m.y=groundAt(map.id,m.x,m.z);
        if(from && this.traceEnabled)this.traceEvent({kind:"move",now,monsterId:id,mapId:m.mapId,from,to:{x:m.x,y:m.y,z:m.z}});
        if(from)walk?.(m,from);
      }
    }
  }
}
