import { mainBatteryMountCanBear } from "../sim/simulation";
import type { AiGunneryTelemetry, AiMainGunHoldReason, ShipState, Vec3 } from "../sim/types";

export interface AiGunneryDecisionFacts {
  preparingTorpedoes: boolean;
  fireIntent: boolean;
  concealmentRetreat: boolean;
  smokeSuppression: boolean;
  seekingCover: boolean;
  tracking: boolean;
  inRange: boolean;
  bearingAllowed: boolean;
  inSalvoWindow: boolean;
}

/** Explain already computed policy facts without changing them or sampling randomness. */
export function aiGunneryTelemetry(
  ship: Readonly<ShipState>, aim: Readonly<Vec3>, facts: AiGunneryDecisionFacts,
): AiGunneryTelemetry {
  const reasons: AiMainGunHoldReason[] = [];
  if (facts.preparingTorpedoes) reasons.push("torpedo-selected");
  if (facts.concealmentRetreat) reasons.push("withdrawal");
  if (facts.smokeSuppression) reasons.push("smoke");
  if (facts.seekingCover) reasons.push("cover");
  if (!facts.tracking) reasons.push("no-track");
  // Range/arc/window are only meaningful against a current local track.
  if (facts.tracking) {
    if (!facts.inRange) reasons.push("out-of-range");
    if (!facts.inSalvoWindow) reasons.push("salvo-window");
  }
  const totalMounts = ship.mainBatteryMounts.length;
  const operational = ship.mainBatteryMounts.filter(mount =>
    ship.modules.gun.health > 0 && mount.health > 0);
  const eligible = ship.mainBatteryMounts.filter((mount, index) =>
    ship.modules.gun.health > 0 && mount.health > 0 && mainBatteryMountCanBear(ship, index, aim));
  const readyMounts = eligible.filter(mount => mount.reloadRemaining <= 0).length;
  if (totalMounts === 0) reasons.push("no-guns");
  else if (operational.length === 0) reasons.push("gun-disabled");
  else {
    if (facts.tracking && !facts.bearingAllowed) reasons.push("arc");
    if (eligible.length > 0 && readyMounts === 0) reasons.push("reloading");
  }
  return {
    requested: !facts.preparingTorpedoes && facts.fireIntent,
    holdReasons: reasons, readyMounts, operationalMounts: operational.length, totalMounts,
    reloadSeconds: eligible.length > 0
      ? Math.max(0, Math.min(...eligible.map(mount => mount.reloadRemaining))) : undefined,
  };
}
