<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { ElInputNumber, ElSwitch, ElSelect, ElOption } from "element-plus";
import {
  useMessageInputStore,
  type InputToolbarSettings,
} from "../../../stores/messageInputStore";
import { useChatSettings } from "../../../composables/settings/useChatSettings";

const emit = defineEmits<{ customize: [] }>();
const inputStore = useMessageInputStore();
const { settings: chatSettings, updateSettings: updateChatSettings } =
  useChatSettings();

function updateSetting(
  key: {
    [K in keyof InputToolbarSettings]: InputToolbarSettings[K] extends boolean
      ? K
      : never;
  }[keyof InputToolbarSettings],
  val: boolean | string | number
) {
  inputStore.settings[key] = val as boolean;
}
</script>

<template>
  <div class="input-settings-content">
    <button class="customize-link" type="button" @click="emit('customize')">
      自定义工具栏…
    </button>
    <div class="setting-item">
      <span class="setting-label">再次点击面板图标</span>
      <el-select
        v-model="inputStore.settings.panelRepeatClickAction"
        class="panel-click-action-select"
        aria-label="再次点击面板图标的行为"
        size="small"
      >
        <el-option label="折叠" value="collapse" />
        <el-option label="关闭" value="close" />
      </el-select>
    </div>
    <div class="setting-item">
      <span class="setting-label">显示 Token 统计</span>
      <el-switch
        :model-value="inputStore.settings.showTokenUsage"
        @update:model-value="
          (v: boolean | string | number) => updateSetting('showTokenUsage', v)
        "
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">启用输入宏解析</span>
      <el-switch
        :model-value="inputStore.settings.enableMacroParsing"
        @update:model-value="
          (v: boolean | string | number) =>
            updateSetting('enableMacroParsing', v)
        "
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">粘贴时提取 Base64 图像</span>
      <el-switch
        :model-value="inputStore.settings.extractBase64FromPaste"
        @update:model-value="
          (v: boolean | string | number) =>
            updateSetting('extractBase64FromPaste', v)
        "
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">快捷按钮按组分行</span>
      <el-switch
        :model-value="inputStore.settings.groupQuickActionsBySet"
        @update:model-value="
          (v: boolean | string | number) =>
            updateSetting('groupQuickActionsBySet', v)
        "
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">导入时自动转写</span>
      <el-switch
        :model-value="chatSettings.transcription.autoStartOnImport"
        @update:model-value="
          (v: boolean | string | number) =>
            updateChatSettings({
              transcription: {
                ...chatSettings.transcription,
                autoStartOnImport: v as boolean,
              },
            })
        "
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">自动插入资产占位符</span>
      <el-switch
        :model-value="chatSettings.transcription.autoInsertPlaceholder"
        @update:model-value="
          (v: boolean | string | number) =>
            updateChatSettings({
              transcription: {
                ...chatSettings.transcription,
                autoInsertPlaceholder: v as boolean,
              },
            })
        "
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">
        工具审批超时
        <el-tooltip
          content="关闭后会一直等待人工允许或拒绝，不会因审批超时自动触发后续模型调用"
          placement="top"
          :show-after="500"
        >
          <span class="info-icon">ⓘ</span>
        </el-tooltip>
      </span>
      <el-switch
        :model-value="chatSettings.uiPreferences.toolApprovalTimeoutEnabled"
        @update:model-value="
          (v: boolean | string | number) =>
            updateChatSettings({
              uiPreferences: {
                ...chatSettings.uiPreferences,
                toolApprovalTimeoutEnabled: v as boolean,
              },
            })
        "
        size="small"
      />
    </div>
    <div
      v-if="chatSettings.uiPreferences.toolApprovalTimeoutEnabled"
      class="setting-item"
    >
      <span class="setting-label">审批等待秒数</span>
      <el-input-number
        :model-value="chatSettings.uiPreferences.toolApprovalTimeoutSeconds"
        :min="5"
        :max="86400"
        :step="30"
        :precision="0"
        controls-position="right"
        size="small"
        class="approval-timeout-input"
        @update:model-value="
          (v: number | undefined) =>
            updateChatSettings({
              uiPreferences: {
                ...chatSettings.uiPreferences,
                toolApprovalTimeoutSeconds: v ?? 60,
              },
            })
        "
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">队列消息自动生成</span>
      <el-switch
        :model-value="
          chatSettings.uiPreferences.autoTriggerGenerationAfterQueue
        "
        @update:model-value="
          (v: boolean | string | number) =>
            updateChatSettings({
              uiPreferences: {
                ...chatSettings.uiPreferences,
                autoTriggerGenerationAfterQueue: v as boolean,
              },
            })
        "
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label">队列模式</span>
      <el-switch
        :model-value="chatSettings.uiPreferences.queueReplyMode === 'chained'"
        @update:model-value="
          (v: boolean | string | number) =>
            updateChatSettings({
              uiPreferences: {
                ...chatSettings.uiPreferences,
                queueReplyMode: (v as boolean) ? 'chained' : 'combined',
              },
            })
        "
        active-text="链式"
        inactive-text="合并"
        size="small"
      />
    </div>
    <div class="setting-item">
      <span class="setting-label native-hint">
        使用原生输入框
        <el-tooltip
          content="规避 Chromium 中文输入首次丢失 Bug，纯文本输入，无语法高亮"
          placement="top"
          :show-after="800"
        >
          <span class="info-icon">ⓘ</span>
        </el-tooltip>
      </span>
      <el-switch
        :model-value="chatSettings.uiPreferences.useNativeTextarea"
        @update:model-value="
          (v: boolean | string | number) =>
            updateChatSettings({
              uiPreferences: {
                ...chatSettings.uiPreferences,
                useNativeTextarea: v as boolean,
              },
            })
        "
        size="small"
      />
    </div>
  </div>
</template>

<style scoped>
.input-settings-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  column-gap: 24px;
  row-gap: 12px;
}
.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-primary);
}
.customize-link {
  width: 100%;
  padding: 0 0 8px;
  grid-column: 1 / -1;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: var(--primary-color);
  cursor: pointer;
}
.panel-click-action-select {
  width: 104px;
  flex-shrink: 0;
}
.approval-timeout-input {
  width: 104px;
}

.setting-label {
  min-width: 0;
}
.setting-item :deep(.el-switch),
.approval-timeout-input {
  flex-shrink: 0;
}
.customize-link:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
</style>
