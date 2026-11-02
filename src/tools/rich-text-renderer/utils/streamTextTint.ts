// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  streamEffectConfig,
  type AnimatedStreamEffect,
} from "./streamEffectStyles";

const MAX_BANDS = 48;
const STEPS = 16;
const MAX_PALETTES = 8;

interface TintPalette {
  key: string;
  prefix: string;
  style: HTMLStyleElement;
  highlights: Highlight[];
  references: number;
}
let nextId = 0;

/** Native glyph coloring: ranges track layout without wrapping or cloning text. */
export function createStreamTextTint(
  root: HTMLElement,
  effect: AnimatedStreamEffect
) {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const registry = win.CSS?.highlights;
  const HighlightClass = win.Highlight;
  const supported =
    !!registry &&
    !!HighlightClass &&
    win.CSS.supports("selector(::highlight(stream-tint))") &&
    win.CSS.supports("color", "color-mix(in srgb, red 50%, white)");
  const prefix = `stream-tint-${++nextId}-`;
  const duration = streamEffectConfig(effect).sweepMs;
  const palettes = new Map<string, TintPalette>();
  let nextPalette = 0;
  const bands: {
    range: Range;
    palette: TintPalette;
    text: Text;
    start: number;
    end: number;
    value: string;
    born: number;
    stage: number;
  }[] = [];
  function paletteFor(text: Text) {
    const computed = win.getComputedStyle(text.parentElement!);
    // Highlight pseudos inherit from ancestor highlights as well as their text.
    // currentColor recursively mixes with those highlights, so snapshot the
    // originating glyph color explicitly for a stable, opaque fade destination.
    const base = computed.color || "CanvasText";
    const primary = (
      computed.getPropertyValue("--primary-color").trim() || base
    ).replace(/currentColor/gi, base);
    const secondary = (
      computed.getPropertyValue("--danger-color").trim() || primary
    ).replace(/currentColor/gi, base);
    const key = JSON.stringify([base, primary, secondary]);
    const existing = palettes.get(key);
    if (existing) return existing;
    // Colorful prose keeps its native colors when all palette slots are in use.
    if (palettes.size >= MAX_PALETTES) return;
    const accent =
      effect === "petals"
        ? secondary
        : effect === "stardust-vivid"
          ? `color-mix(in srgb, ${primary} 65%, ${secondary})`
          : effect === "ink"
            ? `color-mix(in srgb, ${primary} 70%, ${base})`
            : primary;
    const name = `${prefix}${++nextPalette}-`;
    const style = doc.createElement("style");
    style.dataset.streamTextTint = name;
    style.textContent = Array.from({ length: STEPS }, (_, i) => {
      const strength = Math.round(100 * (1 - i / STEPS) ** 1.3);
      return `::highlight(${name}${i}){color:color-mix(in srgb, ${accent} ${strength}%, ${base});}`;
    }).join("\n");
    doc.head.append(style);
    const highlights = Array.from({ length: STEPS }, (_, i) => {
      const highlight = new HighlightClass();
      registry.set(`${name}${i}`, highlight);
      return highlight;
    });
    const palette: TintPalette = {
      key,
      prefix: name,
      style,
      highlights,
      references: 0,
    };
    palettes.set(key, palette);
    return palette;
  }
  function releasePalette(palette: TintPalette) {
    for (let i = 0; i < palette.highlights.length; i++)
      registry.delete(`${palette.prefix}${i}`);
    palette.style.remove();
    palettes.delete(palette.key);
  }
  function remove(index: number) {
    const band = bands[index];
    if (band.stage >= 0) band.palette.highlights[band.stage].delete(band.range);
    if (--band.palette.references === 0) releasePalette(band.palette);
    bands.splice(index, 1);
  }
  function clear() {
    bands.length = 0;
    for (const palette of palettes.values()) releasePalette(palette);
  }
  return {
    get size() {
      return bands.length;
    },
    add(text: Text, start: number, end: number, now: number) {
      if (!supported || start >= end) return;
      // Split only at code point boundaries, including emoji surrogate pairs.
      const offsets = [start];
      for (const character of text.data.slice(start, end))
        offsets.push(offsets[offsets.length - 1] + character.length);
      const count = Math.min(6, offsets.length - 1);
      while (bands.length + count > MAX_BANDS) remove(0);
      const palette = paletteFor(text);
      if (!palette) return;
      for (let i = 0; i < count; i++) {
        const range = doc.createRange();
        range.setStart(
          text,
          offsets[Math.floor((i * (offsets.length - 1)) / count)]
        );
        range.setEnd(
          text,
          offsets[Math.floor(((i + 1) * (offsets.length - 1)) / count)]
        );
        palette.references++;
        bands.push({
          range,
          palette,
          text,
          start: range.startOffset,
          end: range.endOffset,
          value: range.toString(),
          born: now + (i / count) * duration * 0.24,
          stage: -1,
        });
      }
    },
    replaceText(previous: Text, next: Text) {
      for (const band of bands) if (band.text === previous) band.text = next;
    },
    paint(now: number) {
      for (let i = bands.length - 1; i >= 0; i--) {
        const band = bands[i];
        const t = (now - band.born) / duration;
        if (
          !root.contains(band.text) ||
          band.text.data.slice(band.start, band.end) !== band.value ||
          t >= 1
        ) {
          remove(i);
          continue;
        }
        // Vue updates Text.data with the complete value, which collapses live DOM
        // ranges. Re-anchor unchanged glyphs to their recorded logical offsets.
        if (
          band.range.startContainer !== band.text ||
          band.range.startOffset !== band.start ||
          band.range.endOffset !== band.end
        ) {
          band.range.setStart(band.text, band.start);
          band.range.setEnd(band.text, band.end);
        }
        if (t < 0) continue;
        const stage = Math.min(STEPS - 1, Math.floor(t * STEPS));
        if (stage === band.stage) continue;
        if (band.stage >= 0)
          band.palette.highlights[band.stage].delete(band.range);
        band.palette.highlights[stage].add(band.range);
        band.stage = stage;
      }
      if (!bands.length) clear();
    },
    clear,
  };
}
