import { GUN, TORPEDO } from "../sim/config";
import { getTorpedo } from "../ships/torpedoes";
import { effectiveMainBattery } from "../ships/mainBatteries";
import type {
  AmmoType,
  ControlCommand,
  DamageControlPriority,
  ShipState,
  TorpedoSpreadMode,
  Vec3,
  WeaponSlot,
} from "../sim/types";

const DAMAGE_CONTROL_PRIORITIES: readonly DamageControlPriority[] = [
  "balanced",
  "fire",
  "flood",
  "module",
];

export function fireCommandActive(pressedThisFrame: boolean, spaceHeld: boolean): boolean {
  return pressedThisFrame || spaceHeld;
}

const GAMEPLAY_KEY_CODES = new Set([
  "Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyE", "KeyF", "KeyG",
  "KeyQ", "KeyR", "KeyH", "Digit1", "Digit2", "Digit3", "Digit4",
]);

export function isGameplayKeyCode(code: string): boolean {
  return GAMEPLAY_KEY_CODES.has(code);
}

export interface AimProvider {
  aimPoint(ship: ShipState, range: number): Vec3;
  setAiming(active: boolean): void;
}

export class PlayerInput {
  private readonly pressed = new Set<string>();
  private throttle = 0.55;
  private range = 2_200;
  private steeringSensitivity = 1;
  private aiming = false;
  private weaponSlot: WeaponSlot = "mainGun";
  private torpedoSpread: TorpedoSpreadMode = "narrow";
  private firePressed = false;
  private smokePressed = false;
  private hydroPressed = false;
  private depthChargePressed = false;
  private ammoType: AmmoType = "he";
  private damageControlPriority: DamageControlPriority = "balanced";
  private activeShip?: ShipState;
  private suppressed = false;

  constructor(canvas: HTMLCanvasElement, private readonly aimProvider: AimProvider) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.cancelHeldInputs);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.suppressed) {
      if (isGameplayKeyCode(event.code)) event.preventDefault();
      return;
    }
    this.pressed.add(event.code);
    if (event.repeat) return;
    if (event.code === "KeyW") this.throttle = Math.min(1, this.throttle + 0.25);
    if (event.code === "KeyS") this.throttle = Math.max(-0.25, this.throttle - 0.25);
    if (event.code === "KeyR") {
      this.aiming = !this.aiming;
      this.aimProvider.setAiming(this.aiming);
    }
    if (event.code === "Digit1") this.selectWeapon("mainGun");
    if (event.code === "Digit2") this.selectWeapon("torpedo");
    if (event.code === "Digit3") this.selectWeapon("aircraft");
    if (event.code === "KeyQ") {
      if (this.weaponSlot === "torpedo") {
        this.torpedoSpread = this.torpedoSpread === "narrow" ? "wide" : "narrow";
      } else {
        this.ammoType = this.ammoType === "he" ? "ap" : "he";
        this.selectWeapon("mainGun");
      }
    }
    if (event.code === "Space") this.firePressed = true;
    if (event.code === "KeyE") this.smokePressed = true;
    if (event.code === "KeyF") this.hydroPressed = true;
    if (event.code === "KeyG") this.depthChargePressed = true;
    if (event.code === "Digit4") {
      const index = DAMAGE_CONTROL_PRIORITIES.indexOf(this.damageControlPriority);
      this.damageControlPriority = DAMAGE_CONTROL_PRIORITIES[
        (index + 1) % DAMAGE_CONTROL_PRIORITIES.length
      ] ?? "balanced";
    }
    if (isGameplayKeyCode(event.code)) {
      event.preventDefault();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private cancelHeldInputs = (): void => {
    this.pressed.clear();
    this.firePressed = false;
    this.smokePressed = false;
    this.hydroPressed = false;
    this.depthChargePressed = false;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.cancelHeldInputs();
  };

  private maximumAimRange(ship = this.activeShip): number {
    if (this.weaponSlot === "torpedo") {
      return ship
        ? getTorpedo(ship.torpedoId).maximumRangeMeters
        : TORPEDO.maximumRangeMeters;
    }
    if (this.weaponSlot === "mainGun" && ship) {
      return effectiveMainBattery(ship).maximumRangeMeters;
    }
    return GUN.maxAimRange;
  }

  private clampAimRange(ship = this.activeShip): void {
    this.range = Math.max(
      GUN.minAimRange,
      Math.min(this.maximumAimRange(ship), this.range),
    );
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.range = Math.max(
      GUN.minAimRange,
      Math.min(this.maximumAimRange(), this.range + Math.sign(event.deltaY) * 150),
    );
  };

  command(ship: ShipState): ControlCommand {
    this.activeShip = ship;
    this.clampAimRange(ship);
    if (this.suppressed) {
      return {
        throttle: this.throttle,
        rudder: 0,
        aimPoint: this.aimProvider.aimPoint(ship, this.range),
        fire: false,
        activateSmoke: false,
        activateHydro: false,
        deployDepthCharge: false,
        weaponSlot: this.weaponSlot,
        torpedoSpread: this.torpedoSpread,
        repairHull: false,
        damageControlPriority: this.damageControlPriority,
        ammoType: this.ammoType,
      };
    }
    const steeringInput = (this.pressed.has("KeyD") ? 1 : 0)
      - (this.pressed.has("KeyA") ? 1 : 0);
    const fire = fireCommandActive(this.firePressed, this.pressed.has("Space"));
    this.firePressed = false;
    const activateSmoke = this.smokePressed;
    this.smokePressed = false;
    const activateHydro = this.hydroPressed;
    this.hydroPressed = false;
    const deployDepthCharge = this.depthChargePressed;
    this.depthChargePressed = false;
    return {
      throttle: this.throttle,
      rudder: steeringInput * this.steeringSensitivity,
      aimPoint: this.aimProvider.aimPoint(ship, this.range),
      fire,
      activateSmoke,
      activateHydro,
      deployDepthCharge,
      weaponSlot: this.weaponSlot,
      torpedoSpread: this.torpedoSpread,
      repairHull: this.pressed.has("KeyH"),
      damageControlPriority: this.damageControlPriority,
      ammoType: this.ammoType,
    };
  }

  get aimRange(): number {
    return this.range;
  }

  get isAiming(): boolean {
    return this.aiming;
  }

  get selectedWeapon(): WeaponSlot {
    return this.weaponSlot;
  }

  get selectedAmmo(): AmmoType {
    return this.ammoType;
  }

  get selectedTorpedoSpread(): TorpedoSpreadMode {
    return this.torpedoSpread;
  }

  selectWeapon(slot: WeaponSlot): void {
    this.weaponSlot = slot;
    this.clampAimRange();
  }

  exitAiming(): boolean {
    if (!this.aiming) return false;
    this.aiming = false;
    this.pressed.delete("KeyR");
    this.aimProvider.setAiming(false);
    return true;
  }

  setSteeringSensitivity(value: number): void {
    this.steeringSensitivity = Math.min(1, Math.max(0.35, value));
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (!suppressed) return;
    this.cancelHeldInputs();
  }

  reset(): void {
    this.throttle = 0.55;
    this.range = 2_200;
    this.pressed.clear();
    this.firePressed = false;
    this.smokePressed = false;
    this.hydroPressed = false;
    this.depthChargePressed = false;
    this.aiming = false;
    this.weaponSlot = "mainGun";
    this.ammoType = "he";
    this.torpedoSpread = "narrow";
    this.damageControlPriority = "balanced";
    this.activeShip = undefined;
    this.suppressed = false;
    this.aimProvider.setAiming(false);
  }
}
