import { reactive, onMounted } from "vue";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SyncDemoState");

// 定义同步 Key 和 组件 ID
export const SYNC_DEMO_STATE_KEY = "component-tester:sync-demo-data";
export const SYNC_DEMO_COMPONENT_ID = "component-tester:sync-demo";

// 模块级单例数据，确保主窗口内不同组件访问的是同一个对象
const syncData = reactive({
  counter: 42,
  text: "Hello from AIO Hub Sync System!",
  // 测试深度对象同步
  nested: {
    a: 1,
    b: {
      c: "deep value",
    },
  },
  // 记录远程触发的次数
  remoteActionCount: 0,
});

export function useSyncDemoState() {
  const bus = useWindowSyncBus();

  // 1. 初始化同步引擎
  // 开启双向同步：所有窗口类型都自动推送和接收
  const { manualPush } = useStateSyncEngine(syncData, {
    stateKey: SYNC_DEMO_STATE_KEY,
    autoPush: true,
    autoReceive: true,
    debounce: 50,
  });

  // 2. 跨窗口 Action 处理
  // 只有主窗口或分离工具窗口（拥有数据的窗口）才注册处理器
  if (bus.windowType === "main" || bus.windowType === "detached-tool") {
    bus.onActionRequest(async (action, params) => {
      logger.info("收到测试 Action 请求", { action, params });
      if (action === "test-notify") {
        syncData.remoteActionCount++;
        return { success: true, message: `来自分离窗口的消息: ${params.msg}` };
      }
      return null;
    });
  }

  // 3. 分离窗口挂载时，主动请求初始状态
  onMounted(() => {
    if (bus.windowType === "detached-component") {
      logger.info("分离窗口已挂载，请求初始状态...");
      bus.requestInitialState();
    }
  });

  /**
   * 触发远程 Action (从分离窗口调用)
   */
  const triggerRemoteNotify = async (msg: string) => {
    if (bus.windowType === "detached-component") {
      return await bus.requestAction("test-notify", { msg });
    }
    return null;
  };

  return {
    syncData,
    manualPush,
    triggerRemoteNotify,
    windowType: bus.windowType,
  };
}