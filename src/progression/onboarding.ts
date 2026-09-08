export const ONBOARDING_STEPS = ["move", "aim", "fire", "objective"] as const;
export type OnboardingStepId = typeof ONBOARDING_STEPS[number];
export interface OnboardingState {
  version: 1;
  status: "not-started" | "active" | "completed" | "skipped";
  currentStepId?: OnboardingStepId;
  seenStepIds: OnboardingStepId[];
}
export const ONBOARDING_MOVE_METERS = 30;
export function createOnboardingState(completed = false): OnboardingState {
  return { version: 1, status: completed ? "completed" : "not-started", seenStepIds: completed ? [...ONBOARDING_STEPS] : [] };
}
export function normalizeOnboardingState(value: unknown, legacyVeteran = false): OnboardingState {
  if (!value || typeof value !== "object") return createOnboardingState(legacyVeteran);
  const candidate = value as Partial<OnboardingState>;
  if (candidate.version !== 1 || !["not-started", "active", "completed", "skipped"].includes(candidate.status ?? "")) return createOnboardingState(legacyVeteran);
  const seenStepIds = ONBOARDING_STEPS.filter((step) => Array.isArray(candidate.seenStepIds) && candidate.seenStepIds.includes(step));
  const status = candidate.status!;
  if (status === "completed") return createOnboardingState(true);
  if (status !== "active") return { version: 1, status, seenStepIds };
  const currentStepId = ONBOARDING_STEPS.includes(candidate.currentStepId!) ? candidate.currentStepId! : "move";
  return { version: 1, status, currentStepId, seenStepIds: seenStepIds.filter((step) => ONBOARDING_STEPS.indexOf(step) < ONBOARDING_STEPS.indexOf(currentStepId)) };
}
export function shouldOfferOnboarding(state: OnboardingState): boolean { return state.status === "not-started"; }
export function startOnboarding(state?: OnboardingState): OnboardingState {
  return state?.status === "active" ? normalizeOnboardingState(state) : { version: 1, status: "active", currentStepId: "move", seenStepIds: [] };
}
export function skipOnboarding(state: OnboardingState): OnboardingState {
  return { version: 1, status: "skipped", seenStepIds: [...state.seenStepIds] };
}
export interface OnboardingEvidence {
  distanceTravelled?: number;
  isAiming?: boolean;
  playerShot?: boolean;
  mapOpened?: boolean;
}
/** Consume successful actions only, and at most one step for each observation. */
export function advanceOnboarding(state: OnboardingState, evidence: OnboardingEvidence): OnboardingState {
  if (state.status !== "active") return state;
  const step = state.currentStepId ?? "move";
  const complete = step === "move" ? Number.isFinite(evidence.distanceTravelled) && evidence.distanceTravelled! >= ONBOARDING_MOVE_METERS
    : step === "aim" ? evidence.isAiming === true : step === "fire" ? evidence.playerShot === true : evidence.mapOpened === true;
  if (!complete) return state;
  const next = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1];
  return next ? { version: 1, status: "active", currentStepId: next, seenStepIds: [...new Set([...state.seenStepIds, step])] } : createOnboardingState(true);
}
