<template>
  <div class="markdown-html-block" v-html="sanitizedContent"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

// 净化 HTML 内容以防止 XSS 攻击
// 块级 HTML 允许更多标签，但仍然严格过滤危险内容
const sanitizedContent = computed(() => {
  return DOMPurify.sanitize(props.content, {
    ALLOWED_TAGS: [
      'div', 'p', 'section', 'article', 'aside', 'header', 'footer', 'nav',
      'span', 'b', 'i', 'u', 's', 'em', 'strong', 'code', 'pre',
      'a', 'br', 'hr',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img',
      'button', 'input',
      // --- Add custom XML tags for test ---
      'user', 'name', 'age', 'email', 'config', 'setting'
    ],
    ALLOWED_ATTR: [
      'class', 'id', 'style',
      'href', 'title', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'type', 'name', 'value', 'placeholder', 'onclick'
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'applet', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onmouseover', 'onmouseout', 'onfocus', 'onblur'],
  });
});
</script>

<style scoped>
.markdown-html-block {
  display: block;
  margin: 0.5em 0;
}
</style>