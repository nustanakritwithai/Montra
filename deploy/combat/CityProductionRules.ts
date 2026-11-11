import {INVENTORY_SLOT_COUNT} from "./ItemRules.js";
import {RIVER_CITY} from "./RiverCity.js";

export const CITY_PRODUCTION_SITE = RIVER_CITY;
export const CITY_MINING_SITE = "moon_pass";
export const CITY_SITES = [CITY_PRODUCTION_SITE, CITY_MINING_SITE] as const;
export type CitySite = typeof CITY_SITES[number];
export const CITY_PRODUCTION_ENABLED = process.env.MONTRA_CITY_PRODUCTION === "1";
export const CITY_CONSTRUCTION_ENABLED = process.env.MONTRA_CITY_CONSTRUCTION === "1";
export const CITY_WORKSHOP_ENABLED = process.env.MONTRA_CITY_WORKSHOP === "1";
export const CITY_MINING_ENABLED = process.env.MONTRA_CITY_MINING === "1";
export const CITY_MINING_CONSTRUCTION_ENABLED = process.env.MONTRA_CITY_MINING_CONSTRUCTION === "1";
export const CITY_PURCHASE_ENABLED = process.env.MONTRA_CITY_PURCHASE_ORDERS === "1";
export const CITY_MISSIONS_ENABLED = process.env.MONTRA_CITY_MISSIONS === "1";
export const CITY_GOVERNANCE_ENABLED = process.env.MONTRA_CITY_GOVERNANCE === "1";
export const CITY_SUPPLY_ENABLED = process.env.MONTRA_CITY_SUPPLY_RESERVE === "1";
export const CITY_HAUL_ENABLED = process.env.MONTRA_CITY_HAULS === "1";
export const CITY_LOCAL_MARKET_ENABLED = process.env.MONTRA_CITY_LOCAL_MARKETS === "1";
export const CITY_RETURN_MARKET_ENABLED = process.env.MONTRA_CITY_RETURN_MARKET === "1";
export const CITY_TRADE_CONTRACTS_ENABLED = process.env.MONTRA_CITY_TRADE_CONTRACTS === "1";
export const CITY_NEUTRAL_MARKET_ENABLED = process.env.MONTRA_CITY_NEUTRAL_MARKET === "1";
export const CITY_NEUTRAL_RETURN_MARKET_ENABLED = process.env.MONTRA_CITY_NEUTRAL_RETURN_MARKET === "1";
export const CITY_MARKET_CONTRIBUTIONS_ENABLED = process.env.MONTRA_CITY_MARKET_CONTRIBUTIONS === "1";
export const CITY_RAW_ITEMS = ["mat_raw_wood_1", "mat_raw_stone_1"] as const;
export const CITY_PRODUCT = "mat_metal_1";
export const CITY_MINING_ORE = "mat_raw_stone_2";
export const CITY_MINING_PRODUCT = "mat_metal_2";
export const CITY_MARKET_ITEMS = [CITY_PRODUCT, CITY_MINING_PRODUCT] as const;
export type CityMarketItem = typeof CITY_MARKET_ITEMS[number];
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
export const CITY_MINING_WAREHOUSE_MATERIALS = [
  {item: CITY_MINING_ORE, column: "stone", amount: 12},
  {item: CITY_MINING_PRODUCT, column: "metal", amount: 6},
] as const;
export const CITY_WAREHOUSE_REQUIREMENTS = {
  [CITY_PRODUCTION_SITE]: CITY_WAREHOUSE_MATERIALS,
  [CITY_MINING_SITE]: CITY_MINING_WAREHOUSE_MATERIALS,
};
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
export const CITY_HAUL_AMOUNT = 12;
export const CITY_HAUL_DURATION_MS = 86_400_000;
export const CITY_MARKET_QUANTITY = 12;
export const CITY_MARKET_SHELF = 24;
export const CITY_MARKET_TARGET = [12, 24, 36] as const;
export const CITY_MARKET_BUDGET = 1_000_000_000;
export const CITY_CONTRACT_DURATION_MS = 86_400_000;
export const CITY_NEUTRAL_RETURN_DURATION_MS = 86_400_000;
const cityMarketProfiles = {
  [CITY_PRODUCT]: {shelf: CITY_MARKET_SHELF, target: CITY_MARKET_TARGET, sellPrice: 13, buyPrice: 11},
  [CITY_MINING_PRODUCT]: {shelf: 12, target: [6, 12, 18], sellPrice: 36, buyPrice: 34},
} as const;
export const CITY_SUPPLY_MATERIALS = [
  {item: CITY_MINING_ORE, amount: 6}, {item: CITY_MINING_PRODUCT, amount: 3},
] as const;
export const CITY_SUPPLY_RECOVERY_SPEED = .5;
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
  {action: "mission_open"; epoch: number; audience: "guild" | "public"; slots: number; reward: number; hours: number; purpose?: "warehouse"} |
  {action: "mission_accept" | "mission_submit" | "mission_abandon" | "mission_cancel"; missionId: string}
);
export type CityPolicyOrder = {requestId: string; action: "policy_set"; epoch: number; policy: CityPolicy};
export type CitySupplyOrder = {requestId: string; epoch: number} & (
  {action: "supply_reserve"} |
  {action: "supply_cancel" | "supply_repair" | "supply_recover"; supplyId: string}
);
export type CitySupplyRepair = {id: string; epoch: number; guild: string; battle: number};
export type CityMarketOrder = {requestId: string; epoch: number; site: CitySite; item?: CityMarketItem} & (
  {action: "local_market_config"; open: boolean; limit: number} |
  {action: "local_market_stock"; amount: number} |
  {action: "local_market_budget"; amount: number} |
  {action: "local_market_trade"; amount: number; total: number}
);
export type CityNeutralMarketOrder = {requestId: string} & (
  {action: "neutral_market_list"; epoch: number; slot: number; amount: number; unitPrice: number} |
  {action: "neutral_market_buy"; epoch: number; amount: number; total: number} |
  {action: "neutral_market_withdraw"; offerId: string}
);
export type CityMarketContributionOrder = {requestId: string; action: "market_contribute"; epoch: number; amount: number};
export type CityNeutralReturnOrder = {requestId: string} & (
  {action: "neutral_return_open"; epoch: number; amount: number; unitPrice: number} |
  {action: "neutral_return_sell"; epoch: number; amount: number; total: number} |
  {action: "neutral_return_cancel"; orderId: string} |
  {action: "neutral_return_claim"; orderId: string; amount: number}
);
export type CityHaulOrder = {requestId: string} & (
  {action: "haul_open"; epoch: number; destination: CitySite; destinationEpoch: number;
    amount: number; reward: number; audience: "guild" | "public"} |
  {action: "haul_approve" | "haul_decline" | "haul_cancel" | "haul_pickup" | "haul_deliver" | "haul_abandon"; haulId: string}
);
export type CityContractOrder = {requestId: string} & (
  {action: "contract_open"; epoch: number; amount: number; gold: number} |
  {action: "contract_accept"; contractId: string; total: number} |
  {action: "contract_cancel" | "contract_deliver" | "contract_abandon"; contractId: string}
);

