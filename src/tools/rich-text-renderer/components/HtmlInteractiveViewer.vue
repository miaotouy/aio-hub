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
        <!-- 错误提示按钮 -->
        <div v-if="iframeErrors.length > 0" class="error-toolbar-item">
          <el-popover placement="bottom-end" :width="400" trigger="click" popper-class="iframe-error-popper">
            <template #reference>
              <button class="tool-btn error-btn">
                <AlertCircle :size="12" />
                <span class="error-count">{{ iframeErrors.length }}</span>
              </button>
            </template>

            <div class="error-details-container">
              <div class="error-details-header">
                <span class="error-title">渲染错误 ({{ iframeErrors.length }})</span>
                <div class="error-header-actions">
                  <el-button size="small" link @click="copyAllErrors">
                    <template #icon><Copy :size="14" /></template>
                    复制全部
                  </el-button>
                  <el-button size="small" link @click="clearErrors"> 清空 </el-button>
                </div>
              </div>
              <div class="error-list">
                <div v-for="(err, index) in iframeErrors" :key="index" class="error-item">
                  <div class="error-item-main">
                    <span class="error-msg">{{ err.message }}</span>
                    <el-button size="small" link @click="copyError(err)">
                      <Copy :size="12" />
                    </el-button>
                  </div>
                  <div v-if="err.stack" class="error-stack">{{ err.stack }}</div>
                  <div class="error-time">{{ err.time }}</div>
                </div>
              </div>
            </div>
          </el-popover>
        </div>

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
      :style="
        autoHeight
          ? {
              height: contentHeight + 'px',
              maxHeight: typeof maxHeight === 'number' ? maxHeight + 'px' : maxHeight,
              flex: 'none',
              overflow: contentHeight > (parseInt(String(maxHeight)) || Infinity) ? 'auto' : 'hidden',
            }
          : {}
      "
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

      <!-- 错误提示浮窗 -->
      <div v-if="iframeErrors.length > 0" class="error-floating-indicator">
        <el-popover placement="top-end" :width="400" trigger="click" popper-class="iframe-error-popper">
          <template #reference>
            <div class="error-trigger">
              <div class="error-capsule">
                <AlertCircle :size="14" />
                <span class="error-count">{{ iframeErrors.length }}</span>
              </div>
            </div>
          </template>

          <div class="error-details-container">
            <div class="error-details-header">
              <span class="error-title">渲染错误 ({{ iframeErrors.length }})</span>
              <div class="error-header-actions">
                <el-button size="small" link @click="copyAllErrors">
                  <template #icon><Copy :size="14" /></template>
                  复制全部
                </el-button>
                <el-button size="small" link @click="clearErrors"> 清空 </el-button>
              </div>
            </div>
            <div class="error-list">
              <div v-for="(err, index) in iframeErrors" :key="index" class="error-item">
                <div class="error-item-main">
                  <span class="error-msg">{{ err.message }}</span>
                  <el-button size="small" link @click="copyError(err)">
                    <Copy :size="12" />
                  </el-button>
                </div>
                <div v-if="err.stack" class="error-stack">{{ err.stack }}</div>
                <div class="error-time">{{ err.time }}</div>
              </div>
            </div>
          </div>
        </el-popover>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, inject } from "vue";
import { RotateCw, ExternalLink, Loader2, AlertCircle, Copy } from "lucide-vue-next";
import { useThrottleFn } from "@vueuse/core";
import { localizeCdnLinks } from "../utils/cdnLocalizer";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
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
  },
);

const isToolbarVisible = computed(() => props.showToolbar && !props.seamless);
const isBorderVisible = computed(() => props.bordered && !props.seamless);

const loading = ref(true);
const contentHeight = ref(40);
const iframeRef = ref<HTMLIFrameElement | null>(null);
const iframeKey = ref(0);
const renderContent = ref("");

