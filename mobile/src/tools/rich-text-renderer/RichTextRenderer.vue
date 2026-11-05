<template>
  <div class="rich-text-renderer" :class="{ 'is-streaming': isStreaming }">
    <AstNodeRenderer :nodes="displayAst" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, watch } from "vue";
import type { MediaItem } from "@/components/media/types";
import { AstNodeRenderer } from "./components/AstNodeRenderer";
import { CustomParser } from "./core/CustomParser";
import { StreamProcessorV2 } from "./core/StreamProcessorV2";
import { useMarkdownAst } from "./composables/useMarkdownAst";
import type { AstNode } from "./types";
import {
  MOBILE_RICH_TEXT_CONTEXT_KEY,
  type MobileRichTextContext,
} from "./types";

defineOptions({
  name: "RichTextRenderer",
});

const props = withDefaults(
  defineProps<{
    content?: string;
    tokens?: any[]; // 兼容旧版参数
    isStreaming?: boolean;
    resolveAsset?: (content: string) => string;
    resolveMediaItem?: (source: string) => MediaItem | null;
    disableThinkParsing?: boolean;
    disableVcpParsing?: boolean;
  }>(),
  {
    content: "",
    isStreaming: false,
  }
);

// 提供给 AstNodeRenderer 内部跨层使用的上下文
provide<MobileRichTextContext>(MOBILE_RICH_TEXT_CONTEXT_KEY, {
  get resolveAsset() {
    return props.resolveAsset;
  },
  get resolveMediaItem() {
    return props.resolveMediaItem;
  },
  get isStreaming() {
    return props.isStreaming;
  },
  get disableThinkParsing() {
    return props.disableThinkParsing;
  },
  get disableVcpParsing() {
    return props.disableVcpParsing;
  },
});

const processedContent = computed(() => props.content || "");

// 流式稳定区/待定区 AST 响应式管理
const { ast: streamingAst, enqueuePatch, dispose: destroyAst } = useMarkdownAst({
  throttleEnabled: true,
  throttleMs: 32,
});

const parser = new CustomParser(new Set(["think", "guguthink"]));
const streamProcessor = new StreamProcessorV2({
  onPatch: (patches) => {
    enqueuePatch(patches);
  },
});

// 离线/静态 AST（非流式或完成态）
const staticAst = ref<AstNode[]>([]);

// 最终展示的 AST
const displayAst = computed<AstNode[]>(() => {
  // 如果显式传入 tokens（旧版递归或特殊测试），走轻量适配
  if (props.tokens && props.tokens.length > 0) {
    return props.tokens.map((token: any, idx: number): AstNode => {
      if (token.type === "link") {
        return {
          id: `token_link_${idx}`,
          type: "link",
          props: {
            href: token.href,
            title: token.title || "",
          },
          meta: { range: { start: 0, end: 0 }, status: "stable" },
          children: token.tokens ? token.tokens.map((sub: any, sIdx: number): AstNode => ({
            id: `sub_${idx}_${sIdx}`,
            type: "text",
            props: { content: sub.text || sub.content || "" },
            meta: { range: { start: 0, end: 0 }, status: "stable" },
          })) : [{
            id: `sub_${idx}_def`,
            type: "text",
            props: { content: token.text || token.href || "" },
            meta: { range: { start: 0, end: 0 }, status: "stable" },
          }],
        };
      }
      return {
        id: `token_${idx}`,
        type: token.type || "text",
        props: { ...token, content: token.text || token.content || "" },
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      } as unknown as AstNode;
    });
  }

  if (props.isStreaming && streamingAst.value.length > 0) {
    return streamingAst.value;
  }
  return staticAst.value;
});

// 80ms 流式节流调度（保持契约与平滑响应）
const STREAM_RENDER_THROTTLE_MS = 80;
let streamRenderTimer: ReturnType<typeof setTimeout> | null = null;
let pendingContent = "";

function clearStreamRenderTimer() {
  if (streamRenderTimer === null) return;
  clearTimeout(streamRenderTimer);
  streamRenderTimer = null;
}

function processStreamingChunk(text: string) {
  // 同步重置静态解析，确保首屏与流式稳定区平滑接轨
  staticAst.value = parser.parse(text);
  streamProcessor.process(text);
}

function finalizeStreaming(text: string) {
  clearStreamRenderTimer();
  streamProcessor.finalize();
  // 完成后解析一份静态完整的 AST，作为稳定展示
  staticAst.value = parser.parse(text);
}

