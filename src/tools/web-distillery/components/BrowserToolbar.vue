<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ArrowLeft, ArrowRight, RotateCw, Globe, Zap, Scan, Settings2, Trash2 } from "lucide-vue-next";
import { webviewBridge } from "../core/webview-bridge";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("web-distillery/toolbar");

interface Props {
  modelValue: string;
  loading?: boolean;
  activeLevel?: 0 | 1 | 2;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  activeLevel: 0,
  canGoBack: false,
  canGoForward: false,
});

const emit = defineEmits<{
  "update:modelValue": [url: string];
  fetch: [level: 0 | 1];
  navigate: [direction: "back" | "forward"];
  refresh: [];
  "open-interactive": [];
}>();

const urlInputRef = ref<HTMLInputElement | null>(null);
const isEditing = ref(false);
const localUrl = ref(props.modelValue);

const levelOptions = [
  { label: "L0 快速获取", value: 0, icon: Zap, desc: "静态页面 / API，毫秒级响应" },
  { label: "L1 智能提取", value: 1, icon: Scan, desc: "SPA / JS渲染，支持动态内容" },
  { label: "L2 交互模式", value: 2, icon: Settings2, desc: "手动操作网页，配置持久化配方" },
];

const selectedLevel = ref<0 | 1 | 2>(props.activeLevel ?? 0);
const currentLevelOption = computed(() => levelOptions.find((o) => o.value === selectedLevel.value) || levelOptions[0]);

watch(
  () => props.activeLevel,
  (newLevel: 0 | 1 | 2 | undefined) => {
    if (newLevel !== undefined) {
      selectedLevel.value = newLevel;
    }
  }
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
  const url = localUrl.value.trim();
  if (!url) return;
  const finalUrl = url.startsWith("http") ? url : `https://${url}`;
  localUrl.value = finalUrl;
  logger.debug("Triggering fetch", { url: finalUrl, level: selectedLevel.value });
  emit("update:modelValue", finalUrl);

  if (selectedLevel.value === 2) {
    emit("open-interactive");
  } else {
    emit("fetch", selectedLevel.value as 0 | 1);
  }

  urlInputRef.value?.blur();
}

function handleLevelCommand(level: 0 | 1 | 2) {
  selectedLevel.value = level;
  if (level === 2) {
    emit("open-interactive");
  }
}

async function handleForceCleanup() {
  try {
    await webviewBridge.forceCleanup();
    customMessage.success("已强制清理蒸馏环境");
    emit("refresh"); // 触发父组件刷新状态
  } catch (e) {
    logger.error("Force cleanup failed", e);
  }
}
</script>

<template>
  <div class="browser-toolbar" @click.stop>
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

    <!-- Level 选择器 -->
    <el-dropdown trigger="click" @command="handleLevelCommand">
      <div class="level-selector-wrap">
        <button class="toolbar-btn level-btn" :disabled="loading">
          <component :is="currentLevelOption.icon" :size="14" />
          <span>{{ currentLevelOption.label }}</span>
          <i-ep-arrow-down class="level-arrow" />
        </button>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="opt in levelOptions"
            :key="opt.value"
            :command="opt.value"
            :class="{ 'level-item-active': selectedLevel === opt.value }"
          >
            <div class="level-item" :class="{ 'is-active': selectedLevel === opt.value }">
              <component :is="opt.icon" :size="15" class="level-item-icon" />
              <div class="level-item-info">
                <span class="level-item-name">{{ opt.label }}</span>
                <span class="level-item-desc">{{ opt.desc }}</span>
              </div>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 终极清理 (仅在 L1/L2 模式或加载中显示) -->
    <el-tooltip content="终极强制清理 (终止并销毁所有后台进程)" placement="top">
      <button 
        class="toolbar-btn cleanup-btn" 
        @click="handleForceCleanup"
      >
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
  border-bottom: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
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

/* Level 选择器 */
.level-selector-wrap {
  flex-shrink: 0;
  outline: none;
}

.level-btn {
  min-width: 110px;
}

.level-arrow {
  font-size: 12px;
  transition: transform 0.2s;
  margin-left: 2px;
}

.level-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
}

:deep(.el-dropdown-menu__item.level-item-active) {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.level-item.is-active {
  color: var(--primary-color);
}

.level-item-icon {
  flex-shrink: 0;
  color: var(--text-color-light);
}

.level-item.is-active .level-item-icon {
  color: var(--primary-color);
}

.level-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}

.level-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.level-item.is-active .level-item-name {
  color: var(--primary-color);
}

.level-item-desc {
  font-size: 11px;
  color: var(--text-color-light);
  white-space: normal;
}
</style>
