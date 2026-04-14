import { toRef, computed, onUnmounted, type Ref, watch } from "vue";
import { useCanvasStore } from "../stores/canvasStore";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { createModuleLogger } from "@/utils/logger";
import { useCanvasWindowManager } from "./useCanvasWindowManager";

const logger = createModuleLogger("Canvas/Sync");

/**
 * Canvas 状态同步 Composable
 */
export function useCanvasSync() {
  const store = useCanvasStore();
  const bus = useWindowSyncBus();
  const windowManager = useCanvasWindowManager();

  let isInitialized = false;
  const stateEngines: ReturnType<typeof useStateSyncEngine>[] = [];

  onUnmounted(() => {
    if (stateEngines.length > 0) {
      logger.info("组件卸载，清理 Canvas 同步引擎");
      stateEngines.forEach((engine) => engine.cleanup());
      stateEngines.length = 0;
    }
  });

  function cleanupEngines() {
    if (stateEngines.length > 0) {
      stateEngines.forEach((engine) => engine.cleanup());
      stateEngines.length = 0;
    }
    isInitialized = false;
  }

  function initialize() {
    if (isInitialized) return;
    cleanupEngines();

    const activeCanvasId = toRef(store, "activeCanvasId");
    // 影子文件缓存同步（转换为普通对象以支持序列化）
    const pendingUpdates = computed({
      get: () => ({ ...store.pendingUpdates }),
      set: (val) => {
        if (bus.windowType === "detached-component") {
          Object.assign(store.pendingUpdates, val);
        }
      },
    });

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

    createStateEngine(activeCanvasId, "active-id");
    createStateEngine(pendingUpdates, "pending-updates");

    // Layer 3: 监听 pendingUpdates 变化，发送增量推送
    watch(
      () => store.pendingUpdates[store.activeCanvasId || ""],
      (newUpdates, oldUpdates) => {
        if (!newUpdates || bus.windowType !== "main") return;

        // 找出变更的文件
        const changedPaths = Object.keys(newUpdates).filter(
          (path) => !oldUpdates || newUpdates[path] !== oldUpdates[path],
        );

        for (const path of changedPaths) {
          const targetLabel = windowManager.getWindowLabel(store.activeCanvasId || "");
          bus.syncState(
            "canvas:file-delta" as any,
            {
              canvasId: store.activeCanvasId,
              filePath: path,
              content: newUpdates[path],
              changeType: "full",
            },
            0,
            false,
            targetLabel, // 定向推送
          );
        }
      },
      { deep: true },
    );

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
        store.writeFile(canvasId, params.filepath, params.content);
        // 主动推送增量
        const targetLabel = windowManager.getWindowLabel(canvasId);
        bus.syncState(
          "canvas:file-delta" as any,
          {
            canvasId,
            filePath: params.filepath,
            content: params.content,
            changeType: "full",
          },
          0,
          false,
          targetLabel,
        );
        return Promise.resolve();
      }
      case "apply-diff": {
        await store.applyDiff(canvasId, params.filepath, params.diff);
        // applyDiff 内部会调用 writeFile，上面的 watch 会处理推送。
        // 但为了即时性，也可以在这里手动推送一次最新的内容
        const newContent = await store.readCanvasFileAsync(canvasId, params.filepath);
        if (newContent !== null) {
          const targetLabel = windowManager.getWindowLabel(canvasId);
          bus.syncState(
            "canvas:file-delta" as any,
            {
              canvasId,
              filePath: params.filepath,
              content: newContent,
              changeType: "full",
            },
            0,
            false,
            targetLabel,
          );
        }
        return Promise.resolve();
      }
      case "commit-changes":
        return store.commitChanges(params.canvasId || store.activeCanvasId, params.message);
      case "discard-changes":
        store.discardChanges(params.canvasId || store.activeCanvasId);
        return Promise.resolve();
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
