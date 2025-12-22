<template>
  <div
    class="html-interactive-viewer"
    :class="{ 'no-border': !isBorderVisible, 'auto-height': autoHeight }"
  >
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
      :style="autoHeight ? { height: contentHeight + 'px', flex: 'none' } : {}"
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
import { useDebounceFn, useThrottleFn } from "@vueuse/core";
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
     * 适用于非流式加载的场景（如查看本地文件），此时内容被认为是完整且稳定的。
     */
    immediate?: boolean;
    /**
     * 是否自适应高度。
     * 如果为 true，组件高度将跟随 iframe 内容高度变化。
     */
    autoHeight?: boolean;
  }>(),
  {
    showToolbar: true,
    bordered: true,
    seamless: false,
    immediate: false,
    autoHeight: false,
  }
);

const isToolbarVisible = computed(() => props.showToolbar && !props.seamless);
const isBorderVisible = computed(() => props.bordered && !props.seamless);

const loading = ref(true);
const contentHeight = ref(300); // 默认高度
const iframeRef = ref<HTMLIFrameElement | null>(null);
// 用于强制重新挂载 iframe 的 key
const iframeKey = ref(0);
// 用于实际渲染的内容，与 props.content 解耦以实现防抖和稳定性检查
const renderContent = ref("");

// 检查 HTML 内容是否足够稳定以进行渲染
const isContentStable = (html: string): boolean => {
  if (!html) return false;
  const trimmed = html.trim();

  // 1. 长度检查：太短的内容通常是不完整的
  if (trimmed.length < 5) return false;

  // 2. 脚本完整性检查
  // 如果包含 script 标签，必须确保所有 script 标签都已闭合
  const scriptStartCount = (trimmed.match(/<script/gi) || []).length;
  const scriptEndCount = (trimmed.match(/<\/script>/gi) || []).length;

  // 如果开始标签比结束标签多，说明有未闭合的脚本
  if (scriptStartCount > scriptEndCount) {
    return false;
  }

  // 其他情况只要不为空且通过长度检查，都视为稳定
  return true;
};

// 防抖更新渲染内容 (用于非流式但不立即渲染的场景，或者作为节流的补充)
const debouncedUpdateContent = useDebounceFn((newContent: string) => {
  if (isContentStable(newContent)) {
    renderContent.value = newContent;
  } else if (!renderContent.value && newContent.length > 100) {
    renderContent.value = newContent;
  }
}, 200);

// 节流更新渲染内容 (专门用于流式传输场景)
// 降低 iframe 更新频率，避免流式输出时频繁重绘
const throttledUpdateContent = useThrottleFn((newContent: string) => {
  // 在节流更新中，我们依然要检查内容的稳定性，避免渲染出破碎的 HTML
  if (isContentStable(newContent)) {
    renderContent.value = newContent;
  } else if (!renderContent.value && newContent.length > 100) {
    // 兜底：如果一直不稳定但内容很长，也尝试渲染
    renderContent.value = newContent;
  }
}, 1000); // 1秒更新一次，既能看到进度，又不会太卡

// 使用 useIframeTheme 自动注入主题样式，依赖 renderContent 而不是 props.content
const { themedContent } = useIframeTheme(() => renderContent.value);

const title = computed(() => {
  const match = props.content.match(/<title[^>]*>(.*?)<\/title>/i);
  return match && match[1] ? match[1].trim() : "HTML Preview";
});

