/**
 * 移动端 AST 树递归渲染分发组件
 *
 * 接收 AST 节点数组，根据 node.type 将其分发给移动端对应的各轻量节点组件。
 * 针对安全与平台边界：HTML 块与内联节点一律走字面文本降级，不执行脚本也不直接产生 DOM。
 */

import {
  defineComponent,
  h,
  inject,
  type PropType,
  type VNode,
} from "vue";
import type { AstNode } from "../types";
import { MOBILE_RICH_TEXT_CONTEXT_KEY, type MobileRichTextContext } from "../types";

// 移动端专用业务叶子组件
import CodeBlock from "./CodeBlock.vue";
import KatexRenderer from "./KatexRenderer.vue";
import ThinkBlock from "./ThinkBlock.vue";
import AlertBlock from "./AlertBlock.vue";
import VcpBlock from "./VcpBlock.vue";
import MermaidDiagram from "./MermaidDiagram.vue";
import RichTextMediaNode from "./RichTextMediaNode.vue";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isSafeLinkUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("#")) return true;
  try {
    const parsed = new URL(url, "https://aiohub.invalid");
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export const AstNodeRenderer = defineComponent({
  name: "AstNodeRenderer",
  props: {
    nodes: {
      type: Array as PropType<AstNode[]>,
      required: true,
    },
  },
  setup(props) {
    const context = inject<MobileRichTextContext>(MOBILE_RICH_TEXT_CONTEXT_KEY, {});

    function renderChildren(node: AstNode): VNode[] {
      if (!node.children || node.children.length === 0) return [];
      return [h(AstNodeRenderer, { nodes: node.children })];
    }

    function renderNode(node: AstNode): VNode | null {
      const childrenVNodes = renderChildren(node);

      switch (node.type) {
        case "text": {
          return h("span", { key: node.id, class: "md-text" }, node.props?.content || "");
        }

        case "strong": {
          return h("strong", { key: node.id }, childrenVNodes);
        }

        case "em": {
          return h("em", { key: node.id }, childrenVNodes);
        }

        case "strikethrough": {
          return h("del", { key: node.id }, childrenVNodes);
        }

        case "inline_code": {
          return h(
            "code",
            { key: node.id, class: "md-inline-code" },
            node.props?.content || ""
          );
        }

        case "quote": {
          return h("span", { key: node.id, class: "md-quote" }, [
            "“",
            ...childrenVNodes,
            "”",
          ]);
        }

        case "hard_break": {
          return h("br", { key: node.id });
        }

        case "hr": {
          return h("hr", { key: node.id });
        }

        case "paragraph": {
          return h("p", { key: node.id }, childrenVNodes);
        }

        case "heading": {
          const level = Math.min(Math.max(node.props?.level || 1, 1), 6);
          return h(`h${level}`, { key: node.id }, childrenVNodes);
        }

        case "blockquote": {
          return h("blockquote", { key: node.id, class: "md-blockquote" }, childrenVNodes);
        }

        case "alert": {
          const variant = (node.props?.alertType || "note").toLowerCase() as "note" | "tip" | "important" | "warning" | "caution";
          return h(
            AlertBlock,
            { key: node.id, variant },
            () => childrenVNodes
          );
        }

        case "list": {
          const tag = node.props?.ordered ? "ol" : "ul";
          const start = node.props?.start ? { start: node.props.start } : {};
          return h(tag, { key: node.id, ...start }, childrenVNodes);
        }

        case "list_item": {
          return h("li", { key: node.id }, childrenVNodes);
        }

        case "table": {
          return h(
            "div",
            { key: node.id, class: "md-table-wrapper" },
            h("table", {}, h("tbody", {}, childrenVNodes))
          );
        }

        case "table_row": {
          return h("tr", { key: node.id }, childrenVNodes);
        }

        case "table_cell": {
          const tag = node.props?.isHeader ? "th" : "td";
          const style = node.props?.align ? { textAlign: node.props.align } : {};
          return h(tag, { key: node.id, style }, childrenVNodes);
        }

        case "link": {
          const href = node.props?.href || "";
          const linkText = (node.props as any)?.text || href;
          if (isSafeLinkUrl(href)) {
            return h(
              "a",
              {
                key: node.id,
                class: "md-link",
                href,
                target: "_blank",
                rel: "noopener noreferrer",
                referrerpolicy: "no-referrer",
              },
              childrenVNodes.length > 0 ? childrenVNodes : [linkText]
            );
          }
          // 不安全链接降级为不可点击文本
          return h(
            "span",
            { key: node.id, class: "md-link-disabled", title: "安全限制：此链接不可点击" },
            childrenVNodes.length > 0 ? childrenVNodes : [linkText]
          );
        }

        case "image": {
          const src = node.props?.src || "";
          const alt = node.props?.alt || "";

          // 若提供 resolveMediaItem 且命中受管资产，转为 RichTextMediaNode
          if (context.resolveMediaItem) {
            const mediaItem = context.resolveMediaItem(src);
            if (mediaItem) {
              return h(RichTextMediaNode, { key: node.id, item: mediaItem });
            }
          }

          // 常规图片渲染，若提供 resolveAsset 则解析
          const finalSrc = context.resolveAsset ? context.resolveAsset(src) : src;
          return h("img", {
            key: node.id,
            class: "md-image",
            src: finalSrc,
            alt,
            loading: "lazy",
            referrerpolicy: "no-referrer",
          });
        }

        case "code_block": {
          const lang = (node.props?.language || "").toLowerCase();
          const code = node.props?.content || "";

          // mermaid 代码块分流
          if (lang === "mermaid") {
            return h(MermaidDiagram, {
              key: node.id,
              content: code,
              isStreaming: context.isStreaming ?? false,
              isComplete: !context.isStreaming,
            });
          }

          return h(CodeBlock, {
            key: node.id,
            content: code,
            language: lang,
          });
        }

        case "mermaid": {
          return h(MermaidDiagram, {
            key: node.id,
            content: node.props?.content || "",
            isStreaming: context.isStreaming ?? false,
            isComplete: !context.isStreaming,
          });
        }

        case "katex_inline": {
          return h(KatexRenderer, {
            key: node.id,
            content: node.props?.content || "",
            displayMode: false,
          });
        }

        case "katex_block": {
          return h(KatexRenderer, {
            key: node.id,
            content: node.props?.content || "",
            displayMode: true,
          });
        }

        case "llm_think": {
          if (context.disableThinkParsing) {
            return h("div", { key: node.id, class: "md-think-fallback" }, childrenVNodes);
          }
          const tagName = node.props?.rawTagName || "think";
          const rawContent = (node.props as any)?.rawContent || (node.props as any)?.content || "";
          const isClosed = (node.props as any)?.isClosed !== false && (node.props as any)?.closed !== false && node.meta?.status !== "pending";
          const isThinking = !isClosed || (context.isStreaming ?? false);

          return h(
            ThinkBlock,
            {
              key: node.id,
              tagName,
              rawContent,
              isThinking,
            },
            () => childrenVNodes
          );
        }

        case "vcp_role": {
          if (context.disableVcpParsing) {
            return h("div", { key: node.id }, childrenVNodes);
          }
          const role = node.props?.role;
          const variant = node.props?.variant === "tool_summary" ? "tool_summary" : "role";
          const summaryContent = node.props?.summaryItems?.map((s: any) => s.label || s).join("\n") || (node.props as any)?.content || "";
          return h(
            VcpBlock,
            {
              key: node.id,
              variant,
              content: variant === "tool_summary" && summaryContent ? summaryContent : ((node.props as any)?.content || ""),
              closed: (node.props as any)?.closed !== false && (node.props as any)?.isClosed !== false,
              isStreaming: context.isStreaming ?? false,
              role,
            },
            () => childrenVNodes
          );
        }

        case "vcp_tool": {
          if (context.disableVcpParsing) {
            return h("div", { key: node.id }, childrenVNodes);
          }
          const isResult = node.props?.isResult === true || (node.props as any)?.toolType === "result" || (node.props as any)?.toolType === "tool_result";
          const variant = isResult ? "tool_result" : "tool_request";
          const closed = (node.props as any)?.closed !== false && (node.props as any)?.isClosed !== false;

          // 核心边界：如果已经不是流式状态，但 VCP 工具请求未闭合，按字面安全展示
          if (!context.isStreaming && !closed) {
            return h("p", { key: node.id }, (node.props as any)?.raw || (node.props as any)?.content || "");
          }

          return h(VcpBlock, {
            key: node.id,
            variant,
            content: (node.props as any)?.raw || (node.props as any)?.content || "",
            closed,
            isStreaming: context.isStreaming ?? false,
          });
        }

        case "vcp_daily_note": {
          if (context.disableVcpParsing) {
            return h("div", { key: node.id }, childrenVNodes);
          }
          return h(VcpBlock, {
            key: node.id,
            variant: "daily_note",
            content: (node.props as any)?.content || "",
            closed: (node.props as any)?.closed !== false && (node.props as any)?.isClosed !== false,
            isStreaming: context.isStreaming ?? false,
          });
        }

        // HTML 标签一律作为字面安全输出
        case "html_block":
        case "html_inline":
        case "generic_html": {
          const propsAny = node.props as any;
          let rawHtml = propsAny?.raw || propsAny?.content || "";
          if (!rawHtml && propsAny?.tagName) {
            const attrs = propsAny?.attributes
              ? Object.entries(propsAny.attributes)
                  .map(([k, v]) => `${k}="${v}"`)
                  .join(" ")
              : "";
            rawHtml = `<${propsAny.tagName}${attrs ? " " + attrs : ""}>`;
          }
          return h("pre", { key: node.id, class: "md-html" }, rawHtml);
        }

        default: {
          // 未知或通用容器节点
          if (childrenVNodes.length > 0) {
            return h("div", { key: node.id, "data-node-type": node.type }, childrenVNodes);
          }
          return null;
        }
      }
    }

    return () => {
      return props.nodes.map(renderNode);
    };
  },
});
