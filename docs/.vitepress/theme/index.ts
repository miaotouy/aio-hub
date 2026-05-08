// https://vitepress.dev/guide/custom-theme
import { h, defineComponent } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import * as LucideIcons from "lucide-vue-next";
import "./custom.css";

// 简单的 Lucide 图标包装组件
const LucideIcon = defineComponent({
  name: "LucideIcon",
  props: {
    name: {
      type: String,
      required: true,
    },
    size: {
      type: [Number, String],
      default: 16,
    },
    color: {
      type: String,
      default: "currentColor",
    },
    strokeWidth: {
      type: [Number, String],
      default: 2,
    },
  },
  setup(props) {
    return () => {
      const IconComponent = (LucideIcons as any)[props.name];
      if (!IconComponent) {
        console.warn(`[LucideIcon] Icon "${props.name}" not found.`);
        return h("span", { class: "lucide-icon-placeholder" }, props.name);
      }
      return h(IconComponent, {
        size: props.size,
        color: props.color,
        "stroke-width": props.strokeWidth,
        class: "lucide-icon",
        style: {
          display: "inline-block",
          verticalAlign: "middle",
          marginTop: "-2px",
        },
      });
    };
  },
});

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    });
  },
  enhanceApp({ app, router, siteData }) {
    app.component("LIcon", LucideIcon);
  },
} satisfies Theme;