// 注入日志捕获和高度监听脚本
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
          // ignore serialization errors
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

    // 高度监听 - 防止反馈循环的设计：
    // 1. 不使用 ResizeObserver（它会监听容器高度变化，形成循环）
    // 2. 只使用 MutationObserver（监听内容变化）
    // 3. 添加防抖和高度变化阈值
    let lastSentHeight = 0;
    let debounceTimer = null;
    const HEIGHT_THRESHOLD = 10; // 高度变化超过 10px 才更新
    const DEBOUNCE_DELAY = 100; // 100ms 防抖
    
    const sendHeight = () => {
      const body = document.body;
      if (!body) return;
      
      // 计算内容的自然高度
      // 使用 scrollHeight 获取内容完整高度
      const height = body.scrollHeight;
      
      console.debug('[iframe-height] 计算高度:', {
        bodyScrollHeight: body.scrollHeight,
        bodyOffsetHeight: body.offsetHeight,
        bodyClientHeight: body.clientHeight,
        lastSentHeight: lastSentHeight,
        diff: Math.abs(height - lastSentHeight),
        willSend: height > 0 && Math.abs(height - lastSentHeight) > HEIGHT_THRESHOLD
      });
      
      // 只有当高度变化超过阈值时才发送
      if (height > 0 && Math.abs(height - lastSentHeight) > HEIGHT_THRESHOLD) {
        lastSentHeight = height;
        window.parent.postMessage({
          type: 'iframe-resize',
          height: height
        }, '*');
      }
    };
    
    // 防抖版本的 sendHeight
    const debouncedSendHeight = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sendHeight, DEBOUNCE_DELAY);
    };

    // 设置观察器的函数，需要等 DOM 准备好后调用
    const setupObservers = () => {
      const body = document.body;
      
      if (!body) {
        document.addEventListener('DOMContentLoaded', setupObservers);
        return;
      }
      
      // 只使用 MutationObserver 监听 DOM 内容变化
      // 不使用 ResizeObserver，避免反馈循环
      const mutationObserver = new MutationObserver(debouncedSendHeight);
      mutationObserver.observe(body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      
      // 初始发送一次（延迟一帧，确保布局完成）
      requestAnimationFrame(() => {
        sendHeight();
      });
    };
    
    // 注入 CSP 策略，允许加载 asset: 协议资源
    const meta = document.createElement('meta');
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; media-src * 'self' asset: http://asset.localhost https://asset.localhost blob: data:; img-src * 'self' asset: http://asset.localhost https://asset.localhost data: blob:; frame-src *;";
    document.head.appendChild(meta);

    // 根据 DOM 状态决定何时设置观察器
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupObservers);
    } else {
      setupObservers();
    }
    
    // load 事件时再发送一次，确保所有资源（如图片）加载完成后高度正确
    window.addEventListener('load', () => {
      // 延迟一帧，确保布局完成
      requestAnimationFrame(sendHeight);
    });

    // 交互感知：监听鼠标移动，通知父级显示悬浮菜单
    // 使用节流防止消息轰炸
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
  })();
