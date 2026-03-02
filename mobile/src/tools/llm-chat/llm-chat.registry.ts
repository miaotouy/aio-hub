import { MessageSquare } from "lucide-vue-next";
import { markRaw } from "vue";
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 提前注册语言包，确保路由 meta.title 等 getter 能正确获取翻译
registerToolLocales("llm-chat", {
  "zh-CN": zhCN,
  "en-US": enUS,
});

export default {
  id: "llm-chat",
  get name() {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-chat.common.AI 对话");
  },
  icon: markRaw(MessageSquare),
  get description() {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-chat.common.与 AI 进行即时对话");
  },
  route: {
    path: "/tools/llm-chat",
    name: "LlmChatRoot",
    redirect: "/tools/llm-chat/home",
    children: [
      {
        path: "home",
        name: "LlmChatHome",
        component: () => import("./views/ChatHome.vue"),
        meta: {
          get title() {
            const { tRaw } = useI18n();
            return tRaw("tools.llm-chat.common.AI 对话");
          },
        },
      },
      {
        path: "sessions",
        name: "LlmChatSessions",
        component: () => import("./views/SessionList.vue"),
        meta: {
          get title() {
            const { tRaw } = useI18n();
            return tRaw("tools.llm-chat.common.历史会话");
          },
        },
      },
      {
        path: "chat/:id",
        name: "LlmChatDetail",
        component: () => import("./views/LlmChatView.vue"),
        meta: {
          get title() {
            const { tRaw } = useI18n();
            return tRaw("tools.llm-chat.common.对话详情");
          },
        },
      },
      {
        path: "settings",
        name: "LlmChatSettings",
        component: () => import("./views/ChatSettingsView.vue"),
        meta: {
          get title() {
            const { tRaw } = useI18n();
            return tRaw("tools.llm-chat.common.聊天设置");
          },
        },
      },
    ],
  },
};