export interface BufferedSnapshot<T> {
  readonly snapshot: T;
  readonly receivedAt: number;
}

export interface SnapshotSample<T> {
  readonly previous: BufferedSnapshot<T>;
  readonly next: BufferedSnapshot<T>;
  readonly alpha: number;
}

export class SnapshotBuffer<T> {
  private readonly entries: BufferedSnapshot<T>[] = [];

  constructor(private readonly maxEntries = 32) {}

  push(snapshot: T, receivedAt: number): void {
    this.entries.push({ snapshot, receivedAt });
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  latest(): BufferedSnapshot<T> | undefined {
    return this.entries[this.entries.length - 1];
  }

  list(): readonly BufferedSnapshot<T>[] {
    return this.entries;
  }

  sample(targetReceivedAt: number): SnapshotSample<T> | undefined {
    if (this.entries.length === 0) return undefined;
    if (this.entries.length === 1) {
      const only = this.entries[0]!;
      return { previous: only, next: only, alpha: 0 };
    }
    const first = this.entries[0]!;
    if (targetReceivedAt <= first.receivedAt) {
      return { previous: first, next: first, alpha: 0 };
    }
    for (let index = 1; index < this.entries.length; index += 1) {
      const previous = this.entries[index - 1]!;
      const next = this.entries[index]!;
      if (targetReceivedAt > next.receivedAt) continue;
      const span = Math.max(1, next.receivedAt - previous.receivedAt);
      return {
        previous,
        next,
        alpha: Math.min(1, Math.max(0, (targetReceivedAt - previous.receivedAt) / span)),
      };
    }
    const latest = this.entries[this.entries.length - 1]!;
    return { previous: latest, next: latest, alpha: 0 };
  }
}
