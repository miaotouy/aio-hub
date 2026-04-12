import { ref, reactive, onMounted, onUnmounted } from "vue";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/StateConsumer");

export function useCanvasStateConsumer() {
  const bus = useWindowSyncBus();
  
  // 本地状态副本
  const activeCanvasId = ref<string | null>(null);
  const pendingUpdates = reactive<Record<string, string>>({});
  const canvasMetadata = ref<any>(null);
  
  const engines: ReturnType<typeof useStateSyncEngine>[] = [];

  function initialize() {
    // Layer 1: 元数据同步（只接收）
    const idEngine = useStateSyncEngine(activeCanvasId, {
      stateKey: 'canvas:active-id' as any,
      autoPush: false,
      autoReceive: true,
      enableDelta: true,
    });
    engines.push(idEngine);

    // 监听 Layer 3: 预览增量通道
    const unlisten = bus.onMessage('state-sync', (payload: any) => {
      if (payload.stateType === 'canvas:file-delta') {
        const { filePath, content } = payload.data;
        pendingUpdates[filePath] = content;
      } else if (payload.stateType === 'canvas:pending-updates') {
        // 全量同步
        // 清理旧的
        Object.keys(pendingUpdates).forEach(k => delete pendingUpdates[k]);
        // 如果是全量同步，data 包含所有文件
        if (payload.isFull && payload.data) {
          // 这里需要注意结构，store 中的 pendingUpdates 是 { canvasId: { path: content } }
          // 但同步过来的是否已经剥离了 canvasId？
          // 根据 useCanvasSync.ts，pendingUpdates 是 computed({ get: () => ({ ...store.pendingUpdates }) })
          // 所以 payload.data 是 { canvasId: { path: content } }
          const canvasId = activeCanvasId.value;
          if (canvasId && payload.data[canvasId]) {
            Object.assign(pendingUpdates, payload.data[canvasId]);
          }
        }
      }
    });

    // 请求初始状态
    bus.requestInitialState();
    
    logger.info("Canvas 状态消费者已初始化");
    return unlisten;
  }

  let unlistenFn: (() => void) | null = null;

  onMounted(() => {
    unlistenFn = initialize();
  });

  onUnmounted(() => {
    engines.forEach(e => e.cleanup());
    engines.length = 0;
    if (unlistenFn) unlistenFn();
  });

  return {
    activeCanvasId,
    pendingUpdates,
    canvasMetadata,
  };
}