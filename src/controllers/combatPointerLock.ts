import { cameraPointerMoveAllowed } from "../render/combatCamera";

export interface CombatPointerLockOptions {
  isActive: () => boolean;
  onMove: (deltaX: number, deltaY: number) => void;
  hintText?: string;
}

/** Owns relative mouse input and recoverable capture; never traps a menu or steals focus. */
export class CombatPointerLock {
  private readonly document: Document;
  private readonly window: Window;
  private readonly shell: Element | null;
  private readonly recovery: HTMLButtonElement;
  private enabled = false;
  private pending = false;
  private generation = 0;
  private ignoreNextMovement = true;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: CombatPointerLockOptions) {
    this.document = canvas.ownerDocument;
    const window = this.document.defaultView;
    if (!window) throw new Error("Pointer Lock requires an active document");
    this.window = window;
    this.shell = canvas.closest(".game-shell") ?? canvas.parentElement;
    this.recovery = this.document.createElement("button");
    this.recovery.type = "button";
    this.recovery.className = "pointer-lock-recovery";
    this.recovery.hidden = true;
    this.setHintText(options.hintText ?? "点击返回游戏并锁定鼠标");
    this.shell?.append(this.recovery);
    canvas.addEventListener("pointerdown", this.onCanvasPress);
    canvas.addEventListener("pointermove", this.onPointerMove);
    this.recovery.addEventListener("click", this.onRecoveryClick);
    this.document.addEventListener("pointerlockchange", this.onLockChange);
    this.document.addEventListener("pointerlockerror", this.onLockError);
    this.document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.window.addEventListener("blur", this.onBlur);
    this.window.addEventListener("focus", this.onFocus);
  }

  private get ownsLock(): boolean { return this.document.pointerLockElement === this.canvas; }

  private get eligible(): boolean {
    return !this.disposed && this.enabled && this.options.isActive()
      && !this.document.hidden && this.document.hasFocus();
  }

  get isLocked(): boolean { return this.eligible && this.ownsLock; }

  setHintText(text: string): void {
    this.recovery.textContent = text;
    this.recovery.setAttribute("aria-label", text);
  }

  resetMotion(): void { this.ignoreNextMovement = true; }

  /** Call synchronously from battle start/resume to retain the initiating user gesture. */
  request(): void {
    if (this.disposed || !this.options.isActive()) return;
    this.enabled = true;
    this.refresh();
    if (!this.eligible || this.ownsLock || this.pending) return;
    this.pending = true;
    const generation = ++this.generation;
    try {
      const result = this.canvas.requestPointerLock();
      if (result) void Promise.resolve(result).then(() => {
        if (generation === this.generation) this.pending = false;
        // A request may complete after a menu, map or result released capture.
        if (this.ownsLock && !this.eligible) this.document.exitPointerLock();
        this.refresh();
      }, () => this.requestFailed(generation));
    } catch {
      this.requestFailed(generation);
    }
  }

  /** Intentional UI release disables click-to-capture until battle explicitly resumes. */
  release(): void {
    this.enabled = false;
    this.pending = false;
    ++this.generation;
    this.resetMotion();
    if (this.ownsLock) this.document.exitPointerLock();
    this.refresh();
  }

  private requestFailed(generation: number): void {
    if (generation !== this.generation || this.disposed) return;
    this.pending = false;
    this.resetMotion();
    // Failure remains actionable: the recovery button performs a fresh trusted request.
    this.refresh();
  }

  private refresh(): void {
    const locked = this.isLocked;
    const needed = !this.disposed && this.enabled && this.options.isActive()
      && !this.document.hidden && !locked;
    this.shell?.classList.toggle("pointer-locked", locked);
    this.shell?.classList.toggle("pointer-capture-needed", needed);
    this.recovery.hidden = !needed;
  }

  private onCanvasPress = (event: PointerEvent): void => {
    if (event.isTrusted && event.button === 0 && this.enabled
      && cameraPointerMoveAllowed(this.options.isActive(), event.pointerType)) this.request();
  };

  private onRecoveryClick = (event: MouseEvent): void => {
    if (event.isTrusted && event.button === 0 && this.enabled) this.request();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!cameraPointerMoveAllowed(this.isLocked, event.pointerType)) { this.resetMotion(); return; }
    // Discard the recenter/return-to-focus sample rather than turn it into a camera jump.
    if (this.ignoreNextMovement) { this.ignoreNextMovement = false; return; }
    const x = Number.isFinite(event.movementX) ? Math.max(-80, Math.min(80, event.movementX)) : 0;
    const y = Number.isFinite(event.movementY) ? Math.max(-80, Math.min(80, event.movementY)) : 0;
    if (x || y) this.options.onMove(x, y);
  };

  private onLockChange = (): void => {
    this.pending = false;
    this.resetMotion();
    if (this.ownsLock && !this.eligible) this.document.exitPointerLock();
    this.refresh();
  };

  private onLockError = (): void => { this.requestFailed(this.generation); };

  private suspend(): void {
    this.pending = false;
    ++this.generation;
    this.resetMotion();
    if (this.ownsLock) this.document.exitPointerLock();
    this.refresh();
  }

  private onBlur = (): void => { this.suspend(); };
  private onFocus = (): void => { this.resetMotion(); this.refresh(); };
  private onVisibilityChange = (): void => {
    if (this.document.hidden) this.suspend();
    else this.onFocus();
  };

  dispose(): void {
    if (this.disposed) return;
    this.release();
    this.disposed = true;
    this.canvas.removeEventListener("pointerdown", this.onCanvasPress);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.recovery.removeEventListener("click", this.onRecoveryClick);
    this.document.removeEventListener("pointerlockchange", this.onLockChange);
    this.document.removeEventListener("pointerlockerror", this.onLockError);
    this.document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.window.removeEventListener("blur", this.onBlur);
    this.window.removeEventListener("focus", this.onFocus);
    this.recovery.remove();
  }
}
