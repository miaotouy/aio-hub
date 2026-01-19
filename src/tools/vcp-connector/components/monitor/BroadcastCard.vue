<template>
  <div
    class="broadcast-card"
    :class="[`type-${message.type.toLowerCase()}`]"
    @click="$emit('click')"
  >
    <div class="card-header">
      <span class="type-icon">
        <Database v-if="message.type === 'RAG_RETRIEVAL_DETAILS'" />
        <GitBranch v-else-if="message.type === 'META_THINKING_CHAIN'" />
        <MessageSquare
          v-else-if="message.type === 'AGENT_PRIVATE_CHAT_PREVIEW'"
        />
        <StickyNote v-else-if="message.type === 'AI_MEMO_RETRIEVAL'" />
        <Cpu v-else-if="message.type === 'PLUGIN_STEP_STATUS'" />
        <HelpCircle v-else />
      </span>
      <span class="type-label">{{ typeLabel }}</span>
      <span class="timestamp">{{ formattedTime }}</span>
    </div>

    <div class="card-body">
      <template v-if="message.type === 'RAG_RETRIEVAL_DETAILS'">
        <RagCardContent 
          :message="message as RagRetrievalMessage" 
          @show-json="onShowJson"
        />
      </template>

      <template v-else-if="message.type === 'META_THINKING_CHAIN'">
        <ChainCardContent 
          :message="message as ThinkingChainMessage" 
          @show-json="onShowJson"
        />
      </template>

      <template v-else-if="message.type === 'AGENT_PRIVATE_CHAT_PREVIEW'">
        <AgentCardContent 
          :message="message as AgentChatPreviewMessage" 
          @show-json="onShowJson"
        />
      </template>

      <template v-else-if="message.type === 'AI_MEMO_RETRIEVAL'">
        <MemoCardContent 
          :message="message as AiMemoRetrievalMessage" 
          @show-json="onShowJson"
        />
      </template>

      <template v-else-if="message.type === 'PLUGIN_STEP_STATUS'">
        <PluginCardContent 
          :message="message as PluginStepStatusMessage" 
          @show-json="onShowJson"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import {
  Database,
  GitBranch,
  MessageSquare,
  StickyNote,
  Cpu,
  HelpCircle,
} from "lucide-vue-next";
import type {
  VcpMessage,
  RagRetrievalMessage,
  ThinkingChainMessage,
  AgentChatPreviewMessage,
  AiMemoRetrievalMessage,
  PluginStepStatusMessage,
} from "../../types/protocol";

const RagCardContent = defineAsyncComponent(
  () => import("./RagCardContent.vue"),
);
const ChainCardContent = defineAsyncComponent(
  () => import("./ChainCardContent.vue"),
);
const AgentCardContent = defineAsyncComponent(
  () => import("./AgentCardContent.vue"),
);
const MemoCardContent = defineAsyncComponent(
  () => import("./MemoCardContent.vue"),
);
const PluginCardContent = defineAsyncComponent(
  () => import("./PluginCardContent.vue"),
);

const props = defineProps<{
  message: VcpMessage;
}>();

const emit = defineEmits<{
  click: [];
  "show-json": [message: any];
}>();

function onShowJson(msg: any) {
  emit("show-json", msg);
}

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    RAG_RETRIEVAL_DETAILS: "RAG 检索",
    META_THINKING_CHAIN: "思考链",
    AGENT_PRIVATE_CHAT_PREVIEW: "Agent 私聊",
    AI_MEMO_RETRIEVAL: "记忆回溯",
    PLUGIN_STEP_STATUS: "插件步骤",
  };
  return labels[props.message.type] || "未知";
});

const formattedTime = computed(() => {
  return new Date(props.message.timestamp).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});
</script>

<style scoped lang="css">
.broadcast-card {
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  backdrop-filter: blur(var(--ui-blur));
  cursor: default;
  transition: all 0.2s;
  overflow: hidden;
}

.broadcast-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.broadcast-card {
  animation: jelly-in 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

@keyframes jelly-in {
  0% { opacity: 0; transform: translateY(20px) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.broadcast-card.type-rag {
  border-left: 3px solid #3498db;
}

.broadcast-card.type-meta_thinking_chain {
  border-left: 3px solid #9b59b6;
}

.broadcast-card.type-agent_private_chat_preview {
  border-left: 3px solid #f1c40f;
}

.broadcast-card.type-ai_memo_retrieval {
  border-left: 3px solid #1abc9c;
}

.broadcast-card.type-plugin_step_status {
  border-left: 3px solid #34495e;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-bg-color-page) 50%, transparent);
}

.type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.type-rag .type-icon {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}

.type-meta_thinking_chain .type-icon {
  background: rgba(155, 89, 182, 0.15);
  color: #9b59b6;
}

.type-agent_private_chat_preview .type-icon {
  background: rgba(241, 196, 15, 0.15);
  color: #f1c40f;
}

.type-ai_memo_retrieval .type-icon {
  background: rgba(26, 188, 156, 0.15);
  color: #1abc9c;
}

.type-plugin_step_status .type-icon {
  background: rgba(52, 73, 94, 0.15);
  color: #34495e;
}

.type-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 1;
}

.timestamp {
  font-size: 11px;
  color: var(--el-text-color-tertiary);
  font-family: "Consolas", "Monaco", monospace;
}

.card-body {
  padding: 12px;
}
</style>
