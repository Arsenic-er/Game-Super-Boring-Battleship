/** Small, interruptible UI transitions. They never queue input or mutate game time. */
export const PORT_MOTION = { hover: 120, panel: 220, ship: 350 } as const;
const running = new WeakMap<HTMLElement, { token: object; animation?: Animation }>();
export function reducedPortMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function portVisibility(element: HTMLElement, visible: boolean, duration: number = PORT_MOTION.panel): void {
  const prior = running.get(element);
  const computed = prior?.animation && typeof getComputedStyle === "function" ? getComputedStyle(element) : undefined;
  const startOpacity = computed?.opacity;
  const startTransform = computed?.transform;
  // Snapshot the current interpolated state before cancelling, so reversal never jumps.
  prior?.animation?.cancel();
  const token = {};
  const state: { token: object; animation?: Animation } = { token };
  running.set(element, state);
  element.inert = !visible;
  if (!visible && element.hidden) { running.delete(element); return; }
  element.hidden = false;
  if (reducedPortMotion() || typeof element.animate !== "function") {
    element.hidden = !visible;
    running.delete(element);
    return;
  }
  state.animation = element.animate([
    { opacity: startOpacity ?? (visible ? 0 : 1), transform: startTransform ?? (visible ? "translateY(10px)" : "translateY(0)") },
    { opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)" }],
  { duration, easing: "cubic-bezier(.2,.8,.2,1)", fill: "none" });
  void state.animation.finished.then(() => {
    if (running.get(element)?.token === token) { element.hidden = !visible; running.delete(element); }
  }).catch(() => { /* A newer input owns the element; cancelling is intentional. */ });
}
export function portEnter(element: HTMLElement, duration: number = PORT_MOTION.panel): void {
  portVisibility(element, true, duration);
}
