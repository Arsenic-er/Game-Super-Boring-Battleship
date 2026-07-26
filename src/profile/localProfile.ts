import { DEFAULT_MAIN_GUN_ID } from "../ships/components";
import type { MainGunId } from "../ships/components";
import { DEFAULT_TORPEDO_ID } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import type { BattleStatus } from "../sim/types";
import {
  CATEGORY_META,
  EQUIPMENT_BY_ID,
  EQUIPMENT_CATALOG,
  equipmentFor,
} from "./equipmentCatalog";
import type { EquipmentCategory, EquipmentRarity, HullId } from "./equipmentCatalog";

export interface LocalProfile {
  version: 3;
  commanderName: string;
  credits: number;
  researchPoints: number;
  supplyTokens: number;
  materials: { steel: number; parts: number };
  drawCount: number;
  battlesCompleted: number;
  inventory: Record<string, number>;
  unlockedEquipment: Record<string, boolean>;
  recentDraws: SupplyDrawResult[];
  hullId: HullId;
  loadout: Record<EquipmentCategory, string | null>;
}

export interface ArmoryTransaction {
  profile: LocalProfile;
  success: boolean;
  reason: "ok" | "unknown-item" | "already-unlocked" | "research-required"
    | "insufficient-resources" | "installed" | "protected-baseline" | "not-owned";
}

export interface BattleEconomyReward {
  credits: number;
  researchPoints: number;
  steel: number;
  parts: number;
  supplyTokens: number;
}

export interface SupplyDrawResult {
  kind: "material" | "equipment";
  rarity: EquipmentRarity;
  itemId?: string;
  material?: "steel" | "parts";
  amount?: number;
}

export interface BattleLoadout {
  mainGunId: MainGunId;
  torpedoId: TorpedoId;
  maxSpeedMultiplier: number;
  accelerationMultiplier: number;
  turnMultiplier: number;
  reloadMultiplier: number;
  magazineRiskMultiplier: number;
}

const STORAGE_KEY = "grey-sea-local-profile-v3";
const LEGACY_STORAGE_KEYS = ["grey-sea-local-profile-v1"] as const;
const categories = Object.keys(CATEGORY_META) as EquipmentCategory[];

function baseLoadout(): LocalProfile["loadout"] {
  return Object.fromEntries(categories.map((category) => [
    category,
    category === "sideGun" ? null : equipmentFor(category, "common").id,
  ])) as LocalProfile["loadout"];
}

function baseInventory(): Record<string, number> {
  return Object.fromEntries(categories
    .filter((category) => category !== "sideGun")
    .map((category) => [equipmentFor(category, "common").id, 1]));
}

function baseUnlocks(): Record<string, boolean> {
  return Object.fromEntries(EQUIPMENT_CATALOG
    .filter((item) => item.rarity === "common")
    .map((item) => [item.id, true]));
}

export function createDefaultLocalProfile(): LocalProfile {
  return {
    version: 3,
    commanderName: "本地舰长",
    credits: 12_000,
    researchPoints: 220,
    supplyTokens: 10,
    materials: { steel: 240, parts: 80 },
    drawCount: 0,
    battlesCompleted: 0,
    inventory: baseInventory(),
    unlockedEquipment: baseUnlocks(),
    recentDraws: [],
    hullId: "destroyer",
    loadout: baseLoadout(),
  };
}

