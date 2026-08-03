import type { ImpactEvent, ShipState, ShotEvent } from "../sim/types";

const AUDIO = {
  masterVolume: 0.72,
  oceanVolume: 0.12,
  machineryVolume: 0.055,
  throttleEpsilon: 0.01,
  traverseEpsilonRadians: 0.000_08,
  birdIntervalMinSeconds: 9,
  birdIntervalJitterSeconds: 13,
} as const;

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

export function throttleOrderChanged(previous: number | undefined, current: number): boolean {
  return previous !== undefined && Math.abs(current - previous) > AUDIO.throttleEpsilon;
}

export function audioAngularDelta(previous: number | undefined, current: number): number {
  return previous === undefined ? 0 : Math.abs(wrapAngle(current - previous));
}

export function mountTraversed(previous: number | undefined, current: number): boolean {
  return audioAngularDelta(previous, current) > AUDIO.traverseEpsilonRadians;
}

export type CombatShotSoundKind =
  | "depthChargeDrop"
  | "airMachineGun"
  | "airBombRelease"
  | "airTorpedoEntry"
  | "torpedoLaunch"
  | "secondaryGun"
  | "mainGun";

export function combatShotSoundKind(shot: Pick<ShotEvent, "kind" | "weaponSource" | "airWeapon">): CombatShotSoundKind {
  if (shot.weaponSource === "aircraft") {
    if (shot.airWeapon === "machineGun") return "airMachineGun";
    if (shot.airWeapon === "aerialTorpedo") return "airTorpedoEntry";
    return "airBombRelease";
  }
  if (shot.kind === "depthCharge") return "depthChargeDrop";
  if (shot.kind === "torpedo") return "torpedoLaunch";
  return shot.weaponSource === "secondary" ? "secondaryGun" : "mainGun";
}

