import type { BattleEconomyReward } from "../profile/localProfile";
export interface SettledBattleRecord { battleId: string; reward: BattleEconomyReward }
export const MAX_SETTLED_BATTLES = 128;
export function isBattleId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function normalizeSettledBattles(value: unknown): SettledBattleRecord[] {
  if (!Array.isArray(value)) return [];
  const latest = new Map<string, SettledBattleRecord>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || !isBattleId(entry.battleId)) continue;
    const validReward = entry.reward && typeof entry.reward === "object" && ["credits", "researchPoints", "steel", "parts", "supplyTokens"].every((key) => typeof entry.reward[key] === "number" && Number.isFinite(entry.reward[key]) && entry.reward[key] >= 0);
    const reward: BattleEconomyReward = validReward ? {
      credits: Math.floor(entry.reward.credits), researchPoints: Math.floor(entry.reward.researchPoints),
      steel: Math.floor(entry.reward.steel), parts: Math.floor(entry.reward.parts), supplyTokens: Math.floor(entry.reward.supplyTokens),
    } : { credits: 0, researchPoints: 0, steel: 0, parts: 0, supplyTokens: 0 };
    const battleId = entry.battleId.toLowerCase();
    latest.delete(battleId);
    latest.set(battleId, { battleId, reward });
  }
  return [...latest.values()].slice(-MAX_SETTLED_BATTLES);
}
