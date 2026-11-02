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
import { ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import {
  assetDescriptionSettingsManager,
  DEFAULT_ASSET_DESCRIPTION_PROMPT,
} from "../../services/agentAssetDescriptionSettings";
import {
  getAssetDescriptionBindings,
  type AssetDescriptionBinding,
} from "../../services/agentAssetDescriptionService";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "open-transcription-settings"): void;
}>();
const errorHandler = createModuleErrorHandler("AssetDescriptionSettings");
const prompt = ref(DEFAULT_ASSET_DESCRIPTION_PROMPT);
const bindings = ref<AssetDescriptionBinding[]>([]);
const loading = ref(false);
const saving = ref(false);
let loadVersion = 0;
watch(
  () => props.modelValue,
  async (visible) => {
    const version = ++loadVersion;
    if (!visible) return;
    loading.value = true;
    bindings.value = [];
    try {
      const [settings, models] = await Promise.all([
        assetDescriptionSettingsManager.load(),
        getAssetDescriptionBindings(),
      ]);
      if (version !== loadVersion) return;
      prompt.value = settings.prompt;
      bindings.value = models;
    } catch (error) {
      if (version === loadVersion)
        errorHandler.error(error, "加载描述生成设置失败");
    } finally {
      if (version === loadVersion) loading.value = false;
    }
  }
);
const save = async () => {
  if (!prompt.value.trim() || saving.value) return;
  saving.value = true;
  try {
    await assetDescriptionSettingsManager.save({ prompt: prompt.value.trim() });
    customMessage.success("描述提示词已保存");
    emit("update:modelValue", false);
  } catch (error) {
    errorHandler.error(error, "保存描述提示词失败");
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="描述生成设置"
    width="560px"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="binding-header">
      <span>模型跟随转写配置</span>
      <el-button
        link
        type="primary"
        @click="emit('open-transcription-settings')"
        >打开转写设置</el-button
      >
    </div>
    <div class="model-bindings">
      <div
        v-for="binding in bindings"
        :key="binding.type"
        class="model-binding"
      >
        <span class="type-label">{{ binding.label }}</span>
        <div>
          <div>{{ binding.modelLabel }}</div>
          <div v-if="binding.error" class="binding-error">
            {{ binding.error }}
          </div>
        </div>
      </div>
    </div>
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item label="描述提示词">
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="8"
          :maxlength="4000"
          show-word-limit
          aria-label="描述提示词"
          placeholder="描述需要关注的内容、语言和长度"
        />
      </el-form-item>
    </el-form>
    <div class="settings-note">
      所有智能体共用此提示词。生成时，资产内容会发送给对应的转写模型。
    </div>
    <template #footer>
      <el-button
        :disabled="loading || saving"
        @click="prompt = DEFAULT_ASSET_DESCRIPTION_PROMPT"
        >恢复默认</el-button
      >
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="loading || !prompt.trim()"
        @click="save"
        >保存</el-button
      >
    </template>
  </BaseDialog>
</template>

<style scoped>
.binding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
}
.model-bindings {
  margin-bottom: 20px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.model-binding {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px;
  padding: 7px 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.type-label,
.settings-note {
  color: var(--el-text-color-secondary);
}
.binding-error {
  color: var(--el-color-warning);
  font-size: 12px;
  margin-top: 3px;
}
.settings-note {
  font-size: 12px;
  line-height: 1.6;
}
</style>
