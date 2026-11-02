// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { onMounted, reactive, watch } from "vue";
import { usePageActivity } from "@/composables/usePageActivity";

export function useGraphStats(
  showHud: () => boolean,
  getViewport: () => { zoom: number }
) {
  const active = usePageActivity();
  const stats = reactive({ fps: 60, zoom: 1 });
  let frame: number | null = null;
  let frameCount = 0;
  let lastTime = performance.now();
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const tick = () => {
    frame = null;
    if (!active.value || !showHud()) return;
    const now = performance.now();
    frameCount++;
    if (now - lastTime >= 1000) {
      stats.fps = Math.round((frameCount * 1000) / (now - lastTime));
      frameCount = 0;
      lastTime = now;
    }
    const viewport = getViewport();
    if (Math.abs(stats.zoom - viewport.zoom) > 0.01) stats.zoom = viewport.zoom;
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    stop();
    if (!active.value || !showHud()) return;
    frameCount = 0;
    lastTime = performance.now();
    tick();
  };
  onMounted(sync);
  watch([active, showHud], sync, { flush: "sync" });
  return stats;
}
