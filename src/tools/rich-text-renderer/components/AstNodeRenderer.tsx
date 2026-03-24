/**
 * AST 节点渲染器
 *
 * 职责：
 * 1. 递归遍历 AST 节点数组
 * 2. 根据节点类型动态渲染对应的组件
 * 3. 传递节点属性和子节点给渲染组件
 */

import { defineComponent, h, type PropType, type VNode } from "vue";
import type { AstNode } from "../types";

// 导入节点组件
// 内联节点
import TextNode from "./nodes/TextNode.vue";
import StrongNode from "./nodes/StrongNode.vue";
import EmNode from "./nodes/EmNode.vue";
import StrikethroughNode from "./nodes/StrikethroughNode.vue";
import QuoteNode from "./nodes/QuoteNode.vue";
import InlineCodeNode from "./nodes/InlineCodeNode.vue";
import LinkNode from "./nodes/LinkNode.vue";
import ImageNode from "./nodes/ImageNode.vue";
import VideoNode from "./nodes/VideoNode.vue";
import AudioNode from "./nodes/AudioNode.vue";
import HardBreakNode from "./nodes/HardBreakNode.vue";
import HtmlInlineNode from "./nodes/HtmlInlineNode.vue";
import GenericHtmlNode from "./nodes/GenericHtmlNode.vue";
import StyleNode from "./nodes/StyleNode.vue";
import ActionButtonNode from "./nodes/ActionButtonNode.vue";
import SvarNode from "./nodes/SvarNode.vue";
// 块级节点
import ParagraphNode from "./nodes/ParagraphNode.vue";
import HeadingNode from "./nodes/HeadingNode.vue";
import CodeBlockNode from "./nodes/CodeBlockNode.vue";
import MermaidNode from "./nodes/MermaidNode.vue";
import ListNode from "./nodes/ListNode.vue";
import ListItemNode from "./nodes/ListItemNode.vue";
import BlockquoteNode from "./nodes/BlockquoteNode.vue";
import AlertNode from "./nodes/AlertNode.vue";
import HrNode from "./nodes/HrNode.vue";
import HtmlBlockNode from "./nodes/HtmlBlockNode.vue";
import TableNode from "./nodes/TableNode.vue";
import TableRowNode from "./nodes/TableRowNode.vue";
import TableCellNode from "./nodes/TableCellNode.vue";
import LlmThinkNode from "./nodes/LlmThinkNode.vue";
import VcpToolNode from "./nodes/VcpToolNode.vue";
import VcpRoleNode from "./nodes/VcpRoleNode.vue";
import VcpDailyNoteNode from "./nodes/VcpDailyNoteNode.vue";
import KatexRenderer from "./KatexRenderer.vue";

/**
 * 组件映射表
 * 将 AST 节点类型映射到对应的 Vue 组件
 */
const componentMap: Record<string, any> = {
  // 内联节点
  text: TextNode,
  strong: StrongNode,
  em: EmNode,
  strikethrough: StrikethroughNode,
  quote: QuoteNode,
  inline_code: InlineCodeNode,
  katex_inline: KatexRenderer,
  link: LinkNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  hard_break: HardBreakNode,
  html_inline: HtmlInlineNode,
  generic_html: GenericHtmlNode,
  action_button: ActionButtonNode,
  session_variable: SvarNode,
  // 块级节点
  paragraph: ParagraphNode,
  heading: HeadingNode,
  code_block: CodeBlockNode,
  mermaid: MermaidNode,
  llm_think: LlmThinkNode,
  list: ListNode,
  list_item: ListItemNode,
  blockquote: BlockquoteNode,
  alert: AlertNode,
  hr: HrNode,
  html_block: HtmlBlockNode,
  table: TableNode,
  table_row: TableRowNode,
  table_cell: TableCellNode,
  katex_block: KatexRenderer,
  vcp_tool: VcpToolNode,
  vcp_role: VcpRoleNode,
  vcp_daily_note: VcpDailyNoteNode,
};

/**
 * 不应用 fade-in 动画的节点类型
 * 这些节点需要在流式输出时立即显示，而不是等内容完成后才显示
 */
const NO_ANIMATION_NODE_TYPES = new Set([
  "llm_think", // 思考节点需要立即显示，内容逐渐填充
  "code_block", // 代码块需要立即显示
  "mermaid", // Mermaid 图表需要立即显示
  "vcp_tool", // VCP 工具请求需要立即显示
  "vcp_role", // VCP 角色容器需要立即显示
  "vcp_daily_note", // VCP 日记容器需要立即显示
  // 'katex_block',  // KaTeX 渲染的数学公式块
  "html_block", // 原始 HTML 块，可能包含自己的动画
  "image", // 图片有自己的加载效果，不应被干扰
]);

/**
 * 块级节点类型集合
 * 这些节点可以应用 content-visibility: auto 优化渲染性能
 */
const BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "code_block",
  "mermaid",
  "llm_think",
  "list",
  "blockquote",
  "alert",
  "hr",
  "html_block",
  "table",
  "katex_block",
  "vcp_tool",
  "vcp_role",
  "vcp_daily_note",
]);

/**
 * 降级组件：当找不到对应的节点组件时使用
 */
const FallbackNode = defineComponent({
  props: {
    type: { type: String, required: true },
  },
  setup(props) {
    return () =>
      h("div", { class: "fallback-node", style: { color: "orange", padding: "4px" } }, [
        h("span", {}, `⚠️ 未知节点类型: ${props.type}`),
      ]);
  },
});

/**
 * AST 节点渲染器组件
 */
const AstNodeRenderer = defineComponent({
  name: "AstNodeRenderer",
  props: {
    nodes: {
      type: Array as PropType<AstNode[]>,
      required: true,
    },
    generationMeta: {
      type: Object as PropType<any>,
    },
    enableEnterAnimation: {
      type: Boolean,
      default: true,
    },
    parentContainerId: {
      type: String,
    },
  },
  setup(props) {
    return (): VNode[] => {
      return props.nodes.map((node: AstNode): VNode => {
        let NodeComponent = componentMap[node.type] || FallbackNode;

        // 特殊处理：如果是一个 generic_html 且标签名为 style，则使用专门的 StyleNode
        // 这样可以避免 CSS 内容被渲染成普通的 span 文本溢出到页面上
        if (node.type === "generic_html" && node.props?.tagName === "style") {
          NodeComponent = StyleNode;
        }

        // 特殊处理：拦截 HTML video 标签并转换为 VideoNode
        if (node.type === "generic_html" && node.props?.tagName === "video") {
          NodeComponent = VideoNode;
        }

        // 特殊处理：拦截 HTML audio 标签并转换为 AudioNode
        if (node.type === "generic_html" && node.props?.tagName === "audio") {
          NodeComponent = AudioNode;
        }

        // 尝试获取或生成容器 ID，用于样式隔离
        const containerId =
          (node.props as any)?.id || (node.type === "generic_html" ? `html-node-${node.id.slice(0, 8)}` : undefined);

        // 构建子节点 - 通过变量引用实现递归
        const children: VNode | undefined =
          node.children?.length && NodeComponent !== StyleNode
            ? h(AstNodeRenderer, {
                nodes: node.children,
                generationMeta: props.generationMeta,
                enableEnterAnimation: props.enableEnterAnimation,
                parentContainerId: containerId || props.parentContainerId,
              })
            : undefined;

        // 根据节点类型决定是否应用动画
        const shouldAnimate = props.enableEnterAnimation && !NO_ANIMATION_NODE_TYPES.has(node.type);

        // 识别块级节点以应用性能优化
        const isBlock = BLOCK_NODE_TYPES.has(node.type);

        // 为 KaTeX 节点添加 displayMode 属性
        const componentProps: any = {
          key: node.id,
          nodeId: node.id,
          id: containerId,
          "data-node-status": node.meta.status,
          class: [shouldAnimate ? "rich-text-node" : undefined, isBlock ? "rich-text-block" : undefined]
            .filter(Boolean)
            .join(" "),
          ...(node.type === "generic_html" && (node.props?.tagName === "video" || node.props?.tagName === "audio")
            ? (() => {
                const attrs = { ...node.props.attributes };
                // 确保 src 存在，优先使用 attributes.src
                let src = attrs.src || (node.props as any).src || "";

                // 如果父节点没有 src，尝试从子节点 <source> 提取
                if (!src && node.children) {
                  const sourceNode = node.children.find(
                    (c) => c.type === "generic_html" && (c.props as any)?.tagName === "source",
                  );
                  if (sourceNode && (sourceNode.props as any)?.attributes?.src) {
                    src = (sourceNode.props as any).attributes.src;
                  }
                }

                return {
                  ...attrs,
                  src,
                };
              })()
            : node.props),
          generationMeta: props.generationMeta,
          // 如果是 StyleNode，我们需要传递原始子节点以提取文本
          sourceNodes: NodeComponent === StyleNode ? node.children : undefined,
          // 传递父级容器 ID 给子节点，方便 StyleNode 进行样式隔离
          parentContainerId: props.nodes.some((n) => n.type === "generic_html" && (n.props as any)?.tagName === "style")
            ? containerId
            : props.parentContainerId,
        };

        // 根据节点类型设置 displayMode
        if (node.type === "katex_block") {
          componentProps.displayMode = true;
        } else if (node.type === "katex_inline") {
          componentProps.displayMode = false;
        }

        return h(NodeComponent, componentProps, children ? () => children : undefined);
      });
    };
  },
});

export default AstNodeRenderer;
