<template>
  <div
    class="result-item"
    :class="{ selected: isSelected }"
    @click="$emit('select', match)"
    @contextmenu="$emit('contextmenu', $event)"
  >
    <span class="result-item__line-number">{{ match.lineNumber }}</span>
    <el-tooltip
      :content="tooltipContent"
      :show-after="500"
      placement="top"
      popper-class="result-item-tooltip"
      :fallback-placements="['bottom', 'top']"
    >
      <span class="result-item__content">
        <template v-for="(part, idx) in highlightParts" :key="idx">
          <span v-if="part.isMatch" class="result-item__highlight">{{ part.text }}</span>
          <span v-else>{{ part.text }}</span>
        </template>
      </span>
    </el-tooltip>
    <!-- 悬停操作图标 -->
    <span class="result-item__actions">
      <el-tooltip v-if="showReplace" content="替换此匹配" placement="top" :show-after="500">
        <Replace
          :size="16"
          class="result-item__action-icon"
          @click.stop="$emit('replaceMatch')"
        />
      </el-tooltip>
      <el-tooltip content="从结果中移除" placement="top" :show-after="500">
        <X
          :size="16"
          class="result-item__action-icon result-item__action-icon--dismiss"
          @click.stop="$emit('dismiss')"
        />
      </el-tooltip>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { X, Replace } from "lucide-vue-next";
import type { SearchMatch, HighlightPart } from "../types";

const props = defineProps<{
  match: SearchMatch;
  isSelected?: boolean;
  showReplace?: boolean;
}>();

defineEmits<{
  select: [match: SearchMatch];
  dismiss: [];
  replaceMatch: [];
  contextmenu: [event: MouseEvent];
}>();

const tooltipContent = computed(() => {
  const content = props.match.lineContent;
  const MAX_LENGTH = 300;
  if (content.length <= MAX_LENGTH) return content;
  return content.slice(0, MAX_LENGTH) + `... (省略 ${content.length - MAX_LENGTH} 字符)`;
});

const highlightParts = computed<HighlightPart[]>(() => {
  const { lineContent, matchStart, matchEnd } = props.match;
  const parts: HighlightPart[] = [];

  // 截取显示范围（行内容可能很长，只显示匹配附近的内容）
  const contextChars = 60;
  const displayStart = Math.max(0, matchStart - contextChars);
  const displayEnd = Math.min(lineContent.length, matchEnd + contextChars);

  const displayContent = lineContent.slice(displayStart, displayEnd);
  const adjustedStart = matchStart - displayStart;
  const adjustedEnd = matchEnd - displayStart;

  // 前缀省略号
  const prefix = displayStart > 0 ? "…" : "";
  const suffix = displayEnd < lineContent.length ? "…" : "";

  const before = prefix + displayContent.slice(0, adjustedStart);
  const matched = displayContent.slice(adjustedStart, adjustedEnd);
  const after = displayContent.slice(adjustedEnd) + suffix;

  if (before) parts.push({ text: before, isMatch: false });
  if (matched) parts.push({ text: matched, isMatch: true });
  if (after) parts.push({ text: after, isMatch: false });

  return parts;
});
</script>

<style scoped>
.result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 8px 3px 24px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 3px;
  transition: background-color 0.1s;
  position: relative;
}

.result-item:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.06));
}

.result-item.selected {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}

.result-item__line-number {
  color: var(--el-text-color-secondary);
  font-family: monospace;
  font-size: 11px;
  min-width: 32px;
  text-align: right;
  flex-shrink: 0;
  user-select: none;
}

.result-item__content {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  color: var(--el-text-color-regular);
}

.result-item__highlight {
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  border-radius: 2px;
  padding: 0 1px;
}

/* 悬停操作图标 */
.result-item__actions {
  display: none;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  line-height: 1;
}

.result-item:hover .result-item__actions {
  display: flex;
}

.result-item__action-icon {
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
}

.result-item__action-icon:hover {
  color: var(--el-color-primary);
}

.result-item__action-icon--dismiss:hover {
  color: var(--el-color-danger);
}
</style>

<!-- Tooltip popper 样式（非 scoped，因为 popper 挂在 body 上） -->
<style>
.result-item-tooltip {
  max-width: 600px !important;
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