export type CityFactoryOrder = {requestId: string} & (
  WarehouseOrder |
  {action: "build" | "start" | "start_fast"; epoch: number} |
  {action: "deposit"; epoch: number; slot: number; item: CityInput; amount: number} |
  {action: "list"; epoch: number; amount: number; price: number; item?: typeof CITY_MINING_PRODUCT} |
  {action: "cancel"; listingId: string} |
  {action: "reclaim"; epoch: number; item: CityItem; amount: number}
);
export type CityOrder = CityFactoryOrder | CityWorkshopOrder | CityPurchaseOrder | CityMissionOrder |
  CityPolicyOrder | CitySupplyOrder | CityHaulOrder | CityMarketOrder | CityContractOrder | CityNeutralMarketOrder |
  CityMarketContributionOrder | CityNeutralReturnOrder | ({requestId: string} & (
  {action: "disband"; guildId: string} |
  {action: "claim_disband"; guildId: string; item: CityAsset; amount: number}
));
export type CityDisband = {guild: string; actor: string; name: string; requested: number};

export type CityMember = {id: string; name: string; officer: boolean; commander?: boolean};
export type CityTenure = {id: number; guild: string};
export type CityOwnership = {
  active: CityTenure | null;
  previous: {guild: string; ended: number; siegeStarted?: number} | null;
  neutralEpoch?: number;
  siegeStarted?: number;
  defense?: {seq: number; started: number; damaged: boolean};
};
export type CityOwnerships = Readonly<Record<CitySite, CityOwnership>>;

