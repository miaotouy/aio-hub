<template>
  <div class="html-interactive-viewer" :class="{ 'no-border': !isBorderVisible }">
    <!-- 工具栏 -->
    <div class="viewer-toolbar" v-if="isToolbarVisible">
      <div class="toolbar-left">
        <span class="title-text">{{ title }}</span>
        <el-tooltip v-if="!immediate" content="内容生成中..." placement="bottom">
          <div class="streaming-indicator">
            <Loader2 class="animate-spin" :size="14" />
          </div>
        </el-tooltip>
      </div>

      <div class="toolbar-right">
        <el-tooltip content="刷新预览" placement="bottom">
          <button class="tool-btn" @click="refresh">
            <RotateCw :size="14" />
          </button>
        </el-tooltip>

        <el-tooltip :content="!immediate ? '内容生成中...' : '在浏览器中打开'" placement="bottom">
          <button class="tool-btn" :disabled="!immediate" @click="openInBrowser">
            <ExternalLink :size="14" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- 内容区域 -->
    <div
      class="viewer-content"
      :style="autoHeight ? {
        height: contentHeight + 'px',
        maxHeight: typeof maxHeight === 'number' ? maxHeight + 'px' : maxHeight,
        flex: 'none',
        overflow: contentHeight > (parseInt(String(maxHeight)) || Infinity) ? 'auto' : 'hidden'
      } : {}"
    >
      <div v-if="loading" class="loading-overlay">
        <Loader2 class="animate-spin" :size="24" />
      </div>

      <iframe
        ref="iframeRef"
        :key="iframeKey"
        class="preview-iframe"
        :srcdoc="srcDoc"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        :scrolling="autoHeight ? 'no' : 'auto'"
        @load="onLoad"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, inject } from "vue";
import { RotateCw, ExternalLink, Loader2 } from "lucide-vue-next";
import { useThrottleFn } from "@vueuse/core";
import { localizeCdnLinks } from "../utils/cdnLocalizer";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../types";
import { useIframeTheme } from "@/composables/useIframeTheme";

const errorHandler = createModuleErrorHandler("HtmlInteractiveViewer");
const iframeErrorHandler = createModuleErrorHandler("HtmlInteractiveViewer:Iframe");
const logger = createModuleLogger("HtmlInteractiveViewer:Iframe");

// 注入上下文以获取全局设置
const context = inject<RichTextContext>(RICH_TEXT_CONTEXT_KEY);
const enableCdnLocalizer = context?.enableCdnLocalizer;
const contextAllowExternalScripts = context?.allowExternalScripts;

const emit = defineEmits<{
  (e: "content-hover", value: boolean): void;
}>();

const props = withDefaults(
  defineProps<{
    content: string;
    showToolbar?: boolean;
    bordered?: boolean;
    seamless?: boolean;
    /**
     * 是否立即渲染，跳过防抖和稳定性检查。
     */
    immediate?: boolean;
    /**
     * 是否自适应高度。
     */
    autoHeight?: boolean;
    /**
     * 是否允许加载外部资源。
     */
    allowExternalScripts?: boolean;
    /**
     * 最大高度限制。
     */
    maxHeight?: number | string;
  }>(),
  {
    showToolbar: true,
    bordered: true,
    seamless: false,
    immediate: false,
    autoHeight: false,
    allowExternalScripts: false,
  }
);

const isToolbarVisible = computed(() => props.showToolbar && !props.seamless);
const isBorderVisible = computed(() => props.bordered && !props.seamless);

const loading = ref(true);
const contentHeight = ref(40);
const iframeRef = ref<HTMLIFrameElement | null>(null);
const iframeKey = ref(0);
const renderContent = ref("");

// 检查 HTML 内容是否足够稳定以进行渲染
const isContentStable = (html: string): boolean => {
  if (!html) return false;
  const trimmed = html.trim();
  if (trimmed.length < 5) return false;
  const scriptStartCount = (trimmed.match(/<script/gi) || []).length;
  const scriptEndCount = (trimmed.match(/<\/script>/gi) || []).length;
  if (scriptStartCount > scriptEndCount) return false;
  return true;
};

