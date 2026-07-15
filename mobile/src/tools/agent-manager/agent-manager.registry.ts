import { Bot } from "lucide-vue-next";
import { markRaw } from "vue";
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

registerToolLocales("agent-manager", { "zh-CN": zhCN, "en-US": enUS });

export default {
  id: "agent-manager",
  get name() {
    return useI18n().tRaw("tools.agent-manager.common.智能体管理");
  },
  icon: markRaw(Bot),
  get description() {
    return useI18n().tRaw("tools.agent-manager.common.管理角色设定与模型绑定");
  },
  route: {
    path: "/tools/agent-manager",
    name: "AgentManagerRoot",
    redirect: "/tools/agent-manager/list",
    children: [
      {
        path: "list",
        name: "AgentManagerList",
        component: () => import("./views/AgentList.vue"),
      },
      {
        path: ":id",
        name: "AgentManagerDetail",
        component: () => import("./views/AgentDetail.vue"),
      },
    ],
  },
};
