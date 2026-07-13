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
  <BaseDialog
    :model-value="visible"
    @update:model-value="handleVisibleChange"
    title="创建用户档案"
    width="80vw"
  >
    <template #content>
      <UserProfileForm
        v-model="form"
        :required="true"
        :description-rows="6"
        icon-placeholder="输入 emoji 或选择图标（可选）"
        icon-hint="可以输入 emoji 或从预设选择"
      />
    </template>

    <template #footer>
      <el-button @click="handleVisibleChange(false)">取消</el-button>
      <el-button type="primary" @click="handleCreate" :disabled="!isValid">
        创建
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import UserProfileForm from "./UserProfileForm.vue";
import { customMessage } from "@/utils/customMessage";

interface Props {
  visible: boolean;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (
    e: "create",
    data: { name: string; displayName?: string; content: string; icon?: string }
  ): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

// 表单数据
const form = ref({
  name: "",
  displayName: "",
  icon: "",
  content: "",
});

// 验证表单是否有效
const isValid = computed(() => {
  return form.value.name.trim() !== "" && form.value.content.trim() !== "";
});

// 处理对话框显示状态变化
const handleVisibleChange = (value: boolean) => {
  if (!value) {
    // 关闭时重置表单
    form.value = {
      name: "",
      displayName: "",
      icon: "",
      content: "",
    };
  }
  emit("update:visible", value);
};

// 处理创建
const handleCreate = () => {
  if (!isValid.value) {
    customMessage.error("请填写所有必填字段");
    return;
  }

  emit("create", {
    name: form.value.name.trim(),
    displayName: form.value.displayName?.trim() || undefined,
    content: form.value.content.trim(),
    icon: form.value.icon?.trim() || undefined,
  });

  handleVisibleChange(false);
};
</script>
