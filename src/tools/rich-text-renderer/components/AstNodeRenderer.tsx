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
import HardBreakNode from "./nodes/HardBreakNode.vue";
import HtmlInlineNode from "./nodes/HtmlInlineNode.vue";
import GenericHtmlNode from "./nodes/GenericHtmlNode.vue";
import ActionButtonNode from "./nodes/ActionButtonNode.vue";
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
  hard_break: HardBreakNode,
  html_inline: HtmlInlineNode,
  generic_html: GenericHtmlNode,
  action_button: ActionButtonNode,
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
};

/**
 * 不应用 fade-in 动画的节点类型
 * 这些节点需要在流式输出时立即显示，而不是等内容完成后才显示
 */
const NO_ANIMATION_NODE_TYPES = new Set([
  'llm_think',    // 思考节点需要立即显示，内容逐渐填充
  'code_block',   // 代码块需要立即显示
  'mermaid',      // Mermaid 图表需要立即显示
  'vcp_tool',     // VCP 工具请求需要立即显示
  // 'katex_block',  // KaTeX 渲染的数学公式块
  'html_block',   // 原始 HTML 块，可能包含自己的动画
  'image',        // 图片有自己的加载效果，不应被干扰
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
  },
  setup(props) {
    return (): VNode[] => {
      return props.nodes.map((node: AstNode): VNode => {
        const NodeComponent = componentMap[node.type] || FallbackNode;

        // 构建子节点 - 通过变量引用实现递归
        const children: VNode | undefined = node.children?.length
          ? h(AstNodeRenderer, {
              nodes: node.children,
              generationMeta: props.generationMeta,
              enableEnterAnimation: props.enableEnterAnimation,
            })
          : undefined;

        // 根据节点类型决定是否应用动画
        const shouldAnimate =
          props.enableEnterAnimation && !NO_ANIMATION_NODE_TYPES.has(node.type);

        // 为 KaTeX 节点添加 displayMode 属性
        const componentProps: any = {
          key: node.id,
          nodeId: node.id,
          'data-node-status': node.meta.status,
          class: shouldAnimate ? 'rich-text-node' : undefined, // 条件添加动画类名
          ...node.props,
          generationMeta: props.generationMeta,
        };

        // 根据节点类型设置 displayMode
        if (node.type === 'katex_block') {
          componentProps.displayMode = true;
        } else if (node.type === 'katex_inline') {
          componentProps.displayMode = false;
        }

        return h(
          NodeComponent,
          componentProps,
          children ? () => children : undefined
        );
      });
    };
  },
});

export default AstNodeRenderer;
