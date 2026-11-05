import { LlmServiceIcon } from "@aiohub/tool-icons";
import { markRaw } from "vue";
import { useLlmProfilesStore } from "./stores/llmProfiles";
import { useI18n } from "@/i18n";

export default {
  id: "llm-api",
  get name() {
    const { t } = useI18n();
    return t("tools.llm-api.common.LLM 服务");
  },
  icon: markRaw(LlmServiceIcon),
  get description() {
    const { t } = useI18n();
    return t("tools.llm-api.common.管理 LLM 渠道与模型配置");
  },
  route: {
    path: "/tools/llm-api",
    name: "LlmSettings",
    component: () => import("./views/LlmSettingsView.vue"),
    meta: {
      get title() {
        const { t } = useI18n();
        return t("tools.llm-api.common.LLM 渠道管理");
      },
    },
  },
  async init() {
    const llmProfilesStore = useLlmProfilesStore();
    await llmProfilesStore.init();
  },
};
