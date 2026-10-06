import { FileText } from "lucide-vue-next";
import { markRaw } from "vue";
import { useI18n } from "@/i18n";

export default {
  id: "log-manager",
  get name() {
    const { t } = useI18n();
    return t("tools.log-manager.common.日志管理");
  },
  icon: markRaw(FileText),
  get description() {
    const { t } = useI18n();
    return t("tools.log-manager.common.查看与管理运行日志");
  },
  route: {
    path: "/tools/log-manager",
    name: "LogManager",
    component: () => import("./views/LogManagerView.vue"),
    meta: {
      get title() {
        const { t } = useI18n();
        return t("tools.log-manager.common.系统日志");
      },
    },
  },
};
