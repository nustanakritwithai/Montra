import {RIVER_CITY} from "./RiverCity.js";

export const CITY_PRODUCTION_SITE = RIVER_CITY;
export const CITY_MINING_SITE = "moon_pass";
export const CITY_SITES = [CITY_PRODUCTION_SITE, CITY_MINING_SITE] as const;
export type CitySite = typeof CITY_SITES[number];
export const CITY_PRODUCTION_ENABLED = process.env.MONTRA_CITY_PRODUCTION === "1";
export const CITY_CONSTRUCTION_ENABLED = process.env.MONTRA_CITY_CONSTRUCTION === "1";
export const CITY_WORKSHOP_ENABLED = process.env.MONTRA_CITY_WORKSHOP === "1";
export const CITY_MINING_ENABLED = process.env.MONTRA_CITY_MINING === "1";
export const CITY_PURCHASE_ENABLED = process.env.MONTRA_CITY_PURCHASE_ORDERS === "1";
export const CITY_MISSIONS_ENABLED = process.env.MONTRA_CITY_MISSIONS === "1";
export const CITY_GOVERNANCE_ENABLED = process.env.MONTRA_CITY_GOVERNANCE === "1";
export const CITY_RAW_ITEMS = ["mat_raw_wood_1", "mat_raw_stone_1"] as const;
export const CITY_PRODUCT = "mat_metal_1";
export const CITY_MINING_ORE = "mat_raw_stone_2";
export const CITY_MINING_PRODUCT = "mat_metal_2";
export const CITY_ITEMS = [...CITY_RAW_ITEMS, CITY_PRODUCT, CITY_MINING_ORE, CITY_MINING_PRODUCT] as const;
export type CityItem = typeof CITY_ITEMS[number];
type CityInput = Exclude<CityItem, typeof CITY_MINING_PRODUCT>;
export type CityAsset = CityItem | "gold";

export const CITY_FACTORY_COSTS = [
  {wood: 5, stone: 5},
  {wood: 10, stone: 10},
] as const;
export const CITY_RECIPE = {wood: 1, stone: 2, quantity: 1};
export const CITY_CAPACITY = 60;
export const CITY_WAREHOUSE_CAPACITY = 90;
export const CITY_WAREHOUSE_DURATION_MS = 300_000;
export const CITY_WAREHOUSE_MATERIALS = [
  {item: CITY_RAW_ITEMS[0], column: "wood", amount: 12},
  {item: CITY_RAW_ITEMS[1], column: "stone", amount: 16},
  {item: CITY_PRODUCT, column: "metal", amount: 4},
] as const;
export const CITY_DURATION_MS = [0, 120_000, 60_000] as const;
export const CITY_RUSH_GOLD = 15;
export const CITY_WORKSHOP_FEE = 5;
export const CITY_WORKSHOP_SLOTS = 4;
export const CITY_PURCHASE_AMOUNT = 20;
export const CITY_POLICY_PURCHASE_AMOUNT = 24;
export const CITY_POLICY_COOLDOWN_MS = 86_400_000;
export const CITY_POLICY_SPEED = .85;
export type CityPolicy = "industry" | "procurement";
export const CITY_PURCHASE_MAX_PRICE = 1_000_000;
export const CITY_PURCHASE_DURATION_MS = 86_400_000;
export const CITY_MISSION_ORE_COUNT = 3;
export const CITY_MISSION_POST_LIMIT = 3;
export const CITY_MISSION_WORKERS = 5;
export const CITY_MISSION_MAX_REWARD = 1_000_000;
export const CITY_MISSION_HOURS = [1, 6, 24] as const;
export const CITY_LINES = {
  [CITY_PRODUCTION_SITE]: {inputs: CITY_RAW_ITEMS, output: CITY_PRODUCT, recipe: CITY_RECIPE},
  [CITY_MINING_SITE]: {inputs: [CITY_PRODUCT, CITY_MINING_ORE], output: CITY_MINING_PRODUCT,
    recipe: {wood: 1, stone: 2, quantity: 1}},
} as const;

type WarehouseOrder =
  {action: "warehouse_start"; epoch: number} |
  {action: "warehouse_contribute"; epoch: number; slot: number; item: CityItem; amount: number} |
  {action: "warehouse_allocate"; epoch: number; item: CityItem; amount: number};

export type CityWorkshopOrder = {requestId: string} & (
  {action: "workshop_start"; epoch: number; woodSlot: number; stoneSlot: number} |
  {action: "workshop_claim"; jobId: string}
);

export type CityPurchaseOrder = {requestId: string} & (
  {action: "purchase_open"; epoch: number; amount: number; unitPrice: number} |
  {action: "purchase_cancel"; orderId: string} |
  {action: "purchase_fill"; orderId: string; slot: number; amount: number}
);
export type CityMissionOrder = {requestId: string} & (
  {action: "mission_open"; epoch: number; audience: "guild" | "public"; slots: number; reward: number; hours: number} |
  {action: "mission_accept" | "mission_submit" | "mission_abandon" | "mission_cancel"; missionId: string}
);
export type CityPolicyOrder = {requestId: string; action: "policy_set"; epoch: number; policy: CityPolicy};

