import { Images } from "lucide-vue-next";
import { markRaw } from "vue";
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

registerToolLocales("asset-manager", { "zh-CN": zhCN, "en-US": enUS });

export default {
  id: "asset-manager",
  get name() {
    return useI18n().tRaw("tools.asset-manager.common.name");
  },
  icon: markRaw(Images),
  get description() {
    return useI18n().tRaw("tools.asset-manager.common.description");
  },
  route: {
    path: "/tools/asset-manager",
    name: "AssetManager",
    component: () => import("./views/AssetManagerView.vue"),
    meta: {
      get title() {
        return useI18n().tRaw("tools.asset-manager.common.name");
      },
    },
  },
};
