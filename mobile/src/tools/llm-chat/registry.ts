import { MessageSquare } from "lucide-vue-next";
import { markRaw } from "vue";

export default {
  id: "llm-chat",
  name: "AI 对话",
  icon: markRaw(MessageSquare),
  description: "与 AI 进行即时对话",
  route: {
    path: "/tools/llm-chat",
    name: "LlmChatRoot",
    redirect: "/tools/llm-chat/home",
    children: [
      {
        path: "home",
        name: "LlmChatHome",
        component: () => import("./views/ChatHome.vue"),
        meta: { title: "AI 对话" },
      },
      {
        path: "sessions",
        name: "LlmChatSessions",
        component: () => import("./views/SessionList.vue"),
        meta: { title: "历史会话" },
      },
      {
        path: "chat/:id",
        name: "LlmChatDetail",
        component: () => import("./views/LlmChatView.vue"),
        meta: { title: "对话详情" },
      },
    ],
  },
};