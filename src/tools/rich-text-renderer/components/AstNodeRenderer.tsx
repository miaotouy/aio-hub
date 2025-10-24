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
import InlineCodeNode from "./nodes/InlineCodeNode.vue";
import LinkNode from "./nodes/LinkNode.vue";
import HtmlInlineNode from "./nodes/HtmlInlineNode.vue";
import GenericHtmlNode from "./nodes/GenericHtmlNode.vue";
// 块级节点
import ParagraphNode from "./nodes/ParagraphNode.vue";
import HeadingNode from "./nodes/HeadingNode.vue";
import CodeBlockNode from "./nodes/CodeBlockNode.vue";
import ListNode from "./nodes/ListNode.vue";
import ListItemNode from "./nodes/ListItemNode.vue";
import BlockquoteNode from "./nodes/BlockquoteNode.vue";
import HrNode from "./nodes/HrNode.vue";
import HtmlBlockNode from "./nodes/HtmlBlockNode.vue";
import TableNode from "./nodes/TableNode.vue";
import TableRowNode from "./nodes/TableRowNode.vue";
import TableCellNode from "./nodes/TableCellNode.vue";

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
  inline_code: InlineCodeNode,
  link: LinkNode,
  html_inline: HtmlInlineNode,
  generic_html: GenericHtmlNode,
  // 块级节点
  paragraph: ParagraphNode,
  heading: HeadingNode,
  code_block: CodeBlockNode,
  list: ListNode,
  list_item: ListItemNode,
  blockquote: BlockquoteNode,
  hr: HrNode,
  html_block: HtmlBlockNode,
  table: TableNode,
  table_row: TableRowNode,
  table_cell: TableCellNode,
};

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
  },
  setup(props) {
    return (): VNode[] => {
      return props.nodes.map((node: AstNode): VNode => {
        const NodeComponent = componentMap[node.type] || FallbackNode;

        // 构建子节点 - 通过变量引用实现递归
        const children: VNode | undefined = node.children?.length
          ? h(AstNodeRenderer, { nodes: node.children })
          : undefined;

        return h(
          NodeComponent,
          {
            key: node.id,
            nodeId: node.id,
            'data-node-status': node.meta.status,
            ...node.props,
          },
          children ? () => children : undefined
        );
      });
    };
  },
});

export default AstNodeRenderer;
