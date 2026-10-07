/** Low quality caps only the 3D framebuffer; CSS/DOM dimensions are unchanged. */
export const LOW_RENDER_PIXEL_BUDGET = 1280 * 720;
export const LOW_RENDER_MIN_SCALING = 1.35;

export type RenderQuality = "low" | "medium";

export interface RenderResolution {
  cssWidth: number;
  cssHeight: number;
  width: number;
  height: number;
  hardwareScalingLevel: number;
}

/**
 * Babylon uses CSS pixels / hardwareScalingLevel when adaptToDeviceRatio=false.
 * Do not multiply by devicePixelRatio: that would silently increase GPU work on
 * high-DPI phones. Medium intentionally keeps the existing CSS-native behavior.
 */
export function renderResolutionFor(
  quality: RenderQuality,
  cssWidth: number,
  cssHeight: number,
): RenderResolution {
  if (!(Number.isFinite(cssWidth) && cssWidth > 0
    && Number.isFinite(cssHeight) && cssHeight > 0)) {
    cssWidth = 1280;
    cssHeight = 720;
  }
  const hardwareScalingLevel = quality === "low"
    ? Math.max(LOW_RENDER_MIN_SCALING, Math.sqrt(cssWidth * cssHeight / LOW_RENDER_PIXEL_BUDGET))
    : 1;
  return {
    cssWidth,
    cssHeight,
    width: Math.max(1, Math.floor(cssWidth / hardwareScalingLevel)),
    height: Math.max(1, Math.floor(cssHeight / hardwareScalingLevel)),
    hardwareScalingLevel,
  };
}
