<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { acquireBlobUrl, releaseBlobUrl, acquireBlobUrlSync } from "@/utils/avatarImageCache";
import { useIntersectionObserver } from "@vueuse/core";

interface Props {
  /** 头像源：可以是图片 URL、appdata:// 路径、emoji 或其他字符 */
  src: string;
  /** 头像尺寸（px） */
  size?: number;
  /** 头像形状 */
  shape?: "circle" | "square";
  /** 圆角大小（仅当 shape 为 square 时生效，px） */
  radius?: number;
  /** 备用文字（当图片加载失败时显示首字符，建议使用 name 而非 displayName ） */
  alt?: string;
  /** 背景色（可选，默认使用主题色） */
  backgroundColor?: string;
  /** 边框样式（可选） */
  border?: boolean;
  /** 是否启用懒加载（仅针对 appdata:// 和本地路径） */
  lazy?: boolean;
  /** 懒加载触发距离 */
  rootMargin?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 40,
  shape: "square",
  radius: 6,
  alt: "",
  backgroundColor: "",
  border: true,
  lazy: true,
  rootMargin: "100px",
});

const containerRef = ref<HTMLElement | null>(null);
const shouldLoad = ref(false);

// 如果启用了懒加载，使用 IntersectionObserver
if (props.lazy) {
  useIntersectionObserver(
    containerRef,
    ([{ isIntersecting }]) => {
      if (isIntersecting) {
        shouldLoad.value = true;
      }
    },
    {
      rootMargin: props.rootMargin,
    }
  );
} else {
  shouldLoad.value = true;
}

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
  const s = sanitizedSrc.value;
  return (
    s &&
    (s.startsWith("/") ||
      s.startsWith("appdata://") ||
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("data:") ||
      s.startsWith("file://") ||
      /^[A-Za-z]:[\/\\]/.test(s) || // Windows 绝对路径（支持正反斜杠）
      s.startsWith("\\\\")) // UNC 路径
  );
});

// 异步处理路径转换
const processSrc = async () => {
  const currentSrc = sanitizedSrc.value;

  if (!currentSrc) {
    isSrcReady.value = true;
    imageLoadFailed.value = false;
    processedSrc.value = "";
    managedSrc.value = null;
    return;
  }

  // 1. HTTP/HTTPS/Base64/Public 相对路径 - 直接使用
  if (
    currentSrc.startsWith("http") ||
    currentSrc.startsWith("data:") ||
    currentSrc.startsWith("/")
  ) {
    processedSrc.value = currentSrc;
    isSrcReady.value = true;
    imageLoadFailed.value = false;
    managedSrc.value = null;
    return;
  }

  // 2. 本地绝对路径或 file:// 协议 - 使用 convertFileSrc
  if (
    currentSrc.startsWith("file://") ||
    /^[A-Za-z]:[\/\\]/.test(currentSrc) ||
    currentSrc.startsWith("\\\\")
  ) {
    let path = currentSrc;
    if (path.startsWith("file://")) {
      try {
        // 尝试解析 file URL
        const url = new URL(currentSrc);
        path = decodeURIComponent(url.pathname);
        // Windows 上 pathname 开头可能是 /C:/... 需要去掉开头的 /
        if (/^\/[A-Za-z]:/.test(path)) {
          path = path.slice(1);
        }
      } catch (e) {
        // 解析失败，简单去掉前缀
        path = currentSrc.replace(/^file:\/\//, "");
      }
    }

    processedSrc.value = convertFileSrc(path);
    isSrcReady.value = true;
    imageLoadFailed.value = false;
    managedSrc.value = null;
    return;
  }

  // 3. appdata:// 协议 - 使用缓存获取 Blob URL
  if (currentSrc.startsWith("appdata://")) {
    // 如果启用了懒加载且尚未进入视口，则暂停加载
    if (props.lazy && !shouldLoad.value) {
      return;
    }

    // 3.1 尝试同步获取缓存（避免闪烁）
    const cachedUrl = acquireBlobUrlSync(currentSrc);
    if (cachedUrl) {
      processedSrc.value = cachedUrl;
      managedSrc.value = currentSrc;
      isSrcReady.value = true;
      imageLoadFailed.value = false;
      return;
    }

    // 3.2 缓存未命中，进入异步加载状态
    isSrcReady.value = false;
    imageLoadFailed.value = false;
    processedSrc.value = "";
    managedSrc.value = null; // 重置管理状态

    const blobUrl = await acquireBlobUrl(currentSrc);
    // 再次检查 src 是否在等待期间发生了变化
    if (sanitizedSrc.value !== _currentProcessingSrc) return;

    if (blobUrl) {
      processedSrc.value = blobUrl;
      managedSrc.value = currentSrc; // 标记为已管理
    } else {
      console.error(`[Avatar Debug] FAILED: Could not acquire blob url for src: ${currentSrc}`);
      imageLoadFailed.value = true;
    }
    isSrcReady.value = true;
    return;
  }

  // 其他情况（可能是 emoji 或文本）
  isSrcReady.value = true;
};

let _currentProcessingSrc = "";

// 监听器现在会处理旧值的清理
watch(
  sanitizedSrc,
  (_newSrc, oldSrc) => {
    _currentProcessingSrc = _newSrc;
    // 如果旧的 src 是我们管理的 appdata:// (注意：现在本地路径不由 blob 管理了)，则释放它
    if (oldSrc && oldSrc.startsWith("appdata://")) {
      releaseBlobUrl(oldSrc);
    }
    processSrc();
  },
  { immediate: true }
);

// 监听 shouldLoad 变化，触发加载
watch(shouldLoad, (val) => {
  if (val) {
    _currentProcessingSrc = sanitizedSrc.value;
    processSrc();
  }
});

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
const containerStyle = computed(() => {
  const style: Record<string, any> = {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: props.shape === "circle" ? "50%" : `${props.radius}px`,
    border: props.border ? "1px solid var(--border-color)" : "none",
  };

  // 仅在提供了 backgroundColor Prop 或处于 fallback/emoji 状态时设置背景色
  // 这样，对于没有提供 backgroundColor 的图片（尤其是透明 GIF），容器背景将保持透明
  if (props.backgroundColor) {
    style.backgroundColor = props.backgroundColor;
  } else if (!isImagePath.value || imageLoadFailed.value) {
    style.backgroundColor = "var(--container-bg)";
  }

  return style;
});

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
  <div class="avatar-container" :style="containerStyle" ref="containerRef">
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