<\/script>
`;

// 构建 srcdoc
const srcDoc = computed(() => {
  let content = themedContent.value;
  if (!content) return "";

  // 1. CDN 本地化拦截
  if (enableCdnLocalizer?.value !== false) {
    const { html: localizedContent } = localizeCdnLinks(content);
    content = localizedContent;
  }

  // 如果内容已经包含了 html 标签，则不再包裹，而是尝试注入脚本
  const trimmed = content.trim().toLowerCase();
  const isFullHtml = trimmed.includes("<html") || trimmed.includes("<!doctype");

  if (isFullHtml) {
    // 尝试注入脚本到 head 或 body
    // 注入脚本
    if (content.includes("</head>")) {
      return content.replace("</head>", `${logCaptureScript}</head>`);
    } else if (content.includes("<body>")) {
      return content.replace("<body>", `<body>${logCaptureScript}`);
    } else {
      // 实在找不到位置，就追加到最后
      return content + logCaptureScript;
    }
  } else {
    // 片段模式，包裹基本结构
    // 注意：这里使用 props.content 对应的 themedContent，已经包含了主题变量
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; media-src * 'self' asset: agent-asset: http://asset.localhost https://asset.localhost blob: data:; img-src * 'self' asset: agent-asset: http://asset.localhost https://asset.localhost data: blob:; frame-src *;">
          ${logCaptureScript}
          <style>
            body {
              margin: 0;
              padding: 16px;
              padding-bottom: 24px; /* 额外的底部缓冲，避免内容被截断 */
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: var(--text-color, #333);
              background-color: transparent;
              /* 防止 body 高度跟随 iframe 变化 */
              height: fit-content !important;
              min-height: 0 !important;
            }
            html {
              height: auto !important;
              min-height: 0 !important;
            }
            /* 滚动条样式 */
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

// 处理 iframe 传来的日志和消息
const handleIframeMessage = (event: MessageEvent) => {
  if (!event.data || !iframeRef.value) return;

  // 严格隔离：只处理来自当前实例 iframe 的消息
  if (event.source !== iframeRef.value.contentWindow) return;

  // 处理高度调整消息
  if (event.data.type === "iframe-resize" && props.autoHeight) {
    const newHeight = event.data.height;
    if (newHeight && newHeight > 0) {
      // 不再添加缓冲区，因为这会导致反馈循环：
      // 父组件设置高度 → iframe body 高度变化 → scrollHeight 变化 → 报告新高度 → 循环
      // 缓冲区改为在 iframe 内部的 body padding-bottom 中提供
      contentHeight.value = newHeight;
    }
    return;
  }

  // 处理交互事件
  if (event.data.type === "iframe-mousemove" || event.data.type === "iframe-mouseenter") {
    emit("content-hover", true);
    return;
  }
  if (event.data.type === "iframe-mouseleave") {
    emit("content-hover", false);
    return;
  }

  if (event.data.type === "iframe-log") {
    const { level, args } = event.data;

    // 构造符合 Logger 规范的 message 和 data
    let message = "";
    let extraData: any = undefined;

    if (args && args.length > 0) {
      const first = args[0];
      if (typeof first === "string") {
        message = first;
        if (args.length > 1) {
          extraData = args.slice(1);
        }
      } else {
        // 第一个参数不是字符串，可能是对象
        try {
          const str = JSON.stringify(first);
          message = str.length > 50 ? str.slice(0, 50) + "..." : str;
        } catch {
          message = "[Object]";
        }
        extraData = args;
      }
    } else {
      message = "[Empty Log]";
    }

    // 映射到系统 Logger
    switch (level) {
      case "log":
      case "info":
        logger.info(message, extraData);
        break;
      case "warn":
        logger.warn(message, extraData);
        break;
      case "error":
        // 尝试从 args 中提取类似 Error 的对象，如果没有则使用 message
        const errorPayload =
          args.find((a: any) => a && typeof a === "object" && (a.message || a.stack)) || message;

        // 使用 iframeErrorHandler 处理错误，模块名会显示为 "HtmlInteractiveViewer:Iframe"
        iframeErrorHandler.handle(errorPayload, {
          level: ErrorLevel.ERROR,
          showToUser: false,
          context: {
            originalArgs: extraData,
            source: "iframe",
          },
        });
        break;
      case "debug":
        logger.debug(message, extraData);
        break;
      default:
        logger.info(message, extraData);
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
  // 通过改变 key 强制 Vue 销毁并重新创建 iframe 组件
  // 这比手动操作 srcdoc 更彻底，也能触发完整的 onload 生命周期
  iframeKey.value++;
};

const openInBrowser = () => {
  try {
    const blob = new Blob([srcDoc.value], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");

    // 清理 URL object (稍微延迟一点，确保新窗口已经加载)
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) {
    errorHandler.error(error, "在浏览器打开失败");
    customMessage.error("无法在浏览器中打开预览");
  }
};

watch(
  [() => props.content, () => props.immediate],
  ([newContent, isImmediate]) => {
    // 只有当显示内容为空时（首次加载），才立即显示 loading
    // 后续更新尽量静默，避免遮罩层频繁闪烁
    if (!renderContent.value) {
      loading.value = true;
    }

    if (isImmediate) {
      // 立即模式（已闭合或非流式）：直接更新，不节流，确保最终结果立即显示
      renderContent.value = newContent;

      // 取消可能的待执行的节流/防抖，避免重复更新
      const debouncedFn = debouncedUpdateContent as any;
      if (debouncedFn.cancel) debouncedFn.cancel();

      // useThrottleFn 返回的函数没有暴露 cancel 方法，但在 VueUse 中通常不需要手动 cancel，
      // 因为我们已经覆盖了 renderContent.value
    } else {
      // 流式模式：使用节流更新
      // 注意：这里不再因为 isContentStable 为 true 就立即更新，
      // 而是强制走节流逻辑，以降低 iframe 刷新频率。
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

/* 自适应高度模式：移除高度限制和 overflow 裁剪 */
.html-interactive-viewer.auto-height {
  height: auto;
  overflow: visible;
}

.html-interactive-viewer.no-border {
  border: none;
  border-radius: 0;
}

/* 工具栏 */
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
  overflow: hidden; /* 防止标题过长溢出 */
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
  position: relative;
  overflow: hidden;
}

.tool-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 4px;
  background-color: var(--el-fill-color);
  opacity: 0;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.tool-btn:hover:not(:disabled) {
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.tool-btn:hover:not(:disabled)::before {
  opacity: 1;
}

.tool-btn:active:not(:disabled) {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 内容区域 */
.viewer-content {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 300px; /* 最小高度 */
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
  /* 使用主题背景色，避免暗色模式下闪瞎眼 */
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
