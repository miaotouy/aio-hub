<script setup lang="ts">
import { Info, ChevronRight } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import type { LlmProfile } from "../types";

type CustomEndpoints = NonNullable<LlmProfile["customEndpoints"]>;

const { t, tRaw } = useI18n();
useKeyboardAvoidance();

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
  <var-popup
    :show="show"
    @update:show="$emit('update:show', $event)"
    position="right"
    style="width: 100%; height: 100%"
  >
    <div class="full-popup">
      <var-app-bar
        :title="tRaw('tools.llm-api.CustomEndpointsEditor.高级端点配置')"
        fixed
        safe-area
      >
        <template #left>
          <var-button round text @click="$emit('update:show', false)">
            <ChevronRight :size="24" class="back-btn" />
          </var-button>
        </template>
        <template #right>
          <var-button text @click="$emit('update:show', false)">
            {{ t("common.确认") }}
          </var-button>
        </template>
      </var-app-bar>

      <div class="popup-content">
        <div class="info-card">
          <Info :size="20" class="info-icon" />
          <div class="info-text">
            {{ tRaw("tools.llm-api.CustomEndpointsEditor.填写相对路径提示") }}
          </div>
        </div>

        <div class="form-list">
          <var-input
            :model-value="endpoints.chatCompletions"
            @update:model-value="updateField('chatCompletions', $event)"
            :label="tRaw('tools.llm-api.CustomEndpointsEditor.聊天补全 (Chat)')"
            placeholder="/v1/chat/completions"
            variant="outlined"
          />
          <var-input
            :model-value="endpoints.models"
            @update:model-value="updateField('models', $event)"
            :label="tRaw('tools.llm-api.CustomEndpointsEditor.模型列表 (Models)')"
            placeholder="/v1/models"
            variant="outlined"
          />
          <var-input
            :model-value="endpoints.embeddings"
            @update:model-value="updateField('embeddings', $event)"
            :label="tRaw('tools.llm-api.CustomEndpointsEditor.嵌入 (Embeddings)')"
            placeholder="/v1/embeddings"
            variant="outlined"
          />
          <var-input
            :model-value="endpoints.audioSpeech"
            @update:model-value="updateField('audioSpeech', $event)"
            :label="tRaw('tools.llm-api.CustomEndpointsEditor.语音合成 (TTS)')"
            placeholder="/v1/audio/speech"
            variant="outlined"
          />
          <var-input
            :model-value="endpoints.audioTranscriptions"
            @update:model-value="updateField('audioTranscriptions', $event)"
            :label="tRaw('tools.llm-api.CustomEndpointsEditor.语音转文字 (STT)')"
            placeholder="/v1/audio/transcriptions"
            variant="outlined"
          />
        </div>

        <div class="footer-actions" />
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
  /* 避让 fixed AppBar: 54px (AppBar) */
  /* 同时考虑顶部安全区域 */
  padding: calc(54px + var(--safe-area-inset-top, 0px) + 32px) 20px 20px;
  /* 软键盘避让：在键盘弹出时增加底部内边距，确保最下方的输入框不被遮挡 */
  padding-bottom: calc(20px + var(--keyboard-height, 0px));
  transition: padding-bottom 0.3s ease;
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
  padding-bottom: calc(24px + var(--safe-area-inset-bottom, 0px));
}
</style>
