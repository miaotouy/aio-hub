<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ArrowLeft, ArrowRight, RotateCw, Globe, Zap, Scan, Settings2, Trash2, FileUp } from "lucide-vue-next";
import type { DistillMode } from "../types";
import { iframeBridge } from "../core/iframe-bridge";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("web-distillery/toolbar");

interface Props {
  modelValue: string;
  loading?: boolean;
  activeMode?: DistillMode;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  activeMode: "fast",
  canGoBack: false,
  canGoForward: false,
});

const emit = defineEmits<{
  "update:modelValue": [url: string];
  fetch: [mode: "fast" | "smart"];
  navigate: [direction: "back" | "forward"];
  refresh: [];
  "open-interactive": [];
  upload: [payload: { content: string; fileName: string }];
}>();

const urlInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isEditing = ref(false);
const localUrl = ref(props.modelValue);

const modeOptions = [
  { label: "快速模式", value: "fast", icon: Zap, desc: "纯 HTTP 请求，毫秒级响应" },
  { label: "智能模式", value: "smart", icon: Scan, desc: "隐藏 Iframe 渲染 JS，支持动态内容" },
  { label: "交互模式", value: "interactive", icon: Settings2, desc: "可见 Iframe + 元素选择，配置持久化配方" },
];

const selectedMode = ref<DistillMode>(props.activeMode ?? "fast");
const currentModeOption = computed(() => modeOptions.find((o) => o.value === selectedMode.value) || modeOptions[0]);

watch(
  () => props.activeMode,
  (newMode: DistillMode | undefined) => {
    if (newMode !== undefined) {
      selectedMode.value = newMode;
    }
  },
);

watch(
  () => props.modelValue,
  (newUrl) => {
    localUrl.value = newUrl;
  },
);

function onUrlKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") triggerFetch();
  else if (e.key === "Escape") {
    localUrl.value = props.modelValue;
    isEditing.value = false;
    urlInputRef.value?.blur();
  }
}

