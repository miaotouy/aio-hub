// https://vitepress.dev/guide/custom-theme
import { h, defineComponent, ref, onMounted, onUnmounted } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import * as LucideIcons from "lucide-vue-next";
import { useData } from "vitepress";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
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

// 文档操作组件：复制/下载
const DocAction = defineComponent({
  name: "DocAction",
  setup() {
    const { page } = useData();
    const showMenu = ref(false);
    const copiedText = ref("");
    const menuRef = ref<HTMLElement | null>(null);

    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    });

    // 使用 GFM 插件支持表格
    turndownService.use(gfm);

    // 针对 VitePress 的定制规则
    // 1. 移除锚点链接
    turndownService.addRule("removeAnchors", {
      filter: (node) => node.nodeName === "A" && node.classList.contains("header-anchor"),
      replacement: () => "",
    });

    // 2. 处理 VitePress 自定义容器 (::: tip 等)
    turndownService.addRule("customBlocks", {
      filter: (node) => node.nodeName === "DIV" && node.classList.contains("custom-block"),
      replacement: (content, node) => {
        const title = (node as HTMLElement).querySelector(".custom-block-title")?.textContent || "";
        const type = Array.from(node.classList)
          .find((c) => ["tip", "info", "warning", "danger", "details"].includes(c))
          ?.toUpperCase();
        return `\n\n> **${type}${title ? ": " + title : ""}**\n> ${content.trim().replace(/\n/g, "\n> ")}\n\n`;
      },
    });

    // 3. 移除代码块的行号和复制按钮等干扰
    turndownService.addRule("cleanCodeBlocks", {
      filter: (node) => node.nodeName === "DIV" && node.classList.contains("language-"),
      replacement: (content, node) => {
        const pre = (node as HTMLElement).querySelector("pre");
        const code = pre?.querySelector("code")?.textContent || pre?.textContent || "";
        const lang = Array.from(node.classList)
          .find((c) => c.startsWith("language-"))
          ?.replace("language-", "");
        return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
      },
    });

    const getDocContent = () => {
      const el = document.querySelector(".vp-doc > div");
      return el as HTMLElement | null;
    };

    const handleCopy = async (type: "text" | "md") => {
      const el = getDocContent();
      if (!el) return;

      try {
        let content = "";
        if (type === "text") {
          content = el.innerText;
        } else {
          content = turndownService.turndown(el.innerHTML);
        }

        await navigator.clipboard.writeText(content);
        copiedText.value = type === "text" ? "已复制文本" : "已复制 MD";
        showMenu.value = false;
        setTimeout(() => (copiedText.value = ""), 2000);
      } catch (e) {
        console.error("Failed to copy", e);
      }
    };

    const handleDownload = () => {
      const el = getDocContent();
      if (!el) return;

      const mdContent = turndownService.turndown(el.innerHTML);
      const blob = new Blob([mdContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const title = page.value.title || "document";
      a.href = url;
      a.download = `${title}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showMenu.value = false;
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
        showMenu.value = false;
      }
    };

    onMounted(() => {
      document.addEventListener("click", handleClickOutside);
    });

    onUnmounted(() => {
      document.removeEventListener("click", handleClickOutside);
    });

    return () =>
      h(
        "div",
        {
          class: "doc-actions",
          ref: menuRef,
        },
        [
          h(
            "button",
            {
              onClick: (e: MouseEvent) => {
                e.stopPropagation();
                showMenu.value = !showMenu.value;
              },
              class: ["vp-button-action", showMenu.value ? "active" : ""],
            },
            [
              h((LucideIcons as any)["FileOutput"], { size: 14 }),
              copiedText.value || "文档操作",
              h((LucideIcons as any)["ChevronDown"], {
                size: 12,
                class: ["chevron", showMenu.value ? "open" : ""],
              }),
            ],
          ),
          showMenu.value &&
            h("div", { class: "doc-action-menu" }, [
              h("div", { class: "menu-item", onClick: () => handleCopy("text") }, [
                h((LucideIcons as any)["FileText"], { size: 14 }),
                "复制纯文本",
              ]),
              h("div", { class: "menu-item", onClick: () => handleCopy("md") }, [
                h((LucideIcons as any)["FileCode"], { size: 14 }),
                "复制 Markdown",
              ]),
              h("div", { class: "menu-divider" }),
              h("div", { class: "menu-item", onClick: handleDownload }, [
                h((LucideIcons as any)["Download"], { size: 14 }),
                "下载 Markdown",
              ]),
            ]),
        ],
      );
  },
});

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // 将操作按钮插入到文档顶部
      "doc-before": () => h(DocAction),
    });
  },
  enhanceApp({ app, router, siteData }) {
    app.component("LIcon", LucideIcon);
  },
} satisfies Theme;
