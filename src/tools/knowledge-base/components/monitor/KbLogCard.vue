<script setup lang="ts">
import { ref, computed } from "vue";
import {
  ChevronRight,
  ChevronDown,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Code,
  Clock,
} from "lucide-vue-next";
import type { KbMonitorMessage } from "../../types/monitor";
import { format } from "date-fns";
import JsonDetailDrawer from "./JsonDetailDrawer.vue";

const props = defineProps<{
  message: KbMonitorMessage;
}>();

const emit = defineEmits<{
  (e: "update:expanded", el: HTMLElement | null): void;
}>();

const isExpanded = ref(false);
const cardRef = ref<HTMLElement | null>(null);
const showJson = ref(false);

const levelIcon = computed(() => {
  switch (props.message.level) {
    case "success":
      return CheckCircle2;
    case "warn":
      return AlertTriangle;
    case "error":
      return XCircle;
    default:
      return Info;
  }
});

const typeLabel = computed(() => {
  const type = props.message.type;
  switch (type) {
    case "RAG":
      return "检索";
    case "Index":
      return "索引";
    case "Chain":
      return "链式";
    case "System":
      return "系统";
    default:
      return type;
  }
});

const timeStr = computed(() => format(props.message.timestamp, "HH:mm:ss.SSS"));

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
  // 延迟发射事件，等待动画开始/结束
  setTimeout(() => {
    emit("update:expanded", cardRef.value);
  }, 0);
  // 动画结束后再次触发测量，确保高度准确
  setTimeout(() => {
    emit("update:expanded", cardRef.value);
  }, 350);
};
</script>

<template>
  <div
    ref="cardRef"
    class="kb-log-card"
    :class="[`is-${message.level}`, { 'is-expanded': isExpanded }]"
  >
    <div class="card-header" @click="toggleExpand">
      <div class="header-left">
        <component :is="isExpanded ? ChevronDown : ChevronRight" class="expand-icon" :size="16" />
        <div class="level-icon-wrapper">
          <component :is="levelIcon" class="level-icon" :size="16" />
        </div>
        <span class="timestamp">{{ timeStr }}</span>
        <el-tag
          size="small"
          :type="message.type === 'System' ? 'info' : 'primary'"
          effect="plain"
          class="type-tag"
        >
          {{ typeLabel }}
        </el-tag>
        <span class="title">{{ message.title }}</span>
      </div>

      <div class="header-right">
        <span class="summary" v-if="!isExpanded">{{ message.summary }}</span>
        <div class="actions" @click.stop>
          <el-tooltip content="查看原始数据" placement="top">
            <el-button link :icon="Code" @click="showJson = true" />
          </el-tooltip>
        </div>
      </div>
    </div>

    <el-collapse-transition>
      <div v-if="isExpanded" class="card-content">
        <div class="module-info">
          <Clock :size="12" />
          <span>模块: {{ message.module }}</span>
        </div>

        <div class="main-content">
          <slot name="content">
            <div class="default-summary">{{ message.summary }}</div>
          </slot>
        </div>
      </div>
    </el-collapse-transition>

    <JsonDetailDrawer v-model="showJson" :data="message" :title="`日志详情 - ${message.title}`" />
  </div>
</template>

<style scoped>
.kb-log-card {
  margin-bottom: 8px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: all 0.2s ease;
  backdrop-filter: blur(var(--ui-blur));
  box-sizing: border-box;
}

.kb-log-card:hover {
  border-color: var(--el-color-primary-light-5);
  background-color: rgba(var(--el-color-primary-rgb), 0.02);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  min-height: 40px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.expand-icon {
  color: var(--el-text-color-secondary);
  transition: transform 0.2s ease;
}

.level-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.is-info .level-icon {
  color: var(--el-color-info);
}
.is-success .level-icon {
  color: var(--el-color-success);
}
.is-warn .level-icon {
  color: var(--el-color-warning);
}
.is-error .level-icon {
  color: var(--el-color-danger);
}

.timestamp {
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.type-tag {
  flex-shrink: 0;
}

.title {
  font-weight: 500;
  font-size: 14px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 12px;
}

.summary {
  font-size: 13px;
  color: var(--el-text-color-regular);
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-content {
  padding: 0 12px 12px 36px;
  border-top: 1px solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.02);
}

.module-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
  margin-bottom: 8px;
}

.main-content {
  font-size: 13px;
  line-height: 1.6;
}

.default-summary {
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
}

/* 级别特定的边框色增强 */
.is-error {
  border-left: 3px solid var(--el-color-danger);
}
.is-warn {
  border-left: 3px solid var(--el-color-warning);
}
.is-success {
  border-left: 3px solid var(--el-color-success);
}
.is-info {
  border-left: 3px solid var(--el-color-info);
}
</style>
