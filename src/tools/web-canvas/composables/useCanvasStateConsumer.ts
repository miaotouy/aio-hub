import { ref, onMounted, onUnmounted } from "vue";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/StateConsumer");

/**
 * Canvas 状态消费者 (分离窗口使用)
 */
export function useCanvasStateConsumer() {
  const bus = useWindowSyncBus();

  // 本地状态副本
  const activeCanvasId = ref<string | null>(null);
  const lastFileChangeTimestamp = ref(0);

  const engines: ReturnType<typeof useStateSyncEngine>[] = [];
  let unlistenFn: (() => void) | null = null;

  /**
   * 初始化状态同步
   * 注意：为了兼容异步 setup，此方法不使用生命周期钩子，需手动调用 cleanup
   */
  function initialize() {
    if (unlistenFn) return;

    // 只同步 canvasId
    const idEngine = useStateSyncEngine(activeCanvasId, {
      stateKey: "canvas:active-id" as any,
      autoPush: false,
      autoReceive: true,
      enableDelta: true,
    });
    engines.push(idEngine);

    // 监听文件变更通知
    unlistenFn = bus.onMessage("state-sync", (payload: any) => {
      if (payload.stateType === "canvas:file-changed") {
        lastFileChangeTimestamp.value = payload.data.timestamp;
        logger.info("收到文件变更通知", {
          canvasId: payload.data.canvasId,
          filepath: payload.data.filepath,
          timestamp: payload.data.timestamp
        });
      }
    });

    // 请求初始状态
    bus.requestInitialState();

    logger.info("Canvas 状态消费者已初始化");
  }

  function cleanup() {
    engines.forEach((e) => e.cleanup());
    engines.length = 0;
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
    logger.info("Canvas 状态消费者已清理");
  }

  // 如果在 setup 期间调用，则自动挂载生命周期
  try {
    onMounted(() => initialize());
    onUnmounted(() => cleanup());
  } catch (e) {
    // 忽略在非组件上下文中的错误，由调用者手动管理
  }

  return {
    activeCanvasId,
    lastFileChangeTimestamp,
    initialize,
    cleanup
  };
}
