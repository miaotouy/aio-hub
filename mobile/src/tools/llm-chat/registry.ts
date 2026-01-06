export default {
  id: "llm-chat",
  name: "AI 对话",
  icon: "MessageSquare",
  route: {
    path: "/tools/llm-chat",
    name: "LlmChat",
    component: () => import("./views/LlmChatView.vue"),
    meta: { title: "AI 对话" },
  },
};