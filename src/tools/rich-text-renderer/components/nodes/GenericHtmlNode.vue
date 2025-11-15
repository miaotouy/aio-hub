<template>
  <component
    :is="safeTagName"
    v-bind="filteredAttributes"
    :data-node-id="nodeId"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
}>();

// 验证标签名是否合法
// HTML 标签名必须以字母开头，只能包含字母、数字、连字符和下划线
// 参考：https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const isValidTagName = (tag: string): boolean => {
  // 基本规则：以字母开头，后跟字母、数字、连字符或下划线
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tag);
};

// 安全的标签名：非法标签名退化为 span
const safeTagName = computed(() => {
  if (isValidTagName(props.tagName)) {
    return props.tagName;
  }
  // 非法标签名，使用 span 包裹，并在控制台警告
  console.warn(`[GenericHtmlNode] Invalid tag name detected: "${props.tagName}", fallback to <span>`);
  return 'span';
});

// 过滤和处理属性
// 移除可能有安全风险的属性，并处理特殊属性
const filteredAttributes = computed(() => {
  const attrs: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(props.attributes)) {
    const lowerKey = key.toLowerCase();
    
    // 跳过危险属性
    if (lowerKey.startsWith('on')) {
      // 跳过事件处理器（如 onclick, onload 等）
      continue;
    }
    
    // 处理特殊属性
    if (lowerKey === 'class') {
      attrs.class = value;
    } else if (lowerKey === 'style') {
      attrs.style = value;
    } else {
      // 其他属性直接传递
      attrs[key] = value;
    }
  }
  
  return attrs;
});
</script>

<style scoped>
/* GenericHtmlNode 不需要特殊样式，完全依赖传入的属性 */
</style>