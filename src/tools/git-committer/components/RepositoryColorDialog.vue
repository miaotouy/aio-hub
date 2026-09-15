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
    title="修改仓库颜色"
    width="420px"
    max-width="calc(100vw - 32px)"
  >
    <div class="repository-color-dialog">
      <div class="repository-context">
        <span class="repository-name">{{ repo.alias || repo.name }}</span>
        <span class="repository-path">{{ repo.path }}</span>
      </div>

      <div class="color-row">
        <span
          class="color-preview"
          :style="{
            backgroundColor: resolvedColor,
            color: getAvatarTextColor(resolvedColor),
          }"
        >
          {{ avatarText }}
        </span>
        <el-color-picker
          v-model="colorDraft"
          :predefine="predefineColors"
          class="color-picker"
        />
        <el-button link type="primary" @click="colorDraft = ''">
          跟随自动
        </el-button>
      </div>

      <div class="color-hint">
        留空（跟随自动）时，将按仓库路径从「设置 -
        仓库图标配色」的色盘中稳定取色。
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="isVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { RepositoryConfig } from "../types";
import { getAvatarTextColor, resolveRepoAvatarPalette } from "../utils";
import {
  getRepoColor,
  repoAvatarPalette,
  updateRepositoryColor,
} from "../composables/useGitCommitterState";

const props = defineProps<{
  modelValue: boolean;
  repo: RepositoryConfig;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const colorDraft = ref<string>("");
const isVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const predefineColors = computed(() =>
  resolveRepoAvatarPalette(repoAvatarPalette.value)
);

const avatarText = computed(() =>
  (props.repo.alias || props.repo.name).charAt(0).toUpperCase()
);

const resolvedColor = computed(
  () => colorDraft.value || getRepoColor(props.repo)
);

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      colorDraft.value = props.repo.color || "";
    }
  },
  { immediate: true }
);

const save = () => {
  updateRepositoryColor(props.repo.path, colorDraft.value);
  isVisible.value = false;
};
</script>

<style scoped>
.repository-color-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.color-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: normal;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.color-picker {
  height: 40px;
}

.color-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
</style>
