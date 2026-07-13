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

<template>
  <div class="prompt-editor">
    <el-input
      :model-value="modelValue"
      @update:model-value="(val: string) => emit('update:modelValue', val)"
      type="textarea"
      :rows="rows"
      :placeholder="placeholder"
      class="prompt-textarea"
    />
    <div class="prompt-actions">
      <el-popconfirm
        title="确定要重置为默认提示词吗？"
        @confirm="handleReset"
        width="200"
      >
        <template #reference>
          <el-button type="default" plain size="small">
            <el-icon><RefreshLeft /></el-icon>
            重置
          </el-button>
        </template>
      </el-popconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElInput, ElButton, ElIcon, ElPopconfirm } from "element-plus";
import { RefreshLeft } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";

interface Props {
  modelValue: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
  defaultValue: "",
  placeholder: "请输入提示词",
  rows: 6,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const handleReset = () => {
  if (props.modelValue === props.defaultValue) {
    return;
  }
  emit("update:modelValue", props.defaultValue);
  customMessage.success("已重置为默认提示词");
};
</script>

<style scoped>
.prompt-editor {
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: flex-start;
}

.prompt-textarea {
  flex: 1;
}

.prompt-actions {
  flex-shrink: 0;
  margin-top: 2px;
}
</style>
