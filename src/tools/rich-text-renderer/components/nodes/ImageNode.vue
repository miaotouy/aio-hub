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
        @error="hasError = true"
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
import { convertFileSrc } from "@tauri-apps/api/core";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { ZoomIn, Copy, Download, Check } from "lucide-vue-next";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";
import { customMessage } from "@/utils/customMessage";
import { resolveAgentAssetUrlSync } from "@/tools/llm-chat/utils/agentAssetUtils";
import type { ChatAgent } from "@/tools/llm-chat/types";

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
const isHovered = ref(false);
const isCopying = ref(false);
let basePath: string | null = null;

const resolveUrl = async () => {
  isLoading.value = true;
  hasError.value = false;

  try {
    if (props.src.startsWith("agent-asset://")) {
      // Agent 资产协议：优先使用上下文提供的解析钩子
      if (context?.resolveAsset) {
        resolvedSrc.value = context.resolveAsset(props.src);
      } else {
        // 降级使用同步解析（依赖缓存）
        const agent = currentAgent?.value;
        if (agent) {
          const resolved = resolveAgentAssetUrlSync(props.src, agent);
          resolvedSrc.value = resolved;
        } else {
          // 没有 Agent 上下文，无法解析
          console.warn(`[ImageNode] No agent context or resolveAsset hook for agent-asset:// URL: ${props.src}`);
          resolvedSrc.value = props.src;
        }
      }
    } else if (props.src.startsWith("appdata://")) {
      if (!basePath) {
        basePath = await assetManagerEngine.getAssetBasePath();
      }
      const assetPath = props.src.substring("appdata://".length);
      resolvedSrc.value = assetManagerEngine.convertToAssetProtocol(assetPath, basePath);
    } else if (
      // 检查是否为本地绝对路径 (Windows 盘符, UNC 路径, 或 Unix 绝对路径)
      /^[a-zA-Z]:[\\/]/.test(props.src) ||
      props.src.startsWith("\\\\") ||
      props.src.startsWith("/")
    ) {
      // 本地绝对路径：使用 convertFileSrc 转换为 asset 协议 URL
      resolvedSrc.value = convertFileSrc(props.src);
    } else {
      // 其他情况（http/https/base64 等）直接使用
      resolvedSrc.value = props.src;
    }
  } catch (error) {
    console.error(`[ImageNode] Failed to resolve image source: ${props.src}`, error);
    hasError.value = true;
  } finally {
    isLoading.value = false;
  }
};

// 监听 src 或 Agent 上下文的变化
// 解决竟态问题：当 Agent 数据加载完成时，重新解析资产路径
watch([() => props.src, () => currentAgent?.value], resolveUrl, { immediate: true });

// === 功能实现 ===

/**
 * 辅助函数：将路径转换为可预览的 URL
 */
const convertToPreviewUrl = async (src: string): Promise<string> => {
  if (src.startsWith("agent-asset://")) {
    // Agent 资产协议
    if (context?.resolveAsset) {
      return context.resolveAsset(src);
    }
    const agent = currentAgent?.value;
    if (agent) {
      return resolveAgentAssetUrlSync(src, agent);
    }
    return src;
  } else if (src.startsWith("appdata://")) {
    if (!basePath) {
      basePath = await assetManagerEngine.getAssetBasePath();
    }
    const assetPath = src.substring("appdata://".length);
    return assetManagerEngine.convertToAssetProtocol(assetPath, basePath);
  } else if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("\\\\") || src.startsWith("/")) {
    return convertFileSrc(src);
  }
  return src;
};

/**
 * 预览图片
 */
const handlePreview = async () => {
  // 1. 转换当前图片 URL (用于单张预览或兜底)
  const currentUrl = await convertToPreviewUrl(props.src);

  if (!context || !context.images.value.length) {
    // 如果没有上下文，仅预览当前图片
    imageViewer.show(currentUrl);
    return;
  }

  // 2. 转换上下文中的所有图片 URL
  // 注意：这里需要保持顺序，且为了性能，我们并行处理转换
  const allImages = context.images.value;
  const convertedImages = await Promise.all(allImages.map((src) => convertToPreviewUrl(src)));

  // 3. 查找当前图片在转换后列表中的索引
  // 我们通过原始 src 来找索引，因为 convertedImages 和 allImages 是一一对应的
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
