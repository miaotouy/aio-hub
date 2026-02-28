<template>
  <div class="markdown-html-block" v-html="processedContent"></div>
</template>

<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue';
import DOMPurify from 'dompurify';
import { processMessageAssetsSync } from '@/tools/llm-chat/utils/agentAssetUtils';
import type { ChatAgent } from '@/tools/llm-chat/types';

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

// 注入当前 Agent（由 MessageContent 提供，用于解析 agent-asset:// URL）
const currentAgent = inject<ComputedRef<ChatAgent | undefined> | null>("currentAgent", null);

// 净化 HTML 内容以防止 XSS 攻击
// 块级 HTML 允许更多标签，但仍然严格过滤危险内容
// 性能优化：添加内容长度限制，避免处理超大 HTML 导致卡顿
const sanitizedContent = computed(() => {
  const MAX_HTML_LENGTH = 100000; // 最大 100KB HTML
  
  if (props.content.length > MAX_HTML_LENGTH) {
    console.warn(`[HtmlBlockNode] HTML content too large (${props.content.length} chars), truncating to ${MAX_HTML_LENGTH}`);
    return `<div style="color: var(--el-color-warning); padding: 12px; border: 1px solid var(--el-color-warning); border-radius: 4px;">
      ⚠️ HTML 内容过大 (${(props.content.length / 1024).toFixed(1)}KB)，已截断显示前 ${(MAX_HTML_LENGTH / 1024).toFixed(1)}KB 以保护性能。
    </div>` + DOMPurify.sanitize(props.content.slice(0, MAX_HTML_LENGTH), {
      ALLOWED_TAGS: ['div', 'p', 'span', 'b', 'i', 'u', 'em', 'strong', 'br', 'hr'],
      ALLOWED_ATTR: ['class', 'style'],
    });
  }
  
  return DOMPurify.sanitize(props.content, {
    ALLOWED_TAGS: [
      // 结构与语义
      'div', 'p', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'figure', 'figcaption',
      // 文本格式
      'span', 'b', 'i', 'u', 's', 'em', 'strong', 'code', 'pre', 'br', 'hr',
      'mark', 'small', 'del', 'ins', 'sub', 'sup', 'abbr', 'kbd', 'q', 'cite', 'time',
      // 链接与媒体
      'a', 'img', 'audio', 'video', 'source', 'iframe',
      // 列表
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // 表格
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
      // 表单
      'form', 'fieldset', 'legend', 'label', 'input', 'button', 'select', 'option', 'textarea',
      // 交互式
      'details', 'summary',
      // 仪表与进度
      'progress', 'meter',
      // 用于测试的自定义 XML
      'user', 'name', 'age', 'email', 'config', 'setting'
    ],
    ALLOWED_ATTR: [
      // 通用
      'class', 'id', 'style', 'title', 'lang', 'dir',
      // Links
      'href', 'target', 'rel', 'download',
      // Media
      'src', 'alt', 'width', 'height', 'poster', 'preload', 'controls', 'autoplay', 'loop', 'muted',
      // iframe - 谨慎使用
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
      // 其他
      'datetime', 'cite', 'onclick', 'loading', 'decoding', 'aria-label', 'aria-pressed'
    ],
    ALLOW_DATA_ATTR: true, // Allow all data-* attributes
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'applet', 'link', 'meta', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onmouseover', 'onmouseout', 'onfocus', 'onblur'],
  });
});

// 处理 agent-asset:// URL 后的最终内容
const processedContent = computed(() => {
  const sanitized = sanitizedContent.value;
  
  // 如果内容中包含 agent-asset:// URL，且有 Agent 上下文，则进行转换
  if (sanitized.includes('agent-asset://') && currentAgent?.value) {
    return processMessageAssetsSync(sanitized, currentAgent.value);
  }
  
  return sanitized;
});
</script>

<style scoped>
.markdown-html-block {
  display: block;
  margin: 0.5em 0;
}
</style>