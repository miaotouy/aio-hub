<script setup lang="ts">
import { computed } from "vue";
import { Bot, Check, User } from "lucide-vue-next";
import type { ChatMessageNode } from "../types";

const props = defineProps<{
  show: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "switch-branch", nodeId: string): void;
}>();

const visible = computed({
  get: () => props.show,
  set: (value) => emit("update:show", value),
});

const getPreview = (message: ChatMessageNode) => {
  const text = message.content.replace(/\s+/g, " ").trim();
  if (text) return text.length > 92 ? `${text.slice(0, 92)}...` : text;
  if (message.status === "generating") return "生成中...";
  if (message.status === "error") return message.metadata?.error || "发送失败";
  return "空消息";
};

const formatTime = (timestamp?: string) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const handleSwitch = (nodeId: string) => {
  emit("switch-branch", nodeId);
  emit("update:show", false);
};
</script>

<template>
  <var-popup v-model:show="visible" position="bottom" round>
    <div class="branch-selector">
      <div class="drawer-handle"></div>
      <div class="selector-header">
        <div class="title">选择分支</div>
        <div class="count">
          {{ currentSiblingIndex + 1 }} / {{ siblings.length }}
        </div>
      </div>

      <div class="branch-list">
        <button
          v-for="(sibling, index) in siblings"
          :key="sibling.id"
          class="branch-item"
          :class="{ active: index === currentSiblingIndex }"
          @click="handleSwitch(sibling.id)"
        >
          <div class="branch-avatar">
            <User v-if="sibling.role === 'user'" :size="16" />
            <Bot v-else :size="16" />
          </div>

          <div class="branch-body">
            <div class="branch-meta">
              <span class="branch-title">
                {{ sibling.role === "user" ? "用户消息" : "助手回复" }}
                #{{ index + 1 }}
              </span>
              <span v-if="formatTime(sibling.timestamp)" class="branch-time">
                {{ formatTime(sibling.timestamp) }}
              </span>
            </div>
            <div class="branch-preview">{{ getPreview(sibling) }}</div>
          </div>

          <Check
            v-if="index === currentSiblingIndex"
            class="active-icon"
            :size="18"
          />
        </button>
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.branch-selector {
  max-height: min(72vh, 560px);
  padding: 10px 14px calc(18px + env(safe-area-inset-bottom));
  background: var(--card-bg);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
}

.drawer-handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--border-color);
  align-self: center;
  margin-bottom: 12px;
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 12px;
}

.title {
  font-size: 1rem;
  font-weight: 700;
}

.count {
  color: var(--text-color-secondary);
  font-size: 0.82rem;
}

.branch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.branch-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  color: inherit;
  text-align: left;
}

.branch-item.active {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary), transparent 90%);
}

.branch-avatar {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--card-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.branch-body {
  min-width: 0;
  flex: 1;
}

.branch-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.branch-title {
  font-size: 0.86rem;
  font-weight: 600;
}

.branch-time {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}

.branch-preview {
  color: var(--text-color-secondary);
  font-size: 0.82rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.active-icon {
  margin-top: 5px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}
</style>
