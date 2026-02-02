<script setup lang="ts">
import { ref, computed } from "vue";
import { ElTooltip, ElPopover } from "element-plus";
import BranchSelector from "./BranchSelector.vue";
import {
  Copy,
  Edit,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Eye,
  EyeOff,
  Code,
  Settings2,
  Share,
} from "lucide-vue-next";
import type { MediaMessage, MediaTask } from "../../types";

interface Props {
  message: MediaMessage;
  isSending?: boolean;
  siblings: MediaMessage[];
  currentSiblingIndex: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "copy"): void;
  (e: "edit"): void;
  (e: "delete", taskId: string): void;
  (e: "download", task: MediaTask): void;
  (e: "retry", useNewBranch?: boolean, useNewModel?: boolean): void;
  (e: "toggle-enabled"): void;
  (e: "edit-raw"): void;
  (e: "export"): void;
  (e: "switch", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
}>();

// 复制状态
const copied = ref(false);

// 分支快速切换相关
const showBranchPopover = ref(false);

const task = computed(() => props.message.metadata?.taskSnapshot);

// 复制消息
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit("copy");
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error("复制失败", error);
  }
};

// 处理切换到指定分支
const handleSwitchToBranch = (nodeId: string) => {
  showBranchPopover.value = false;
  emit("switch-branch", nodeId);
};
</script>

<template>
  <div class="message-menubar">
    <!-- Branch control -->
    <div v-if="siblings.length > 1" class="branch-control">
      <el-tooltip content="上一个版本" placement="top" :show-after="500">
        <button
          class="menu-btn"
          :disabled="currentSiblingIndex === 0"
          @click="emit('switch', 'prev')"
        >
          <ChevronLeft :size="16" />
        </button>
      </el-tooltip>

      <!-- 分支选择器 Popover -->
      <el-popover
        v-model:visible="showBranchPopover"
        placement="top"
        :width="320"
        trigger="click"
        popper-class="branch-selector-popover"
      >
        <template #reference>
          <div class="branch-indicator-wrapper">
            <el-tooltip content="点击查看分支列表" placement="top" :show-after="500">
              <div
                class="branch-indicator clickable"
                :class="{ 'popover-active': showBranchPopover }"
              >
                {{ currentSiblingIndex + 1 }} / {{ siblings.length }}
              </div>
            </el-tooltip>
          </div>
        </template>
        <BranchSelector
          v-if="showBranchPopover"
          :message="message"
          :siblings="siblings"
          :current-sibling-index="currentSiblingIndex"
          @switch-branch="handleSwitchToBranch"
        />
      </el-popover>
      <el-tooltip content="下一个版本" placement="top" :show-after="500">
        <button
          class="menu-btn"
          :disabled="currentSiblingIndex === siblings.length - 1"
          @click="emit('switch', 'next')"
        >
          <ChevronRight :size="16" />
        </button>
      </el-tooltip>
    </div>
    <div v-if="siblings.length > 1" class="separator"></div>

    <!-- 重试 -->
    <div class="retry-group">
      <el-tooltip content="重试" placement="top" :show-after="500">
        <button class="menu-btn" @click="emit('retry', true, false)">
          <RotateCcw :size="16" />
        </button>
      </el-tooltip>

      <el-tooltip content="切换模型重试" placement="top" :show-after="500">
        <button class="menu-btn" @click="emit('retry', true, true)">
          <Settings2 :size="16" />
        </button>
      </el-tooltip>
    </div>

    <!-- 启用/禁用 -->
    <el-tooltip :content="message.isEnabled !== false ? '禁用 (不参与上下文)' : '启用'" placement="top" :show-after="500">
      <button class="menu-btn" @click="emit('toggle-enabled')">
        <Eye v-if="message.isEnabled !== false" :size="16" />
        <EyeOff v-else :size="16" />
      </button>
    </el-tooltip>

    <!-- 复制 -->
    <el-tooltip content="复制提示词" placement="top" :show-after="500">
      <button class="menu-btn" :class="{ 'menu-btn-active': copied }" @click="copyMessage">
        <Check v-if="copied" :size="16" />
        <Copy v-else :size="16" />
      </button>
    </el-tooltip>

    <!-- 编辑 -->
    <div class="edit-group">
      <el-tooltip content="编辑" placement="top" :show-after="500">
        <button class="menu-btn" @click="emit('edit')">
          <Edit :size="16" />
        </button>
      </el-tooltip>

      <el-tooltip content="查看/编辑 Raw 数据" placement="top" :show-after="500">
        <button class="menu-btn" @click="emit('edit-raw')">
          <Code :size="16" />
        </button>
      </el-tooltip>
    </div>

    <!-- 下载 (仅限生成的媒体) -->
    <el-tooltip
      v-if="message.role === 'assistant' && task?.status === 'completed'"
      content="下载"
      placement="top"
      :show-after="500"
    >
      <button class="menu-btn" @click.stop="task && emit('download', task)">
        <Download :size="16" />
      </button>
    </el-tooltip>

    <!-- 导出 -->
    <el-tooltip content="导出分支" placement="top" :show-after="500">
      <button class="menu-btn" @click="emit('export')">
        <Share :size="16" />
      </button>
    </el-tooltip>

    <!-- 删除 -->
    <el-tooltip content="移除" placement="top" :show-after="500">
      <button class="menu-btn menu-btn-danger" @click.stop="emit('delete', message.id)">
        <Trash2 :size="16" />
      </button>
    </el-tooltip>
  </div>
</template>

<style scoped>
.message-menubar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.branch-control,
.retry-group,
.edit-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

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
  background-color: var(--primary-color-alpha, rgba(var(--primary-color-rgb), 0.1));
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
  border: 1px solid var(--border-color);
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
  color: white;
  border-color: var(--primary-color);
}

.retry-btn {
  width: 32px;
  color: var(--text-color-light);
}

.retry-btn:hover {
  color: var(--primary-color);
}

.branch-indicator {
  font-size: 12px;
  padding: 0 4px;
  color: var(--text-color-light);
  min-width: 40px;
  text-align: center;
  white-space: nowrap;
}

.separator {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
  margin: 0 4px;
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
  transition: all 0.2s ease;
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
  color: white;
}

.menu-btn-highlight {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.menu-btn-highlight:hover:not(:disabled) {
  opacity: 0.8;
}

.menu-btn-danger:hover:not(:disabled) {
  background-color: var(--error-color);
  border-color: var(--error-color);
  color: white;
}

.menu-btn-abort {
  background-color: var(--error-color);
  color: white;
}

.menu-btn-abort:hover {
  opacity: 0.8;
}

.continue-model-icon {
  transform: scale(0.85);
  opacity: 0.8;
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

.branch-indicator.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 4px;
  user-select: none;
}

.branch-indicator.clickable:hover,
.branch-indicator.popover-active {
  background-color: var(--hover-bg);
  color: var(--text-color);
}

.dropdown-trigger-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
