<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChatSettings } from '../composables/useChatSettings';
import { useI18n } from '@/i18n';
import { ChevronLeft, RotateCcw } from 'lucide-vue-next';
import LlmModelSelector from '../../llm-api/components/LlmModelSelector.vue';

const router = useRouter();
const { tRaw } = useI18n();
const { settings, loadSettings, updateSettingItem, resetSettings } = useChatSettings();

onMounted(async () => {
  await loadSettings();
});

const handleBack = () => {
  router.back();
};

const handleReset = async () => {
  await resetSettings();
};
</script>

<template>
  <div class="chat-settings-view">
    <var-app-bar
      :title="tRaw('tools.llm-chat.common.聊天设置')"
      title-position="center"
      fixed
      safe-area
      z-index="100"
    >
      <template #left>
        <var-button round text color="transparent" @click="handleBack">
          <ChevronLeft :size="24" />
        </var-button>
      </template>
      <template #right>
        <var-button round text color="transparent" @click="handleReset">
          <RotateCcw :size="20" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="view-content">
      <!-- UI 偏好 -->
      <div class="section">
        <div class="section-title">{{ tRaw('tools.llm-chat.ChatSettingsView.界面偏好') }}</div>
        <div class="section-card">
          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.流式输出')">
            <template #extra>
              <var-switch v-model="settings.uiPreferences.isStreaming" @change="updateSettingItem('uiPreferences', { isStreaming: settings.uiPreferences.isStreaming })" />
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.显示时间戳')">
            <template #extra>
              <var-switch v-model="settings.uiPreferences.showTimestamp" @change="updateSettingItem('uiPreferences', { showTimestamp: settings.uiPreferences.showTimestamp })" />
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.显示 Token 统计')">
            <template #extra>
              <var-switch v-model="settings.uiPreferences.showTokenCount" @change="updateSettingItem('uiPreferences', { showTokenCount: settings.uiPreferences.showTokenCount })" />
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.显示模型信息')">
            <template #extra>
              <var-switch v-model="settings.uiPreferences.showModelInfo" @change="updateSettingItem('uiPreferences', { showModelInfo: settings.uiPreferences.showModelInfo })" />
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.自动滚动')">
            <template #extra>
              <var-switch v-model="settings.uiPreferences.autoScroll" @change="updateSettingItem('uiPreferences', { autoScroll: settings.uiPreferences.autoScroll })" />
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.聊天字体缩放') + ` (${Math.round(settings.uiPreferences.fontSize * 100)}%)`">
            <template #description>
              <div class="slider-container">
                <var-slider
                  v-model="settings.uiPreferences.fontSize"
                  :min="0.8"
                  :max="1.5"
                  :step="0.05"
                  @change="updateSettingItem('uiPreferences', { fontSize: settings.uiPreferences.fontSize })"
                />
              </div>
            </template>
          </var-cell>
        </div>
      </div>

      <!-- 模型偏好 -->
      <div class="section">
        <div class="section-title">{{ tRaw('tools.llm-chat.ChatSettingsView.模型偏好') }}</div>
        <div class="section-card">
          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.默认模型')">
            <template #description>
              <div class="selector-container">
                <llm-model-selector
                  v-model="settings.modelPreferences.defaultModel"
                  @update:model-value="(val) => updateSettingItem('modelPreferences', { defaultModel: val })"
                />
              </div>
            </template>
          </var-cell>
        </div>
      </div>

      <!-- 消息管理 -->
      <div class="section">
        <div class="section-title">{{ tRaw('tools.llm-chat.ChatSettingsView.消息管理') }}</div>
        <div class="section-card">
          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.删除消息前确认')">
            <template #extra>
              <var-switch v-model="settings.messageManagement.confirmBeforeDeleteMessage" @change="updateSettingItem('messageManagement', { confirmBeforeDeleteMessage: settings.messageManagement.confirmBeforeDeleteMessage })" />
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.删除会话前确认')">
            <template #extra>
              <var-switch v-model="settings.messageManagement.confirmBeforeDeleteSession" @change="updateSettingItem('messageManagement', { confirmBeforeDeleteSession: settings.messageManagement.confirmBeforeDeleteSession })" />
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.清空会话前确认')">
            <template #extra>
              <var-switch v-model="settings.messageManagement.confirmBeforeClearAll" @change="updateSettingItem('messageManagement', { confirmBeforeClearAll: settings.messageManagement.confirmBeforeClearAll })" />
            </template>
          </var-cell>
        </div>
      </div>

      <!-- 请求设置 -->
      <div class="section">
        <div class="section-title">{{ tRaw('tools.llm-chat.ChatSettingsView.请求设置') }}</div>
        <div class="section-card">
          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.请求超时时间') + ` (${settings.requestSettings.timeout / 1000}s)`">
            <template #description>
              <div class="slider-container">
                <var-slider
                  v-model="settings.requestSettings.timeout"
                  :min="10000"
                  :max="120000"
                  :step="5000"
                  @change="updateSettingItem('requestSettings', { timeout: settings.requestSettings.timeout })"
                />
              </div>
            </template>
          </var-cell>

          <var-cell :title="tRaw('tools.llm-chat.ChatSettingsView.最大重试次数') + ` (${settings.requestSettings.maxRetries})`">
            <template #description>
              <div class="slider-container">
                <var-slider
                  v-model="settings.requestSettings.maxRetries"
                  :min="0"
                  :max="5"
                  :step="1"
                  @change="updateSettingItem('requestSettings', { maxRetries: settings.requestSettings.maxRetries })"
                />
              </div>
            </template>
          </var-cell>
        </div>
      </div>

      <div class="bottom-placeholder"></div>
    </div>
  </div>
</template>

<style scoped>
.chat-settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface);
}

.view-content {
  flex: 1;
  overflow-y: auto;
  padding: 70px 16px 24px;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 13px;
  color: var(--color-primary);
  font-weight: 600;
  padding: 0 4px 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-card {
  background-color: var(--color-surface-container-high);
  border-radius: 12px;
  overflow: hidden;
}

.slider-container {
  padding: 8px 4px 12px;
}

.selector-container {
  padding: 4px 0 8px;
}

.bottom-placeholder {
  height: 40px;
}

:deep(.var-cell) {
  --cell-padding: 12px 16px;
  background-color: transparent;
  border-bottom: 1px solid var(--color-outline-variant);
}

:deep(.var-cell:last-child) {
  border-bottom: none;
}

:deep(.var-cell__title) {
  font-size: 15px;
  color: var(--color-on-surface);
}

:deep(.var-cell__description) {
  padding-top: 4px;
}
</style>