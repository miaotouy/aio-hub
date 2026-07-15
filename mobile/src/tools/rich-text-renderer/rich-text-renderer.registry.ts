import { FileText } from "lucide-vue-next";
import { markRaw } from "vue";
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 提前注册语言包，确保路由 meta.title 等 getter 能正确获取翻译
registerToolLocales("rich-text-renderer", {
  "zh-CN": zhCN,
  "en-US": enUS,
});

export default {
  id: "rich-text-renderer",
  get name() {
    const { tRaw } = useI18n();
    return tRaw("tools.rich-text-renderer.common.富文本渲染");
  },
  icon: markRaw(FileText),
  get description() {
    const { tRaw } = useI18n();
    return tRaw("tools.rich-text-renderer.common.富文本渲染测试与排版调试");
  },
  route: {
    path: "/tools/rich-text-renderer",
    name: "RichTextRendererTester",
    component: () => import("./views/TesterView.vue"),
    meta: {
      get title() {
        const { tRaw } = useI18n();
        return tRaw("tools.rich-text-renderer.common.富文本渲染测试");
      },
    },
  },
};
