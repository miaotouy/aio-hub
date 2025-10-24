<template>
  <component
    :is="tagName"
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