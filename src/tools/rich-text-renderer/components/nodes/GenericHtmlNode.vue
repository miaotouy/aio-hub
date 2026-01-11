<template>
  <div
    class="generic-node-wrapper"
    :class="{ 'has-hidden-audio': isHiddenAudio, 'is-transparent': !isHiddenAudio }"
  >
    <component
      :is="safeTagName"
      v-bind="filteredAttributes"
      :class="computedClass"
      :data-node-id="nodeId"
      :ref="
        (el: any) => {
          if (isAudio) audioRef = el;
        }
      "
    >
      <slot />
    </component>

    <!-- 针对隐形音频的兜底控制器 -->
    <div v-if="isHiddenAudio" class="audio-fallback-ctrl">
      <div class="ctrl-main">
        <div class="ctrl-info">
          <Volume2 :size="14" class="icon-v" />
          <span class="label">{{ audioDisplayName }}</span>
        </div>
        <div class="ctrl-btns">
          <el-button @click="togglePlay" circle size="small" :title="isPlaying ? '暂停' : '播放'">
            <component :is="isPlaying ? Pause : Play" :size="12" />
          </el-button>
          <el-button @click="stopAudio" circle size="small" title="停止">
            <Square :size="12" />
          </el-button>
        </div>
        <div class="ctrl-status">
          <span v-if="isPlaying" class="playing-tag">正在播放</span>
          <span v-else class="paused-tag">已暂停</span>
        </div>
      </div>

      <div class="ctrl-progress">
        <el-slider
          v-model="currentTime"
          :max="duration"
          :step="0.1"
          :show-tooltip="false"
          size="small"
          @input="handleSeek"
          class="audio-slider"
        />
        <div class="time-display">
          <span>{{ formatTime(currentTime) }}</span>
          <span class="separator">/</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, onMounted, watch } from "vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";
import { Play, Pause, Square, Volume2 } from "lucide-vue-next";

const props = defineProps<{
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
  /** 是否允许渲染危险的 HTML 标签（覆盖 context 中的设置） */
  allowDangerousHtml?: boolean;
}>();

// 注入上下文以获取资产解析钩子
const context = inject<RichTextContext | null>(RICH_TEXT_CONTEXT_KEY, null);

// 注入聊天设置 (由 MessageContent 提供)
const chatSettings = inject<any>("chatSettings", null);
// 注入当前 Agent (由 MessageContent 提供)
const currentAgent = inject<any>("currentAgent", null);

const audioRef = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);
const isMuted = ref(false);
const currentTime = ref(0);
const duration = ref(0);

