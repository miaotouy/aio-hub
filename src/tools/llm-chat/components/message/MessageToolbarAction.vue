<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ElTooltip,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElPopover,
} from "element-plus";
import {
  Languages,
  Check,
  BookOpen,
  Columns,
  RefreshCw,
  Variable,
} from "lucide-vue-next";
import type { ChatMessageNode } from "../../types";
import type { MessageToolbarAction } from "./messageToolbarActions";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import MessageVariableSnapshot from "./MessageVariableSnapshot.vue";

const props = defineProps<{
  action: MessageToolbarAction;
  message: ChatMessageNode;
  inMenu?: boolean;
}>();
const emit = defineEmits<{
  invoke: [];
  "translation-command": [command: string];
  "translate-click": [event: MouseEvent];
  "popup-change": [visible: boolean];
}>();
const { settings } = useChatSettings();
const popupVisible = ref(false);
function setPopupVisible(visible: boolean) {
  popupVisible.value = visible;
  emit("popup-change", visible);
}
const isTranslationVisible = computed(
  () => props.message.metadata?.translation?.visible === true
);
const hasTranslation = computed(
  () => !!props.message.metadata?.translation?.content
);
const currentTranslationMode = computed(
  () => props.message.metadata?.translation?.displayMode || "both"
);
const buttonClasses = computed(() => [
  "menu-btn",
  {
    "menu-action": props.inMenu,
    "menu-btn-active": props.action.active,
    "menu-btn-danger": props.action.danger,
  },
]);
const tooltip = computed(() =>
  props.action.id === "translate"
    ? "翻译 (按住 Shift 点击可快速翻译为 " +
      settings.value.translation.messageTargetLang +
      ")"
    : props.action.label
);
</script>

<template>
  <el-tooltip
    :content="tooltip"
    placement="top"
    :show-after="500"
    :disabled="inMenu || popupVisible"
  >
    <el-dropdown
      v-if="action.id === 'translate'"
      :persistent="false"
      trigger="click"
      placement="top"
      @command="emit('translation-command', $event)"
      @visible-change="setPopupVisible"
    >
      <div class="dropdown-trigger-wrapper">
        <button
          :class="buttonClasses"
          type="button"
          :aria-label="action.label"
          :data-action-id="action.id"
          @click="emit('translate-click', $event)"
        >
          <Languages :size="16" />
          <span v-if="inMenu">{{ action.label }}</span>
        </button>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <!-- 语言选择列表 -->
          <el-dropdown-item disabled>
            <span style="font-size: 12px; opacity: 0.7">目标语言</span>
          </el-dropdown-item>

          <el-dropdown-item
            v-for="lang in settings.translation.targetLangList"
            :key="lang"
            :command="'lang-' + lang"
          >
            <div class="dropdown-item-content">
              <span>{{ lang }}</span>
              <Check
                v-if="message.metadata?.translation?.targetLang === lang"
                :size="14"
                class="mode-active-icon"
              />
            </div>
          </el-dropdown-item>

          <!-- 分隔线 -->
          <el-dropdown-item divided disabled>
            <span style="font-size: 12px; opacity: 0.7">操作</span>
          </el-dropdown-item>

          <!-- 模式切换：切换/同时 -->
          <div class="translation-mode-switch">
            <div
              class="mode-switch-btn"
              :class="{ active: currentTranslationMode === 'translation' }"
              @click.stop="emit('translation-command', 'mode-translation')"
            >
              <BookOpen :size="14" />
              <span>切换</span>
            </div>
            <div
              class="mode-switch-btn"
              :class="{ active: currentTranslationMode === 'both' }"
              @click.stop="emit('translation-command', 'mode-both')"
            >
              <Columns :size="14" />
              <span>同时</span>
            </div>
          </div>

          <!-- 翻译开关与重试 -->
          <div class="translation-actions">
            <div
              class="action-btn translate-btn"
              :class="{ active: isTranslationVisible }"
              @click.stop="emit('translation-command', 'toggle-visible')"
            >
              <Languages :size="14" />
              <span>{{
                hasTranslation
                  ? isTranslationVisible
                    ? "隐藏"
                    : "显示"
                  : "翻译"
              }}</span>
            </div>

            <div
              class="action-btn retry-btn"
              @click.stop="emit('translation-command', 'retry')"
              title="重新翻译"
            >
              <RefreshCw :size="14" />
            </div>
          </div>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <el-popover
      v-else-if="action.id === 'variables'"
      placement="top"
      :width="320"
      trigger="click"
      popper-class="variable-snapshot-popover"
      @show="setPopupVisible(true)"
      @hide="setPopupVisible(false)"
    >
      <template #reference>
        <button
          type="button"
          :class="buttonClasses"
          :aria-label="action.label"
          :data-action-id="action.id"
        >
          <Variable :size="16" /><span v-if="inMenu">{{ action.label }}</span>
        </button>
      </template>
      <MessageVariableSnapshot
        v-if="message.metadata?.sessionVariableSnapshot"
        :snapshot="message.metadata.sessionVariableSnapshot"
      />
    </el-popover>
    <button
      v-else
      type="button"
      :class="buttonClasses"
      :disabled="action.disabled"
      :aria-label="action.label"
      :data-action-id="action.id"
      @click="emit('invoke')"
    >
      <component :is="action.icon" :size="16" /><span v-if="inMenu">{{
        action.label
      }}</span>
    </button>
  </el-tooltip>
</template>

<style scoped>
/* 翻译菜单自定义样式 */
.translation-mode-switch {
  display: flex;
  padding: 4px 8px;
  gap: 4px;
}

.mode-switch-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color-light);
  background-color: var(--bg-color);
  border: 1px solid transparent;
  transition: all 0.2s;
}

.mode-switch-btn:hover {
  background-color: var(--hover-bg);
  color: var(--text-color);
}

.mode-switch-btn.active {
  background-color: var(
    --primary-color-alpha,
    rgba(var(--primary-color-rgb), 0.1)
  );
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.translation-actions {
  display: flex;
  padding: 4px 8px 8px;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  background-color: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
}

.translate-btn {
  flex: 1;
}

.translate-btn.active {
  background-color: var(--primary-color);
  color: var(--el-color-white);
  border-color: var(--primary-color);
}

.retry-btn {
  width: 32px;
  color: var(--text-color-light);
}

.retry-btn:hover {
  color: var(--primary-color);
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--text-color-light);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.menu-btn:hover:not(:disabled) {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--text-color);
}

.menu-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-btn-active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--el-color-white);
}

.dropdown-item-content {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.mode-active-icon {
  margin-left: auto;
  color: var(--primary-color);
}

.menu-btn {
  flex-shrink: 0;
}
.menu-btn:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.menu-action {
  width: 100%;
  min-height: 32px;
  height: auto;
  padding: 7px 8px;
  justify-content: flex-start;
  gap: 10px;
  text-align: left;
  font-size: 13px;
}
.menu-action > svg {
  flex-shrink: 0;
}
.dropdown-trigger-wrapper:has(.menu-action) {
  width: 100%;
}
@media (prefers-reduced-motion: reduce) {
  .menu-btn,
  .mode-switch-btn,
  .action-btn {
    transition: none;
  }
}
.menu-action.menu-btn-active {
  color: var(--primary-color);
  background: var(--hover-bg);
}
</style>
