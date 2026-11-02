<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div
    class="code-header"
    :class="{
      floating: seamless && viewMode === 'preview',
      hovered: isHovered,
    }"
  >
    <div class="language-info">
      <span class="language-tag">{{ language || "文本" }}</span>
      <span v-if="isHtml && viewMode === 'preview'" class="mode-tag"
        >预览模式</span
      >
      <span v-if="showTokenCount" class="token-info">
        {{ contentLength }} 字 / ~{{ tokenCount }} tokens
      </span>
    </div>
    <div
      class="header-actions"
      @pointerover="handlePointerOver"
      @pointerleave="hoveredButton = null"
      @focusin="handleFocusIn"
      @focusout="focusedButton = null"
      @keydown.esc="hideTooltip"
    >
      <template v-for="action in actions" :key="action.id">
        <button
          type="button"
          class="action-btn"
          :class="{ 'action-btn-active': action.active }"
          :data-code-action="action.id"
          :aria-label="action.label"
          :aria-pressed="action.pressed"
          :aria-expanded="action.expanded"
          :aria-describedby="
            tooltipVisible && tooltipAction?.id === action.id
              ? tooltipId
              : undefined
          "
          :disabled="action.disabled"
          @click="emit(action.id)"
        >
          <component :is="action.icon" :size="14" />
        </button>
        <div v-if="action.dividerAfter" class="divider"></div>
      </template>
    </div>
    <el-tooltip
      v-if="tooltipVisible && tooltipAction"
      :visible="true"
      :virtual-ref="tooltipReference"
      virtual-triggering
      :enterable="false"
      :persistent="false"
      popper-class="code-action-tooltip"
    >
      <template #content>
        <span :id="tooltipId">{{ tooltipAction.label }}</span>
      </template>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onDeactivated,
  ref,
  shallowRef,
  useId,
  watch,
  type Component,
} from "vue";
import { ElTooltip } from "element-plus";
import {
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  RotateCcw,
  WrapText,
  Eye,
  Code,
  ExternalLink,
} from "lucide-vue-next";

const props = defineProps<{
  language?: string;
  viewMode: "code" | "preview";
  isHtml: boolean;
  isExpanded: boolean;
  wordWrapEnabled: boolean;
  copied: boolean;
  codeFontSize: number;
  codeFontMin: number;
  codeFontMax: number;
  defaultCodeFontSize: number;
  fontBaselineReady: boolean;
  tokenCount: number;
  showTokenCount: boolean;
  contentLength: number;
  closed?: boolean;
  seamless?: boolean;
  isHovered?: boolean;
}>();

type CodeAction =
  | "toggle-view-mode"
  | "open-dialog-preview"
  | "decrease-font"
  | "reset-font"
  | "increase-font"
  | "toggle-word-wrap"
  | "copy-code"
  | "toggle-expand";
const emit = defineEmits<(event: CodeAction) => void>();
interface HeaderAction {
  id: CodeAction;
  label: string;
  icon: Component;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  dividerAfter?: boolean;
}
const actions = computed<HeaderAction[]>(() => [
  ...(props.isHtml
    ? [
        {
          id: "toggle-view-mode" as const,
          label: props.viewMode === "preview" ? "查看源码" : "预览 HTML",
          icon: props.viewMode === "preview" ? Code : Eye,
          active: props.viewMode === "preview",
          pressed: props.viewMode === "preview",
        },
        {
          id: "open-dialog-preview" as const,
          label: props.closed === false ? "内容生成中..." : "在弹窗中预览",
          icon: ExternalLink,
          disabled: props.closed === false,
          dividerAfter: true,
        },
      ]
    : []),
  {
    id: "decrease-font",
    label: "减小字体",
    icon: Minus,
    disabled: props.codeFontSize <= props.codeFontMin,
  },
  {
    id: "reset-font",
    label: "重置字体大小",
    icon: RotateCcw,
    disabled:
      !props.fontBaselineReady ||
      props.codeFontSize === props.defaultCodeFontSize,
  },
  {
    id: "increase-font",
    label: "增大字体",
    icon: Plus,
    disabled: props.codeFontSize >= props.codeFontMax,
  },
  {
    id: "toggle-word-wrap",
    label: props.wordWrapEnabled ? "禁用换行" : "启用换行",
    icon: WrapText,
    active: props.wordWrapEnabled,
    pressed: props.wordWrapEnabled,
  },
  {
    id: "copy-code",
    label: props.copied ? "已复制" : "复制代码",
    icon: props.copied ? Check : Copy,
    active: props.copied,
  },
  {
    id: "toggle-expand",
    label: props.isExpanded ? "折叠" : "展开",
    icon: props.isExpanded ? Minimize2 : Maximize2,
    expanded: props.isExpanded,
  },
]);

