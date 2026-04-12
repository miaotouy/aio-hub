import { toRef, computed, onUnmounted, type Ref, watch } from "vue";
import { useCanvasStore } from "../stores/canvasStore";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { createModuleLogger } from "@/utils/logger";
import { useDetachedManager } from "@/composables/useDetachedManager";

const logger = createModuleLogger("Canvas/Sync");

/**
 * Canvas 状态同步 Composable
 */
export function useCanvasSync() {
  const store = useCanvasStore();
  const bus = useWindowSyncBus();

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
      }
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

    // 处理重新附着
    if (bus.windowType === "main" || bus.windowType === "detached-tool") {
      const detachedManager = useDetachedManager();
      watch(
        () => detachedManager.detachedComponents.value.length,
        (newLength, oldLength) => {
          if (typeof oldLength === "number" && newLength < oldLength) {
            logger.info("Canvas 检测到组件重新附着，强制全量广播");
            stateEngines.forEach(e => e.manualPush(true, undefined, true));
          }
        }
      );
    }

    logger.info("Canvas 同步引擎已初始化", { windowType: bus.windowType });
    isInitialized = true;
  }

  // 注册 Action 处理器
  const handleActionRequest = (action: string, params: any): Promise<any> => {
    logger.info("Canvas 收到操作请求", { action, params });
    switch (action) {
      case "write-file":
        store.writeFile(params.canvasId || store.activeCanvasId, params.filepath, params.content);
        return Promise.resolve();
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
      { immediate: true }
    );
  }

  return {};
}