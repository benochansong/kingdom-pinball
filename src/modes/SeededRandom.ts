/** Serialized xorshift32. Content generation never depends on ambient Math.random. */
export class SeededRandom {
  constructor(public state: number) {
    this.state = state >>> 0 || 0x6d2b79f5;
  }
  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
  pick<T>(items: readonly T[]) {
    return items[this.int(items.length)];
  }
  shuffle<T>(items: readonly T[]) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  static hash(text: string) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
}
