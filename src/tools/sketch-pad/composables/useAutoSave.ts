import { watch, onUnmounted } from "vue";
import type { EditorSession } from "./useEditorSession";
import type { useEditorExport } from "./useEditorExport";
import { useSketchPadStore } from "../stores/sketchPadStore";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/AutoSave");

/**
 * 自动保存系统
 * 负责定时器管理和脏状态 watcher
 */
export function useAutoSave(
  session: EditorSession,
  exportActions: ReturnType<typeof useEditorExport>,
) {
  const { state } = session;
  const store = useSketchPadStore();

  let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  /** 启动自动保存定时器 */
  function startAutoSaveTimer(): void {
    stopAutoSaveTimer();
    if (!store.settings.autoSaveEnabled) return;

    const intervalMs = store.settings.autoSaveInterval * 1000;
    autoSaveTimer = setInterval(() => {
      if (state.isDirty.value && state.project.value && state.currentView.value === "editor") {
        exportActions.handleAutoSave();
      }
    }, intervalMs);

    logger.debug("自动保存定时器已启动", { intervalMs });
  }

  /** 停止自动保存定时器 */
  function stopAutoSaveTimer(): void {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
  }

  // 标记脏状态：图层数据变化时自动标记
  watch(
    () => state.layers.value,
    () => {
      if (state.currentView.value === "editor" && !state.isInitializing.value) {
        state.isDirty.value = true;
      }
    },
    { deep: true },
  );

  // 智能图层切换提示
  watch(
    () => state.activeTool.value,
    (newTool) => {
      if (!state.activeLayer.value) return;

      const rasterTools = ["pencil", "marker", "eraser"];
      const objectTools = ["rect", "ellipse", "line", "arrow", "text"];

      if (rasterTools.includes(newTool) && state.activeLayer.value.type !== "raster") {
        if (store.settings.showToolSwitchHint) {
          // 提示由 customMessage 处理，这里只做图层切换逻辑
          import("@/utils/customMessage").then(({ customMessage }) => {
            customMessage.info("提示：画笔工具需要位图图层，已自动为您切换/创建位图图层");
          });
        }
        // 寻找最近的位图图层
        const rasterLayer = state.layers.value.find((l) => l.type === "raster");
        if (rasterLayer) {
          state.activeLayerId.value = rasterLayer.id;
        } else {
          session.actions.addLayer("raster");
        }
      } else if (objectTools.includes(newTool) && state.activeLayer.value.type !== "object") {
        if (store.settings.showToolSwitchHint) {
          import("@/utils/customMessage").then(({ customMessage }) => {
            customMessage.info("提示：形状/文字工具需要对象图层，已自动为您切换/创建对象图层");
          });
        }
        // 寻找最近的对象图层
        const objectLayer = state.layers.value.find((l) => l.type === "object");
        if (objectLayer) {
          state.activeLayerId.value = objectLayer.id;
        } else {
          session.actions.addLayer("object");
        }
      }
    },
  );

  // 组件卸载时清理定时器
  onUnmounted(() => {
    stopAutoSaveTimer();
  });

  return {
    startAutoSaveTimer,
    stopAutoSaveTimer,
  };
}