export class CombatAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private oceanGain?: GainNode;
  private machineryGain?: GainNode;
  private ambientStarted = false;
  private battleActive = false;
  private volume: number = AUDIO.masterVolume;
  private muted = false;
  private previousThrottle?: number;
  private previousTurretRelative?: number;
  private previousLauncherRelative?: number;
  private nextBirdAt = Number.POSITIVE_INFINITY;

  unlock(): void {
    if (this.context?.state === "closed") {
      this.context = undefined;
      this.master = undefined;
      this.oceanGain = undefined;
      this.machineryGain = undefined;
      this.ambientStarted = false;
    }
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.context.destination);
    }
    void this.context.resume().then(() => {
      if (!this.battleActive) return;
      this.ensureAmbientLoops();
      this.fadeBattleBed(true);
    }).catch(() => {
      // Browsers can reject resume() when no user activation is available.
    });
  }

  configure(masterVolume: number, muted: boolean): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(masterVolume) ? masterVolume : 0.7));
    this.muted = muted;
    const context = this.context;
    if (!context || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, context.currentTime, 0.035);
  }

  sync(player: ShipState | undefined, active: boolean): void {
    const context = this.context;
    if (!context || context.state !== "running") return;

    if (active !== this.battleActive) {
      this.battleActive = active;
      if (active) {
        this.ensureAmbientLoops();
        this.nextBirdAt = context.currentTime + this.nextBirdDelay();
      }
      this.fadeBattleBed(active);
      this.previousThrottle = player?.throttle;
      this.previousTurretRelative = player
        ? wrapAngle(player.turretHeading - player.heading)
        : undefined;
      this.previousLauncherRelative = player
        ? wrapAngle(player.torpedoLauncherHeading - player.heading)
        : undefined;
    }
    if (!active || !player) return;

    if (throttleOrderChanged(this.previousThrottle, player.throttle)) {
      this.engineTelegraphBell();
    }

    const turretRelative = wrapAngle(player.turretHeading - player.heading);
    const launcherRelative = wrapAngle(player.torpedoLauncherHeading - player.heading);
    const turretMoving = player.modules.gun.health > 0
      && mountTraversed(this.previousTurretRelative, turretRelative);
    const launcherMoving = mountTraversed(
      this.previousLauncherRelative,
      launcherRelative,
    ) && player.modules.torpedoTubes.health > 0;
    const machineryTarget = turretMoving || launcherMoving ? AUDIO.machineryVolume : 0;
    this.machineryGain?.gain.setTargetAtTime(machineryTarget, context.currentTime, 0.055);

    if (context.currentTime >= this.nextBirdAt) {
      this.seabirdCall();
      this.nextBirdAt = context.currentTime + this.nextBirdDelay();
    }

    this.previousThrottle = player.throttle;
    this.previousTurretRelative = turretRelative;
    this.previousLauncherRelative = launcherRelative;
  }

  consumeShots(shots: readonly ShotEvent[]): void {
    if (!this.context || this.context.state !== "running") return;
    const played = new Set<string>();
    for (const shot of shots) {
      const sound = combatShotSoundKind(shot);
      const key = `${sound}:${shot.ownerId}:${shot.salvoId ?? shot.id}`;
      if (played.has(key)) continue;
      played.add(key);
      const friendly = shot.team === "player";
      switch (sound) {
        case "depthChargeDrop":
          this.depthChargeDrop(friendly ? 0.13 : 0.05);
          break;
        case "airMachineGun":
          this.airMachineGun(friendly ? 0.065 : 0.026);
          break;
        case "airBombRelease":
          this.airBombRelease(friendly ? 0.075 : 0.028);
          break;
        case "airTorpedoEntry":
          this.airTorpedoEntry(friendly ? 0.095 : 0.038);
          break;
        case "torpedoLaunch":
          this.torpedoLaunch(friendly ? 0.2 : 0.08);
          break;
        case "secondaryGun":
          this.secondaryBoom(friendly ? 0.075 : 0.035);
          break;
        case "mainGun":
          this.boom(friendly ? 0.23 : 0.1);
          break;
      }
    }
  }

  consumeImpacts(impacts: readonly ImpactEvent[]): void {
    if (!this.context || this.context.state !== "running") return;
    for (const impact of impacts) {
      if (impact.projectileKind === "depthCharge") this.depthChargeExplosion(0.16);
      else if (impact.projectileKind === "torpedo") this.torpedoImpact(0.22);
      else if (impact.kind === "hit") this.noiseBurst(0.13, 0.19, 520);
      else this.noiseBurst(0.06, 0.28, 1_600);
    }
  }

  private output(): AudioNode | undefined {
    return this.master;
  }

  private ensureAmbientLoops(): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output || this.ambientStarted) return;
    this.ambientStarted = true;

    const oceanSource = context.createBufferSource();
    const oceanLowpass = context.createBiquadFilter();
    const oceanHighpass = context.createBiquadFilter();
    this.oceanGain = context.createGain();
    oceanSource.buffer = this.loopingNoiseBuffer(6, 0.035);
    oceanSource.loop = true;
    oceanLowpass.type = "lowpass";
    oceanLowpass.frequency.value = 1_450;
    oceanLowpass.Q.value = 0.7;
    oceanHighpass.type = "highpass";
    oceanHighpass.frequency.value = 55;
    this.oceanGain.gain.value = 0;
    oceanSource
      .connect(oceanLowpass)
      .connect(oceanHighpass)
      .connect(this.oceanGain)
      .connect(output);
    oceanSource.start();

    const machinerySource = context.createBufferSource();
    const machineryFilter = context.createBiquadFilter();
    const machineryTone = context.createOscillator();
    const machineryToneGain = context.createGain();
    this.machineryGain = context.createGain();
    machinerySource.buffer = this.loopingNoiseBuffer(2, 0.22);
    machinerySource.loop = true;
    machineryFilter.type = "bandpass";
    machineryFilter.frequency.value = 780;
    machineryFilter.Q.value = 1.45;
    machineryTone.type = "sawtooth";
    machineryTone.frequency.value = 46;
    machineryToneGain.gain.value = 0.16;
    this.machineryGain.gain.value = 0;
    machinerySource.connect(machineryFilter).connect(this.machineryGain);
    machineryTone.connect(machineryToneGain).connect(this.machineryGain);
    this.machineryGain.connect(output);
    machinerySource.start();
    machineryTone.start();
  }

  private fadeBattleBed(active: boolean): void {
    const context = this.context;
    if (!context) return;
    this.oceanGain?.gain.setTargetAtTime(
      active ? AUDIO.oceanVolume : 0,
      context.currentTime,
      active ? 0.7 : 0.12,
    );
    if (!active) this.machineryGain?.gain.setTargetAtTime(0, context.currentTime, 0.06);
  }

  private engineTelegraphBell(): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    for (const [strikeIndex, delay] of [0, 0.16, 0.32].entries()) {
      const strikeAt = now + delay;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.000_1, strikeAt);
      gain.gain.exponentialRampToValueAtTime(0.12 - strikeIndex * 0.012, strikeAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.000_1, strikeAt + 0.72);
      gain.connect(output);
      for (const [partialIndex, frequency] of [640, 940, 1_370, 1_860].entries()) {
        const oscillator = context.createOscillator();
        const partialGain = context.createGain();
        oscillator.type = partialIndex < 2 ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, strikeAt);
        oscillator.frequency.exponentialRampToValueAtTime(
          frequency * (0.985 - partialIndex * 0.002),
          strikeAt + 0.62,
        );
        partialGain.gain.value = 1 / (partialIndex + 1.25);
        oscillator.connect(partialGain).connect(gain);
        oscillator.start(strikeAt);
        oscillator.stop(strikeAt + 0.75);
      }
    }
  }

  private seabirdCall(): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const pan = context.createStereoPanner();
    const distanceGain = context.createGain();
    pan.pan.value = Math.random() * 1.5 - 0.75;
    distanceGain.gain.value = 0.026 + Math.random() * 0.012;
    pan.connect(distanceGain).connect(output);
    for (let call = 0; call < 2; call += 1) {
      const start = now + call * 0.46;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(760 + call * 90, start);
      oscillator.frequency.exponentialRampToValueAtTime(1_420, start + 0.12);
      oscillator.frequency.exponentialRampToValueAtTime(690, start + 0.38);
      gain.gain.setValueAtTime(0.000_1, start);
      gain.gain.exponentialRampToValueAtTime(1, start + 0.045);
      gain.gain.exponentialRampToValueAtTime(0.000_1, start + 0.4);
      oscillator.connect(gain).connect(pan);
      oscillator.start(start);
      oscillator.stop(start + 0.42);
    }
  }

  private nextBirdDelay(): number {
    return AUDIO.birdIntervalMinSeconds + Math.random() * AUDIO.birdIntervalJitterSeconds;
  }

  private loopingNoiseBuffer(seconds: number, smoothing: number): AudioBuffer {
    const context = this.context;
    if (!context) throw new Error("Audio context must exist before creating ambient noise");
    const frameCount = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let smoothed = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      smoothed += (white - smoothed) * smoothing;
      samples[index] = smoothed * 0.82 + white * 0.18;
    }
    return buffer;
  }

  private torpedoLaunch(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const hiss = context.createOscillator();
    const gain = context.createGain();
    hiss.type = "sawtooth";
    hiss.frequency.setValueAtTime(180, now);
    hiss.frequency.exponentialRampToValueAtTime(52, now + 0.32);
    gain.gain.setValueAtTime(volume * 0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    hiss.connect(gain).connect(output);
    hiss.start(now);
    hiss.stop(now + 0.38);
    this.noiseBurst(volume, 0.48, 2_400);
  }

  private airMachineGun(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    for (let burst = 0; burst < 3; burst += 1) {
      const start = now + burst * 0.055;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(190 + burst * 18, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.035);
      oscillator.connect(gain).connect(output);
      oscillator.start(start);
      oscillator.stop(start + 0.04);
    }
    this.noiseBurst(volume * 0.65, 0.19, 2_800);
  }

  private airBombRelease(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(240, now);
    oscillator.frequency.exponentialRampToValueAtTime(115, now + 0.16);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
    this.noiseBurst(volume * 0.42, 0.12, 1_650);
  }

  private airTorpedoEntry(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(118, now);
    oscillator.frequency.exponentialRampToValueAtTime(62, now + 0.26);
    gain.gain.setValueAtTime(volume * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.32);
    this.noiseBurst(volume, 0.34, 1_900);
  }

  private depthChargeDrop(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(92, now);
    oscillator.frequency.exponentialRampToValueAtTime(58, now + 0.24);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
    this.noiseBurst(volume * 0.45, 0.18, 1_100);
  }

  private depthChargeExplosion(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(36, now);
    oscillator.frequency.exponentialRampToValueAtTime(18, now + 0.85);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.92);
    this.noiseBurst(volume * 0.75, 0.72, 430);
  }

  private torpedoImpact(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(58, now);
    oscillator.frequency.exponentialRampToValueAtTime(24, now + 0.72);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.78);
    this.noiseBurst(volume * 0.62, 0.58, 760);
  }

  private boom(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(92, now);
    oscillator.frequency.exponentialRampToValueAtTime(34, now + 0.42);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.5);
    this.noiseBurst(volume * 0.45, 0.2, 420);
  }

  private secondaryBoom(volume: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(62, now + 0.22);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.28);
    this.noiseBurst(volume * 0.34, 0.12, 720);
  }

  private noiseBurst(volume: number, duration: number, cutoff: number): void {
    const context = this.context;
    const output = this.output();
    if (!context || !output) return;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(output);
    source.start();
  }
}
