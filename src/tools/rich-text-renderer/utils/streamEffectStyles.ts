// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

export const STREAM_EFFECT_OPTIONS = [
  { value: "none", label: "关闭", description: "保留基础节点入场动画。" },
  {
    value: "stardust",
    label: "星屑扫入 · 轻盈",
    description: "细光带伴随小星点与菱形，轻轻散开。",
  },
  {
    value: "stardust-vivid",
    label: "星屑扫入 · 华丽",
    description: "更丰富的星点与菱形，飞散轨迹更鲜明。",
  },
  {
    value: "geometric",
    label: "几何碎片",
    description: "斜切线带出三角碎片，旋转后向两侧散开。",
  },
  {
    value: "petals",
    label: "花瓣轻舞",
    description: "柔和花瓣打着旋飘过文字，沿弧线缓缓落下。",
  },
  {
    value: "scan",
    label: "全息扫描",
    description: "扫描线、定位角标与像素点组合入场。",
  },
  {
    value: "ink",
    label: "水墨晕染",
    description: "柔软墨团扩散，细小墨滴从文字边缘散去。",
  },
] as const;
export type StreamEffect = (typeof STREAM_EFFECT_OPTIONS)[number]["value"];
export type AnimatedStreamEffect = Exclude<StreamEffect, "none">;

interface EffectConfig {
  count: number;
  limit: number;
  size: number;
  sizeSpread: number;
  speed: number;
  speedSpread: number;
  life: number;
  lifeSpread: number;
  sweepMs: number;
  gravity: number;
  opacity: number;
  padding: number;
}
const BASE: EffectConfig = {
  count: 6,
  limit: 96,
  size: 1.2,
  sizeSpread: 2,
  speed: 26,
  speedSpread: 46,
  life: 480,
  lifeSpread: 320,
  sweepMs: 440,
  gravity: 18,
  opacity: 0.8,
  padding: 28,
};
const CONFIGS: Record<AnimatedStreamEffect, EffectConfig> = {
  stardust: BASE,
  "stardust-vivid": {
    ...BASE,
    count: 12,
    limit: 160,
    size: 2,
    speed: 44,
    lifeSpread: 550,
    opacity: 0.95,
    padding: 36,
  },
  geometric: {
    ...BASE,
    count: 5,
    limit: 84,
    size: 3.5,
    sizeSpread: 3,
    speed: 34,
    speedSpread: 50,
    life: 620,
    lifeSpread: 280,
    sweepMs: 520,
    gravity: 38,
    opacity: 0.7,
    padding: 42,
  },
  petals: {
    ...BASE,
    count: 4,
    limit: 64,
    size: 4,
    sizeSpread: 3,
    speed: 12,
    speedSpread: 22,
    life: 850,
    lifeSpread: 450,
    sweepMs: 650,
    gravity: 26,
    opacity: 0.65,
    padding: 48,
  },
  scan: {
    ...BASE,
    count: 6,
    limit: 72,
    size: 1.4,
    sizeSpread: 1.4,
    speed: 14,
    speedSpread: 18,
    life: 340,
    lifeSpread: 240,
    sweepMs: 540,
    gravity: 0,
    opacity: 0.8,
    padding: 28,
  },
  ink: {
    ...BASE,
    count: 3,
    limit: 48,
    size: 4,
    sizeSpread: 5,
    speed: 8,
    speedSpread: 12,
    life: 700,
    lifeSpread: 400,
    sweepMs: 700,
    gravity: 3,
    opacity: 0.2,
    padding: 36,
  },
};
export function streamEffectConfig(effect: AnimatedStreamEffect): EffectConfig {
  return CONFIGS[effect] ?? BASE;
}

export interface StreamSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  born: number;
  life: number;
  kind: number;
}
export interface StreamSweep {
  x: number;
  y: number;
  width: number;
  height: number;
  born: number;
}
export interface StreamEffectColors {
  primary: string;
  secondary: string;
  ink: string;
}

