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
import {
  listAdaptersForOperation,
  type LlmAdapterId,
  type ModelRouteBinding,
} from "@aiohub/llm-core";
import { getAdapterLabel } from "@/config/llm-routing";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";

const props = defineProps<{
  modelValue: boolean;
  modelCount: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", binding: ModelRouteBinding): void;
}>();

const chatAdapterOptions = listAdaptersForOperation("chat");
const adapterId = ref<LlmAdapterId>();
const endpoint = ref("");

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) return;
    adapterId.value = undefined;
    endpoint.value = "";
  }
);

const handleConfirm = () => {
  if (!adapterId.value) {
    customMessage.warning("请选择请求协议");
    return;
  }
  emit("confirm", {
    adapterId: adapterId.value,
    source: "manual",
    ...(endpoint.value.trim() ? { endpoint: endpoint.value.trim() } : {}),
  });
  emit("update:modelValue", false);
};

const handleClose = () => {
  emit("update:modelValue", false);
};
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="批量设置 Chat 请求协议"
    width="560px"
    @update:model-value="handleClose"
  >
    <template #content>
      <div class="batch-route-dialog">
        <el-form label-width="110px">
          <el-form-item label="请求协议">
            <el-select
              v-model="adapterId"
              class="adapter-select"
              placeholder="选择 Chat 使用的协议适配器"
              :aria-label="'Chat 请求协议'"
            >
              <el-option
                v-for="adapter in chatAdapterOptions"
                :key="adapter"
                :label="getAdapterLabel(adapter)"
                :value="adapter"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="专用端点">
            <el-input
              v-model="endpoint"
              placeholder="可选，例如: /v1/responses"
              clearable
            />
          </el-form-item>
        </el-form>

        <div class="batch-route-hint">
          将为全部 {{ modelCount }} 个模型的 Chat 操作设置该绑定，覆盖已有 Chat
          绑定；不影响 Embedding、Rerank 等其他操作，也不会修改模型列表解析。
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.batch-route-dialog {
  padding: 16px 20px 4px;
}

.adapter-select {
  width: 100%;
}

.batch-route-hint {
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
</style>
