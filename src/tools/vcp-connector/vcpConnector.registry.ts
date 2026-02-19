import type { ToolConfig, ToolRegistry } from "@/services/types";
import { markRaw } from "vue";
import VcpConnectorIcon from "@/components/icons/VcpConnectorIcon.vue";

export class VcpConnectorRegistry implements ToolRegistry {
  public readonly id = "vcp-connector";
  public readonly name = "VCP 连接器";
  public readonly description = "VCP 分布式连接与监控中心";

  public getMetadata() {
    return {
      methods: [],
    };
  }
}

export const toolConfig: ToolConfig = {
  name: "VCP 连接器",
  path: "/vcp-connector",
  icon: markRaw(VcpConnectorIcon),
  component: () => import("./VcpConnector.vue"),
  description: "VCP 分布式连接中心 - 支持跨节点工具共享、RAG 监控及 Agent 消息广播",
  category: "调试工具",
};