export function otherCity(site: CitySite): CitySite {
  return site === CITY_PRODUCTION_SITE ? CITY_MINING_SITE : CITY_PRODUCTION_SITE;
}

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

export function isCitySupplyOrder(order: CityOrder): order is CitySupplyOrder {
  return order.action === "supply_reserve" || order.action === "supply_cancel" ||
    order.action === "supply_repair" || order.action === "supply_recover";
}

export function isCityHaulOrder(order: CityOrder): order is CityHaulOrder {
  return order.action === "haul_open" || order.action === "haul_approve" || order.action === "haul_decline" ||
    order.action === "haul_cancel" || order.action === "haul_pickup" || order.action === "haul_deliver" || order.action === "haul_abandon";
}

export function isCityMarketOrder(order: CityOrder): order is CityMarketOrder {
  return order.action === "local_market_config" || order.action === "local_market_stock" ||
    order.action === "local_market_budget" || order.action === "local_market_trade";
}

export function isCityNeutralMarketOrder(order: CityOrder): order is CityNeutralMarketOrder {
  return order.action === "neutral_market_list" || order.action === "neutral_market_buy" ||
    order.action === "neutral_market_withdraw";
}

export function isCityNeutralReturnOrder(order: CityOrder): order is CityNeutralReturnOrder {
  return order.action === "neutral_return_open" || order.action === "neutral_return_sell" ||
    order.action === "neutral_return_cancel" || order.action === "neutral_return_claim";
}

export function isCityContractOrder(order: CityOrder): order is CityContractOrder {
  return order.action === "contract_open" || order.action === "contract_accept" || order.action === "contract_cancel" ||
    order.action === "contract_deliver" || order.action === "contract_abandon";
}

export function cityMarketSide(site: CitySite, item: CityMarketItem): "sell" | "buy" {
  return (site === CITY_PRODUCTION_SITE) === (item === CITY_PRODUCT) ? "sell" : "buy";
}

export function cityMarketLimits(site: CitySite, item: CityMarketItem) {
  const profile = cityMarketProfiles[item];
  return cityMarketSide(site, item) === "sell" ?
    {min: 1, initial: profile.shelf, max: profile.shelf} :
    {min: profile.target[0], initial: profile.target[1], max: profile.target[2]};
}

export function cityMarketPrices(site: CitySite, stock: number, target: number, budget: number, free: number,
  item: CityMarketItem = CITY_PRODUCT): number[] {
  const profile = cityMarketProfiles[item];
  if (cityMarketSide(site, item) === "sell") {
    return Array.from({length: Math.min(stock, CITY_MARKET_QUANTITY)},
      (_, index) => profile.sellPrice + Math.floor((profile.shelf / 2 - (stock - index)) / 4));
  }
  const prices: number[] = [];
  const available = Math.min(CITY_MARKET_QUANTITY, target - stock, free);
  for (let index = 0; index < available; index++) {
    const price = profile.buyPrice + Math.floor((target - (stock + index)) / 4);
    if (budget < price) break;
    budget -= price;
    prices.push(price);
  }
  return prices;
}

