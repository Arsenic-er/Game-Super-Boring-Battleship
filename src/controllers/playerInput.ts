import { GUN } from "../sim/config";
import type { ControlCommand, ShipState, Vec3, WeaponSlot } from "../sim/types";

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

  constructor(canvas: HTMLCanvasElement, private readonly aimProvider: AimProvider) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onKeyDown = (event: KeyboardEvent): void => {
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
    if (["Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyR", "KeyH", "Digit1", "Digit2", "Digit3"].includes(event.code)) {
      event.preventDefault();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.range = Math.max(
      GUN.minAimRange,
      Math.min(GUN.maxAimRange, this.range + Math.sign(event.deltaY) * 150),
    );
  };

  command(ship: ShipState): ControlCommand {
    const steeringInput = (this.pressed.has("KeyD") ? 1 : 0)
      - (this.pressed.has("KeyA") ? 1 : 0);
    return {
      throttle: this.throttle,
      rudder: steeringInput * this.steeringSensitivity,
      aimPoint: this.aimProvider.aimPoint(ship, this.range),
      fire: this.pressed.has("Space"),
      weaponSlot: this.weaponSlot,
      repairHull: this.pressed.has("KeyH"),
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

  selectWeapon(slot: WeaponSlot): void {
    this.weaponSlot = slot;
  }

  exitAiming(): boolean {
    if (!this.aiming) return false;
    this.aiming = false;
    this.weaponSlot = "mainGun";
    this.pressed.delete("KeyR");
    this.aimProvider.setAiming(false);
    return true;
  }

  setSteeringSensitivity(value: number): void {
    this.steeringSensitivity = Math.min(1, Math.max(0.35, value));
  }

  reset(): void {
    this.throttle = 0.55;
    this.range = 2_200;
    this.pressed.clear();
    this.aiming = false;
    this.aimProvider.setAiming(false);
  }
}
