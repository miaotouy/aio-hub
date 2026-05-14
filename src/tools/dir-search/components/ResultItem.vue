<template>
  <div class="result-item" :class="{ selected: isSelected }" @click="$emit('select', match)">
    <span class="result-item__line-number">{{ match.lineNumber }}</span>
    <span class="result-item__content">
      <template v-for="(part, idx) in highlightParts" :key="idx">
        <span v-if="part.isMatch" class="result-item__highlight">{{ part.text }}</span>
        <span v-else>{{ part.text }}</span>
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SearchMatch, HighlightPart } from "../types";

const props = defineProps<{
  match: SearchMatch;
  isSelected?: boolean;
}>();

defineEmits<{
  select: [match: SearchMatch];
}>();

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
</style>
