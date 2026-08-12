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
import { computed } from "vue";
import {
  listAdaptersForOperation,
  resolveModelExecution,
  type LlmAdapterId,
  type LlmModelRouting,
  type LlmOperation,
  type ModelRouteBinding,
  type ModelRouteSource,
} from "@aiohub/llm-core";
import { getAdapterLabel, OPERATION_LABELS } from "@/config/llm-routing";
import { Delete } from "@element-plus/icons-vue";

const props = defineProps<{
  modelValue?: LlmModelRouting;
  operations?: LlmOperation[];
  providerType?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: LlmModelRouting): void;
}>();

const operations = computed<LlmOperation[]>(() => props.operations ?? ["chat"]);

const supportedEndpointTypes = computed(
  () => props.modelValue?.supportedEndpointTypes ?? []
);

const SOURCE_LABELS: Readonly<Record<ModelRouteSource, string>> = {
  manual: "手动绑定",
  probe: "探测确认",
  discovered: "服务端声明",
  "profile-default": "渠道默认",
};

function bindingFor(operation: LlmOperation): ModelRouteBinding | undefined {
  return props.modelValue?.bindings?.[operation];
}

function setBinding(
  operation: LlmOperation,
  binding: ModelRouteBinding | undefined
) {
  const bindings = { ...props.modelValue?.bindings };
  if (binding) bindings[operation] = binding;
  else delete bindings[operation];
  emit("update:modelValue", { ...props.modelValue, bindings });
}

function onAdapterChange(
  operation: LlmOperation,
  adapterId: LlmAdapterId | undefined
) {
  if (!adapterId) {
    setBinding(operation, undefined);
    return;
  }
  const previous = bindingFor(operation);
  setBinding(operation, {
    adapterId,
    source: "manual",
    ...(previous?.endpointType ? { endpointType: previous.endpointType } : {}),
    ...(previous?.endpoint ? { endpoint: previous.endpoint } : {}),
  });
}

function onEndpointChange(operation: LlmOperation, endpoint: string) {
  const binding = bindingFor(operation);
  if (!binding) return;
  const next: ModelRouteBinding = { ...binding };
  if (endpoint.trim()) next.endpoint = endpoint.trim();
  else delete next.endpoint;
  setBinding(operation, next);
}

function clearBinding(operation: LlmOperation) {
  setBinding(operation, undefined);
}

function effectiveExecution(operation: LlmOperation) {
  if (!props.providerType) return null;
  try {
    return resolveModelExecution({
      profile: { type: props.providerType },
      model: { id: "", routing: props.modelValue },
      operation,
    });
  } catch {
    return null;
  }
}
</script>

<template>
  <div class="routing-editor">
    <div v-if="supportedEndpointTypes.length > 0" class="supported-endpoints">
      <span class="supported-label">服务端声明端点</span>
      <el-tag
        v-for="endpointType in supportedEndpointTypes"
        :key="endpointType"
        size="small"
        type="info"
        effect="plain"
      >
        {{ endpointType }}
      </el-tag>
      <span class="supported-hint">
        仅声明可用集合，不会自动改变实际请求协议
      </span>
    </div>

    <div
      v-for="operation in operations"
      :key="operation"
      class="route-row"
    >
      <div class="route-heading">
        <span class="route-operation">{{ OPERATION_LABELS[operation] }}</span>
        <el-tag
          v-if="bindingFor(operation)"
          size="small"
          effect="plain"
          type="primary"
        >
          {{ SOURCE_LABELS[bindingFor(operation)!.source ?? "manual"] }}
        </el-tag>
      </div>

      <div class="route-controls">
        <el-select
          :model-value="bindingFor(operation)?.adapterId ?? ''"
          class="route-adapter-select"
          placeholder="跟随渠道默认"
          clearable
          :aria-label="`${OPERATION_LABELS[operation]}请求协议`"
          @update:model-value="
            (value: LlmAdapterId | undefined) => onAdapterChange(operation, value)
          "
        >
          <el-option
            v-for="adapter in listAdaptersForOperation(operation)"
            :key="adapter"
            :label="getAdapterLabel(adapter)"
            :value="adapter"
          />
        </el-select>

        <el-input
          v-if="bindingFor(operation)"
          :model-value="bindingFor(operation)?.endpoint ?? ''"
          class="route-endpoint-input"
          placeholder="可选：绑定专用端点路径"
          clearable
          @update:model-value="(value: string) => onEndpointChange(operation, value)"
        />

        <el-button
          v-if="bindingFor(operation)"
          link
          type="danger"
          :icon="Delete"
          title="清除该操作的绑定"
          @click="clearBinding(operation)"
        >
          重置
        </el-button>
      </div>

      <div class="route-hint">
        当前生效：
        {{
          effectiveExecution(operation)
            ? `${getAdapterLabel(effectiveExecution(operation)!.adapterId)}（${
                SOURCE_LABELS[effectiveExecution(operation)!.routeSource]
              }）`
            : "—"
        }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.routing-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.supported-endpoints {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

.supported-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-right: 2px;
}

.supported-hint {
  width: 100%;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.route-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--card-bg);
}

.route-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.route-operation {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.route-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.route-adapter-select {
  flex: 1;
  min-width: 0;
}

.route-endpoint-input {
  flex: 1;
  min-width: 0;
}

.route-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
}
</style>
