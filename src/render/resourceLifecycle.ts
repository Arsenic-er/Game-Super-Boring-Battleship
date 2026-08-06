export interface DisposableRenderResource {
  dispose(): void;
}

export interface ProjectileTrailResources {
  core: DisposableRenderResource;
  plume?: DisposableRenderResource;
  wakePlanes?: readonly DisposableRenderResource[];
}

/** Releases every independently-owned projectile-trail resource. */
export function disposeProjectileTrailResources(
  trail: Readonly<ProjectileTrailResources> | undefined,
): void {
  if (!trail) return;
  trail.core.dispose();
  trail.plume?.dispose();
  for (const wake of trail.wakePlanes ?? []) wake.dispose();
}