watch(
  () => [processedContent.value, props.isStreaming] as const,
  ([content, isStreaming], oldValues) => {
    pendingContent = content;
    const wasStreaming = oldValues ? oldValues[1] : false;

    // 1. 内容清空或重置
    if (!content) {
      clearStreamRenderTimer();
      streamProcessor.reset();
      staticAst.value = [];
      return;
    }

    // 2. 从流式切换到结束态，或者非流式直接传入
    if (!isStreaming) {
      if (wasStreaming) {
        finalizeStreaming(content);
      } else {
        clearStreamRenderTimer();
        streamProcessor.reset();
        staticAst.value = parser.parse(content);
      }
      return;
    }

    // 3. 正在流式输出中
    // 首次进入流式状态，立即同步更新，保证首屏响应
    if (!wasStreaming || staticAst.value.length === 0) {
      clearStreamRenderTimer();
      processStreamingChunk(content);
      return;
    }

    // 中间包按 80ms 节流调度
    if (streamRenderTimer === null) {
      streamRenderTimer = setTimeout(() => {
        streamRenderTimer = null;
        processStreamingChunk(pendingContent);
      }, STREAM_RENDER_THROTTLE_MS);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearStreamRenderTimer();
  destroyAst();
  streamProcessor.destroy();
});
</script>

<style scoped>
.rich-text-renderer {
  font-family: inherit;
  font-size: var(--font-size-md);
  line-height: 1.6;
  color: var(--text-color);
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: normal;
}

/* 段落与文本排版 */
:deep(p) {
  margin: 0.5em 0;
}

:deep(h1),
:deep(h2),
:deep(h3),
:deep(h4),
:deep(h5),
:deep(h6) {
  margin: 1em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
}

:deep(h1) {
  font-size: var(--font-size-xl);
}
:deep(h2) {
  font-size: var(--font-size-xl);
}
:deep(h3) {
  font-size: var(--font-size-lg);
}
:deep(h4) {
  font-size: var(--font-size-md);
}
:deep(h5) {
  font-size: var(--font-size-sm);
}
:deep(h6) {
  font-size: var(--font-size-sm);
}

:deep(.md-text) {
  display: inline;
}

:deep(strong) {
  font-weight: 600;
}

:deep(em) {
  font-style: italic;
}

:deep(del) {
  text-decoration: line-through;
  opacity: 0.75;
}

/* 行内代码 */
:deep(.md-inline-code) {
  font-family: monospace;
  padding: 2px 6px;
  margin: 0 4px;
  font-size: 0.85em;
  background-color: var(--input-bg);
  border-radius: var(--app-radius-sm);
  color: var(--danger-color, #d14343);
  overflow-wrap: anywhere;
  word-break: normal;
}

/* 链接与图片 */
:deep(a) {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 500;
}

:deep(a:hover) {
  text-decoration: underline;
}

:deep(.md-link-disabled) {
  color: var(--text-color-light);
  cursor: not-allowed;
}

:deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--app-radius-md);
  margin: 8px 0;
  display: block;
}

/* 引用块 */
:deep(blockquote) {
  margin: 12px 0;
  padding: 4px 12px;
  border-left: 4px solid var(--border-color);
  background-color: var(--card-bg);
  color: var(--text-color);
  border-radius: 0 var(--app-radius-sm) var(--app-radius-sm) 0;
}

/* 列表 */
:deep(ul),
:deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

:deep(li) {
  margin-bottom: 4px;
}

:deep(li:last-child) {
  margin-bottom: 0;
}

/* 水平线 */
:deep(hr) {
  height: 1px;
  border: none;
  background-color: var(--border-color);
  margin: 16px 0;
}

/* 表格 */
:deep(.md-table-wrapper) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 12px 0;
  border: 1px solid var(--border-color);
  border-radius: var(--app-radius-md);
}

:deep(table) {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

:deep(th),
:deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  overflow-wrap: anywhere;
  word-break: normal;
}

:deep(th) {
  background-color: var(--input-bg);
  font-weight: 600;
}

:deep(tr:nth-child(even)) {
  background-color: var(--card-bg, var(--card-bg));
}

/* HTML 安全字面输出 */
:deep(.md-html) {
  margin: 8px 0;
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
  font-family: monospace;
  font-size: 0.85em;
  padding: 8px 12px;
  background-color: var(--input-bg);
  border-radius: var(--app-radius-md);
  border: 1px solid var(--border-color);
}

:deep(.md-quote) {
  font-style: italic;
  color: var(--text-color-light);
}
</style>
