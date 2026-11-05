// Copyright 2025-2026 miaotouy(Github@miaotouy)

const MIN_OVERLAP = 16;
const MAX_TAIL = 4096;

/** Match only the start of a continuation; preserve short repeats and all whitespace. */
export class ContinuationTextFilter {
  private pending = "";
  private candidates: number[] | undefined;
  private overlap = 0;
  private decided: boolean;

  constructor(
    private readonly prefix: string,
    deduplicate = true
  ) {
    this.decided = !deduplicate || prefix.length === 0;
  }

  push(chunk: string): string {
    if (this.decided || !chunk) return chunk;
    const previousLength = this.pending.length;
    if (!this.candidates) {
      this.candidates = [];
      const start = Math.max(0, this.prefix.length - MAX_TAIL);
      if (this.prefix[0] === chunk[0]) this.candidates.push(0);
      for (
        let index = this.prefix.indexOf(chunk[0], Math.max(1, start));
        index >= 0 && index <= this.prefix.length - MIN_OVERLAP;
        index = this.prefix.indexOf(chunk[0], index + 1)
      ) {
        this.candidates.push(index);
      }
    }
    this.pending += chunk;
    this.candidates = this.candidates.filter((start) => {
      const length = this.prefix.length - start;
      const compared = Math.min(chunk.length, length - previousLength);
      if (
        this.prefix.slice(
          start + previousLength,
          start + previousLength + compared
        ) !== chunk.slice(0, compared)
      ) {
        return false;
      }
      if (this.pending.length >= length) {
        const replay = this.prefix.slice(start);
        const textCharacters = replay.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
        if (textCharacters >= (start === 0 ? 1 : 8)) {
          this.overlap = Math.max(this.overlap, length);
        }
        return false;
      }
      return true;
    });
    return this.candidates.length ? "" : this.finish();
  }

  /** Release an ambiguous beginning on completion or interruption, once. */
  finish(): string {
    if (this.decided) return "";
    this.decided = true;
    const text = this.pending.slice(this.overlap);
    this.pending = "";
    this.candidates = undefined;
    return text;
  }
}

export function mergeContinuationText(
  prefix: string,
  content: string,
  deduplicate = true
): string {
  const filter = new ContinuationTextFilter(prefix, deduplicate);
  return prefix + filter.push(content) + filter.finish();
}