const throttledUpdateContent = useThrottleFn((newContent: string) => {
  if (isContentStable(newContent)) {
    renderContent.value = newContent;
  } else if (!renderContent.value && newContent.length > 100) {
    renderContent.value = newContent;
  }
}, 1000);

const { themedContent } = useIframeTheme(() => renderContent.value);

const cspContent = computed(() => {
  const allowExternal = props.allowExternalScripts ?? contextAllowExternalScripts?.value ?? false;
  if (allowExternal) {
    return "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; media-src * 'self' asset: agent-asset: http://asset.localhost https://asset.localhost blob: data:; img-src * 'self' asset: agent-asset: http://asset.localhost https://asset.localhost data: blob:; frame-src *;";
  } else {
    return "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: asset: agent-asset: http://asset.localhost https://asset.localhost; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: asset:; style-src 'self' 'unsafe-inline' asset:; img-src 'self' data: blob: asset: agent-asset: http://asset.localhost https://asset.localhost; media-src 'self' data: blob: asset: agent-asset: http://asset.localhost https://asset.localhost; connect-src 'self' asset: agent-asset: http://asset.localhost https://asset.localhost; frame-src 'self';";
  }
});

const title = computed(() => {
  const match = props.content.match(/<title[^>]*>(.*?)<\/title>/i);
  return match && match[1] ? match[1].trim() : "HTML Preview";
});

// 仅保留日志捕获和交互感知脚本
const logCaptureScript = `
<script>
  (function() {
    // 日志捕获
    function proxyConsole(method) {
      const original = console[method];
      console[method] = function(...args) {
        original.apply(console, args);
        try {
          const safeArgs = args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.parse(JSON.stringify(arg)) : arg;
            } catch (e) {
              return String(arg);
            }
          });
          window.parent.postMessage({
            type: 'iframe-log',
            level: method,
            args: safeArgs
          }, '*');
        } catch (e) {
        }
      };
    }
    ['log', 'info', 'warn', 'error', 'debug'].forEach(proxyConsole);
    
    window.addEventListener('error', function(event) {
      window.parent.postMessage({
        type: 'iframe-log',
        level: 'error',
        args: [event.message, 'at', event.filename || 'unknown', ':', event.lineno, ':', event.colno]
      }, '*');
    });

    // 交互感知
    let lastMoveTime = 0;
    const MOVE_THROTTLE = 200;
    document.addEventListener('mousemove', () => {
      const now = Date.now();
      if (now - lastMoveTime > MOVE_THROTTLE) {
        lastMoveTime = now;
        window.parent.postMessage({ type: 'iframe-mousemove' }, '*');
      }
    });
    document.addEventListener('mouseenter', () => {
      window.parent.postMessage({ type: 'iframe-mouseenter' }, '*');
    });
    document.addEventListener('mouseleave', () => {
      window.parent.postMessage({ type: 'iframe-mouseleave' }, '*');
    });
    
    // 注入 CSP
    const meta = document.createElement('meta');
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = __CSP_CONTENT__;
    document.head.appendChild(meta);

    // 高度自适应监测
    if (__AUTO_HEIGHT__) {
      let lastHeight = 0;
      const notifyHeight = () => {
        const height = document.documentElement.scrollHeight;
        if (Math.abs(height - lastHeight) > 1) { // 忽略 1px 以内的微小波动
          lastHeight = height;
          window.parent.postMessage({
            type: 'iframe-height',
            height: height
          }, '*');
        }
      };

      // 1. 监听尺寸变化 (涵盖 3D 容器、图片加载等)
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          requestAnimationFrame(notifyHeight);
        });
        ro.observe(document.documentElement);
      }

      // 2. 监听 DOM 变化 (涵盖动态增删节点)
      const mo = new MutationObserver(() => {
        requestAnimationFrame(notifyHeight);
      });
      mo.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true
      });

      // 3. 初始加载与资源加载
      window.addEventListener('load', notifyHeight);
      setTimeout(notifyHeight, 100); // 保险起见，100ms 后再触发一次
    }

  })();
<\/script>
`;

