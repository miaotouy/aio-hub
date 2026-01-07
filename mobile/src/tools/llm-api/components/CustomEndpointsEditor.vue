<script setup lang="ts">
import { Info, ChevronRight } from "lucide-vue-next";
import type { LlmProfile } from "../types";

type CustomEndpoints = NonNullable<LlmProfile['customEndpoints']>;

const props = defineProps<{
  show: boolean;
  endpoints: CustomEndpoints;
}>();

const emit = defineEmits<{
  (e: "update:show", val: boolean): void;
  (e: "update:endpoints", val: CustomEndpoints): void;
}>();

const updateField = (key: keyof CustomEndpoints, val: string) => {
  emit("update:endpoints", { ...props.endpoints, [key]: val });
};
</script>

<template>
  <var-popup :show="show" @update:show="$emit('update:show', $event)" position="right" style="width: 100%; height: 100%">
    <div class="full-popup">
      <var-app-bar title="高级端点配置" safe-area>
        <template #left>
          <var-button round text @click="$emit('update:show', false)">
            <ChevronRight :size="24" class="back-btn" />
          </var-button>
        </template>
      </var-app-bar>
      
      <div class="popup-content">
        <div class="info-card">
          <Info :size="20" class="info-icon" />
          <div class="info-text">填写相对路径(如 /v1/chat)将拼接到基础地址，填写完整 URL 则直接使用。留空则使用默认。</div>
        </div>

        <div class="form-list">
          <var-input 
            :model-value="endpoints.chatCompletions" 
            @update:model-value="updateField('chatCompletions', $event)"
            label="聊天补全 (Chat)" 
            placeholder="/v1/chat/completions" 
            variant="outlined" 
          />
          <var-input 
            :model-value="endpoints.models" 
            @update:model-value="updateField('models', $event)"
            label="模型列表 (Models)" 
            placeholder="/v1/models" 
            variant="outlined" 
          />
          <var-input 
            :model-value="endpoints.embeddings" 
            @update:model-value="updateField('embeddings', $event)"
            label="嵌入 (Embeddings)" 
            placeholder="/v1/embeddings" 
            variant="outlined" 
          />
          <var-input 
            :model-value="endpoints.audioSpeech" 
            @update:model-value="updateField('audioSpeech', $event)"
            label="语音合成 (TTS)" 
            placeholder="/v1/audio/speech" 
            variant="outlined" 
          />
          <var-input 
            :model-value="endpoints.audioTranscriptions" 
            @update:model-value="updateField('audioTranscriptions', $event)"
            label="语音转文字 (STT)" 
            placeholder="/v1/audio/transcriptions" 
            variant="outlined" 
          />
        </div>
        
        <div class="footer-actions">
          <var-button block type="primary" @click="$emit('update:show', false)">确定</var-button>
        </div>
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.full-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.back-btn {
  transform: rotate(180deg);
}

.popup-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.info-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: var(--color-primary-container);
  color: var(--color-primary);
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 32px;
}

.info-icon {
  flex-shrink: 0;
}

.form-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.footer-actions {
  margin-top: 48px;
  padding-bottom: 24px;
}
</style>