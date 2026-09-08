import { awardBattleResult, normalizeLocalProfile, saveLocalProfile } from "../profile/localProfile";
import type { BattleEconomyReward, LocalProfile, ProfileSaveResult } from "../profile/localProfile";
import type { BattleEndReason } from "../sim/types";
import type { BattlePerformanceSummary } from "./battleTelemetry";
import { isBattleId, MAX_SETTLED_BATTLES } from "./settlementRecords";
import type { OnboardingState } from "./onboarding";

export interface BattleLaunchContext {
  readonly battleId: string;
  readonly mode: "battle";
  readonly origin: "solo";
  readonly rewardEligible: true;
  readonly tutorialEligible: boolean;
  readonly savedBuildId?: string;
}
export function createBattleLaunchContext(
  options: { origin: "solo" | "lan" | "sea-trials"; mode: string; tutorialEligible?: boolean; savedBuildId?: string },
  uuid: () => string = () => crypto.randomUUID(),
): BattleLaunchContext | null {
  if (options.origin !== "solo" || options.mode !== "battle") return null;
  const battleId = uuid();
  if (!isBattleId(battleId)) throw new Error("Invalid battle UUID");
  return Object.freeze({ battleId: battleId.toLowerCase(), mode: "battle", origin: "solo", rewardEligible: true,
    tutorialEligible: options.tutorialEligible === true, ...(options.savedBuildId ? { savedBuildId: options.savedBuildId } : {}) });
}
export interface BattleResult {
  battleId: string;
  status: "player-won" | "enemy-won" | "draw";
  endReason?: BattleEndReason;
  performance: BattlePerformanceSummary;
}
export interface EconomyBalances extends BattleEconomyReward {}
export interface BattleSettlement {
  battleId: string;
  applied: boolean;
  reward: BattleEconomyReward;
  balancesAfter: EconomyBalances;
  profileAfter: LocalProfile;
}
export function economyBalances(profile: LocalProfile): EconomyBalances {
  return { credits: profile.credits, researchPoints: profile.researchPoints, supplyTokens: profile.supplyTokens,
    steel: profile.materials.steel, parts: profile.materials.parts };
}
export function settleBattle(source: LocalProfile, result: BattleResult): BattleSettlement {
  if (!isBattleId(result.battleId)) throw new Error("Invalid battle UUID");
  const battleId = result.battleId.toLowerCase();
  const profile = normalizeLocalProfile(source);
  const existing = profile.settledBattles.find((entry) => entry.battleId === battleId);
  if (existing) return { battleId, applied: false, reward: { ...existing.reward }, profileAfter: profile, balancesAfter: economyBalances(profile) };
  const awarded = awardBattleResult(profile, result.status);
  awarded.profile.settledBattles = [...awarded.profile.settledBattles, { battleId, reward: { ...awarded.reward } }].slice(-MAX_SETTLED_BATTLES);
  return { battleId, applied: true, reward: awarded.reward, profileAfter: awarded.profile, balancesAfter: economyBalances(awarded.profile) };
}
export type ProfileMutationResult = ProfileSaveResult | { ok: false; error: "pending-settlement" };
export interface PendingSettlement { readonly result: BattleResult; readonly settlement: BattleSettlement }
export interface BattleCompletion {
  eligible: boolean;
  result: BattleResult;
  settlement?: BattleSettlement;
  saveResult?: ProfileSaveResult;
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
/** Application-level transaction boundary; it never mutates BattleState or LAN data. */
export class BattleProgression {
  private currentProfile: LocalProfile;
  private pendingTransaction: PendingSettlement | null = null;
  private currentResult: BattleCompletion | null = null;
  private activeContext: BattleLaunchContext | null = null;
  private invalidatedBattleIds = new Set<string>();
  constructor(profile: LocalProfile, private readonly save: (profile: LocalProfile) => ProfileSaveResult = saveLocalProfile) {
    this.currentProfile = freezeDeep(normalizeLocalProfile(profile));
  }
  get profile(): LocalProfile { return this.currentProfile; }
  get pending(): PendingSettlement | null { return this.pendingTransaction; }
  get profileLocked(): boolean { return this.pendingTransaction !== null; }
  get result(): BattleCompletion | null { return this.currentResult; }
  beginBattle(context: BattleLaunchContext | null): ProfileMutationResult {
    if (context) {
      const ready = this.prepareRewardBattle();
      if (!ready.ok) return ready;
    }
    this.activeContext = context;
    this.currentResult = null;
    return { ok: true };
  }
  invalidateRewards(battleId = this.activeContext?.battleId): void {
    if (battleId) this.invalidatedBattleIds.add(battleId);
  }
  leaveBattle(): void { this.activeContext = null; }
  updateProfile(next: LocalProfile): ProfileMutationResult {
    if (this.profileLocked) return { ok: false, error: "pending-settlement" };
    const normalized = normalizeLocalProfile(next);
    const saved = this.save(normalized);
    if (saved.ok) this.currentProfile = freezeDeep(normalized);
    return saved;
  }
  /** Tutorial progress stays visible in memory even if its persistence fails. */
  updateOnboarding(onboarding: OnboardingState): ProfileMutationResult {
    if (this.profileLocked) return { ok: false, error: "pending-settlement" };
    this.currentProfile = freezeDeep(normalizeLocalProfile({ ...this.currentProfile, onboarding }));
    return this.save(this.currentProfile);
  }
  finishBattle(context: BattleLaunchContext | null, result: BattleResult): BattleCompletion {
    const eligible = !!context && context.origin === "solo" && context.mode === "battle" && context.rewardEligible
      && this.activeContext?.battleId === context.battleId
      && context.battleId === result.battleId && !this.invalidatedBattleIds.has(context.battleId);
    if (!eligible) return this.currentResult = { eligible: false, result: freezeDeep(structuredClone(result)) };
    // A terminal redraw after a successful save is not a new transaction.
    if (!this.pendingTransaction && this.currentResult?.eligible && this.currentResult.result.battleId === result.battleId) return this.currentResult;
    if (this.pendingTransaction) {
      if (this.pendingTransaction.result.battleId !== result.battleId) throw new Error("Pending settlement must be saved before another reward battle");
    } else {
      const immutableResult = freezeDeep(structuredClone(result));
      this.pendingTransaction = freezeDeep({ result: immutableResult, settlement: settleBattle(this.currentProfile, immutableResult) });
    }
    const pending = this.pendingTransaction;
    const saveResult = this.retryPending();
    return this.currentResult = { eligible: true, result: pending.result, settlement: pending.settlement, saveResult };
  }
  retryPending(): ProfileSaveResult {
    if (!this.pendingTransaction) return { ok: true };
    const pending = this.pendingTransaction;
    const saved = this.save(pending.settlement.profileAfter);
    if (saved.ok) {
      this.currentProfile = freezeDeep(structuredClone(pending.settlement.profileAfter));
      this.pendingTransaction = null;
    }
    if (this.currentResult?.result.battleId === pending.result.battleId) this.currentResult = { ...this.currentResult, saveResult: saved };
    return saved;
  }
  prepareRewardBattle(): ProfileSaveResult { return this.retryPending(); }
}