export function normalizeLocalProfile(value: unknown): LocalProfile {
  const defaults = createDefaultLocalProfile();
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const oldLoadout = candidate.loadout && typeof candidate.loadout === "object"
    ? candidate.loadout as Record<string, unknown>
    : {};
  const requestedName = typeof candidate.commanderName === "string" ? candidate.commanderName.trim().slice(0, 20) : "";
  const inventory = { ...baseInventory() };
  if (candidate.inventory && typeof candidate.inventory === "object") {
    for (const [id, count] of Object.entries(candidate.inventory as Record<string, unknown>)) {
      if (EQUIPMENT_BY_ID[id] && typeof count === "number" && Number.isFinite(count)) inventory[id] = Math.max(0, Math.floor(count));
    }
  }
  const unlockedEquipment = { ...baseUnlocks() };
  if (candidate.unlockedEquipment && typeof candidate.unlockedEquipment === "object") {
    for (const [id, unlocked] of Object.entries(candidate.unlockedEquipment as Record<string, unknown>)) {
      if (EQUIPMENT_BY_ID[id] && unlocked === true) unlockedEquipment[id] = true;
    }
  }
  // Every previously owned component remains researched after the v2 migration.
  for (const [id, count] of Object.entries(inventory)) {
    if (count > 0 && EQUIPMENT_BY_ID[id]) unlockedEquipment[id] = true;
  }
  const legacyMainGun = oldLoadout.mainGun === "mk2-twin" ? "mainGun-purple" : "mainGun-common";
  inventory[legacyMainGun] = Math.max(1, inventory[legacyMainGun] ?? 0);
  unlockedEquipment[legacyMainGun] = true;
  const loadout = baseLoadout();
  for (const category of categories) {
    const requested = oldLoadout[category];
    const item = typeof requested === "string" ? EQUIPMENT_BY_ID[requested] : undefined;
    if (item?.category === category && item.compatibleHulls.includes("destroyer") && (inventory[item.id] ?? 0) > 0) loadout[category] = item.id;
  }
  if (!oldLoadout.mainGun || String(oldLoadout.mainGun).startsWith("mk")) loadout.mainGun = legacyMainGun;
  loadout.sideGun = null;
  const recent = Array.isArray(candidate.recentDraws)
    ? candidate.recentDraws.filter((entry) => entry && typeof entry === "object").slice(0, 10) as SupplyDrawResult[]
    : [];
  return {
    version: 3,
    commanderName: requestedName || defaults.commanderName,
    credits: finiteInt(candidate.credits, defaults.credits, 999_999),
    researchPoints: finiteInt(candidate.researchPoints, defaults.researchPoints, 999_999),
    supplyTokens: finiteInt(candidate.supplyTokens, defaults.supplyTokens, 9_999),
    materials: {
      steel: finiteInt((candidate.materials as Record<string, unknown> | undefined)?.steel, defaults.materials.steel, 999_999),
      parts: finiteInt((candidate.materials as Record<string, unknown> | undefined)?.parts, defaults.materials.parts, 999_999),
    },
    drawCount: finiteInt(candidate.drawCount, 0, 999_999),
    battlesCompleted: finiteInt(candidate.battlesCompleted, 0, 999_999),
    inventory,
    unlockedEquipment,
    recentDraws: recent,
    hullId: "destroyer",
    loadout,
  };
}

function finiteInt(value: unknown, fallback: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
}

export function setCommanderName(profile: LocalProfile, name: string): LocalProfile {
  return normalizeLocalProfile({ ...profile, commanderName: name });
}

function rollRarity(drawNumber: number, roll: number): EquipmentRarity | "material" {
  if (drawNumber % 100 === 0) return "redGold";
  if (drawNumber % 50 === 0) return "gold";
  if (drawNumber % 10 === 0) return "purple";
  if (roll < 0.55) return "material";
  if (roll < 0.91) return "common";
  if (roll < 0.982) return "purple";
  if (roll < 0.998) return "gold";
  return "redGold";
}

