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
  <div class="repo-prompt-editor">
    <div class="editor-header">
      <div class="editor-title">
        <MessageSquareText :size="16" class="title-icon" />
        <span>仓库 AI 提示词</span>
        <span class="repo-name" :title="repo?.alias || repo?.name">
          {{ repo?.alias || repo?.name }}
        </span>
        <el-tag
          :type="isRepoScoped ? 'success' : 'info'"
          size="small"
          round
          effect="plain"
        >
          {{ isRepoScoped ? "仓库专属" : "继承全局" }}
        </el-tag>
      </div>
      <div class="editor-actions">
        <el-button
          link
          type="primary"
          :disabled="!isRepoScoped"
          @click="inheritGlobal"
        >
          跟随全局
        </el-button>
        <el-button
          type="primary"
          size="small"
          :disabled="!isDirty"
          @click="save"
        >
          保存
        </el-button>
      </div>
    </div>

    <div class="editor-hint">
      此提示词仅对当前仓库生效，留空并保存后跟随全局提示词。可使用
      <code>{{ COMMIT_LANGUAGE_MACRO }}</code> 引用全局提交语言设置。
    </div>

    <el-input
      v-model="draft"
      type="textarea"
      resize="none"
      class="prompt-textarea"
      placeholder="留空表示跟随全局提示词；在此输入仅对当前仓库生效的系统提示词"
      @keydown.ctrl.enter.prevent="save"
    />

    <div v-if="!isRepoScoped" class="global-preview">
      <div class="preview-title">当前继承的全局提示词</div>
      <pre class="preview-content">{{ globalPrompt }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MessageSquareText } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import {
  currentRepo,
  systemPrompt,
  updateRepositorySystemPrompt,
} from "../composables/useGitCommitterState";
import { COMMIT_LANGUAGE_MACRO } from "../utils";

const repo = currentRepo;
const globalPrompt = systemPrompt;

const draft = ref("");
const savedValue = ref("");

watch(
  () => [repo.value?.path, repo.value?.systemPrompt] as const,
  () => {
    savedValue.value = repo.value?.systemPrompt || "";
    draft.value = savedValue.value;
  },
  { immediate: true }
);

const isRepoScoped = computed(() => Boolean(repo.value?.systemPrompt));
const isDirty = computed(() => draft.value.trim() !== savedValue.value.trim());

const save = () => {
  if (!repo.value) return;
  updateRepositorySystemPrompt(repo.value.path, draft.value);
  savedValue.value = repo.value.systemPrompt || "";
  draft.value = savedValue.value;
  customMessage.success("已保存仓库 AI 提示词");
};

const inheritGlobal = () => {
  if (!repo.value) return;
  updateRepositorySystemPrompt(repo.value.path, "");
  savedValue.value = "";
  draft.value = "";
  customMessage.success("已跟随全局 AI 提示词");
};
</script>

<style scoped>
.repo-prompt-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 12px;
  box-sizing: border-box;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.title-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.repo-name {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.editor-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.editor-hint code {
  color: var(--el-color-primary);
  font-family: var(--font-family-mono);
}

.prompt-textarea {
  flex: 1;
  min-height: 0;
}

.prompt-textarea :deep(.el-textarea__inner) {
  height: 100%;
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--el-text-color-primary);
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.6;
  resize: none;
}

.global-preview {
  flex-shrink: 0;
  max-height: 32%;
  overflow: auto;
  padding: 10px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(var(--el-color-info-rgb), 0.05);
}

.preview-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.preview-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
</style>
