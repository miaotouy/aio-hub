// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  streamEffectConfig,
  paintStreamSweep,
  paintStreamSpark,
  type AnimatedStreamEffect,
  type StreamEffectColors,
  type StreamSpark,
  type StreamSweep,
} from "./streamEffectStyles";
import {
  collectStreamText,
  isStreamText,
  scanStreamText,
} from "./streamTextTargets";
import { createStreamTextTint } from "./streamTextTint";
export type { StreamEffect } from "./streamEffectStyles";

export interface StardustStats {
  observerMs: number;
  frames: number;
  frameMs: number;
  maxFrameMs: number;
  emissions: number;
  peakParticles: number;
  particles: number;
  pendingTexts: number;
  canvasPixels: number;
  tintedRanges: number;
}

export interface StreamStardustOptions {
  /** Standalone preview documents contain native HTML rather than AST wrappers. */
  html?: boolean;
  /** Previous rendered document, used to reveal only the newly loaded text. */
  previousText?: readonly string[];
}

const MAX_PENDING = 32;
const MAX_RECTS = 8;
const BATCH_MS = 70;

/** Decorative only: native text, selection and layout are never modified. */
export function createStreamStardust(
  root: HTMLElement,
  effect: AnimatedStreamEffect = "stardust",
  options: StreamStardustOptions = {}
) {
  const config = streamEffectConfig(effect);
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const tint = createStreamTextTint(root, effect);
  const pending = new Map<Text, number>();
  const sparks: StreamSpark[] = [];
  const sweeps: StreamSweep[] = [];
  const limit = config.limit;
  const stats: StardustStats = {
    observerMs: 0,
    frames: 0,
    frameMs: 0,
    maxFrameMs: 0,
    emissions: 0,
    peakParticles: 0,
    particles: 0,
    pendingTexts: 0,
    canvasPixels: 0,
    tintedRanges: 0,
  };
  let canvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let lastEmission = -Infinity;
  let finishing = false;
  let destroyed = false;
  let colors: StreamEffectColors;
  let lastDpr = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  let viewportWidth = win.innerWidth;
  // Cache the clipping chain, not its geometry: scrolling can move every ancestor.
  const clips: { element: HTMLElement; x: boolean; y: boolean }[] = [];
  for (let el = root.parentElement; el; el = el.parentElement) {
    const style = win.getComputedStyle(el);
    const x = /auto|scroll|hidden|clip/.test(style.overflowX);
    const y = /auto|scroll|hidden|clip/.test(style.overflowY);
    if (x || y) clips.push({ element: el, x, y });
  }

  function clear() {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    pending.clear();
    sparks.length = 0;
    sweeps.length = 0;
    tint.clear();
    stats.tintedRanges = 0;
    canvas?.remove();
    canvas = undefined;
    ctx = null;
    cssWidth = cssHeight = lastDpr = 0;
    stats.particles = stats.pendingTexts = stats.canvasPixels = 0;
    if (finishing) {
      destroyed = true;
      releaseListeners();
    }
  }
  function schedule() {
    if (!raf && !destroyed && !doc.hidden)
      raf = win.requestAnimationFrame(frame);
  }
  function enqueue(text: Text, offset: number) {
    if (!isStreamText(text, options.html)) return;
    if (pending.has(text))
      pending.set(text, Math.min(pending.get(text)!, offset));
    else {
      // Keep the latest visible tail when one update inserts a large subtree.
      if (pending.size >= MAX_PENDING)
        pending.delete(pending.keys().next().value!);
      pending.set(text, offset);
    }
    stats.pendingTexts = pending.size;
    schedule();
  }
  const observer = new win.MutationObserver((records) => {
    if (doc.hidden || finishing) return;
    const start = performance.now();
    let remaining = 128;
    for (
      let index = Math.max(0, records.length - 128);
      index < records.length && remaining > 0;
      index++
    ) {
      const record = records[index];
      if (record.type === "characterData") {
        remaining--;
        const text = record.target as Text;
        const old = record.oldValue ?? "";
        // Rewrites (Markdown reparsing / restored blocks) do not replay old prose.
        if (text.data.startsWith(old)) enqueue(text, old.length);
      } else {
        let addedIndex = 0;
        for (const node of record.addedNodes) {
          const replaced = record.removedNodes[addedIndex++];
          if (remaining <= 0) break;
          remaining--;
          if (node.nodeType === 3) {
            const previous =
              record.removedNodes.length === 1 ? record.removedNodes[0] : null;
            const old =
              previous?.nodeType === 3 ? (previous.textContent ?? "") : "";
            if ((node as Text).data.startsWith(old)) {
              if (previous?.nodeType === 3)
                tint.replaceText(previous as Text, node as Text);
              enqueue(node as Text, old.length);
            }
          } else if (node.nodeType === 1) {
            // v-html replaces whole elements. Match the prior text slots so
            // existing prose does not replay on every streamed HTML update.
            const budget = Math.min(32, Math.floor(remaining / 2));
            const before = replaced
              ? scanStreamText(replaced, budget)
              : { texts: [], visited: 0 };
            const after = scanStreamText(
              node,
              Math.min(64, remaining - before.visited)
            );
            const oldTexts = before.texts,
              newTexts = after.texts;
            remaining -= before.visited + after.visited;
            for (let i = 0; i < newTexts.length; i++) {
              const text = newTexts[i],
                previous = oldTexts[i];
              const old = previous?.data ?? "";
              if (text.data.startsWith(old)) {
                if (previous) tint.replaceText(previous, text);
                enqueue(text, old.length);
              }
            }
          }
        }
      }
    }
    stats.observerMs += performance.now() - start;
  });
  observer.observe(root, {
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
  });
  if (options.previousText) {
    collectStreamText(root).forEach((text, index) => {
      const old = options.previousText![index] ?? "";
      if (text.data.startsWith(old)) enqueue(text, old.length);
    });
  }

  function emit(
    x: number,
    y: number,
    width: number,
    height: number,
    now: number
  ) {
    if (sweeps.length >= 12) sweeps.shift();
    sweeps.push({ x, y, width: Math.min(width, 360), height, born: now });
    const count = config.count;
    for (let i = 0; i < count && sparks.length < limit; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = config.speed + Math.random() * config.speedSpread;
      sparks.push({
        x: x + Math.random() * Math.min(width, 260),
        y: y + height * (0.35 + Math.random() * 0.45),
        vx:
          effect === "petals"
            ? 12 + Math.random() * 20
            : Math.cos(angle) * speed,
        vy:
          Math.sin(angle) * speed -
          (effect === "petals"
            ? 4
            : effect === "ink" || effect === "scan"
              ? 0
              : 22),
        size: config.size + Math.random() * config.sizeSpread,
        rotation: Math.random() * Math.PI,
        born: now,
        life: config.life + Math.random() * config.lifeSpread,
        kind: i % 3,
      });
    }
    stats.emissions++;
    stats.peakParticles = Math.max(stats.peakParticles, sparks.length);
  }

  function frame(now: number) {
    raf = 0;
    if (destroyed || doc.hidden || !root.isConnected) {
      clear();
      return;
    }
    const start = performance.now();
    const rect = root.getBoundingClientRect();
    let left = Math.max(0, rect.left - config.padding);
    let top = Math.max(0, rect.top - config.padding);
    let right = Math.min(win.innerWidth, rect.right + config.padding);
    let bottom = Math.min(win.innerHeight, rect.bottom + config.padding);
    for (const clip of clips) {
      const bounds = clip.element.getBoundingClientRect();
      if (clip.x) {
        left = Math.max(left, bounds.left + clip.element.clientLeft);
        right = Math.min(
          right,
          bounds.left + clip.element.clientLeft + clip.element.clientWidth
        );
      }
      if (clip.y) {
        top = Math.max(top, bounds.top + clip.element.clientTop);
        bottom = Math.min(
          bottom,
          bounds.top + clip.element.clientTop + clip.element.clientHeight
        );
      }
    }
    left = Math.floor(left);
    top = Math.floor(top);
    const width = Math.ceil(right - left),
      height = Math.ceil(bottom - top);
    if (width <= 0 || height <= 0) {
      clear();
      return;
    }

    if (pending.size && now - lastEmission >= BATCH_MS) {
      const range = doc.createRange();
      let budget = MAX_RECTS;
      for (const [text, offset] of pending) {
        if (!budget) break;
        if (!text.isConnected || !root.contains(text) || offset >= text.length)
          continue;
        range.setStart(text, Math.max(offset, text.length - 160));
        range.setEnd(text, text.length);
        const boxes = range.getClientRects();
        let visible = false;
        for (
          let i = Math.max(0, boxes.length - 3);
          i < boxes.length && budget;
          i++
        ) {
          const box = boxes[i];
          if (
            box.width <= 0 ||
            box.height <= 0 ||
            box.right <= left ||
            box.left >= right ||
            box.bottom <= top ||
            box.top >= bottom
          )
            continue;
          visible = true;
          emit(
            box.left - rect.left,
            box.top - rect.top,
            box.width,
            box.height,
            now
          );
          budget--;
        }
        if (visible) tint.add(text, range.startOffset, range.endOffset, now);
      }
      pending.clear();
      stats.pendingTexts = 0;
      lastEmission = now;
    }

    tint.paint(now);
    stats.tintedRanges = tint.size;

    // Lazy allocation: offscreen / code-only / idle streams own no canvas.
    if (!sparks.length && !sweeps.length && !tint.size) {
      if (pending.size) schedule();
      else clear();
      return;
    }
    if (!canvas) {
      canvas = doc.createElement("canvas");
      canvas.className = "stream-stardust-overlay";
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText =
        "position:fixed;pointer-events:none;z-index:2000;contain:strict;";
      doc.body.append(canvas);
      ctx = canvas.getContext("2d");
      if (!ctx) {
        destroy();
        return;
      }
      const style = win.getComputedStyle(root);
      const primary =
        style.getPropertyValue("--primary-color").trim() || style.color;
      colors = {
        primary,
        secondary: style.getPropertyValue("--danger-color").trim() || primary,
        ink: style.color,
      };
    }
    const dpr = Math.min(
      win.devicePixelRatio || 1,
      1.5,
      Math.sqrt(2_000_000 / (width * height))
    );
    if (width !== cssWidth || height !== cssHeight || dpr !== lastDpr) {
      cssWidth = width;
      cssHeight = height;
      lastDpr = dpr;
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      stats.canvasPixels = canvas.width * canvas.height;
    }
    if (canvas.style.left !== `${left}px`) canvas.style.left = `${left}px`;
    if (canvas.style.top !== `${top}px`) canvas.style.top = `${top}px`;
    const context = ctx!;
    context.clearRect(0, 0, width, height);
    const ox = rect.left - left,
      oy = rect.top - top;
    for (let i = sweeps.length - 1; i >= 0; i--) {
      const sweep = sweeps[i];
      const t = (now - sweep.born) / config.sweepMs;
      if (t >= 1) {
        sweeps.splice(i, 1);
        continue;
      }
      paintStreamSweep(effect, context, sweep, t, ox, oy, colors);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      const elapsed = now - spark.born;
      if (elapsed >= spark.life) {
        sparks.splice(i, 1);
        continue;
      }
      const t = elapsed / spark.life,
        seconds = elapsed / 1000;
      paintStreamSpark(effect, context, spark, t, seconds, ox, oy, colors);
    }
    context.globalAlpha = 1;
    stats.frames++;
    stats.particles = sparks.length;
    const duration = performance.now() - start;
    stats.frameMs += duration;
    stats.maxFrameMs = Math.max(stats.maxFrameMs, duration);
    if (sparks.length || sweeps.length || tint.size || pending.size) schedule();
    else clear();
  }
  function onVisibility() {
    if (doc.hidden) clear();
  }
  function onResize() {
    // Auto-height previews resize after each document load. Their text geometry
    // stays stable when only height changes; keep the reveal alive through it.
    if (!options.html || win.innerWidth !== viewportWidth) clear();
    viewportWidth = win.innerWidth;
  }
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("resize", onResize);
  function releaseListeners() {
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("resize", onResize);
  }
  function destroy() {
    destroyed = true;
    observer.disconnect();
    releaseListeners();
    clear();
  }
  return {
    stats,
    destroy,
    /** Stop observing finalization; existing decorations may finish for at most 1.3s. */
    finish() {
      finishing = true;
      observer.disconnect();
      pending.clear();
      stats.pendingTexts = 0;
      if (!raf && !sparks.length && !sweeps.length && !tint.size) destroy();
    },
  };
}
