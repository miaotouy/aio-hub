<template>
  <section class="input-panel">
    <div class="panel-header">
      <div class="language-row">
        <el-select
          v-model="store.sourceLang"
          class="language-select"
          :disabled="store.isTranslating"
          teleported
        >
          <el-option
            v-for="language in sourceLanguageOptions"
            :key="language.value"
            :label="language.label"
            :value="language.value"
          />
        </el-select>

        <el-button
          class="icon-button"
          :icon="ArrowLeftRight"
          :disabled="store.sourceLang === 'auto' || store.isTranslating"
          @click="store.swapLanguages"
        />

        <el-select
          v-model="store.targetLang"
          class="language-select"
          :disabled="store.isTranslating"
          teleported
        >
          <el-option
            v-for="language in targetLanguageOptions"
            :key="language.value"
            :label="language.label"
            :value="language.value"
          />
        </el-select>
      </div>
    </div>

    <el-input
      v-model="store.inputText"
      class="source-input"
      type="textarea"
      resize="none"
      :autosize="false"
      :disabled="store.isTranslating"
      placeholder="粘贴要翻译的文本"
      @keydown.ctrl.enter.prevent="store.translate"
    />

    <div class="channel-section">
      <div class="section-title">
        <span>渠道</span>
        <el-button
          class="icon-button"
          :icon="Plus"
          :disabled="store.activeChannels.length >= 4 || store.isTranslating"
          @click="store.addChannel"
        />
      </div>

      <div class="channel-list">
        <div
          v-for="(channel, index) in store.activeChannels"
          :key="channel.id"
          class="channel-item"
        >
          <span class="channel-index">{{ index + 1 }}</span>
          <LlmModelSelector
            :model-value="`${channel.profileId}:${channel.modelId}`"
            :capabilities="modelCapabilities"
            :disabled="store.isTranslating"
            placeholder="选择文本模型"
            popper-class="translator-model-select"
            @update:model-value="
              (value) => handleChannelModelChange(channel.id, value)
            "
          />
          <el-button
            class="icon-button"
            :icon="X"
            :disabled="store.activeChannels.length <= 1 || store.isTranslating"
            @click="store.removeChannel(channel.id)"
          />
        </div>
      </div>
    </div>

    <div class="actions">
      <el-button
        v-if="store.isTranslating"
        :icon="Square"
        @click="store.abortAll"
      >
        停止全部
      </el-button>
      <el-button
        v-else
        type="primary"
        :icon="Play"
        :disabled="!canTranslate"
        @click="store.translate"
      >
        翻译
      </el-button>
      <el-button
        :icon="Trash2"
        :disabled="store.isTranslating"
        @click="store.clearInput"
      >
        清空
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeftRight, Play, Plus, Square, Trash2, X } from "lucide-vue-next";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import type { ModelCapabilities } from "@/types/llm-profiles";
import { TRANSLATOR_LANGUAGES } from "../constants";
import { useTranslatorStore } from "../composables/useTranslatorStore";

const store = useTranslatorStore();

const modelCapabilities: Partial<ModelCapabilities> = {
  embedding: false,
  rerank: false,
  imageGeneration: false,
  videoGeneration: false,
  audioGeneration: false,
  musicGeneration: false,
};

const sourceLanguageOptions = TRANSLATOR_LANGUAGES;
const targetLanguageOptions = TRANSLATOR_LANGUAGES.filter(
  (language) => language.value !== "auto"
);

const canTranslate = computed(() => {
  return (
    store.inputText.trim().length > 0 &&
    store.hasConfiguredChannels &&
    !store.isTranslating
  );
});

function handleChannelModelChange(channelId: string, value: string) {
  const [profileId, modelId] = parseModelCombo(value);
  if (!profileId || !modelId) return;
  store.updateChannelModel(channelId, profileId, modelId);
}
</script>

<style scoped>
.input-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-right: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

.panel-header {
  padding: 14px 14px 10px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.language-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.language-select {
  min-width: 0;
}

.icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
  flex-shrink: 0;
}

.source-input {
  flex: 1;
  min-height: 200px;
  padding: 14px;
  box-sizing: border-box;
}

.source-input:deep(.el-textarea__inner) {
  height: 100% !important;
  min-height: 200px !important;
  box-shadow: none;
  border: var(--border-width) solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  line-height: 1.65;
  font-size: 14px;
  border-radius: 8px;
}

.channel-section {
  border-top: var(--border-width) solid var(--border-color);
  padding: 12px 14px 14px;
  background: var(--sidebar-bg);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--text-color-secondary);
  font-size: 13px;
  font-weight: 600;
}

.channel-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.channel-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 32px;
  gap: 8px;
  align-items: center;
}

.channel-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 700;
  border: var(--border-width) solid var(--border-color);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-top: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

@media (max-width: 860px) {
  .input-panel {
    height: auto;
    border-right: 0;
    border-bottom: var(--border-width) solid var(--border-color);
  }

  .source-input {
    min-height: 240px;
  }
}
</style>

