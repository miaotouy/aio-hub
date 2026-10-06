import { FileText } from "lucide-vue-next";
import { markRaw } from "vue";
import { useI18n } from "@/i18n";

export default {
  id: "rich-text-renderer",
  get name() {
    const { t } = useI18n();
    return t("tools.rich-text-renderer.common.富文本渲染");
  },
  icon: markRaw(FileText),
  get description() {
    const { t } = useI18n();
    return t("tools.rich-text-renderer.common.富文本渲染测试与排版调试");
  },
  route: {
    path: "/tools/rich-text-renderer",
    name: "RichTextRendererTester",
    component: () => import("./views/TesterView.vue"),
    meta: {
      get title() {
        const { t } = useI18n();
        return t("tools.rich-text-renderer.common.富文本渲染测试");
      },
    },
  },
};
