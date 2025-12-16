<script setup lang="ts">
import { computed } from "vue";
import { useClipboard } from "@vueuse/core";
import { toolRegistryManager } from "@/services/registry";
import type LlmChatRegistry from "@/tools/llm-chat/llmChat.registry";
import customMessage from "@/utils/customMessage";

const props = defineProps<{
  nodeId: string;
  label: string;
  content: string;
  action: "send" | "input" | "copy";
  style?: string;
}>();

// 通过 Registry 获取服务实例，避免直接依赖内部实现
const getChatService = () => toolRegistryManager.getRegistry<LlmChatRegistry>("llm-chat");
// 使用 computed 确保响应式
// 只有在 copy 时才使用原始 content，其他操作使用 safeContent
const clipboardSource = computed(() => props.content);
const { copy, copied } = useClipboard({ source: clipboardSource });

// 安全过滤内容：防止控制字符和超长文本
const safeContent = computed(() => {
  if (!props.content) return "";

  // 1. 长度限制：防止超长文本导致 UI 卡死或 DOS
  const MAX_LENGTH = 5000;
  let content = props.content;
  if (content.length > MAX_LENGTH) {
    content = content.slice(0, MAX_LENGTH);
    customMessage.warning("内容过长，已自动截断");
  }

  // 2. 过滤控制字符：保留换行(\n, \r)和制表符(\t)，移除其他不可见控制字符
  // ASCII 0-31 中，9是\t, 10是\n, 13是\r
  return content.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
});

// 安全过滤样式：防止 position: fixed 等覆盖主应用
const safeStyle = computed(() => {
  if (!props.style) return undefined;

  // 简单的分号分割解析（不使用复杂的 CSS Parser 以保持轻量）
  // 移除 position, z-index, top, left, right, bottom 等可能导致脱离文档流的属性
  return (
    props.style
      .split(";")
      .filter((rule) => {
        const [key] = rule.split(":");
        if (!key) return false;
        const trimmedKey = key.trim().toLowerCase();
        // 禁止定位属性和过大的层级
        return !["position", "z-index", "top", "left", "right", "bottom"].includes(trimmedKey);
      })
      .join(";") + "; position: relative; z-index: 0;"
  ); // 强制重置为安全值
});

const handleClick = async () => {
  const llmChatService = getChatService();

  switch (props.action) {
    case "input":
      if (llmChatService) {
        llmChatService.addContentToInput(safeContent.value);
      } else {
        customMessage.warning("聊天服务不可用");
      }
      break;
    case "send":
      if (llmChatService) {
        await llmChatService.sendMessage(safeContent.value);
      } else {
        customMessage.warning("聊天服务不可用");
      }
      break;
    case "copy":
      await copy();
      if (copied.value) {
        customMessage.success("已复制到剪贴板");
      }
      break;
  }
};

const iconMap = {
  send: "⚡",
  input: "📝",
  copy: "📋",
};

const titleMap = {
  send: "点击直接发送",
  input: "点击插入到输入框",
  copy: "点击复制内容",
};
</script>

<template>
  <button
    :class="[
      'hover-effect',
      { 'action-button': !props.style, [`action-${props.action}`]: !props.style },
    ]"
    :style="safeStyle"
    :title="titleMap[props.action]"
    @click="handleClick"
  >
    <!-- 如果没有内联样式，使用带图标的默认布局 -->
    <template v-if="!props.style">
      <span class="action-icon">
        <template v-if="props.action === 'copy' && copied">✅</template>
        <template v-else>{{ iconMap[props.action] }}</template>
      </span>
      <span class="action-label">{{ props.label }}</span>
    </template>
    <!-- 如果有内联样式，只显示文本内容，完全由 style 控制外观 -->
    <template v-else>
      {{ props.label }}
    </template>
  </button>
</template>

<style scoped>
.hover-effect {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
}

.hover-effect:hover {
  transform: translateY(-2px);
  z-index: 1;
}

.action-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  margin: 2px 4px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--primary-color);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  vertical-align: middle;
}
.action-button:hover {
  border: 1px solid var(--primary-color);
}
</style>
