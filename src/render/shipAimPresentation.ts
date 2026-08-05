export const OWN_SHIP_AIM_VISIBILITY = 0.2;

export interface BodyMeshVisibility {
  visibility: number;
}

export function ownShipBodyVisibility(
  shipId: string,
  aiming: boolean,
  controlledShipId = "player",
): number {
  return shipId === controlledShipId && aiming ? OWN_SHIP_AIM_VISIBILITY : 1;
}

export function applyBodyVisibility(
  meshes: readonly BodyMeshVisibility[],
  visibility: number,
): void {
  for (const mesh of meshes) mesh.visibility = visibility;
}
