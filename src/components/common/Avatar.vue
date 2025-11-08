<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { invoke } from "@tauri-apps/api/core";

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

// 判断是否为图片路径
const isImagePath = computed(() => {
  return (
    props.src &&
    (props.src.startsWith("/") ||
      props.src.startsWith("appdata://") ||
      props.src.startsWith("http://") ||
      props.src.startsWith("https://") ||
      props.src.startsWith("data:") ||
      /^[A-Za-z]:[\/\\]/.test(props.src) || // Windows 绝对路径（支持正反斜杠）
      props.src.startsWith("\\\\")) // UNC 路径
  );
});

// 异步处理路径转换
const updateProcessedSrc = async () => {
  isSrcReady.value = false;
  imageLoadFailed.value = false;

  if (processedSrc.value.startsWith("blob:")) {
    URL.revokeObjectURL(processedSrc.value);
  }
  processedSrc.value = "";

  if (!props.src) {
    return;
  }

  // HTTP/HTTPS/Base64/Public 相对路径 - 直接使用
  if (props.src.startsWith("http") || props.src.startsWith("data:") || props.src.startsWith("/")) {
    processedSrc.value = props.src;
    isSrcReady.value = true;
    return;
  }

  // appdata:// 协议 - 转换为 Blob URL
  if (props.src.startsWith("appdata://")) {
    try {
      const relativePath = props.src.substring(10).replace(/\\/g, "/");
      const bytes = await invoke<number[]>("get_asset_binary", { relativePath });
      const uint8Array = new Uint8Array(bytes);
      const blob = new Blob([uint8Array]);
      processedSrc.value = URL.createObjectURL(blob);
    } catch (error) {
      console.error(`[Avatar] Failed to load asset from appdata:// path: ${props.src}`, error);
      imageLoadFailed.value = true;
    } finally {
      isSrcReady.value = true;
    }
    return;
  }

  // 其他情况（可能是 emoji 或文本）
  isSrcReady.value = true;
};

// 组件卸载前，释放 Blob URL
onBeforeUnmount(() => {
  if (processedSrc.value.startsWith("blob:")) {
    URL.revokeObjectURL(processedSrc.value);
  }
});

// 监听 src 变化
watch(
  () => props.src,
  () => {
    imageLoadFailed.value = false; // 重置加载失败状态
    updateProcessedSrc();
  },
  { immediate: true }
);

// 判断是否为 emoji（简单判断：单个字符或包含 emoji Unicode 范围）
const isEmoji = computed(() => {
  if (!props.src || isImagePath.value) return false;
  // 简单的 emoji 检测：长度较短且包含非 ASCII 字符
  return (
    props.src.length <= 4 &&
    /[\u{1F000}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(props.src)
  );
});

// 获取 fallback 文字（取 alt 的首字符或 src 的首字符）
const fallbackText = computed(() => {
  if (props.alt) return props.alt.charAt(0).toUpperCase();
  if (props.src && !isImagePath.value) return props.src.charAt(0).toUpperCase();
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
      {{ src }}
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
