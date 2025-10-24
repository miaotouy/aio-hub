<template>
  <span class="markdown-html-inline" v-html="sanitizedContent"></span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

// 净化 HTML 内容以防止 XSS 攻击
const sanitizedContent = computed(() => {
  return DOMPurify.sanitize(props.content, {
    ALLOWED_TAGS: [
      'span', 'b', 'i', 'u', 's', 'em', 'strong', 'code', 'a', 'br', 'button',
      'mark', 'small', 'del', 'ins', 'sub', 'sup', 'abbr', 'kbd', 'q', 'cite', 'time',
      'img' // img is technically an inline-block, but often used inline
    ],
    ALLOWED_ATTR: [
      'class', 'style', 'title', 'lang',
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'datetime', 'cite', 'onclick', 'aria-label'
    ],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onmouseover'],
  });
});
</script>

<style scoped>
.markdown-html-inline {
  display: inline;
}
</style>