import { ref, onBeforeUnmount } from "vue";
import { DanmakuEngine } from "../core/danmakuEngine";
import type { ParsedDanmaku, DanmakuConfig, AssScriptInfo } from "../types";

export function useDanmakuRenderer() {
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  let engine: DanmakuEngine | null = null;
  let animationId: number | null = null;

  const initEngine = (canvas: HTMLCanvasElement, config: DanmakuConfig, scriptInfo: AssScriptInfo) => {
    canvasRef.value = canvas;
    engine = new DanmakuEngine(canvas, config, scriptInfo);
  };

  const setDanmakus = (danmakus: ParsedDanmaku[]) => {
    engine?.setDanmakus(danmakus);
  };

  const updateConfig = (config: DanmakuConfig) => {
    engine?.setConfig(config);
  };

  const updateScriptInfo = (info: AssScriptInfo) => {
    engine?.setScriptInfo(info);
  };

  const startRender = (getCurrentTime: () => number) => {
    if (animationId) return;

    const loop = () => {
      if (engine) {
        engine.render(getCurrentTime());
      }
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
  };

  const stopRender = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };

  const clearCanvas = () => {
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    }
  };

  onBeforeUnmount(() => {
    stopRender();
  });

  return {
    canvasRef,
    initEngine,
    setDanmakus,
    updateConfig,
    updateScriptInfo,
    startRender,
    stopRender,
    clearCanvas,
  };
}
