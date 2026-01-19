import type { ToolConfig, ToolRegistry } from "@/services/types";
import { markRaw } from "vue";
import VcpConnectorIcon from "@/components/icons/VcpConnectorIcon.vue";

export class VcpConnectorRegistry implements ToolRegistry {
  public readonly id = "vcp-connector";
  public readonly name = "VCP 监控";
  public readonly description = "VCP 实时监控面板";

  public getMetadata() {
    return {
      methods: [],
    };
  }
}

export const toolConfig: ToolConfig = {
  name: "VCP 监控",
  path: "/vcp-connector",
  icon: markRaw(VcpConnectorIcon),
  component: () => import("./VcpConnector.vue"),
  description: "VCP 实时监控面板 - 监听 RAG、推理链、Agent 私聊等广播消息",
  category: "调试工具",
};
