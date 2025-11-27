<template>
  <div class="html-interactive-viewer" :class="{ 'no-border': !bordered }">
    <!-- 工具栏 -->
    <div class="viewer-toolbar" v-if="showToolbar">
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

        <el-tooltip content="在浏览器中打开" placement="bottom">
          <button class="tool-btn" @click="openInBrowser">
            <ExternalLink :size="14" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="viewer-content">
      <div v-if="loading" class="loading-overlay">
        <Loader2 class="animate-spin" :size="24" />
      </div>

      <iframe
        :key="iframeKey"
        ref="iframeRef"
        class="preview-iframe"
        :srcdoc="srcDoc"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        @load="onLoad"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { RotateCw, ExternalLink, Loader2 } from "lucide-vue-next";
import { useDebounceFn } from "@vueuse/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { useIframeTheme } from "@/composables/useIframeTheme";

const errorHandler = createModuleErrorHandler("HtmlInteractiveViewer");

const props = withDefaults(
  defineProps<{
    content: string;
    showToolbar?: boolean;
    bordered?: boolean;
    /**
     * 是否立即渲染，跳过防抖和稳定性检查。
     * 适用于非流式加载的场景（如查看本地文件），此时内容被认为是完整且稳定的。
     */
    immediate?: boolean;
  }>(),
  {
    showToolbar: true,
    bordered: true,
    immediate: false,
  }
);

const iframeRef = ref<HTMLIFrameElement | null>(null);
const loading = ref(true);
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
  // 如果包含 script 标签但没有结束标签，视为不稳定，绝对不要渲染，否则可能会执行错误的 js
  const hasScriptStart = /<script/i.test(trimmed);
  const hasScriptEnd = /<\/script>/i.test(trimmed);
  
  if (hasScriptStart && !hasScriptEnd) {
    return false;
  }

  // 其他情况只要不为空且通过长度检查，都视为稳定
  return true;
};

// 防抖更新渲染内容
const debouncedUpdateContent = useDebounceFn((newContent: string) => {
  // 如果内容稳定，或者虽然不稳定但这是第一次渲染（避免永远不显示），则更新
  // 但对于流式传输，我们倾向于等待稳定
  if (isContentStable(newContent)) {
    renderContent.value = newContent;
  } else if (!renderContent.value && newContent.length > 100) {
    // 如果当前是空的，且新内容已经很长了但还没检测到闭合标签（可能是长文本），也尝试渲染一下
    renderContent.value = newContent;
  }
}, 500); // 500ms 防抖，平衡响应速度和闪烁频率

// 使用 useIframeTheme 自动注入主题样式，依赖 renderContent 而不是 props.content
const { themedContent } = useIframeTheme(() => renderContent.value);

const title = computed(() => {
  const match = props.content.match(/<title[^>]*>(.*?)<\/title>/i);
  return match && match[1] ? match[1].trim() : "HTML Preview";
});
// 构建 srcdoc
const srcDoc = computed(() => {
  return themedContent.value;
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
  () => props.content,
  (newContent) => {
    // 只有当显示内容为空时（首次加载），才立即显示 loading
    // 后续更新尽量静默，避免遮罩层频繁闪烁
    if (!renderContent.value) {
      loading.value = true;
    }

    // 优化：如果开启了 immediate 模式，或内容已经稳定（例如非流式加载的完整HTML，或流式加载完成），
    // 立即渲染以消除防抖带来的延迟（白屏）
    if (props.immediate || isContentStable(newContent)) {
      renderContent.value = newContent;
      // 取消可能的待执行防抖，避免重复更新
      const debouncedFn = debouncedUpdateContent as any;
      if (debouncedFn.cancel) {
        debouncedFn.cancel();
      }
    } else {
      debouncedUpdateContent(newContent);
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
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
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
  background-color: var(--el-fill-color-lighter); /* 使用应用主题色 */
  border-bottom: 1px solid var(--border-color);
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
  border: 1px solid transparent;
  border-radius: 4px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
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