export function parseCityOrder(input: unknown): CityOrder | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const order = input as Record<string, unknown>;
  if (typeof order.requestId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(order.requestId)) return null;
  const keys = (...fields: string[]) =>
    Object.keys(order).length === fields.length + 2 && fields.every(field => Object.hasOwn(order, field));
  const marketKeys = (...fields: string[]) => keys("site", "epoch", ...fields,
    ...(Object.hasOwn(order, "item") ? ["item"] : []));
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
  if (order.action === "haul_approve" || order.action === "haul_decline" || order.action === "haul_cancel" ||
      order.action === "haul_pickup" || order.action === "haul_deliver" || order.action === "haul_abandon")
    return keys("haulId") && uuid(order.haulId) ? order as CityOrder : null;
  if (order.action === "contract_cancel" || order.action === "contract_deliver" || order.action === "contract_abandon")
    return keys("contractId") && uuid(order.contractId) ? order as CityOrder : null;
  if (order.action === "contract_accept")
    return keys("contractId", "total") && uuid(order.contractId) &&
      integer(order.total, 1, CITY_MARKET_BUDGET) ? order as CityOrder : null;
  if (order.action === "purchase_fill")
    return keys("orderId", "slot", "amount") && uuid(order.orderId) && integer(order.slot, 0, INVENTORY_SLOT_COUNT - 1) &&
      integer(order.amount, 1, CITY_POLICY_PURCHASE_AMOUNT) ? order as CityOrder : null;
  if (order.action === "disband")
    return keys("guildId") && uuid(order.guildId) ? order as CityOrder : null;
  if (order.action === "claim_disband")
    return keys("guildId", "item", "amount") && uuid(order.guildId) &&
      (order.item === "gold" || CITY_ITEMS.some(item => item === order.item)) &&
      integer(order.amount, 1, order.item === "gold" ? 1_000_000_000 : 99) ? order as CityOrder : null;
  if (order.action === "neutral_market_withdraw")
    return keys("offerId") && uuid(order.offerId) ? order as CityOrder : null;
  if (order.action === "neutral_market_list")
    return keys("epoch", "slot", "amount", "unitPrice") && integer(order.epoch, 0) && integer(order.slot, 0, INVENTORY_SLOT_COUNT - 1) &&
      integer(order.amount, 1, CITY_MARKET_QUANTITY) && integer(order.unitPrice, 1, CITY_PURCHASE_MAX_PRICE) ? order as CityOrder : null;
  if (order.action === "neutral_market_buy")
    return keys("epoch", "amount", "total") && integer(order.epoch, 0) && integer(order.amount, 1, CITY_MARKET_QUANTITY) &&
      integer(order.total, 1, CITY_MARKET_QUANTITY * CITY_PURCHASE_MAX_PRICE) ? order as CityOrder : null;
  if (order.action === "neutral_return_open")
    return keys("epoch", "amount", "unitPrice") && integer(order.epoch, 0) && integer(order.amount, 1, CITY_MARKET_QUANTITY) &&
      integer(order.unitPrice, 1, CITY_PURCHASE_MAX_PRICE) ? order as CityOrder : null;
  if (order.action === "neutral_return_sell")
    return keys("epoch", "amount", "total") && integer(order.epoch, 0) && integer(order.amount, 1, CITY_MARKET_QUANTITY) &&
      integer(order.total, 1, CITY_MARKET_QUANTITY * CITY_PURCHASE_MAX_PRICE) ? order as CityOrder : null;
  if (order.action === "neutral_return_cancel")
    return keys("orderId") && uuid(order.orderId) ? order as CityOrder : null;
  if (order.action === "neutral_return_claim")
    return keys("orderId", "amount") && uuid(order.orderId) &&
      integer(order.amount, 1, CITY_MARKET_QUANTITY) ? order as CityOrder : null;
  if (!integer(order.epoch, 1)) return null;
  switch (order.action) {
    case "market_contribute":
      return keys("epoch", "amount") && integer(order.amount, 1, CITY_MARKET_BUDGET) ? order as CityOrder : null;
    case "contract_open":
      return keys("epoch", "amount", "gold") && integer(order.amount, 1, CITY_MARKET_QUANTITY) &&
        integer(order.gold, 1, CITY_MISSION_MAX_REWARD) ? order as CityOrder : null;
    case "local_market_config":
    case "local_market_stock":
    case "local_market_budget":
    case "local_market_trade": {
      const site = CITY_SITES.find(site => site === order.site);
      const item = Object.hasOwn(order, "item") ? CITY_MARKET_ITEMS.find(item => item === order.item) : CITY_PRODUCT;
      if (!site || !item) return null;
      const side = cityMarketSide(site, item), {min, max} = cityMarketLimits(site, item);
      switch (order.action) {
        case "local_market_config":
          return marketKeys("open", "limit") && typeof order.open === "boolean" && integer(order.limit, min, max)
            ? order as CityOrder : null;
        case "local_market_stock":
          return marketKeys("amount") && side === "sell" && integer(order.amount, -max, max) && order.amount !== 0
            ? order as CityOrder : null;
        case "local_market_budget":
          return marketKeys("amount") && side === "buy" &&
            integer(order.amount, -CITY_MARKET_BUDGET, CITY_MARKET_BUDGET) && order.amount !== 0 ? order as CityOrder : null;
        case "local_market_trade":
          return marketKeys("amount", "total") && integer(order.amount, 1, CITY_MARKET_QUANTITY) &&
            integer(order.total, 1, CITY_MARKET_BUDGET) ? order as CityOrder : null;
      }
    }
    case "supply_reserve":
      return keys("epoch") ? order as CityOrder : null;
    case "supply_cancel":
    case "supply_repair":
    case "supply_recover":
      return keys("epoch", "supplyId") && uuid(order.supplyId) ? order as CityOrder : null;
    case "haul_open":
      return keys("epoch", "destination", "destinationEpoch", "amount", "reward", "audience") &&
        CITY_SITES.some(site => site === order.destination) && integer(order.destinationEpoch, 1) &&
        integer(order.amount, 1, CITY_HAUL_AMOUNT) && integer(order.reward, 1, CITY_MISSION_MAX_REWARD) &&
        (order.audience === "guild" || order.audience === "public") ? order as CityOrder : null;
    case "policy_set":
      return keys("epoch", "policy") && (order.policy === "industry" || order.policy === "procurement") ? order as CityOrder : null;
    case "mission_open":
      return (keys("epoch", "audience", "slots", "reward", "hours") ||
        (keys("epoch", "audience", "slots", "reward", "hours", "purpose") && order.purpose === "warehouse" && order.audience === "guild")) &&
        (order.audience === "guild" || order.audience === "public") && integer(order.slots, 1, CITY_MISSION_WORKERS) &&
        integer(order.reward, 1, CITY_MISSION_MAX_REWARD) && CITY_MISSION_HOURS.some(hours => hours === order.hours) ? order as CityOrder : null;
    case "purchase_open":
      return keys("epoch", "amount", "unitPrice") && integer(order.amount, 1, CITY_POLICY_PURCHASE_AMOUNT) &&
        integer(order.unitPrice, 1, CITY_PURCHASE_MAX_PRICE) ? order as CityOrder : null;
    case "workshop_start":
      return keys("epoch", "woodSlot", "stoneSlot") && integer(order.woodSlot, 0, INVENTORY_SLOT_COUNT - 1) &&
        integer(order.stoneSlot, 0, INVENTORY_SLOT_COUNT - 1) && order.woodSlot !== order.stoneSlot ? order as CityOrder : null;
    case "build":
    case "start":
    case "start_fast":
    case "warehouse_start":
      return keys("epoch") ? order as CityOrder : null;
    case "deposit":
      return keys("epoch", "slot", "item", "amount") && integer(order.slot, 0, INVENTORY_SLOT_COUNT - 1) &&
        (CITY_RAW_ITEMS.some(item => item === order.item) || order.item === CITY_PRODUCT || order.item === CITY_MINING_ORE) &&
        integer(order.amount, 1, 99) ? order as CityOrder : null;
    case "list":
      return (keys("epoch", "amount", "price") || (keys("epoch", "amount", "price", "item") && order.item === CITY_MINING_PRODUCT)) &&
        integer(order.amount, 1, 99) &&
        integer(order.price, 1, 1_000_000_000) ? order as CityOrder : null;
    case "reclaim":
    case "warehouse_allocate":
      return keys("epoch", "item", "amount") && CITY_ITEMS.some(item => item === order.item) &&
        integer(order.amount, 1, 99) ? order as CityOrder : null;
    case "warehouse_contribute":
      return keys("epoch", "slot", "item", "amount") && integer(order.slot, 0, INVENTORY_SLOT_COUNT - 1) &&
        [...CITY_WAREHOUSE_MATERIALS, ...CITY_MINING_WAREHOUSE_MATERIALS].some(({item}) => item === order.item) &&
        integer(order.amount, 1, 99) ? order as CityOrder : null;
    default:
      return null;
  }
}