// 所有操作共用交互时才创建的提示层，按钮本身始终保留。
const hoveredButton = shallowRef<HTMLButtonElement | null>(null);
const focusedButton = shallowRef<HTMLButtonElement | null>(null);
const tooltipButton = computed(
  () => hoveredButton.value ?? focusedButton.value
);
const tooltipAction = computed(() =>
  actions.value.find(
    (action) => action.id === tooltipButton.value?.dataset.codeAction
  )
);
const tooltipVisible = ref(false);
const tooltipId = useId();
let tooltipTimer: ReturnType<typeof setTimeout> | undefined;
// 只向 Popper 提供定位信息。触发器的 ARIA 与键盘行为由按钮自身管理。
const tooltipReference = computed(() => {
  const button = tooltipButton.value;
  return button
    ? {
        getBoundingClientRect: () => button.getBoundingClientRect(),
        contextElement: button,
      }
    : undefined;
});
function actionButton(event: Event): HTMLButtonElement | null {
  const button =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("button[data-code-action]")
      : null;
  return event.currentTarget instanceof Element &&
    button &&
    event.currentTarget.contains(button)
    ? button
    : null;
}
function handlePointerOver(event: PointerEvent) {
  if (event.pointerType !== "touch") hoveredButton.value = actionButton(event);
}
function handleFocusIn(event: FocusEvent) {
  hoveredButton.value = null;
  focusedButton.value = actionButton(event);
}
function hideTooltip() {
  if (tooltipTimer !== undefined) clearTimeout(tooltipTimer);
  tooltipTimer = undefined;
  tooltipVisible.value = false;
}
watch(tooltipButton, (button) => {
  hideTooltip();
  if (button)
    tooltipTimer = setTimeout(() => {
      tooltipTimer = undefined;
      tooltipVisible.value = button.isConnected;
    }, 300);
});
function resetTooltip() {
  hoveredButton.value = null;
  focusedButton.value = null;
  hideTooltip();
}
watch(() => props.isHtml, resetTooltip);
onDeactivated(resetTooltip);
onBeforeUnmount(hideTooltip);
</script>

<style scoped>
.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--code-block-bg, var(--card-bg));
  backdrop-filter: blur(var(--ui-blur, 10px));
  flex-shrink: 0;
  border-radius: 6px 6px 0 0;
}

/* 悬浮 Header 模式 */
.code-header.floating {
  position: absolute;
  top: -40px;
  height: 40px;
  left: 0;
  right: 0;
  padding: 0 8px 4px 8px;
  background-color: transparent;
  backdrop-filter: none;
  pointer-events: none;
  z-index: 10;
  justify-content: flex-end;
  align-items: flex-end;
  border-radius: 0;
}

.code-header.floating .language-info {
  display: none;
}

.code-header.floating .header-actions {
  background-color: var(--el-bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
  box-shadow: var(--el-box-shadow-light);
  pointer-events: auto;
  opacity: 0;
  transform: translateY(5px);
  transition: all 0.2s ease-in-out;
  position: relative;
}

.code-header.floating .header-actions::after {
  content: "";
  position: absolute;
  bottom: -15px;
  left: 0;
  right: 0;
  height: 20px;
  background: transparent;
  z-index: -1;
}

/* 桥接层逻辑通过 isHovered prop 控制 */
.code-header.floating.hovered .header-actions {
  opacity: 1;
  transform: translateY(0);
}

.language-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.language-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.mode-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}

.token-info {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  opacity: 0.6;
  font-family: var(--el-font-family-mono);
  margin-left: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  opacity: 0;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-btn:hover:not(:disabled) {
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.action-btn:hover:not(:disabled)::before {
  opacity: 1;
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.2)
  );
  color: var(--el-color-primary);
}

.action-btn-active::before {
  display: none;
}

.action-btn-active:hover:not(:disabled) {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.35)
  );
  box-shadow: 0 2px 8px rgba(var(--el-color-primary-rgb), 0.2);
}

.divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color);
  margin: 0 4px;
}
</style>
