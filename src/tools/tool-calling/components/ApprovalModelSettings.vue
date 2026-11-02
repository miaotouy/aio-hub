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
import { computed, onMounted, ref, watch } from "vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import {
  getDecisionChannelSettings,
  loadDecisionChannelSettings,
  saveDecisionChannelSettings,
} from "@/services/decision-arbiter/channelConfig";
import type { DecisionEngine } from "@/services/decision-arbiter/types";
import { LLM_APPROVAL_MODEL_CAPABILITIES } from "@/services/decision-arbiter/llmApproval";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const emit = defineEmits<{ "engine-change": [engine: DecisionEngine] }>();
const errorHandler = createModuleErrorHandler(
  "tool-calling/approval-model-settings"
);

const decisionChannelSettings = ref({
  ...getDecisionChannelSettings(),
});
const decisionEngine = computed<DecisionEngine>({
  get: () => decisionChannelSettings.value.engine ?? "jev",
  set: (engine) => {
    if (engine === decisionEngine.value) return;
    decisionChannelSettings.value = {
      ...decisionChannelSettings.value,
      engine,
      profileId: null,
      model: engine === "jev" ? "jev-latest" : "",
      timeoutMs: engine === "jev" ? 8_000 : 30_000,
    };
  },
});
const decisionTimeoutSeconds = computed({
  get: () => decisionChannelSettings.value.timeoutMs / 1_000,
  set: (seconds: number) => {
    decisionChannelSettings.value.timeoutMs = seconds * 1_000;
  },
});
const decisionChannelCombo = computed<string>({
  get: () => {
    const { profileId, model } = decisionChannelSettings.value;
    return profileId ? `${profileId}:${model}` : "";
  },
  set: (combo) => {
    if (!combo) {
      decisionChannelSettings.value = {
        ...decisionChannelSettings.value,
        profileId: null,
      };
      return;
    }
    const sepIndex = combo.indexOf(":");
    decisionChannelSettings.value = {
      ...decisionChannelSettings.value,
      profileId: combo.slice(0, sepIndex),
      model: combo.slice(sepIndex + 1),
    };
  },
});
const isDecisionChannelSaving = ref(false);
const isLoading = ref(true);

watch(decisionEngine, (engine) => emit("engine-change", engine), {
  immediate: true,
});

const handleSaveDecisionChannel = async () => {
  isDecisionChannelSaving.value = true;
  try {
    await saveDecisionChannelSettings(decisionChannelSettings.value);
    customMessage.success("审批模型配置已保存");
  } catch (error) {
    errorHandler.error(error, "保存审批模型配置失败");
  } finally {
    isDecisionChannelSaving.value = false;
  }
};

onMounted(async () => {
  try {
    decisionChannelSettings.value = {
      ...(await loadDecisionChannelSettings()),
    };
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <section
    class="approval-model-settings"
    data-testid="approval-model-settings"
  >
    <h4 class="approval-model-title">审批模型（全局）</h4>
    <p class="form-hint">
      所有启用 AI 自动审批的智能体共用此配置，保存后立即生效。
    </p>
    <el-form
      label-position="top"
      size="small"
      :disabled="isLoading || isDecisionChannelSaving"
    >
      <el-form-item label="审批模型类型">
        <el-radio-group
          v-model="decisionEngine"
          data-testid="approval-engine-selector"
        >
          <el-radio-button value="jev">JEV 决策模型</el-radio-button>
          <el-radio-button value="llm" data-testid="approval-engine-llm"
            >普通 LLM</el-radio-button
          >
        </el-radio-group>
      </el-form-item>
      <el-form-item label="审批模型">
        <LlmModelSelector
          v-model="decisionChannelCombo"
          :capabilities="
            decisionEngine === 'jev'
              ? { decision: true }
              : LLM_APPROVAL_MODEL_CAPABILITIES
          "
          :clearable="true"
          :disabled="isLoading || isDecisionChannelSaving"
          placeholder="请选择用于工具审批的模型"
          test-id="decision-channel-selector"
          popper-class="approval-model-selector-popper"
        />
        <div class="form-hint">模型审核失败时转人工处理。</div>
      </el-form-item>

      <el-form-item label="审核超时（秒）">
        <el-input-number
          v-model="decisionTimeoutSeconds"
          :min="1"
          :max="120"
          :step="1"
        />
      </el-form-item>
      <el-form-item v-if="decisionEngine === 'llm'" label="补充审批规则">
        <el-input
          v-model="decisionChannelSettings.llmInstructions"
          type="textarea"
          :rows="3"
          :maxlength="4000"
          placeholder="例如：允许读取工作目录中的文件；写入已有文件前转人工确认。"
        />
        <div class="form-hint">补充具体的操作范围与审批要求，保存后生效。</div>
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          plain
          data-testid="decision-channel-save"
          :disabled="isLoading"
          :loading="isDecisionChannelSaving"
          @click="handleSaveDecisionChannel"
        >
          保存审批模型配置
        </el-button>
      </el-form-item>
    </el-form>
  </section>
</template>

<style scoped>
.approval-model-settings {
  margin: 12px 0;
  padding-bottom: 4px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.approval-model-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.form-hint {
  margin: 4px 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
