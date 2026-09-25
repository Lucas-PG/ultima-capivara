import type { AssetEntry } from './asset-manifest';

export type AssetProgressCallback = (fraction: number, label: string) => void;

// A fixed denominator prevents the bar going backwards when a model discovers
// its external textures. Bytes are counted once, on transfer or load completion.
export class AssetProgress {
  private readonly entries = new Map<string, { spec: AssetEntry; loaded: number; complete: boolean; failed: boolean }>();
  private totalBytes = 0;
  private loadedBytes = 0;
  private completed = 0;

  constructor(manifest: readonly AssetEntry[], private readonly onProgress: AssetProgressCallback) {
    for (const spec of manifest) {
      if (this.entries.has(spec.path)) throw new Error(`Duplicate asset: ${spec.path}`);
      this.entries.set(spec.path, { spec, loaded: 0, complete: false, failed: false }); this.totalBytes += spec.bytes;
    }
  }

  transfer(path: string, bytes: number) {
    const entry = this.entries.get(path);
    if (!entry) return;
    const next = Math.min(entry.spec.bytes, Math.max(entry.loaded, bytes));
    this.loadedBytes += next - entry.loaded; entry.loaded = next;
    this.emit(entry.spec.label);
  }

  finish(path: string) {
    const entry = this.entries.get(path);
    if (!entry || entry.complete || entry.failed) return;
    entry.complete = true; this.completed++;
    this.transfer(path, entry.spec.bytes);
  }

  fail(path: string) {
    const entry = this.entries.get(path); if (entry) entry.failed = true;
  }

  private emit(label: string) {
    // 90% accounts for network/decode, the last 10% for GPU preparation.
    this.onProgress(this.totalBytes ? this.loadedBytes / this.totalBytes * .9 : 0,
      `${label} (${this.completed}/${this.entries.size})`);
  }

  get stats() { return { loadedBytes: this.loadedBytes, totalBytes: this.totalBytes, completed: this.completed, total: this.entries.size }; }
}
