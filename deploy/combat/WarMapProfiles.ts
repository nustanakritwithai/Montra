export const ALL_MAP_WARS_ENABLED=process.env.MONTRA_WORLD_EXPANSION==="1" && process.env.MONTRA_ALL_MAP_WARS==="1";

type Point=readonly [x:number,z:number];
export const FRONTIER_SIZES={
  small:{durationMs:3*60_000,goal:30},
  medium:{durationMs:5*60_000,goal:60},
  large:{durationMs:8*60_000,goal:90},
} as const;
type FrontierField=Readonly<{
  size:keyof typeof FRONTIER_SIZES;attack:Point;flag:Point;defend:Point;relay?:Point;
}>;

// These are walkable positions on the existing maps. The world maps themselves are not rewritten.
export const FRONTIER_WAR_FIELDS:Readonly<Record<string,FrontierField>>={
  forbidden_forest:{size:"small",attack:[-40,-30],flag:[0,-30],defend:[40,-30]},
  bound_temple:{size:"small",attack:[-39,5],flag:[1,3],defend:[41,1]},
  bamboo_frontier:{size:"small",attack:[32,13],flag:[-7,22],defend:[-46,31]},
  drowned_marsh:{size:"small",attack:[30,7],flag:[-7,22],defend:[-44,37]},
  twin_neck_pass:{size:"small",attack:[25,74],flag:[-15,76],defend:[-55,78]},
  lotus_basin:{size:"medium",attack:[-45,8],flag:[-8,23],defend:[29,38]},
  moon_cemetery:{size:"medium",attack:[-31,5],flag:[5,22],defend:[41,39]},
  hex_ridge:{size:"medium",attack:[-44,7],flag:[-7,22],defend:[30,37]},
  naga_cavern:{size:"medium",attack:[27,-9],flag:[-1,18],defend:[-29,45]},
  fallen_city:{size:"large",attack:[-32,-9],flag:[0,15],defend:[32,39],relay:[-20,4]},
  asura_peak:{size:"large",attack:[27,15],flag:[-10,30],defend:[-47,45],relay:[-12,18]},
  spirit_rift:{size:"large",attack:[33,20],flag:[-7,22],defend:[-47,24],relay:[20,14]},
};
