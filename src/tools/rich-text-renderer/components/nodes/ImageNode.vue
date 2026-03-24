<template>
  <div
    class="image-container"
    :data-node-id="nodeId"
    :data-node-status="$attrs['data-node-status']"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div v-if="isLoading" class="loading-placeholder">
      <div class="spinner"></div>
    </div>
    <div v-else-if="hasError" class="error-placeholder">⚠️ 加载失败</div>
    <template v-else>
      <img
        :src="resolvedSrc"
        :alt="alt || ''"
        :title="title || undefined"
        class="markdown-image"
        referrerpolicy="no-referrer"
        @error="handleImageError"
        @click="handlePreview"
      />

      <!-- 悬停操作栏 -->
      <transition name="fade">
        <div v-show="isHovered" class="image-toolbar">
          <div class="toolbar-item" @click.stop="handlePreview" title="放大查看">
            <ZoomIn :size="16" />
          </div>
          <div class="toolbar-item" @click.stop="handleCopy" title="复制图片">
            <Copy v-if="!isCopying" :size="16" />
            <Check v-else :size="16" class="success-icon" />
          </div>
          <div class="toolbar-item" @click.stop="handleDownload" title="下载图片">
            <Download :size="16" />
          </div>
        </div>
      </transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, inject, type ComputedRef } from "vue";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { ZoomIn, Copy, Download, Check } from "lucide-vue-next";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";
import { customMessage } from "@/utils/customMessage";
import { resolveAgentAssetUrlSync } from "@/tools/llm-chat/utils/agentAssetUtils";
import type { ChatAgent } from "@/tools/llm-chat/types";
import { resolveLocalPath } from "../../utils/path-utils";

const props = defineProps<{
  nodeId: string;
  src: string;
  alt?: string;
  title?: string;
}>();

// 注入上下文
const context = inject<RichTextContext | null>(RICH_TEXT_CONTEXT_KEY, null);
// 注入当前 Agent（由 MessageContent 提供，用于解析 agent-asset:// URL）
const currentAgent = inject<ComputedRef<ChatAgent | undefined> | null>("currentAgent", null);
const imageViewer = useImageViewer();

const resolvedSrc = ref("");
const isLoading = ref(true);
const hasError = ref(false);
const isRetrying = ref(false);
const isHovered = ref(false);
const isCopying = ref(false);
let basePath: string | null = null;

const resolveUrl = async () => {
  isLoading.value = true;
  hasError.value = false;

  try {
    let src = props.src;

    // 1. 优先尝试 Agent 资产解析 (Chat 专用)
    if (context?.resolveAsset) {
      src = context.resolveAsset(props.src);
    } else if (src.startsWith("agent-asset://")) {
      // 降级使用同步解析（依赖缓存）
      const agent = currentAgent?.value;
      if (agent) {
        src = resolveAgentAssetUrlSync(src, agent);
      } else {
        console.warn(`[ImageNode] No agent context or resolveAsset hook for agent-asset:// URL: ${src}`);
      }
    }

    // 2. 处理特殊协议或本地路径
    if (src.startsWith("appdata://")) {
      if (!basePath) {
        basePath = await assetManagerEngine.getAssetBasePath();
      }
      const assetPath = props.src.substring("appdata://".length);
      resolvedSrc.value = assetManagerEngine.convertToAssetProtocol(assetPath, basePath);
    } else if (props.src.startsWith("//")) {
      // 协议相对 URL (如 //example.com/image.png)
      // 默认使用 https
      resolvedSrc.value = `https:${props.src}`;
    } else {
      // 处理本地路径转换
      resolvedSrc.value = resolveLocalPath(src);
    }
  } catch (error) {
    console.error(`[ImageNode] Failed to resolve image source: ${props.src}`, error);
    hasError.value = true;
  } finally {
    isLoading.value = false;
  }
};

/**
 * 处理图片加载失败：尝试使用 fetch 代理（绕过 Referer 限制）
 */
