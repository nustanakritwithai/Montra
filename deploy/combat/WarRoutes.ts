import type {DatabaseSync} from "node:sqlite";
import type {TerritoryGovernment} from "./TerritoryGovernment.js";
import {SCHEDULED_WARS_ENABLED} from "./WarSchedule.js";

export const WAR_ROUTES_ENABLED=SCHEDULED_WARS_ENABLED && process.env.MONTRA_WAR_ROUTES==="1";
const DAY=86_400_000,TRAVEL_MIN_MS=30_000,TRAVEL_LIMIT_MS=30*60_000;
export const ROUTE_FEE=5,ROUTE_REWARD=12;
const edges=[
  ["ritual_village","mantra_capital"],
  ["mantra_capital","moon_pass"],
  ["mantra_capital","river_watch"],
  ["river_watch","sam_lan_estuary"],
  ["river_watch","tri_wiang_castle"],
] as const;

type Carrier={character:string;guild:string;officer:boolean};
type Status="pending"|"delivered"|"cancelled";
type Route={id:string;character:string;guild:string;origin:string;destination:string;opened:number;expires:number;status:Status};
export type RouteOrder={id:string} & ({action:"dispatch";destination:string}|{action:"deliver"|"cancel"});
export function parseRouteOrder(input:unknown):RouteOrder|null {
  if(!input || typeof input!=="object" || Array.isArray(input))return null;
  const {id,action,destination}=input as Record<string,unknown>;
  if(typeof id!=="string" || !/^[a-z0-9_-]{16,64}$/i.test(id))return null;
  const count=Object.keys(input).length;
  if(action==="dispatch" && count===3 && typeof destination==="string" && destination.length<=40)return {id,action,destination};
  if((action==="deliver" || action==="cancel") && count===2)return {id,action};
  return null;
}

export class WarRoutes {
  constructor(private readonly db:DatabaseSync,private readonly government:TerritoryGovernment){
    db.exec(`CREATE TABLE IF NOT EXISTS war_trade_routes(
      id TEXT PRIMARY KEY,character TEXT NOT NULL,guild TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,destination TEXT NOT NULL,opened INTEGER NOT NULL,expires INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','delivered','cancelled')));
      CREATE UNIQUE INDEX IF NOT EXISTS war_route_active ON war_trade_routes(guild) WHERE status='pending';
      CREATE INDEX IF NOT EXISTS war_route_recent ON war_trade_routes(guild,opened);`);
  }

  private owns(guild:string,site:string):boolean {
    return !!this.db.prepare("SELECT 1 FROM territory_estates WHERE site=? AND owner=?").get(site,guild);
  }

  private destinations(guild:string,origin:string):string[] {
    if(!this.owns(guild,origin))return [];
    return edges.flatMap(([a,b])=>a===origin?[b]:b===origin?[a]:[]).filter(site=>this.owns(guild,site));
  }

  cancelAtHandover(site:string,winner:string|null):void {
    this.db.prepare(`UPDATE war_trade_routes SET status='cancelled'
      WHERE status='pending' AND guild IS NOT ? AND (origin=? OR destination=?)`).run(winner,site,site);
  }

  private viewRoute(route:Route) {
    const {id,origin,destination,opened,expires,status}=route;
    return {id,origin,destination,opened,expires,status,deliverAt:opened+TRAVEL_MIN_MS};
  }

  view(actor:Carrier,origin:string,now:number) {
    const route=this.db.prepare(`SELECT * FROM war_trade_routes
      WHERE guild=? AND character=? AND status='pending' AND expires>?`).get(actor.guild,actor.character,now) as Route|undefined;
    const last=this.db.prepare("SELECT max(opened) AS opened FROM war_trade_routes WHERE guild=?").get(actor.guild);
    return {destinations:actor.officer?this.destinations(actor.guild,origin):[],
      nextDispatchAt:typeof last?.opened==="number"?last.opened+DAY:0,
      route:route?this.viewRoute(route):null,fee:ROUTE_FEE,reward:ROUTE_REWARD};
  }

  // The territory store holds BEGIN IMMEDIATE across the convoy and the treasury ledger.
  order(actor:Carrier,site:string,order:RouteOrder,now:number,settle:(site:string)=>void) {
    const route=this.db.prepare("SELECT * FROM war_trade_routes WHERE id=?").get(order.id) as Route|undefined;
    if(route && (route.character!==actor.character || route.guild!==actor.guild))throw Error("war_route_unavailable");
    if(order.action==="dispatch"){
      if(route){
        if(route.origin!==site || route.destination!==order.destination)throw Error("war_route_request_conflict");
        return this.viewRoute(route);
      }
      if(!actor.officer)throw Error("war_officer");
      if(!this.destinations(actor.guild,site).includes(order.destination))throw Error("war_route_destination");
      this.db.prepare("UPDATE war_trade_routes SET status='cancelled' WHERE guild=? AND status='pending' AND expires<=?").run(actor.guild,now);
      if(this.db.prepare("SELECT 1 FROM war_trade_routes WHERE guild=? AND opened>?").get(actor.guild,now-DAY))
        throw Error("war_route_cooldown");
      this.government.bookRoute(actor.guild,site,now,-ROUTE_FEE);
      const created:Route={id:order.id,character:actor.character,guild:actor.guild,origin:site,destination:order.destination,
        opened:now,expires:now+TRAVEL_LIMIT_MS,status:"pending"};
      this.db.prepare(`INSERT INTO war_trade_routes(id,character,guild,origin,destination,opened,expires,status)
        VALUES(?,?,?,?,?,?,?,'pending')`).run(created.id,created.character,created.guild,created.origin,created.destination,created.opened,created.expires);
      return this.viewRoute(created);
    }
    if(!route)throw Error("war_route_unavailable");
    if(route.status!=="pending")return this.viewRoute(route);
    if(order.action==="deliver"){settle(route.origin);settle(route.destination);}
    if(order.action==="cancel" || now>=route.expires ||
       !this.owns(actor.guild,route.origin) || !this.owns(actor.guild,route.destination)){
      this.db.prepare("UPDATE war_trade_routes SET status='cancelled' WHERE id=?").run(route.id);
      return this.viewRoute({...route,status:"cancelled"});
    }
    if(site!==route.destination || now<route.opened+TRAVEL_MIN_MS)throw Error("war_route_delivery");
    this.government.bookRoute(actor.guild,site,now,ROUTE_REWARD);
    this.db.prepare("UPDATE war_trade_routes SET status='delivered' WHERE id=?").run(route.id);
    return this.viewRoute({...route,status:"delivered"});
  }
}