const srcDoc = computed(() => {
  let content = themedContent.value;
  if (!content) return "";

  const processedLogCaptureScript = logCaptureScript
    .replace("__CSP_CONTENT__", JSON.stringify(cspContent.value))
    .replace("__AUTO_HEIGHT__", String(props.autoHeight));

  if (enableCdnLocalizer?.value !== false) {
    const { html: localizedContent } = localizeCdnLinks(content);
    content = localizedContent;
  }

  const trimmed = content.trim().toLowerCase();
  const isFullHtml = trimmed.includes("<html") || trimmed.includes("<!doctype");

  if (isFullHtml) {
    const autoHeightStyle = props.autoHeight
      ? "<style>html,body{height:auto!important;overflow:hidden!important;margin:0!important;padding:0!important;} body > * { margin-top: 0 !important; }</style>"
      : "";
    const injection = processedLogCaptureScript + autoHeightStyle;
    if (/<\/head>/i.test(content)) {
      return content.replace(/<\/head>/i, `${injection}</head>`);
    } else if (/<head[^>]*>/i.test(content)) {
      return content.replace(/<head[^>]*>/i, (match) => `${match}${injection}`);
    } else {
      return content + injection;
    }
  } else {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="Content-Security-Policy" content="${cspContent.value}">
          ${processedLogCaptureScript}
          <style>
            body {
              margin: 0;
              padding: ${props.autoHeight ? '0' : '16px'};
              height: ${props.autoHeight ? 'auto' : '100%'};
              overflow: ${props.autoHeight ? 'hidden' : 'auto'};
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: var(--text-color, #333);
              background-color: transparent;
            }
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.4); border-radius: 3px; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(128, 128, 128, 0.6); }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `;
  }
});

const handleIframeMessage = (event: MessageEvent) => {
  if (!event.data || !iframeRef.value) return;
  if (event.source !== iframeRef.value.contentWindow) return;

  if (event.data.type === "iframe-mousemove" || event.data.type === "iframe-mouseenter") {
    emit("content-hover", true);
    return;
  }
  if (event.data.type === "iframe-mouseleave") {
    emit("content-hover", false);
    return;
  }

  if (event.data.type === "iframe-height" && props.autoHeight) {
    const newHeight = event.data.height;
    if (newHeight > 0) {
      contentHeight.value = newHeight;
    }
    return;
  }

  if (event.data.type === "iframe-log") {
    const { level, args } = event.data;
    let message = args?.[0] ? String(args[0]) : "[Empty Log]";
    let extraData = args?.slice(1);

    switch (level) {
      case "log":
      case "info":
        logger.info(message, extraData);
        break;
      case "warn":
        logger.warn(message, extraData);
        break;
      case "error":
        iframeErrorHandler.handle(message, {
          level: ErrorLevel.ERROR,
          showToUser: false,
          context: { originalArgs: extraData },
        });
        break;
      case "debug":
        logger.debug(message, extraData);
        break;
    }
  }
};

onMounted(() => {
  window.addEventListener("message", handleIframeMessage);
});

onUnmounted(() => {
  window.removeEventListener("message", handleIframeMessage);
});

const onLoad = () => {
  loading.value = false;
};

const refresh = () => {
  loading.value = true;
  iframeKey.value++;
};

const openInBrowser = () => {
  try {
    const blob = new Blob([srcDoc.value], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) {
    errorHandler.error(error, "在浏览器打开失败");
  }
};

watch(
  [() => props.content, () => props.immediate],
  ([newContent, isImmediate]) => {
    if (!renderContent.value) loading.value = true;
    if (isImmediate) {
      renderContent.value = newContent;
    } else {
      throttledUpdateContent(newContent);
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.html-interactive-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: var(--bg-color);
  overflow: hidden;
  box-sizing: border-box;
}

.html-interactive-viewer.no-border {
  border: none;
  border-radius: 0;
}

.viewer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--card-bg);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.streaming-indicator {
  display: flex;
  align-items: center;
  color: var(--el-color-primary);
  opacity: 0.8;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.tool-btn:hover:not(:disabled) {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.viewer-content {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background-color: transparent;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color);
  z-index: 10;
  color: var(--el-color-primary);
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
