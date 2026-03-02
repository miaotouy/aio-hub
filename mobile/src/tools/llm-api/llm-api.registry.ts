import { Bot } from "lucide-vue-next";
import { markRaw } from "vue";
import { useLlmProfilesStore } from "./stores/llmProfiles";
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 提前注册语言包，确保路由 meta.title 等 getter 能正确获取翻译
registerToolLocales("llm-api", {
  "zh-CN": zhCN,
  "en-US": enUS,
});

export default {
  id: "llm-api",
  get name() {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.common.LLM 服务");
  },
  icon: markRaw(Bot),
  get description() {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.common.管理 LLM 渠道与模型配置");
  },
  route: {
    path: "/tools/llm-api",
    name: "LlmSettings",
    component: () => import("./views/LlmSettingsView.vue"),
    meta: {
      get title() {
        const { tRaw } = useI18n();
        return tRaw("tools.llm-api.common.LLM 渠道管理");
      },
    },
  },
  async init() {
    const llmProfilesStore = useLlmProfilesStore();
    await llmProfilesStore.init();
  },
};