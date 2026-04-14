import { toRef, onUnmounted, type Ref, watch } from "vue";
import { useCanvasStore } from "../stores/canvasStore";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { createModuleLogger } from "@/utils/logger";
import { useCanvasWindowManager } from "./useCanvasWindowManager";

const logger = createModuleLogger("Canvas/Sync");

/**
 * Canvas 状态同步 Composable (Physical-First 版)
 */
export function useCanvasSync() {
  const store = useCanvasStore();
  const bus = useWindowSyncBus();
  const windowManager = useCanvasWindowManager();

  let isInitialized = false;
  const stateEngines: ReturnType<typeof useStateSyncEngine>[] = [];
  let fileChangedUnlisten: (() => void) | null = null;

  onUnmounted(() => {
    cleanupEngines();
  });

  function cleanupEngines() {
    if (stateEngines.length > 0) {
      logger.info("清理 Canvas 同步引擎");
      stateEngines.forEach((engine) => engine.cleanup());
      stateEngines.length = 0;
    }
    if (fileChangedUnlisten) {
      fileChangedUnlisten();
      fileChangedUnlisten = null;
    }
    isInitialized = false;
  }

  function initialize() {
    if (isInitialized) return;
    cleanupEngines();

    const activeCanvasId = toRef(store, "activeCanvasId");

    const createStateEngine = (stateSource: Ref<any>, stateKey: string) => {
      const engine = useStateSyncEngine(stateSource, {
        stateKey: `canvas:${stateKey}` as any,
        autoPush: true,
        autoReceive: true,
        enableDelta: true,
      });
      stateEngines.push(engine);
      return engine;
    };

    // 只同步 active-id
    createStateEngine(activeCanvasId, "active-id");

    // 监听 store 的文件变更事件，广播到分离窗口
    fileChangedUnlisten = store.onFileChanged((canvasId, filepath) => {
      const targetLabel = windowManager.getWindowLabel(canvasId);
      bus.syncState(
        "canvas:file-changed" as any,
        {
          canvasId,
          filepath,
          timestamp: Date.now(),
        },
        0,
        false,
        targetLabel,
      );
    });

    // 处理窗口打开事件（全量同步）
    if (bus.windowType === "main" || bus.windowType === "detached-tool") {
      watch(
        () => windowManager.openWindows.value.size,
        (newSize, oldSize) => {
          if (typeof oldSize === "number" && newSize > oldSize) {
            logger.info("Canvas 检测到新窗口打开，强制全量广播");
            stateEngines.forEach((e) => e.manualPush(true, undefined, true));
          }
        },
      );
    }

    logger.info("Canvas 同步引擎已初始化", { windowType: bus.windowType });
    isInitialized = true;
  }

  // 注册 Action 处理器
  const handleActionRequest = async (action: string, params: any): Promise<any> => {
    logger.info("Canvas 收到操作请求", { action, params });
    const canvasId = params.canvasId || store.activeCanvasId;

    switch (action) {
      case "open-window": {
        return windowManager.openPreviewWindow(canvasId, `画布预览 - ${canvasId}`);
      }
      case "open-canvas": {
        if (params.canvasId) {
          await store.openCanvas(params.canvasId);
        }
        return Promise.resolve();
      }
      case "write-file": {
        // 重构后调用物理写入
        await store.writeFilePhysical(canvasId, params.filepath, params.content);
        return Promise.resolve();
      }
      case "apply-diff": {
        await store.applyDiff(canvasId, params.filepath, params.diff);
        return Promise.resolve();
      }
      case "commit-changes":
        return store.commitChanges(canvasId, params.message);
      case "discard-changes":
        return store.discardChanges(canvasId);
      default:
        return Promise.reject(new Error(`Unknown canvas action: ${action}`));
    }
  };

  if (bus.windowType === "main" || bus.windowType === "detached-tool") {
    bus.onActionRequest("canvas", handleActionRequest);

    watch(
      bus.hasDownstreamWindows,
      (hasDownstream) => {
        if (hasDownstream) {
          initialize();
        } else {
          cleanupEngines();
        }
      },
      { immediate: true },
    );
  }

  return {};
}
