export interface AimingCameraInput {
  length: number;
  beam: number;
  deckHeight: number;
  renderScaleY: number;
  heading: number;
  cameraAlpha: number;
  beta: number;
}

export interface AimingCameraPlan {
  focusDistance: number;
  targetHeight: number;
  radius: number;
  fov: number;
  hullProjection: number;
  clearance: number;
}

/** Keeps the scope camera beyond the view-facing edge of every hull size. */
export function aimingCameraPlan(input: Readonly<AimingCameraInput>): AimingCameraPlan {
  const directionX = -Math.cos(input.cameraAlpha);
  const directionZ = -Math.sin(input.cameraAlpha);
  const forwardX = Math.sin(input.heading);
  const forwardZ = Math.cos(input.heading);
  const starboardX = Math.cos(input.heading);
  const starboardZ = -Math.sin(input.heading);
  const alongHull = Math.abs(directionX * forwardX + directionZ * forwardZ);
  const acrossHull = Math.abs(directionX * starboardX + directionZ * starboardZ);
  const hullProjection = alongHull * input.length * 0.5
    + acrossHull * input.beam * 0.5;
  const radius = 78 * Math.sqrt(input.length / 112);
  const horizontalOrbitOffset = radius * Math.sin(input.beta);
  const clearance = Math.max(14, input.beam * 0.65);
  const focusDistance = hullProjection + horizontalOrbitOffset + clearance;
  const skyLook = Math.max(0, input.beta - 1.42);
  const baseTargetHeight = 7 * input.renderScaleY + skyLook * 85;
  const minimumCameraHeight = input.deckHeight + Math.max(6, input.deckHeight * 0.18);
  const targetHeight = Math.max(
    baseTargetHeight,
    minimumCameraHeight - radius * Math.cos(input.beta),
  );
  return {
    focusDistance,
    targetHeight,
    radius,
    fov: 0.44,
    hullProjection,
    clearance,
  };
}

export function cameraTransitionValue(
  current: number,
  target: number,
  enteringAiming: boolean,
  smoothing = 0.14,
): number {
  return enteringAiming ? target : current + (target - current) * smoothing;
}
