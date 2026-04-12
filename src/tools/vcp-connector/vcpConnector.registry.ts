import type { ToolConfig, ToolRegistry } from "@/services/types";
import type { DetachableComponentRegistration } from "@/types/detachable";
import { markRaw, ref } from "vue";
import VcpConnectorIcon from "@/components/icons/VcpConnectorIcon.vue";
import { useVcpStore } from "./stores/vcpConnectorStore";
import { useVcpDistributedStore } from "./stores/vcpDistributedStore";
import { useVcpDistributedNode } from "./composables/useVcpDistributedNode";
import { vcpBridgeFactory } from "./services/VcpBridgeFactory";

export class VcpConnectorRegistry implements ToolRegistry {
  public readonly id = "vcp-connector";
  public readonly runMode = "main-only";
  public readonly name = "VCP 连接器";
  public readonly description = "VCP 分布式连接与监控中心";
  public readonly detachableComponents: Record<string, DetachableComponentRegistration> = {
    "vcp-connector:monitor": {
      component: () => import("./components/monitor/MessageMonitorPage.vue"),
      logicHook: () => ({
        // 显式注入 isDetached 状态，告知组件它正处于分离模式
        props: ref({
          isDetached: true,
        }),
        listeners: {},
      }),
    },
  };

  public readonly startupConfig = {
    label: "VCP 自动连接",
    description: "应用启动时自动尝试连接到 VCP 服务器",
    defaultEnabled: false,
  };
  public async onStartup() {
    const vcpStore = useVcpStore();
    const distStore = useVcpDistributedStore();
    const { startDistributedNode } = useVcpDistributedNode();

    // 等待 store 的异步 init() 完成（配置加载），再触发连接
    // 否则 wsUrl/vcpKey 为空，connect() 会静默失败
    await Promise.all([vcpStore.initPromise, distStore.initPromise]);

    // 显式触发连接
    vcpStore.connect();

    // 启动分布式节点逻辑（包括工具注册和心跳）
    // 这样即便不点开 VCP 界面，自启后也能正常注册工具
    startDistributedNode();
  }

  public getMetadata() {
    return {
      methods: [],
    };
  }
}

export default [new VcpConnectorRegistry(), vcpBridgeFactory];

// VCP 即 Variable & Command Protocol
export const toolConfig: ToolConfig = {
  name: "VCP 连接器",
  path: "/vcp-connector",
  runMode: "main-only",
  icon: markRaw(VcpConnectorIcon),
  component: () => import("./VcpConnector.vue"),
  description: "VCP 分布式连接中心 - 支持跨节点工具共享、RAG 监控及 Agent 消息广播",
  category: "调试工具",
};
