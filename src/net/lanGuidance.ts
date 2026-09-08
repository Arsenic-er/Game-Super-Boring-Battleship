import type { LanMessageKey } from "../i18n/lanLocale";

export const LAN_GUIDANCE_REASONS = ["search-empty", "host-create-failed", "manual-join-timeout", "manual-join-disconnected", "host-disconnected", "version-mismatch", "content-mismatch", "room-full", "invalid-build"] as const;
export type LanGuidanceReason = typeof LAN_GUIDANCE_REASONS[number];
export interface LanTroubleshootingState {
  readonly reason: LanGuidanceReason;
  readonly titleKey: LanMessageKey;
  readonly actionKeys: readonly LanMessageKey[];
}

const ACTIONS = {
  "search-empty": ["privateNetwork", "apIsolation", "manualAddress"],
  "host-create-failed": ["completeDesktop", "privateNetwork", "firewall"],
  "manual-join-timeout": ["checkEndpoint", "checkVersions", "privateNetwork", "firewall"],
  "manual-join-disconnected": ["checkEndpoint", "checkVersions", "privateNetwork", "firewall"],
  "host-disconnected": ["newRoom"],
  "version-mismatch": [], "content-mismatch": [], "room-full": [], "invalid-build": [],
} as const satisfies Record<LanGuidanceReason, readonly LanMessageKey[]>;

export function lanTroubleshootingState(reason: LanGuidanceReason): LanTroubleshootingState {
  return { reason, titleKey: reason, actionKeys: ACTIONS[reason] };
}

export function rejectionGuidance(reason: string): LanGuidanceReason | undefined {
  return reason === "version-mismatch" || reason === "content-mismatch" || reason === "room-full" || reason === "invalid-build" ? reason : undefined;
}
