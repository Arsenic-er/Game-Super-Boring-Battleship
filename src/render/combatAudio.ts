import type { ImpactEvent, ShotEvent } from "../sim/types";

export class CombatAudio {
  private context?: AudioContext;

  unlock(): void {
    this.context ??= new AudioContext();
    void this.context.resume();
  }

  consumeShots(shots: readonly ShotEvent[]): void {
    if (!this.context || this.context.state !== "running") return;
    for (const shot of shots) this.boom(shot.team === "player" ? 0.23 : 0.1);
  }

  consumeImpacts(impacts: readonly ImpactEvent[]): void {
    if (!this.context || this.context.state !== "running") return;
    for (const impact of impacts) {
      if (impact.kind === "hit") this.noiseBurst(0.13, 0.19, 520);
      else this.noiseBurst(0.06, 0.28, 1_600);
    }
  }

  private boom(volume: number): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(92, now);
    oscillator.frequency.exponentialRampToValueAtTime(34, now + 0.42);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.5);
    this.noiseBurst(volume * 0.45, 0.2, 420);
  }

  private noiseBurst(volume: number, duration: number, cutoff: number): void {
    const context = this.context;
    if (!context) return;
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
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }
}
