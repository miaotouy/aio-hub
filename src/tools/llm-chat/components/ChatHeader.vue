<script setup lang="ts">
import { computed } from 'vue';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useAgentStore } from '../agentStore';
import type { ChatSession } from '../types';

interface Props {
  currentSession: ChatSession | null;
  isSending: boolean;
}

interface Emits {
  (e: 'export'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { enabledProfiles } = useLlmProfiles();
const agentStore = useAgentStore();

// 当前使用的模型信息
const currentModelInfo = computed(() => {
  if (!props.currentSession || !props.currentSession.currentAgentId) return null;
  
  const agent = agentStore.getAgentById(props.currentSession.currentAgentId);
  if (!agent) return null;
  
  const profile = enabledProfiles.value.find(p => p.id === agent.profileId);
  if (!profile) return null;
  
  const model = profile.models.find(m => m.id === agent.modelId);
  return model ? { profile, model } : null;
});
</script>

<template>
  <div class="chat-header">
    <div class="header-left">
      <h2>💬 LLM 对话</h2>
      <div v-if="currentSession" class="session-info">
        <span class="session-name">{{ currentSession.name }}</span>
        <span v-if="currentModelInfo" class="model-badge">
          {{ currentModelInfo.model.name }}
        </span>
      </div>
    </div>

    <div class="header-actions">
      <button
        v-if="currentSession"
        @click="emit('export')"
        class="btn-secondary"
        :disabled="isSending"
        title="导出为 Markdown"
      >
        💾 导出
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text-color);
}

.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-name {
  font-size: 14px;
  color: var(--text-color-light);
}

.model-badge {
  padding: 2px 8px;
  font-size: 12px;
  background-color: var(--primary-color);
  color: white;
  border-radius: 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  font-size: 14px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-hover-color);
}

.btn-secondary {
  background-color: var(--container-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--hover-bg);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>