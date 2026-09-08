import { battleLoadout, type LocalProfile, type ProfileSaveResult } from "../profile/localProfile";
import { battleLoadoutForSavedBuild } from "../profile/savedBuilds";
import { BattleProgression, createBattleLaunchContext, type BattleLaunchContext, type BattleCompletion, type ProfileMutationResult } from "../progression/battleProgression";
import { BattleTelemetryAccumulator } from "../progression/battleTelemetry";
import { advanceOnboarding, createOnboardingState, skipOnboarding, startOnboarding, type OnboardingEvidence } from "../progression/onboarding";
import type { BattleStepOutput } from "../session/battleSession";
import type { GameLaunchRequest } from "../sim/battleSetup";
import type { BattleState } from "../sim/types";
import type { ShipClassId } from "../ships/classes";

export interface LastBattleDockTarget { shipClassId: ShipClassId; savedBuildId?: string }

/** Local application lifecycle. No UUIDs, rewards or onboarding fields enter the simulation. */
export class VoyageSession {
  readonly progression: BattleProgression;
  context: BattleLaunchContext | null = null;
  private telemetry?: BattleTelemetryAccumulator;
  private completed?: BattleCompletion;
  private launchedShip?: LastBattleDockTarget;
  private lastDockTarget?: LastBattleDockTarget;
  private replayQueued = false;
  tutorialSaveFailure?: ProfileMutationResult;

  constructor(profile: LocalProfile, save?: (profile: LocalProfile) => ProfileSaveResult) {
    this.progression = new BattleProgression(profile, save);
  }
  get profile(): LocalProfile { return this.progression.profile; }
  get result(): BattleCompletion | undefined { return this.completed; }
  get hasQueuedReplay(): boolean { return this.replayQueued; }
  get tutorialActive(): boolean {
    return Boolean(this.context?.tutorialEligible && !this.replayQueued && this.profile.onboarding.status === "active");
  }
  tutorialRequest(): GameLaunchRequest | undefined {
    const id = this.profile.selectedBattleBuildId;
    return id && battleLoadoutForSavedBuild(this.profile, id)
      ? { mode: "battle", buildId: id, teamSize: 1, weatherId: "clear" } : undefined;
  }
  launch(request: GameLaunchRequest, tutorial = false, uuid: () => string = () => crypto.randomUUID()) {
    if (request.mode === "battle") {
      const ready = this.progression.prepareRewardBattle();
      if (!ready.ok) return { ok: false as const, reason: "profileLocked" as const };
      if (request.buildId !== this.profile.selectedBattleBuildId) return { ok: false as const, reason: "buildUnavailable" as const };
    }
    const equipment = request.mode === "battle" ? battleLoadoutForSavedBuild(this.profile, request.buildId) : battleLoadout(this.profile);
    if (!equipment) return { ok: false as const, reason: "buildUnavailable" as const };
    const context = createBattleLaunchContext({ origin: request.mode === "battle" ? "solo" : "sea-trials", mode: request.mode,
      tutorialEligible: tutorial || this.profile.onboarding.status === "active", savedBuildId: request.mode === "battle" ? request.buildId : undefined }, uuid);
    const begun = this.progression.beginBattle(context);
    if (!begun.ok) return { ok: false as const, reason: "profileLocked" as const };
    if (tutorial && context) this.tutorialSaveFailure = this.progression.updateOnboarding(startOnboarding(createOnboardingState()));
    this.context = context; this.completed = undefined; this.replayQueued = false;
    this.telemetry = context ? new BattleTelemetryAccumulator("player") : undefined;
    this.launchedShip = { shipClassId: equipment.shipClassId, savedBuildId: request.mode === "battle" ? request.buildId : undefined };
    return { ok: true as const, equipment, context, visualScope: context?.battleId ?? `sea-trials:${uuid()}` };
  }
  observe(output: BattleStepOutput, isAiming: boolean): boolean {
    this.telemetry?.consume(output);
    const ship = output.state.ships.find(({ id }) => id === "player");
    return this.advance({ distanceTravelled: ship?.distanceTravelled, isAiming,
      playerShot: output.shots.some((shot) => shot.ownerId === "player" && shot.kind === "shell" && (shot.weaponSource === "mainGun" || !shot.weaponSource)) });
  }
  advance(evidence: OnboardingEvidence): boolean {
    if (!this.tutorialActive) return false;
    const next = advanceOnboarding(this.profile.onboarding, evidence);
    if (next === this.profile.onboarding) return false;
    this.tutorialSaveFailure = this.progression.updateOnboarding(next);
    return true;
  }
  skipTutorial(): void { this.tutorialSaveFailure = this.progression.updateOnboarding(skipOnboarding(this.profile.onboarding)); }
  queueTutorialReplay(): ProfileSaveResult | { ok: false; error: "pending-settlement" } {
    const result = this.progression.updateOnboarding(createOnboardingState());
    if (result.ok || result.error !== "pending-settlement") this.replayQueued = true;
    return result;
  }
  invalidateRewards(): void { this.progression.invalidateRewards(); }
  finish(state: BattleState): BattleCompletion | undefined {
    if (!this.context || !this.telemetry || state.status === "running") return undefined;
    if (!this.completed) {
      this.lastDockTarget = this.launchedShip ? { ...this.launchedShip } : undefined;
      this.completed = this.progression.finishBattle(this.context, { battleId: this.context.battleId, status: state.status,
        endReason: state.endReason, performance: this.telemetry.freeze(state) });
    }
    return this.completed;
  }
  retry(): ProfileSaveResult {
    const result = this.progression.retryPending();
    if (this.completed && this.progression.result?.result.battleId === this.completed.result.battleId) this.completed = this.progression.result;
    return result;
  }
  getDockTarget(): LastBattleDockTarget | undefined { return this.lastDockTarget && { ...this.lastDockTarget }; }
  clearDockTarget(): void { this.lastDockTarget = undefined; }
  leave(): void {
    this.context = null; this.telemetry = undefined; this.launchedShip = undefined; this.completed = undefined;
    this.progression.leaveBattle();
  }
}
