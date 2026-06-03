<script setup lang="ts">
import { ElPopover, ElSwitch } from "element-plus";
import { Settings } from "lucide-vue-next";
import type { InputToolbarSettings } from "../MessageInputToolbar.vue";
import { useChatSettings } from "../../../composables/settings/useChatSettings";

const props = defineProps<{
  isDetached?: boolean;
  settings: InputToolbarSettings;
}>();

const emit = defineEmits<{
  (e: "update:settings", value: InputToolbarSettings): void;
  (e: "visible-change", visible: boolean): void;
}>();

const { settings: chatSettings, updateSettings: updateChatSettings } =
  useChatSettings();

function updateSetting(
  key: keyof InputToolbarSettings,
  val: boolean | string | number
) {
  emit("update:settings", { ...props.settings, [key]: val });
}
</script>

<template>
  <el-tooltip content="工具栏设置" placement="top" :show-after="500">
    <div>
      <el-popover
        :placement="props.isDetached ? 'bottom' : 'top'"
        :width="240"
        trigger="click"
        :popper-class="[
          'toolbar-settings-popover',
          { 'detached-popover': props.isDetached },
        ]"
        @show="emit('visible-change', true)"
        @hide="emit('visible-change', false)"
      >
        <template #reference>
          <slot>
            <button class="tool-btn settings-btn">
              <Settings :size="16" />
            </button>
          </slot>
        </template>
        <div class="toolbar-settings-content">
          <div class="setting-item">
            <span class="setting-label">显示 Token 统计</span>
            <el-switch
              :model-value="props.settings.showTokenUsage"
              @update:model-value="
                (v: boolean | string | number) =>
                  updateSetting('showTokenUsage', v)
              "
              size="small"
            />
          </div>
          <div class="setting-item">
            <span class="setting-label">启用输入宏解析</span>
            <el-switch
              :model-value="props.settings.enableMacroParsing"
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
              :model-value="props.settings.extractBase64FromPaste"
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
              :model-value="props.settings.groupQuickActionsBySet"
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
              :model-value="
                chatSettings.uiPreferences.queueReplyMode === 'chained'
              "
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
        </div>
      </el-popover>
    </div>
  </el-tooltip>
</template>

<style scoped>
.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  color: var(--text-color-secondary);
  font-size: 16px;
}

.tool-btn:hover {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--text-color-primary);
}
</style>
