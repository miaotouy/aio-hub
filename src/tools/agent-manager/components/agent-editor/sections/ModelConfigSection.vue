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
import { computed, inject, ref } from "vue";
import type { ChatAgent } from "../../../types/agent";
import { useAgentModelContext } from "../../../composables/useAgentModelContext";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import ModelParametersEditor from "../../parameters/ModelParametersEditor.vue";
import {
  MODEL_PARAMETER_GROUPS,
  CONTEXT_PARAMETER_GROUPS,
} from "../../parameters/parameterEditorConfig";

const props = defineProps<{ page: "model" | "context" }>();
const editForm = inject<
  Pick<ChatAgent, "profileId" | "modelId" | "parameters"> & {
    modelCombo: string;
  }
>("agent-edit-form")!;
const { currentModel, currentProviderType, contextLengthLimit } =
  useAgentModelContext(() => editForm);
const parametersEditor = ref<InstanceType<typeof ModelParametersEditor> | null>(
  null
);
const selectedModelCombo = computed({
  get: () =>
    editForm.profileId && editForm.modelId
      ? `${editForm.profileId}:${editForm.modelId}`
      : "",
  set: (value: string) => {
    const [profileId, modelId] = value ? parseModelCombo(value) : ["", ""];
    editForm.profileId = profileId;
    editForm.modelId = modelId;
    editForm.modelCombo = value;
  },
});
defineExpose({
  revealSetting: (settingId: string) =>
    parametersEditor.value?.revealSetting(settingId),
});
</script>

<template>
  <div class="model-config-section">
    <el-form-item
      v-if="props.page === 'model'"
      label="模型"
      data-setting-id="model"
    >
      <div class="model-selector-field">
        <LlmModelSelector
          v-model="selectedModelCombo"
          :capabilities="{ embedding: false, rerank: false }"
          test-id="agent-model-selector"
          popper-class="agent-model-selector-popper"
        />
        <div class="form-hint">智能体使用的核心对话模型</div>
      </div>
    </el-form-item>
    <ModelParametersEditor
      v-if="editForm.parameters"
      ref="parametersEditor"
      v-model="editForm.parameters"
      presentation="settings"
      :groups="
        props.page === 'model'
          ? MODEL_PARAMETER_GROUPS
          : CONTEXT_PARAMETER_GROUPS
      "
      :model-id="editForm.modelId"
      :provider-type="currentProviderType"
      :capabilities="currentModel?.capabilities"
      :token-limits="currentModel?.tokenLimits"
      :context-length-limit="contextLengthLimit"
    />
  </div>
</template>

<style scoped>
.model-selector-field {
  width: 100%;
}
</style>
