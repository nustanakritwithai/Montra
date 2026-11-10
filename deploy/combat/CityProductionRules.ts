import {RIVER_CITY} from "./RiverCity.js";

export const CITY_PRODUCTION_SITE = RIVER_CITY;
export const CITY_PRODUCTION_ENABLED = process.env.MONTRA_CITY_PRODUCTION === "1";
export const CITY_RAW_ITEMS = ["mat_raw_wood_1", "mat_raw_stone_1"] as const;
export const CITY_PRODUCT = "mat_metal_1";
export const CITY_ITEMS = [...CITY_RAW_ITEMS, CITY_PRODUCT] as const;
export type CityItem = typeof CITY_ITEMS[number];

export const CITY_FACTORY_COSTS = [
  {wood: 5, stone: 5},
  {wood: 10, stone: 10},
] as const;
export const CITY_RECIPE = {wood: 1, stone: 2, quantity: 1};
export const CITY_CAPACITY = 60;
export const CITY_DURATION_MS = [0, 120_000, 60_000] as const;

export type CityOrder = {requestId: string} & (
  {action: "build" | "start"; epoch: number} |
  {action: "deposit"; epoch: number; slot: number; item: typeof CITY_RAW_ITEMS[number]; amount: number} |
  {action: "list"; epoch: number; amount: number; price: number} |
  {action: "cancel"; listingId: string} |
  {action: "reclaim"; epoch: number; item: CityItem; amount: number}
);

export type CityMember = {id: string; name: string; officer: boolean};
export type CityTenure = {id: number; guild: string};
export type CityOwnership = {active: CityTenure | null; previous: {guild: string; ended: number} | null};

export function parseCityOrder(input: unknown): CityOrder | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const order = input as Record<string, unknown>;
  if (typeof order.requestId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(order.requestId)) return null;
  const keys = (...fields: string[]) =>
    Object.keys(order).length === fields.length + 2 && fields.every(field => Object.hasOwn(order, field));
  const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

  if (order.action === "cancel")
    return keys("listingId") && typeof order.listingId === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(order.listingId)
      ? order as CityOrder : null;
  if (!integer(order.epoch, 1)) return null;
  switch (order.action) {
    case "build":
    case "start":
      return keys("epoch") ? order as CityOrder : null;
    case "deposit":
      return keys("epoch", "slot", "item", "amount") && integer(order.slot, 0, 11) &&
        CITY_RAW_ITEMS.some(item => item === order.item) && integer(order.amount, 1, 99) ? order as CityOrder : null;
    case "list":
      return keys("epoch", "amount", "price") && integer(order.amount, 1, 99) &&
        integer(order.price, 1, 1_000_000_000) ? order as CityOrder : null;
    case "reclaim":
      return keys("epoch", "item", "amount") && CITY_ITEMS.some(item => item === order.item) &&
        integer(order.amount, 1, 99) ? order as CityOrder : null;
    default:
      return null;
  }
}