// 音频显示名称
const audioDisplayName = computed(() => {
  const attrs = props.attributes;
  // 优先级：title > aria-label > alt > src 文件名 > 默认
  const title = attrs.title;
  if (title && typeof title === "string") return title;

  const ariaLabel = attrs["aria-label"];
  if (ariaLabel && typeof ariaLabel === "string") return ariaLabel;

  const alt = attrs.alt;
  if (alt && typeof alt === "string") return alt;

  const src = attrs.src;
  if (src && typeof src === "string") {
    // 简单粗暴地提取路径最后一部分作为文件名
    // 无论是 agent-asset://path/to/file.mp3 还是 http://host/file.mp3
    const parts = src.split(/[?#]/)[0].split("/");
    const last = parts.pop();
    if (last && last.trim()) return last;
  }

  return "氛围音乐";
});

// 判定是否为音频标签
const isAudio = computed(() => props.tagName.toLowerCase() === "audio");

// 判定是否为“隐形”音频 (导致用户无法控制)
const isHiddenAudio = computed(() => {
  if (!isAudio.value) return false;
  const style = props.attributes.style || "";
  const hasNoControls = props.attributes.controls === undefined;
  const isDisplayNone = style.includes("display: none") || style.includes("display:none");
  const isVisibilityHidden =
    style.includes("visibility: hidden") || style.includes("visibility:hidden");

  return isDisplayNone || isVisibilityHidden || hasNoControls;
});

// 计算初始音量
const updateAudioVolume = () => {
  if (!audioRef.value || !chatSettings?.value) return;

  // 1. 获取原始内容自带的音量 (HTML 属性 volume 范围是 0.0 到 1.0)
  // 如果未设置，则基数为 1.0
  const rawVolumeAttr = props.attributes.volume;
  const baseVolume = rawVolumeAttr !== undefined ? parseFloat(rawVolumeAttr) : 1.0;

  // 2. 获取全局和智能体配置 (0-100)
  const globalVolume = chatSettings.value.uiPreferences?.globalMediaVolume ?? 80;
  const agentVolume = currentAgent?.value?.interactionConfig?.defaultMediaVolume ?? 100;

  // 3. 计算最终音量并限流在 [0, 1] 之间
  const finalVolume = baseVolume * (globalVolume / 100) * (agentVolume / 100);
  audioRef.value.volume = Math.max(0, Math.min(1, finalVolume));
};

onMounted(() => {
  if (isAudio.value && audioRef.value) {
    const el = audioRef.value;

    // 初始化状态
    updateAudioVolume();
    isPlaying.value = !el.paused;
    isMuted.value = el.muted;

    // 事件监听
    el.addEventListener("play", () => (isPlaying.value = true));
    el.addEventListener("pause", () => (isPlaying.value = false));
    el.addEventListener("volumechange", () => (isMuted.value = el.muted));
    el.addEventListener("timeupdate", () => (currentTime.value = el.currentTime));
    el.addEventListener("loadedmetadata", () => (duration.value = el.duration));
  }
});

// 监听全局音量变化
watch(
  () => chatSettings?.value?.uiPreferences?.globalMediaVolume,
  () => {
    updateAudioVolume();
  }
);

const togglePlay = () => {
  if (!audioRef.value) return;
  if (audioRef.value.paused) {
    audioRef.value.play();
  } else {
    audioRef.value.pause();
  }
};

const stopAudio = () => {
  if (!audioRef.value) return;
  audioRef.value.pause();
  audioRef.value.currentTime = 0;
};

const handleSeek = (val: number) => {
  if (!audioRef.value) return;
  audioRef.value.currentTime = val;
};

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

// 验证标签名是否合法
// HTML 标签名必须以字母开头,只能包含字母、数字、连字符和下划线
// 参考：https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const isValidTagName = (tag: string): boolean => {
  // 基本规则：以字母开头，后跟字母、数字、连字符或下划线
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tag);
};

// 危险标签黑名单：即便语法合法也不允许渲染的标签
const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "meta",
  "link",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "frame",
  "frameset",
  "applet",
]);

// 安全的标签名：非法或危险标签名退化为 span
const safeTagName = computed(() => {
  const tag = props.tagName.toLowerCase();

  // 检查是否在黑名单中
  // 仅在未显式允许危险 HTML 时进行检查
  const isDangerousAllowed =
    props.allowDangerousHtml ?? context?.allowDangerousHtml?.value ?? false;

  if (DANGEROUS_TAGS.has(tag) && !isDangerousAllowed) {
    console.warn(
      `[GenericHtmlNode] Dangerous tag blocked: "${props.tagName}", fallback to <span>. Set allowDangerousHtml to true to bypass.`
    );
    return "span";
  }

  if (isValidTagName(props.tagName)) {
    return props.tagName;
  }

  // 非法标签名，使用 span 包裹，并在控制台警告
  console.warn(
    `[GenericHtmlNode] Invalid tag name detected: "${props.tagName}", fallback to <span>`
  );
  return "span";
});