export function paintStreamSweep(
  effect: AnimatedStreamEffect,
  ctx: CanvasRenderingContext2D,
  sweep: StreamSweep,
  t: number,
  ox: number,
  oy: number,
  colors: StreamEffectColors
) {
  const start = ox + sweep.x,
    y = oy + sweep.y;
  const progress = 1 - (1 - t) ** 3;
  const x = start + sweep.width * progress;
  const baseline = y + sweep.height + 1;
  ctx.strokeStyle = colors.primary;
  ctx.fillStyle = colors.primary;
  ctx.lineWidth = 1;
  if (effect === "scan") {
    // A framed scan head, with a dotted baseline instead of a particle ribbon.
    ctx.globalAlpha = (1 - t) * 0.75;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, baseline + 2);
    ctx.moveTo(start + 6, y - 2);
    ctx.lineTo(start, y - 2);
    ctx.lineTo(start, y + 4);
    ctx.moveTo(start + sweep.width - 6, baseline + 2);
    ctx.lineTo(start + sweep.width, baseline + 2);
    ctx.lineTo(start + sweep.width, baseline - 4);
    ctx.stroke();
    ctx.globalAlpha *= 0.4;
    for (let i = 0; i < sweep.width; i += 14)
      ctx.fillRect(start + i, baseline + 4, 2, 1);
  } else if (effect === "geometric") {
    ctx.globalAlpha = (1 - t) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - 18, baseline + 3);
    ctx.lineTo(x - 7, y + sweep.height / 2);
    ctx.lineTo(x + 3, y - 4);
    ctx.moveTo(x - 8, baseline + 3);
    ctx.lineTo(x + 2, y + sweep.height / 2);
    ctx.lineTo(x + 12, y - 4);
    ctx.stroke();
  } else if (effect === "petals") {
    ctx.strokeStyle = colors.secondary;
    ctx.globalAlpha = Math.sin(t * Math.PI) * 0.24;
    ctx.beginPath();
    ctx.moveTo(start, baseline + 4);
    ctx.bezierCurveTo(
      start + sweep.width * 0.3,
      baseline - 8,
      x - 12,
      baseline + 10,
      x,
      baseline
    );
    ctx.stroke();
  } else if (effect === "ink") {
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 2.5 * (1 - t) + 0.5;
    ctx.globalAlpha = (1 - t) * 0.1;
    ctx.beginPath();
    ctx.moveTo(start, baseline + 1);
    ctx.bezierCurveTo(
      start + sweep.width * 0.3,
      baseline - 2,
      x - 12,
      baseline + 4,
      x,
      baseline
    );
    ctx.stroke();
  } else {
    ctx.globalAlpha = (1 - t) * (effect === "stardust-vivid" ? 0.22 : 0.12);
    ctx.fillRect(x - 18, y + 2, 18, Math.max(1, sweep.height - 4));
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.beginPath();
    ctx.moveTo(x - 10, baseline);
    ctx.lineTo(x + 3, baseline);
    ctx.lineTo(x + 7, baseline - 4);
    ctx.stroke();
  }
}

export function paintStreamSpark(
  effect: AnimatedStreamEffect,
  ctx: CanvasRenderingContext2D,
  spark: StreamSpark,
  t: number,
  seconds: number,
  ox: number,
  oy: number,
  colors: StreamEffectColors
) {
  const config = streamEffectConfig(effect);
  let x = ox + spark.x + spark.vx * seconds;
  let y =
    oy + spark.y + spark.vy * seconds + config.gravity * seconds * seconds;
  let size = spark.size * (1 - t * 0.55);
  if (effect === "petals") {
    x += Math.sin(seconds * 4 + spark.rotation) * 10;
    y += Math.sin(seconds * 2 + spark.rotation) * 5;
  } else if (effect === "scan") {
    x = Math.round(x / 3) * 3;
    y = Math.round(y / 3) * 3;
  } else if (effect === "ink") size = spark.size * (0.5 + t * 1.4);
  const alpha =
    Math.sin((Math.min(1, t * 5) * Math.PI) / 2) * (1 - t) * config.opacity;
  ctx.globalAlpha = alpha;
  ctx.fillStyle =
    effect === "petals"
      ? colors.secondary
      : effect === "ink"
        ? colors.ink
        : colors.primary;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(
    spark.rotation +
      seconds * (effect === "geometric" ? 4.5 : effect === "scan" ? 0 : 2.2)
  );
  if (effect === "geometric") {
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.8);
    ctx.lineTo(size * 1.4, -size * 1.2);
    ctx.lineTo(size * 0.5, size);
    ctx.closePath();
    if (spark.kind === 0) ctx.stroke();
    else ctx.fill();
  } else if (effect === "petals") {
    ctx.scale(
      0.55 + Math.abs(Math.cos(seconds * 3 + spark.rotation)) * 0.45,
      1
    );
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.bezierCurveTo(
      size * 1.5,
      -size * 0.8,
      size * 1.1,
      size * 0.8,
      0,
      size * 1.3
    );
    ctx.bezierCurveTo(
      -size * 0.9,
      size * 0.5,
      -size * 0.8,
      -size * 0.4,
      0,
      -size
    );
    ctx.fill();
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = colors.primary;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.6);
    ctx.quadraticCurveTo(size * 0.2, 0, 0, size);
    ctx.stroke();
  } else if (effect === "scan") {
    // Axis-aligned pixels read as a digital trail, even while the text wraps.
    ctx.rotate(-spark.rotation);
    if (spark.kind === 0) ctx.strokeRect(-size, -size, size * 2, size * 2);
    else ctx.fillRect(-size * 2, -0.7, size * 4, 1.4);
  } else if (effect === "ink") {
    for (let layer = 3; layer >= 1; layer--) {
      ctx.globalAlpha = alpha * (layer === 1 ? 0.7 : 0.16);
      ctx.beginPath();
      ctx.ellipse(
        layer * 0.3,
        0,
        size * (0.7 + layer * 0.22),
        size * (0.45 + layer * 0.18),
        spark.rotation,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else if (spark.kind === 0) {
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.7);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size * 1.7);
    ctx.lineTo(-size, 0);
    ctx.closePath();
    ctx.stroke();
  } else if (spark.kind === 1) ctx.fillRect(-size / 2, -size / 2, size, size);
  else {
    ctx.beginPath();
    ctx.moveTo(-size * 1.4, 0);
    ctx.lineTo(size * 1.4, 0);
    ctx.moveTo(0, -size * 1.4);
    ctx.lineTo(0, size * 1.4);
    ctx.stroke();
  }
  ctx.restore();
}
