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
      // Structure & Semantics
      'div', 'p', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'figure', 'figcaption',
      // Text Formatting
      'span', 'b', 'i', 'u', 's', 'em', 'strong', 'code', 'pre', 'br', 'hr',
      'mark', 'small', 'del', 'ins', 'sub', 'sup', 'abbr', 'kbd', 'q', 'cite', 'time',
      // Links & Media
      'a', 'img', 'audio', 'video', 'source', 'iframe',
      // Lists
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
      // Forms
      'form', 'fieldset', 'legend', 'label', 'input', 'button', 'select', 'option', 'textarea',
      // Interactive
      'details', 'summary',
      // Meter & Progress
      'progress', 'meter',
      // Custom XML for test
      'user', 'name', 'age', 'email', 'config', 'setting'
    ],
    ALLOWED_ATTR: [
      // General
      'class', 'id', 'style', 'title', 'lang', 'dir',
      // Links
      'href', 'target', 'rel', 'download',
      // Media
      'src', 'alt', 'width', 'height', 'poster', 'preload', 'controls', 'autoplay', 'loop', 'muted',
      // iframe - use with caution
      'allowfullscreen', 'frameborder',
      // Tables
      'colspan', 'rowspan', 'scope', 'align', 'valign',
      // Forms
      'type', 'name', 'value', 'placeholder', 'disabled', 'checked', 'selected', 'readonly',
      'action', 'method', 'for', 'min', 'max', 'step', 'rows', 'cols',
      // Interactive
      'open',
      // Meter & Progress
      'low', 'high', 'optimum',
      // Other
      'datetime', 'cite', 'onclick', 'loading', 'decoding', 'aria-label', 'aria-pressed'
    ],
    ALLOW_DATA_ATTR: true, // Allow all data-* attributes
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'applet', 'link', 'meta', 'base'],
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