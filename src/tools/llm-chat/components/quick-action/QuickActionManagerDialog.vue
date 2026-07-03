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
import { defineAsyncComponent } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";

const QuickActionFullManager = defineAsyncComponent(
  () => import("./QuickActionFullManager.vue")
);

interface Props {
  visible: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
}>();

const handleClose = () => {
  emit("update:visible", false);
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="快捷操作管理"
    width="90%"
    height="85vh"
    destroy-on-close
  >
    <QuickActionFullManager />

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </BaseDialog>
</template>
