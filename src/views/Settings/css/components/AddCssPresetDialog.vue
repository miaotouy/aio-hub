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
import { ref } from "vue";

interface Emits {
  (e: "confirm", name: string): void;
  (e: "cancel"): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>("visible", { required: true });
const presetName = ref("");

function handleConfirm() {
  if (!presetName.value.trim()) {
    return;
  }
  emit("confirm", presetName.value.trim());
  presetName.value = "";
  visible.value = false;
}

function handleCancel() {
  presetName.value = "";
  visible.value = false;
  emit("cancel");
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="添加 CSS 预设"
    width="400px"
    @close="handleCancel"
  >
    <el-form @submit.prevent="handleConfirm">
      <el-form-item label="预设名称">
        <el-input
          v-model="presetName"
          placeholder="请输入预设名称"
          autofocus
          @keyup.enter="handleConfirm"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button
        type="primary"
        :disabled="!presetName.trim()"
        @click="handleConfirm"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.el-form-item {
  margin-bottom: 0;
}
</style>