interface IframeError {
  message: string;
  stack?: string;
  time: string;
}
const iframeErrors = ref<IframeError[]>([]);

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
    // 允许外部脚本时，放开限制
    return "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; media-src * 'self' asset: agent-asset: http://asset.localhost https://asset.localhost blob: data:; img-src * 'self' asset: agent-asset: http://asset.localhost https://asset.localhost data: blob:; frame-src *; script-src * 'unsafe-inline' 'unsafe-eval' blob: data:;";
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
      const error = event.error;
      const stack = error && error.stack ? error.stack : [event.message, 'at', event.filename || 'unknown', ':', event.lineno, ':', event.colno].join(' ');
      
      window.parent.postMessage({
        type: 'iframe-log',
        level: 'error',
        args: [event.message],
        stack: stack
      }, '*');
    });

    window.addEventListener('unhandledrejection', function(event) {
      const reason = event.reason;
      let message = 'Unhandled Promise Rejection';
      let stack = '';
      
      if (reason instanceof Error) {
        message = reason.message;
        stack = reason.stack;
      } else {
        message = String(reason);
      }

      window.parent.postMessage({
        type: 'iframe-log',
        level: 'error',
        args: [message],
        stack: stack || 'No stack trace available'
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

  const processedLogCaptureScript = logCaptureScript.replace("__AUTO_HEIGHT__", String(props.autoHeight));

  if (enableCdnLocalizer?.value !== false) {
    const { html: localizedContent } = localizeCdnLinks(content);
    content = localizedContent;
  }

  const trimmed = content.trim().toLowerCase();
  const isFullHtml = trimmed.includes("<html") || trimmed.includes("<!doctype");

  // CSP meta 标签（直接插入到 head 顶部，确保在文档解析初期生效）
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${cspContent.value.replace(/"/g, "&quot;")}">`;

  if (isFullHtml) {
    const autoHeightStyle = props.autoHeight
      ? "<style>html,body{height:auto!important;overflow:hidden!important;margin:0!important;padding:0!important;} body > * { margin-top: 0 !important; }</style>"
      : "";
    const injection = cspMeta + processedLogCaptureScript + autoHeightStyle;
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
          ${cspMeta}
          ${processedLogCaptureScript}
          <style>
            body {
              margin: 0;
              padding: ${props.autoHeight ? "0" : "16px"};
              height: ${props.autoHeight ? "auto" : "100%"};
              overflow: ${props.autoHeight ? "hidden" : "auto"};
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
        // 记录到内部错误列表
        const stack = event.data.stack || (extraData?.length ? extraData.join(" ") : "");
        iframeErrors.value.push({
          message,
          stack: stack,
          time: new Date().toLocaleTimeString(),
        });

        iframeErrorHandler.handle(message, {
          level: ErrorLevel.ERROR,
          showToUser: false,
          context: {
            originalArgs: extraData,
            stack: stack,
          },
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
  iframeErrors.value = [];
};

const clearErrors = () => {
  iframeErrors.value = [];
};

const copyError = (err: IframeError) => {
  const text = `Error: ${err.message}\nStack: ${err.stack || "N/A"}\nTime: ${err.time}`;
  navigator.clipboard.writeText(text);
  customMessage.success("已复制到剪贴板");
};

const copyAllErrors = () => {
  const text = iframeErrors.value
    .map((err, i) => `[${i + 1}] ${err.message}\nStack: ${err.stack || "N/A"}\nTime: ${err.time}`)
    .join("\n\n---\n\n");
  navigator.clipboard.writeText(text);
  customMessage.success("已复制全部错误");
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
  { immediate: true },
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

.error-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  background-color: rgba(var(--el-color-danger-rgb), 0.1);
  color: var(--el-color-danger);
  transition: all 0.2s ease;
}

.error-btn:hover {
  background-color: rgba(var(--el-color-danger-rgb), 0.2);
}

.error-btn .error-count {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
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

.error-floating-indicator {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 100;
}

.error-trigger {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.error-trigger:hover {
  transform: scale(1.05);
}

.error-capsule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 9999px;
  background-color: var(--el-bg-color-overlay);
  color: var(--el-text-color-regular);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(var(--ui-blur, 10px));
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.2s ease;
}

.error-trigger:hover .error-capsule {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-7);
  background-color: rgba(var(--el-color-danger-rgb), 0.1);
}

.error-capsule .error-count {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}

.error-details-container {
  display: flex;
  flex-direction: column;
  max-height: 400px;
}

.error-details-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.error-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-color-danger);
}

.error-header-actions {
  display: flex;
  gap: 8px;
}

.error-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.error-item {
  padding: 10px;
  border-radius: 8px;
  background-color: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  font-family: var(--el-font-family-mono);
  transition: all 0.2s ease;
}

.error-item:hover {
  background-color: var(--el-fill-color-light);
  border-color: var(--el-color-danger-light-7);
}

.error-item-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.error-msg {
  font-size: 13px;
  color: var(--el-color-danger);
  word-break: break-all;
  font-weight: 500;
}

.error-stack {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  opacity: 0.8;
}

.error-time {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
  text-align: right;
}
</style>
