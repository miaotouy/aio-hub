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
    v-model="isVisible"
    title="设置仓库 AI 提示词"
    width="560px"
    max-width="calc(100vw - 32px)"
    content-class="repository-prompt-dialog-content"
  >
    <div class="repository-prompt-dialog">
      <div class="repository-context">
        <span class="repository-name">{{ repo.alias || repo.name }}</span>
        <span class="repository-path">{{ repo.path }}</span>
      </div>

      <div class="prompt-hint">
        这里的提示词只对当前仓库生效。留空后保存将跟随全局 AI 提示词。
      </div>

      <el-input
        v-model="promptDraft"
        type="textarea"
        :rows="10"
        maxlength="4000"
        show-word-limit
        resize="vertical"
        autofocus
        class="prompt-input"
        placeholder="例如：使用英文，遵循本项目约定的 commit 类型，标题不超过 72 个字符"
        @keydown.ctrl.enter.prevent="save"
      />
    </div>

    <template #footer>
      <div class="prompt-dialog-footer">
        <el-button
          link
          type="primary"
          :disabled="!repo.systemPrompt"
          @click="inheritGlobalPrompt"
        >
          跟随全局
        </el-button>
        <div class="footer-actions">
          <el-button @click="isVisible = false">取消</el-button>
          <el-button type="primary" @click="save">保存</el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { RepositoryConfig } from "../types";
import { updateRepositorySystemPrompt } from "../composables/useGitCommitterState";

const props = defineProps<{
  modelValue: boolean;
  repo: RepositoryConfig;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const promptDraft = ref("");
const isVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      promptDraft.value = props.repo.systemPrompt || "";
    }
  },
  { immediate: true }
);

const save = () => {
  updateRepositorySystemPrompt(props.repo.path, promptDraft.value);
  isVisible.value = false;
};

const inheritGlobalPrompt = () => {
  updateRepositorySystemPrompt(props.repo.path, "");
  isVisible.value = false;
};
</script>

<style scoped>
.repository-prompt-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.repository-context {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.repository-name {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-path {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.prompt-input {
  width: 100%;
}

.prompt-input :deep(textarea) {
  line-height: 1.6;
}

.prompt-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