export function drawSupplies(
  source: LocalProfile,
  requestedCount: 1 | 10,
  random: () => number = Math.random,
): { profile: LocalProfile; results: SupplyDrawResult[] } {
  let profile = normalizeLocalProfile(source);
  const count = Math.min(requestedCount, profile.supplyTokens);
  const results: SupplyDrawResult[] = [];
  for (let index = 0; index < count; index += 1) {
    const drawNumber = profile.drawCount + 1;
    const rarity = rollRarity(drawNumber, random());
    profile.drawCount = drawNumber;
    profile.supplyTokens -= 1;
    if (rarity === "material") {
      const material = random() < 0.65 ? "steel" : "parts";
      const amount = material === "steel" ? 18 + Math.floor(random() * 23) : 5 + Math.floor(random() * 9);
      profile.materials[material] += amount;
      results.push({ kind: "material", rarity: "common", material, amount });
      continue;
    }
    const pool = EQUIPMENT_CATALOG.filter((item) => item.rarity === rarity);
    const item = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    profile.inventory[item.id] = (profile.inventory[item.id] ?? 0) + 1;
    results.push({ kind: "equipment", rarity, itemId: item.id });
  }
  profile.recentDraws = [...results].reverse().concat(profile.recentDraws).slice(0, 10);
  return { profile: normalizeLocalProfile(profile), results };
}

export function researchComponent(source: LocalProfile, itemId: string): ArmoryTransaction {
  const profile = normalizeLocalProfile(source);
  const item = EQUIPMENT_BY_ID[itemId];
  if (!item) return { profile, success: false, reason: "unknown-item" };
  if (profile.unlockedEquipment[itemId]) {
    return { profile, success: false, reason: "already-unlocked" };
  }
  if (profile.researchPoints < item.researchCost) {
    return { profile, success: false, reason: "insufficient-resources" };
  }
  profile.researchPoints -= item.researchCost;
  profile.unlockedEquipment[itemId] = true;
  return { profile: normalizeLocalProfile(profile), success: true, reason: "ok" };
}

export function purchaseComponent(source: LocalProfile, itemId: string): ArmoryTransaction {
  const profile = normalizeLocalProfile(source);
  const item = EQUIPMENT_BY_ID[itemId];
  if (!item) return { profile, success: false, reason: "unknown-item" };
  if (!profile.unlockedEquipment[itemId]) {
    return { profile, success: false, reason: "research-required" };
  }
  const cost = item.purchaseCost;
  if (
    profile.credits < cost.credits
    || profile.materials.steel < cost.steel
    || profile.materials.parts < cost.parts
  ) return { profile, success: false, reason: "insufficient-resources" };
  profile.credits -= cost.credits;
  profile.materials.steel -= cost.steel;
  profile.materials.parts -= cost.parts;
  profile.inventory[itemId] = (profile.inventory[itemId] ?? 0) + 1;
  return { profile: normalizeLocalProfile(profile), success: true, reason: "ok" };
}

function availableCopies(profile: LocalProfile, itemId: string): number {
  const item = EQUIPMENT_BY_ID[itemId];
  if (!item) return 0;
  const installed = profile.loadout[item.category] === itemId ? 1 : 0;
  return Math.max(0, (profile.inventory[itemId] ?? 0) - installed);
}

export function sellComponent(source: LocalProfile, itemId: string): ArmoryTransaction {
  const profile = normalizeLocalProfile(source);
  const item = EQUIPMENT_BY_ID[itemId];
  if (!item) return { profile, success: false, reason: "unknown-item" };
  if ((profile.inventory[itemId] ?? 0) <= 0) {
    return { profile, success: false, reason: "not-owned" };
  }
  if (availableCopies(profile, itemId) <= 0) {
    return { profile, success: false, reason: "installed" };
  }
  if (item.rarity === "common" && (profile.inventory[itemId] ?? 0) <= 1) {
    return { profile, success: false, reason: "protected-baseline" };
  }
  profile.inventory[itemId] -= 1;
  profile.credits += item.sellCredits;
  return { profile: normalizeLocalProfile(profile), success: true, reason: "ok" };
}

