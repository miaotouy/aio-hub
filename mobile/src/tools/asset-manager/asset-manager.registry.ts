import { Images } from "lucide-vue-next";
import { markRaw } from "vue";
import { useI18n } from "@/i18n";

export default {
  id: "asset-manager",
  get name() {
    return useI18n().t("tools.asset-manager.common.name");
  },
  icon: markRaw(Images),
  get description() {
    return useI18n().t("tools.asset-manager.common.description");
  },
  route: {
    path: "/tools/asset-manager",
    name: "AssetManager",
    component: () => import("./views/AssetManagerView.vue"),
    meta: {
      get title() {
        return useI18n().t("tools.asset-manager.common.name");
      },
    },
  },
};