// 为特定标签自动添加 Markdown 样式类
const computedClass = computed(() => {
  const classes: string[] = [];

  // 如果用户提供了 class，先添加
  if (props.attributes.class) {
    classes.push(props.attributes.class);
  }

  // 为特定的 HTML 标签添加 Markdown 样式
  // 这样可以让 HTML 块内的这些元素保持与 Markdown 元素相同的视觉效果
  if (props.tagName === "blockquote") {
    classes.push("markdown-blockquote");
  }

  return classes.length > 0 ? classes.join(" ") : undefined;
});

// 验证属性名是否合法
const isValidAttributeName = (name: string): boolean => {
  // 属性名必须以字母或下划线开头（HTML5 实际上允许更多，但为了安全起见我们限制严格一点）
  // 绝对不能以数字开头，这会导致 setAttribute 报错
  return /^[a-zA-Z_][a-zA-Z0-9_\-:]*$/.test(name);
};

// 过滤和处理属性
// 移除可能有安全风险的属性，并处理特殊属性
const filteredAttributes = computed(() => {
  const attrs: Record<string, any> = {};

  for (const [key, value] of Object.entries(props.attributes)) {
    // 首先检查属性名是否合法
    if (!isValidAttributeName(key)) {
      continue;
    }

    const lowerKey = key.toLowerCase();

    // 跳过危险属性
    if (lowerKey.startsWith("on")) {
      // 跳过事件处理器（如 onclick, onload 等）
      continue;
    }

    // 跳过 class，因为我们在 computedClass 中统一处理
    if (lowerKey === "class") {
      continue;
    }

    // 过滤 javascript: 协议的 URL 属性
    const isUrlAttr = ["src", "href", "action", "formaction", "data"].includes(lowerKey);
    if (
      isUrlAttr &&
      typeof value === "string" &&
      value.toLowerCase().trim().startsWith("javascript:")
    ) {
      console.warn(`[GenericHtmlNode] Blocked javascript: URL in attribute "${key}"`);
      continue;
    }

    // 处理特殊属性
    if (lowerKey === "style") {
      attrs.style = value;
    } else if (
      lowerKey === "src" &&
      typeof value === "string" &&
      value.startsWith("agent-asset://")
    ) {
      // 解析智能体资产链接
      if (context?.resolveAsset) {
        attrs.src = context.resolveAsset(value);
      } else {
        attrs.src = value;
      }
    } else {
      // 其他属性直接传递
      attrs[key] = value;
    }
  }

  return attrs;
});
</script>

<style scoped>
.generic-node-wrapper {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.generic-node-wrapper.is-transparent {
  /*
     透明模式：让包装层在布局上“消失”，子元素直接参与父级布局。
     这解决了嵌套 HTML 标签时 absolute 定位参照物偏移的问题。
  */
  display: contents;
}

.generic-node-wrapper.has-hidden-audio {
  display: block;
  margin: 8px 0;
}

/* 兜底音频控制器样式 */
.audio-fallback-ctrl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: fit-content;
  min-width: 320px;
  max-width: 1000px;
  transition: all 0.3s ease;
}

.audio-fallback-ctrl:hover {
  border-color: var(--el-color-primary);
}

.ctrl-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ctrl-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
}

.ctrl-info .icon-v {
  color: var(--el-color-primary);
}

.ctrl-info .label {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.ctrl-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-status {
  margin-left: auto;
  font-size: 11px;
}

.ctrl-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 20px;
}

.audio-slider {
  flex: 1;
  height: 20px;
  --el-slider-button-size: 10px;
}

.time-display {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 10px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 65px;
  justify-content: flex-end;
}

.time-display .separator {
  opacity: 0.5;
}

.playing-tag {
  color: var(--el-color-success);
  display: flex;
  align-items: center;
  gap: 4px;
}

.playing-tag::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  background-color: currentColor;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

.paused-tag {
  color: var(--el-text-color-placeholder);
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
}

/* 为 HTML 块内的 blockquote 添加 Markdown 样式 */
.markdown-blockquote {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--el-color-primary);
  background-color: var(--hover-bg);
  color: var(--el-text-color-regular);
}
</style>
