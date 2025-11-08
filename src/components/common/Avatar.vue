<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { acquireBlobUrl, releaseBlobUrl } from "@/utils/avatarImageCache";

interface Props {
  /** 头像源：可以是图片 URL、appdata:// 路径、emoji 或其他字符 */
  src: string;
  /** 头像尺寸（px） */
  size?: number;
  /** 头像形状 */
  shape?: "circle" | "square";
  /** 圆角大小（仅当 shape 为 square 时生效，px） */
  radius?: number;
  /** 备用文字（当图片加载失败时显示首字符） */
  alt?: string;
  /** 背景色（可选，默认使用主题色） */
  backgroundColor?: string;
  /** 边框样式（可选） */
  border?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 40,
  shape: "square",
  radius: 6,
  alt: "",
  backgroundColor: "",
  border: true,
});

const imageLoadFailed = ref(false);
const processedSrc = ref("");
const isSrcReady = ref(false); // 新增状态，控制图片是否准备好渲染
const managedSrc = ref<string | null>(null); // 追踪被管理的 blob url 的源路径

const sanitizedSrc = computed(() => {
  if (!props.src) return "";
  // 移除开头和结尾多余的空格和引号
  return props.src.trim().replace(/^"|"$/g, "").trim();
});

// 判断是否为图片路径
const isImagePath = computed(() => {
  return (
    sanitizedSrc.value &&
    (sanitizedSrc.value.startsWith("/") ||
      sanitizedSrc.value.startsWith("appdata://") ||
      sanitizedSrc.value.startsWith("http://") ||
      sanitizedSrc.value.startsWith("https://") ||
      sanitizedSrc.value.startsWith("data:") ||
      /^[A-Za-z]:[\/\\]/.test(sanitizedSrc.value) || // Windows 绝对路径（支持正反斜杠）
      sanitizedSrc.value.startsWith("\\\\")) // UNC 路径
  );
});

// 异步处理路径转换
const processSrc = async () => {
  isSrcReady.value = false;
  imageLoadFailed.value = false;
  processedSrc.value = "";
  managedSrc.value = null; // 重置管理状态

  if (!sanitizedSrc.value) {
    isSrcReady.value = true;
    return;
  }

  // HTTP/HTTPS/Base64/Public 相对路径 - 直接使用
  if (
    sanitizedSrc.value.startsWith("http") ||
    sanitizedSrc.value.startsWith("data:") ||
    sanitizedSrc.value.startsWith("/")
  ) {
    processedSrc.value = sanitizedSrc.value;
    isSrcReady.value = true;
    return;
  }

  // appdata:// 协议或本地绝对路径 - 使用缓存获取 Blob URL
  if (
    sanitizedSrc.value.startsWith("appdata://") ||
    /^[A-Za-z]:[\/\\]/.test(sanitizedSrc.value) || // Windows 绝对路径
    sanitizedSrc.value.startsWith("\\\\") // UNC 路径
  ) {
    const blobUrl = await acquireBlobUrl(sanitizedSrc.value);
    if (blobUrl) {
      processedSrc.value = blobUrl;
      managedSrc.value = sanitizedSrc.value; // 标记为已管理
    } else {
      console.error(
        `[Avatar Debug] FAILED: Could not acquire blob url for src: ${sanitizedSrc.value}`
      );
      imageLoadFailed.value = true;
    }
    isSrcReady.value = true;
    return;
  }

  // 其他情况（可能是 emoji 或文本）
  isSrcReady.value = true;
};

// 监听器现在会处理旧值的清理
watch(
  sanitizedSrc,
  (_newSrc, oldSrc) => {
    // 如果旧的 src 是我们管理的 appdata:// 或本地路径，则释放它
    if (
      oldSrc &&
      (oldSrc.startsWith("appdata://") ||
        /^[A-Za-z]:[\/\\]/.test(oldSrc) ||
        oldSrc.startsWith("\\\\"))
    ) {
      releaseBlobUrl(oldSrc);
    }
    processSrc();
  },
  { immediate: true }
);

// onBeforeUnmount 进行最终清理
onBeforeUnmount(() => {
  if (managedSrc.value) {
    releaseBlobUrl(managedSrc.value);
    managedSrc.value = null;
  }
});

// 判断是否为 emoji（简单判断：单个字符或包含 emoji Unicode 范围）
const isEmoji = computed(() => {
  if (!sanitizedSrc.value || isImagePath.value) return false;
  // 简单的 emoji 检测：长度较短且包含非 ASCII 字符
  return (
    sanitizedSrc.value.length <= 4 &&
    /[\u{1F000}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(sanitizedSrc.value)
  );
});

// 获取 fallback 文字（取 alt 的首字符或 src 的首字符）
const fallbackText = computed(() => {
  if (props.alt) return props.alt.charAt(0).toUpperCase();
  if (sanitizedSrc.value && !isImagePath.value) return sanitizedSrc.value.charAt(0).toUpperCase();
  return "?";
});

// 容器样式
const containerStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: props.shape === "circle" ? "50%" : `${props.radius}px`,
  backgroundColor: props.backgroundColor || "var(--container-bg)",
  border: props.border ? "1px solid var(--border-color)" : "none",
}));

// Emoji 字体大小（约为容器的一半）
const emojiFontSize = computed(() => `${Math.floor(props.size * 0.5)}px`);

// Fallback 文字字体大小（约为容器的 40%）
const fallbackFontSize = computed(() => `${Math.floor(props.size * 0.4)}px`);

// 图片加载成功处理
const handleImageLoad = () => {
  console.log(
    `[Avatar Debug] 5. SUCCESS: Image loaded successfully for src: ${processedSrc.value}`
  );
};

// 图片加载错误处理
const handleImageError = (event: Event) => {
  console.error(
    `[Avatar Debug] 5. FAILED: Image failed to load for src: ${processedSrc.value}`,
    event
  );
  imageLoadFailed.value = true;
};
</script>

<template>
  <div class="avatar-container" :style="containerStyle">
    <!-- 图片模式 -->
    <img
      v-if="isImagePath && !imageLoadFailed && isSrcReady && processedSrc"
      :src="processedSrc"
      :alt="alt"
      class="avatar-image"
      @load="handleImageLoad"
      @error="handleImageError"
    />
    <!-- Emoji 模式 -->
    <span v-else-if="isEmoji" class="avatar-emoji" :style="{ fontSize: emojiFontSize }">
      {{ sanitizedSrc }}
    </span>
    <!-- Fallback 模式 -->
    <span v-else class="avatar-fallback" :style="{ fontSize: fallbackFontSize }">
      {{ fallbackText }}
    </span>
  </div>
</template>

<style scoped>
.avatar-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  user-select: none;
  position: relative;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-emoji {
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-fallback {
  font-weight: 600;
  color: var(--text-color-secondary);
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
}
</style>
