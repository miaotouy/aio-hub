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
    ALLOWED_TAGS: ['span', 'b', 'i', 'u', 's', 'em', 'strong', 'code', 'a', 'br', 'button'],
    ALLOWED_ATTR: ['class', 'href', 'title', 'target', 'rel', 'style', 'onclick'],
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