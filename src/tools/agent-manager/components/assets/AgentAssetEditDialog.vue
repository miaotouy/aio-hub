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
import type { AgentAsset, AssetGroup } from "../../types/agent";

interface Props {
  modelValue: boolean;
  asset: AgentAsset | null;
  sortedGroups: AssetGroup[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "save", form: { id: string; description: string; group: string }): void;
}>();

const form = ref({ id: "", description: "", group: "default" });

watch(
  () => props.asset,
  (asset) => {
    if (asset) {
      form.value = {
        id: asset.id,
        description: asset.description || "",
        group: asset.group || "default",
      };
    }
  },
  { immediate: true }
);

const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) return "";
  return filename.substring(lastDot + 1).toLowerCase();
};

const handleSave = () => {
  emit("save", { ...form.value });
};
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="编辑资产信息"
    width="400px"
  >
    <el-form :model="form" label-width="60px" @submit.prevent="handleSave">
      <el-form-item label="ID" required>
        <el-input v-model="form.id" placeholder="唯一标识符，用于引用" />
        <div class="form-tip">
          在对话中使用
          <code
            >agent-asset://{{ form.group || "default" }}/{{
              form.id || "ID"
            }}.{{
              asset ? getFileExtension(asset.filename) || "ext" : "ext"
            }}</code
          >
          引用此资产
        </div>
      </el-form-item>
      <el-form-item label="描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="资产描述（可选）"
        />
      </el-form-item>
      <el-form-item label="分组">
        <el-select
          v-model="form.group"
          placeholder="选择或输入分组 ID"
          filterable
          allow-create
          default-first-option
          style="width: 100%"
        >
          <el-option label="未分组 (default)" value="default" />
          <el-option
            v-for="group in sortedGroups"
            :key="group.id"
            :label="`${group.displayName} (${group.id})`"
            :value="group.id"
          />
        </el-select> </el-form-item
    ></el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

code {
  background-color: var(--el-fill-color);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
}
</style>