export type CityFactoryOrder = {requestId: string} & (
  WarehouseOrder |
  {action: "build" | "start" | "start_fast"; epoch: number} |
  {action: "deposit"; epoch: number; slot: number; item: CityInput; amount: number} |
  {action: "list"; epoch: number; amount: number; price: number} |
  {action: "cancel"; listingId: string} |
  {action: "reclaim"; epoch: number; item: CityItem; amount: number}
);
export type CityOrder = CityFactoryOrder | CityWorkshopOrder | CityPurchaseOrder | CityMissionOrder | CityPolicyOrder | ({requestId: string} & (
  {action: "disband"; guildId: string} |
  {action: "claim_disband"; guildId: string; item: CityAsset; amount: number}
));
export type CityDisband = {guild: string; actor: string; name: string; requested: number};

export type CityMember = {id: string; name: string; officer: boolean; commander?: boolean};
export type CityTenure = {id: number; guild: string};
export type CityOwnership = {
  active: CityTenure | null;
  previous: {guild: string; ended: number; siegeStarted?: number} | null;
  siegeStarted?: number;
};

export function isWarehouseOrder(order: CityOrder): order is WarehouseOrder & {requestId: string} {
  return order.action === "warehouse_start" || order.action === "warehouse_contribute" ||
    order.action === "warehouse_allocate";
}

export function isCityPurchaseOrder(order: CityOrder): order is CityPurchaseOrder {
  return order.action === "purchase_open" || order.action === "purchase_cancel" || order.action === "purchase_fill";
}

export function isCityMissionOrder(order: CityOrder): order is CityMissionOrder {
  return order.action === "mission_open" || order.action === "mission_accept" || order.action === "mission_submit" ||
    order.action === "mission_abandon" || order.action === "mission_cancel";
}

export function parseCityOrder(input: unknown): CityOrder | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const order = input as Record<string, unknown>;
  if (typeof order.requestId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(order.requestId)) return null;
  const keys = (...fields: string[]) =>
    Object.keys(order).length === fields.length + 2 && fields.every(field => Object.hasOwn(order, field));
  const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
  const uuid = (value: unknown): value is string => typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

  if (order.action === "cancel")
    return keys("listingId") && uuid(order.listingId) ? order as CityOrder : null;
  if (order.action === "workshop_claim")
    return keys("jobId") && uuid(order.jobId) ? order as CityOrder : null;
  if (order.action === "purchase_cancel")
    return keys("orderId") && uuid(order.orderId) ? order as CityOrder : null;
  if (order.action === "mission_accept" || order.action === "mission_submit" || order.action === "mission_abandon" ||
      order.action === "mission_cancel") return keys("missionId") && uuid(order.missionId) ? order as CityOrder : null;
  if (order.action === "purchase_fill")
    return keys("orderId", "slot", "amount") && uuid(order.orderId) && integer(order.slot, 0, 11) &&
      integer(order.amount, 1, CITY_POLICY_PURCHASE_AMOUNT) ? order as CityOrder : null;
  if (order.action === "disband")
    return keys("guildId") && uuid(order.guildId) ? order as CityOrder : null;
  if (order.action === "claim_disband")
    return keys("guildId", "item", "amount") && uuid(order.guildId) &&
      (order.item === "gold" || CITY_ITEMS.some(item => item === order.item)) &&
      integer(order.amount, 1, order.item === "gold" ? 1_000_000_000 : 99) ? order as CityOrder : null;
  if (!integer(order.epoch, 1)) return null;
  switch (order.action) {
    case "policy_set":
      return keys("epoch", "policy") && (order.policy === "industry" || order.policy === "procurement") ? order as CityOrder : null;
    case "mission_open":
      return keys("epoch", "audience", "slots", "reward", "hours") &&
        (order.audience === "guild" || order.audience === "public") && integer(order.slots, 1, CITY_MISSION_WORKERS) &&
        integer(order.reward, 1, CITY_MISSION_MAX_REWARD) && CITY_MISSION_HOURS.some(hours => hours === order.hours) ? order as CityOrder : null;
    case "purchase_open":
      return keys("epoch", "amount", "unitPrice") && integer(order.amount, 1, CITY_POLICY_PURCHASE_AMOUNT) &&
        integer(order.unitPrice, 1, CITY_PURCHASE_MAX_PRICE) ? order as CityOrder : null;
    case "workshop_start":
      return keys("epoch", "woodSlot", "stoneSlot") && integer(order.woodSlot, 0, 11) &&
        integer(order.stoneSlot, 0, 11) && order.woodSlot !== order.stoneSlot ? order as CityOrder : null;
    case "build":
    case "start":
    case "start_fast":
    case "warehouse_start":
      return keys("epoch") ? order as CityOrder : null;
    case "deposit":
      return keys("epoch", "slot", "item", "amount") && integer(order.slot, 0, 11) &&
        (CITY_RAW_ITEMS.some(item => item === order.item) || order.item === CITY_PRODUCT || order.item === CITY_MINING_ORE) &&
        integer(order.amount, 1, 99) ? order as CityOrder : null;
    case "list":
      return keys("epoch", "amount", "price") && integer(order.amount, 1, 99) &&
        integer(order.price, 1, 1_000_000_000) ? order as CityOrder : null;
    case "reclaim":
    case "warehouse_allocate":
      return keys("epoch", "item", "amount") && CITY_ITEMS.some(item => item === order.item) &&
        integer(order.amount, 1, 99) ? order as CityOrder : null;
    case "warehouse_contribute":
      return keys("epoch", "slot", "item", "amount") && integer(order.slot, 0, 11) &&
        CITY_WAREHOUSE_MATERIALS.some(({item}) => item === order.item) && integer(order.amount, 1, 99) ? order as CityOrder : null;
    default:
      return null;
  }
}