export function salvageComponent(source: LocalProfile, itemId: string): ArmoryTransaction {
  const profile = normalizeLocalProfile(source);
  const item = EQUIPMENT_BY_ID[itemId];
  if (!item) return { profile, success: false, reason: "unknown-item" };
  if ((profile.inventory[itemId] ?? 0) <= 0) {
    return { profile, success: false, reason: "not-owned" };
  }
  if (availableCopies(profile, itemId) <= 0) {
    return { profile, success: false, reason: "installed" };
  }
  if (item.rarity === "common" && (profile.inventory[itemId] ?? 0) <= 1) {
    return { profile, success: false, reason: "protected-baseline" };
  }
  profile.inventory[itemId] -= 1;
  profile.materials.parts += item.salvageParts;
  return { profile: normalizeLocalProfile(profile), success: true, reason: "ok" };
}

export function awardBattleResult(
  source: LocalProfile,
  status: Exclude<BattleStatus, "running">,
): { profile: LocalProfile; reward: BattleEconomyReward } {
  const profile = normalizeLocalProfile(source);
  const reward: BattleEconomyReward = status === "player-won"
    ? { credits: 2_200, researchPoints: 90, steel: 4, parts: 12, supplyTokens: 1 }
    : status === "draw"
      ? { credits: 1_700, researchPoints: 70, steel: 3, parts: 9, supplyTokens: 1 }
      : { credits: 1_400, researchPoints: 55, steel: 2, parts: 7, supplyTokens: 1 };
  profile.credits += reward.credits;
  profile.researchPoints += reward.researchPoints;
  profile.materials.steel += reward.steel;
  profile.materials.parts += reward.parts;
  profile.supplyTokens += reward.supplyTokens;
  profile.battlesCompleted += 1;
  return { profile: normalizeLocalProfile(profile), reward };
}

export function equipComponent(source: LocalProfile, itemId: string): LocalProfile {
  const profile = normalizeLocalProfile(source);
  const item = EQUIPMENT_BY_ID[itemId];
  if (!item || (profile.inventory[itemId] ?? 0) < 1 || !item.compatibleHulls.includes(profile.hullId)) return profile;
  return normalizeLocalProfile({ ...profile, loadout: { ...profile.loadout, [item.category]: itemId } });
}

export function battleLoadout(profileSource: LocalProfile): BattleLoadout {
  const profile = normalizeLocalProfile(profileSource);
  const equipped = (category: EquipmentCategory) => {
    const id = profile.loadout[category];
    return id ? EQUIPMENT_BY_ID[id] : undefined;
  };
  const gun = equipped("mainGun");
  const torpedo = equipped("torpedo");
  const engine = equipped("engine");
  const steering = equipped("steering");
  const magazine = equipped("magazine");
  return {
    mainGunId: gun?.mainGunId ?? DEFAULT_MAIN_GUN_ID,
    torpedoId: torpedo?.torpedoId ?? DEFAULT_TORPEDO_ID,
    maxSpeedMultiplier: 1 + (engine?.bonus ?? 0),
    accelerationMultiplier: 1 + (engine?.bonus ?? 0) * 0.85,
    turnMultiplier: 1 + (steering?.bonus ?? 0),
    reloadMultiplier: 1 - (magazine?.bonus ?? 0) * 0.72,
    magazineRiskMultiplier: (1 + (magazine?.drawback ?? 0)) * (1 + (torpedo?.drawback ?? 0)),
  };
}

export function guaranteeProgress(drawCount: number, threshold: 10 | 50 | 100): number {
  const remainder = drawCount % threshold;
  return remainder === 0 && drawCount > 0 ? threshold : remainder;
}

export function loadLocalProfile(): LocalProfile {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeLocalProfile(JSON.parse(stored));
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacy = window.localStorage.getItem(legacyKey);
      if (!legacy) continue;
      const migrated = normalizeLocalProfile(JSON.parse(legacy));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return createDefaultLocalProfile();
  } catch {
    return createDefaultLocalProfile();
  }
}

export function saveLocalProfile(profile: LocalProfile): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLocalProfile(profile))); } catch { /* optional */ }
}