const handleImageError = async () => {
  // 只有 http/https 链接且未重试过才尝试
  if (isRetrying.value || !resolvedSrc.value.startsWith("http")) {
    hasError.value = true;
    return;
  }

  isRetrying.value = true;
  isLoading.value = true;

  try {
    // 使用 fetch 获取图片，显式设置不带 referrer 并伪装 User-Agent
    const response = await fetch(resolvedSrc.value, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      referrer: "",
      referrerPolicy: "no-referrer",
      credentials: "omit",
      mode: "cors",
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const blob = await response.blob();
    // 检查是否真的是图片
    if (!blob.type.startsWith("image/")) throw new Error("Not an image");

    // 释放旧的 URL (如果是我们自己生成的)
    if (resolvedSrc.value.startsWith("blob:")) {
      URL.revokeObjectURL(resolvedSrc.value);
    }

    resolvedSrc.value = URL.createObjectURL(blob);
    hasError.value = false;
  } catch (error) {
    console.warn(`[ImageNode] Proxy fetch failed for ${props.src}:`, error);
    hasError.value = true;
  } finally {
    isLoading.value = false;
  }
};
// 性能优化：使用 watchEffect 替代 watch，避免不必要的重复触发
// 只在 src 真正变化时才重新解析
let lastSrc = "";
let isActive = true; // 组件激活状态

watch(
  () => props.src,
  (newSrc) => {
    if (!isActive) return; // 组件已停用，跳过
    if (newSrc !== lastSrc) {
      lastSrc = newSrc;
      resolveUrl();
    }
  },
  { immediate: true },
);

// Agent 上下文变化时重新解析（仅针对 agent-asset:// 协议）
watch(
  () => currentAgent?.value,
  () => {
    if (!isActive) return; // 组件已停用，跳过
    if (props.src.startsWith("agent-asset://")) {
      resolveUrl();
    }
  },
);

// 监听降级模式：如果检测到降级，停止所有异步操作
if (context?.images) {
  watch(
    () => context.images.value,
    (images) => {
      // 如果图片列表被清空，说明可能进入降级模式
      if (images.length === 0 && lastSrc) {
        isActive = false; // 停用组件
      }
    },
  );
}

// === 功能实现 ===

/**
 * 辅助函数：将路径转换为可预览的 URL
 */
const convertToPreviewUrl = async (src: string): Promise<string> => {
  let finalSrc = src;

  // 1. 处理 Agent 资产
  if (finalSrc.startsWith("agent-asset://")) {
    if (context?.resolveAsset) {
      finalSrc = context.resolveAsset(finalSrc);
    } else {
      const agent = currentAgent?.value;
      if (agent) {
        finalSrc = resolveAgentAssetUrlSync(finalSrc, agent);
      }
    }
  }

  // 2. 处理特殊协议
  if (finalSrc.startsWith("appdata://")) {
    if (!basePath) {
      basePath = await assetManagerEngine.getAssetBasePath();
    }
    const assetPath = finalSrc.substring("appdata://".length);
    return assetManagerEngine.convertToAssetProtocol(assetPath, basePath);
  } else if (finalSrc.startsWith("//")) {
    return `https:${finalSrc}`;
  }

  // 3. 处理本地路径
  return resolveLocalPath(finalSrc);
};

/**
 * 预览图片
 * 性能优化：只转换当前图片，避免在大量图片场景下卡顿
 */
const handlePreview = async () => {
  // 1. 转换当前图片 URL
  const currentUrl = await convertToPreviewUrl(props.src);

  if (!context || !context.images.value.length) {
    // 如果没有上下文，仅预览当前图片
    imageViewer.show(currentUrl);
    return;
  }

  // 2. 性能优化：限制图片数量
  const allImages = context.images.value;
  const MAX_PREVIEW_IMAGES = 10000; // 最多预览图片数量

  if (allImages.length > MAX_PREVIEW_IMAGES) {
    // 图片过多时，只预览当前图片
    imageViewer.show(currentUrl);
    return;
  }

  // 3. 转换上下文中的所有图片 URL（限制数量后）
  const convertedImages = await Promise.all(allImages.map((src) => convertToPreviewUrl(src)));

  // 4. 查找当前图片在转换后列表中的索引
  const index = allImages.indexOf(props.src);

  if (index !== -1) {
    imageViewer.show(convertedImages, index);
  } else {
    // 兜底：如果没找到，就把当前图片加到最后
    imageViewer.show([...convertedImages, currentUrl], convertedImages.length);
  }
};

/**
 * 复制图片到剪贴板
 */
const handleCopy = async () => {
  if (isCopying.value) return;
  isCopying.value = true;

  try {
    // 获取图片 Blob
    const response = await fetch(resolvedSrc.value);
    const blob = await response.blob();

    // 写入剪贴板
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);

    customMessage.success("图片已复制到剪贴板");

    // 恢复图标状态
    setTimeout(() => {
      isCopying.value = false;
    }, 2000);
  } catch (error) {
    console.error("复制图片失败:", error);
    customMessage.error("复制图片失败");
    isCopying.value = false;
  }
};

/**
 * 下载图片
 */
const handleDownload = async () => {
  try {
    const response = await fetch(resolvedSrc.value);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    // 尝试从 alt 或 src 中获取文件名，默认为 image.png
    let filename = props.alt || "image";
    if (!filename.includes(".")) {
      const type = blob.type.split("/")[1] || "png";
      filename += `.${type}`;
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("下载图片失败:", error);
    customMessage.error("下载图片失败");
  }
};
</script>

<style scoped>
.image-container {
  position: relative;
  display: inline-block;
  vertical-align: middle;
  max-width: 100%;
  line-height: 0; /* 避免图片下方出现额外空隙 */
  user-select: none; /* 防止选中图片 */
}

.markdown-image {
  margin-left: -4px;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  cursor: zoom-in;
  transition: filter 0.2s;
}

.image-container:hover .markdown-image {
  filter: brightness(0.95);
}

/* 悬停工具栏 */
.image-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  -webkit-backdrop-filter: blur(var(--ui-blur));
  padding: 4px;
  border-radius: 6px;
  z-index: 10;
}

.toolbar-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--text-color-regular);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.toolbar-item:hover {
  background-color: var(--el-fill-color);
  color: var(--text-color-primary);
}

.success-icon {
  color: var(--el-color-success);
}

.loading-placeholder,
.error-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50px; /* 最小高度，避免加载时闪烁 */
  width: 100%;
  padding: 16px;
  background-color: var(--container-bg);
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  color: var(--text-color-light);
  font-size: 14px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