function triggerFetch() {
  let url = localUrl.value.trim();
  if (!url) return;

  // 移除可能存在的引号（拖拽路径有时会带引号）
  url = url.replace(/^["']|["']$/g, "");

  let finalUrl = url;
  // 判断是否为本地绝对路径 (Windows: C:\... 或 Unix: /...)
  const isAbsolutePath = /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith("/");
  const isFileUrl = url.startsWith("file://");

  if (!isAbsolutePath && !isFileUrl && !url.startsWith("http")) {
    finalUrl = `https://${url}`;
  }

  localUrl.value = finalUrl;
  logger.debug("Triggering fetch", { url: finalUrl, mode: selectedMode.value });
  emit("update:modelValue", finalUrl);

  if (selectedMode.value === "interactive") {
    emit("open-interactive");
  } else {
    emit("fetch", selectedMode.value as "fast" | "smart");
  }

  urlInputRef.value?.blur();
}

function handleModeCommand(mode: DistillMode) {
  selectedMode.value = mode;
  if (mode === "interactive") {
    emit("open-interactive");
  }
}

async function handleForceCleanup() {
  try {
    await iframeBridge.forceCleanup();
    customMessage.success("已强制清理蒸馏环境");
    emit("refresh"); // 触发父组件刷新状态
  } catch (e) {
    logger.error("Force cleanup failed", e);
  }
}

function triggerFileUpload() {
  fileInputRef.value?.click();
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    logger.info("File loaded", { name: file.name, size: file.size });
    emit("upload", { content, fileName: file.name });

    // 清空 input，允许重复上传同一文件
    target.value = "";
  } catch (err) {
    logger.error("Failed to read file", err);
    customMessage.error("文件读取失败");
  }
}
</script>

<template>
  <div class="browser-toolbar" @click.stop>
    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".html,.htm,.txt,.md,.xml,.rss"
      style="display: none"
      @change="handleFileChange"
    />

    <!-- 导航按钮 -->
    <div class="nav-group">
      <button class="toolbar-btn" :disabled="!canGoBack || loading" title="后退" @click="emit('navigate', 'back')">
        <ArrowLeft :size="15" />
      </button>
      <button
        class="toolbar-btn"
        :disabled="!canGoForward || loading"
        title="前进"
        @click="emit('navigate', 'forward')"
      >
        <ArrowRight :size="15" />
      </button>
      <button class="toolbar-btn" :disabled="loading" title="刷新" @click="emit('refresh')">
        <RotateCw :size="15" :class="{ spin: loading }" />
      </button>
      <button class="toolbar-btn" :disabled="loading" title="上传文件" @click="triggerFileUpload">
        <FileUp :size="15" />
      </button>
    </div>

    <!-- 地址栏 -->
    <div class="url-bar" :class="{ 'is-focused': isEditing }">
      <Globe :size="14" class="url-globe" />
      <input
        ref="urlInputRef"
        v-model="localUrl"
        class="url-input"
        placeholder="输入 URL，回车蒸馏 (如 https://example.com)"
        spellcheck="false"
        @focus="isEditing = true"
        @blur="isEditing = false"
        @keydown="onUrlKeydown"
      />
    </div>

    <!-- 模式选择器 -->
    <el-dropdown trigger="click" @command="handleModeCommand">
      <div class="mode-selector-wrap">
        <button class="toolbar-btn mode-btn" :disabled="loading">
          <component :is="currentModeOption.icon" :size="14" />
          <span>{{ currentModeOption.label }}</span>
          <i-ep-arrow-down class="mode-arrow" />
        </button>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="opt in modeOptions"
            :key="opt.value"
            :command="opt.value"
            :class="{ 'mode-item-active': selectedMode === opt.value }"
          >
            <div class="mode-item" :class="{ 'is-active': selectedMode === opt.value }">
              <component :is="opt.icon" :size="15" class="mode-item-icon" />
              <div class="mode-item-info">
                <span class="mode-item-name">{{ opt.label }}</span>
                <span class="mode-item-desc">{{ opt.desc }}</span>
              </div>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 终极清理 (仅在加载中显示) -->
    <el-tooltip content="终极强制清理 (终止并销毁所有后台进程)" placement="top">
      <button class="toolbar-btn cleanup-btn" @click="handleForceCleanup">
        <Trash2 :size="15" />
      </button>
    </el-tooltip>

    <!-- 蒸馏按钮 -->
    <el-button type="primary" :loading="loading" :disabled="!localUrl.trim()" @click="triggerFetch"> 蒸馏 </el-button>
  </div>
</template>

<style scoped>
.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

/* 导航按钮组 */
.nav-group {
  display: flex;
  gap: 2px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 8px;
  height: 32px;
  background: transparent;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color-light);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
  white-space: nowrap;
}
.toolbar-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border-color: var(--primary-color);
  color: var(--text-color);
}
.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cleanup-btn {
  color: var(--danger-color, #f56c6c);
  border-color: color-mix(in srgb, var(--danger-color, #f56c6c) 30%, transparent);
}
.cleanup-btn:hover {
  background: color-mix(in srgb, var(--danger-color, #f56c6c) 10%, transparent) !important;
  border-color: var(--danger-color, #f56c6c) !important;
  color: var(--danger-color, #f56c6c) !important;
}

/* 旋转动画 */
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 地址栏 */
.url-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  transition: border-color 0.2s;
  backdrop-filter: blur(var(--ui-blur));
}
.url-bar.is-focused {
  border-color: var(--primary-color);
}
.url-globe {
  color: var(--text-color-light);
  flex-shrink: 0;
}
.url-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--text-color);
  font-family: inherit;
}
.url-input::placeholder {
  color: var(--text-color-light);
}

/* 模式选择器 */
.mode-selector-wrap {
  flex-shrink: 0;
  outline: none;
}

.mode-btn {
  min-width: 110px;
}

.mode-arrow {
  font-size: 12px;
  transition: transform 0.2s;
  margin-left: 2px;
}

.mode-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
}

:deep(.el-dropdown-menu__item.mode-item-active) {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.mode-item.is-active {
  color: var(--primary-color);
}

.mode-item-icon {
  flex-shrink: 0;
  color: var(--text-color-light);
}

.mode-item.is-active .mode-item-icon {
  color: var(--primary-color);
}

.mode-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}

.mode-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.mode-item.is-active .mode-item-name {
  color: var(--primary-color);
}

.mode-item-desc {
  font-size: 11px;
  color: var(--text-color-light);
  white-space: normal;
}
</style>
