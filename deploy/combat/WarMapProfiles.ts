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
  bound_temple:{size:"small",attack:[-15,2],flag:[1,3],defend:[17,1]},
  bamboo_frontier:{size:"small",attack:[10,17],flag:[-5,23],defend:[-20,27]},
  drowned_marsh:{size:"small",attack:[10,20],flag:[-5,24],defend:[-19,31]},
  twin_neck_pass:{size:"small",attack:[0,73],flag:[-15,76],defend:[-30,76]},
  lotus_basin:{size:"medium",attack:[-22,16],flag:[-7,23],defend:[8,28]},
  moon_cemetery:{size:"medium",attack:[-10,17],flag:[5,22],defend:[21,26]},
  hex_ridge:{size:"medium",attack:[-20,18],flag:[-5,24],defend:[10,30]},
  naga_cavern:{size:"medium",attack:[8,5],flag:[0,18],defend:[-11,30]},
  fallen_city:{size:"large",attack:[-11,4],flag:[0,15],defend:[11,26],relay:[-20,4]},
  asura_peak:{size:"large",attack:[4,22],flag:[-10,30],defend:[-25,36],relay:[-12,18]},
  spirit_rift:{size:"large",attack:[10,20],flag:[-5,24],defend:[-20,29],relay:[20,14]},
};
