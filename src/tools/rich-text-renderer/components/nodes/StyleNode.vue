<template>
  <!-- 
    样式节点。
    为了实现样式隔离，我们渲染一个隐藏的 span 作为锚点。
    注意：这种隔离是“软隔离”，主要防止样式轻易逃逸到宿主 UI。
  -->
  <span :id="scopeId" style="display: none" aria-hidden="true"></span>
  <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AstNode } from "../../types";
import { scopeCss, generateSimpleId } from "../../utils/cssUtils";

const props = defineProps<{
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
  // 渲染器传入的子节点数据，我们需要从中提取纯文本
  sourceNodes?: AstNode[];
  // 父级容器 ID（由 AstNodeRenderer 传入）
  parentContainerId?: string;
}>();

/**
 * 递归提取所有子节点中的纯文本内容
 */
function extractText(nodes?: AstNode[]): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") return node.props.content || "";
      return extractText(node.children);
    })
    .join("");
}

// 生成一个唯一的作用域 ID
const scopeId = generateSimpleId("style-scope");
/**
 * 应用样式隔离逻辑
 */
const scopedCss = computed(() => {
  const rawCss = extractText(props.sourceNodes);
  if (!rawCss) return "";

  // 优先使用父容器 ID 进行隔离，如果没有则退回到锚点兄弟隔离
  const effectiveScopeId = props.parentContainerId || scopeId;

  // 使用工具类进行加缀
  return scopeCss(rawCss, effectiveScopeId);
});
</script>
