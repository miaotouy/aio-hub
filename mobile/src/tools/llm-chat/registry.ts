import { MessageSquare } from "lucide-vue-next";
import { markRaw } from "vue";

export default {
  id: "llm-chat",
  name: "AI 对话",
  icon: markRaw(MessageSquare),
  description: "与 AI 进行即时对话",
  route: {
    path: "/tools/llm-chat",
    name: "LlmChat",
    component: () => import("./views/LlmChatView.vue"),
    meta: { title: "AI 对话" },
  },
};