import { FileText } from "lucide-vue-next";
import { markRaw } from "vue";
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 提前注册语言包
registerToolLocales("log-manager", {
  "zh-CN": zhCN,
  "en-US": enUS,
});

export default {
  id: "log-manager",
  get name() {
    const { tRaw } = useI18n();
    return tRaw("tools.log-manager.common.日志管理");
  },
  icon: markRaw(FileText),
  get description() {
    const { tRaw } = useI18n();
    return tRaw("tools.log-manager.common.查看与管理运行日志");
  },
  route: {
    path: "/tools/log-manager",
    name: "LogManager",
    component: () => import("./views/LogManagerView.vue"),
    meta: {
      get title() {
        const { tRaw } = useI18n();
        return tRaw("tools.log-manager.common.系统日志");
      },
    },
  },
};