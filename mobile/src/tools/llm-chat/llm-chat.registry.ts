import { MessageSquare } from "lucide-vue-next";
import { markRaw } from "vue";
import { useI18n } from "@/i18n";

export default {
  id: "llm-chat",
  get name() {
    const { t } = useI18n();
    return t("tools.llm-chat.common.AI 对话");
  },
  icon: markRaw(MessageSquare),
  get description() {
    const { t } = useI18n();
    return t("tools.llm-chat.common.与 AI 进行即时对话");
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
            const { t } = useI18n();
            return t("tools.llm-chat.common.AI 对话");
          },
        },
      },
      {
        path: "sessions",
        name: "LlmChatSessions",
        component: () => import("./views/SessionList.vue"),
        meta: {
          get title() {
            const { t } = useI18n();
            return t("tools.llm-chat.common.历史会话");
          },
        },
      },
      {
        path: "chat/:id",
        name: "LlmChatDetail",
        component: () => import("./views/LlmChatView.vue"),
        meta: {
          get title() {
            const { t } = useI18n();
            return t("tools.llm-chat.common.对话详情");
          },
        },
      },
      {
        path: "profiles",
        name: "LlmChatUserProfiles",
        component: () => import("./views/UserProfilesView.vue"),
        meta: {
          get title() {
            const { t } = useI18n();
            return t("tools.llm-chat.UserProfiles.用户档案");
          },
        },
      },
      {
        path: "worldbooks",
        name: "LlmChatWorldbooks",
        component: () => import("./views/WorldbooksView.vue"),
        meta: {
          get title() {
            const { t } = useI18n();
            return t("tools.llm-chat.Worldbooks.世界书");
          },
        },
      },
      {
        path: "settings",
        name: "LlmChatSettings",
        component: () => import("./views/ChatSettingsView.vue"),
        meta: {
          get title() {
            const { t } = useI18n();
            return t("tools.llm-chat.common.聊天设置");
          },
        },
      },
    ],
  },
};
