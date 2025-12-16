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
const clipboardSource = computed(() => props.content);
const { copy, copied } = useClipboard({ source: clipboardSource });

const handleClick = async () => {
  const llmChatService = getChatService();

  switch (props.action) {
    case "input":
      if (llmChatService) {
        llmChatService.addContentToInput(props.content);
      } else {
        customMessage.warning("聊天服务不可用");
      }
      break;
    case "send":
      if (llmChatService) {
        await llmChatService.sendMessage(props.content);
      } else {
        customMessage.warning("聊天服务不可用");
      }
      break;
    case "copy":
      await copy();
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
    :class="{ 'action-button': !props.style, [`action-${props.action}`]: !props.style }"
    :style="props.style"
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
  border: 2px solid var(--primary-color);
}
</style>
