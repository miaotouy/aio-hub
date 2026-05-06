import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ref, readonly } from "vue";

export interface CanvasWindowInfo {
  label: string;
  canvasId: string;
  title: string;
}

// 响应式状态（单例，跨组件共享）
const openWindows = ref<Map<string, CanvasWindowInfo>>(new Map());
let isInitialized = false;

export function useCanvasWindowManager() {
  /**
   * 初始化监听器（仅执行一次）
   */
  const initListeners = async () => {
    if (isInitialized) return;
    isInitialized = true;

    // 获取初始状态
    try {
      const windows = await invoke<CanvasWindowInfo[]>("get_canvas_windows");
      windows.forEach((win) => {
        openWindows.value.set(win.canvasId, win);
      });
    } catch (error) {
      console.error("[CanvasWindowManager] 获取初始窗口列表失败:", error);
    }

    // 监听打开事件
    listen<CanvasWindowInfo>("canvas-window-opened", (event) => {
      openWindows.value.set(event.payload.canvasId, event.payload);
    });

    // 监听关闭事件
    listen<CanvasWindowInfo>("canvas-window-closed", (event) => {
      openWindows.value.delete(event.payload.canvasId);
    });

    // 监听 DOM 事件请求（来自 Store 或 Registry）
    window.addEventListener("canvas:request-window", (e: any) => {
      const { canvasId } = e.detail;
      openPreviewWindow(canvasId);
    });
  };

  /**
   * 打开预览窗口
   */
  async function openPreviewWindow(canvasId: string, title?: string): Promise<string> {
    return invoke<string>("create_canvas_window", {
      canvasId,
      title: title ?? `画布预览 - ${canvasId}`,
    });
  }

  /**
   * 关闭指定画布窗口
   */
  async function closePreviewWindow(canvasId: string): Promise<void> {
    return invoke("close_canvas_window", { canvasId });
  }

  /**
   * 关闭所有画布窗口
   */
  async function closeAllWindows(): Promise<number> {
    return invoke<number>("close_all_canvas_windows");
  }

  /**
   * 判断窗口是否打开
   */
  function isWindowOpen(canvasId: string): boolean {
    return openWindows.value.has(canvasId);
  }

  /**
   * 获取窗口 Label
   */
  function getWindowLabel(canvasId: string): string | undefined {
    return openWindows.value.get(canvasId)?.label;
  }

  // 自动初始化
  initListeners();

  return {
    openWindows: readonly(openWindows),
    openPreviewWindow,
    closePreviewWindow,
    closeAllWindows,
    isWindowOpen,
    getWindowLabel,
  };
}
