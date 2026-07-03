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
import BaseDialog from "@/components/common/BaseDialog.vue";
import VideoViewer from "@/components/common/VideoViewer.vue";
import AudioViewer from "@/components/common/AudioViewer.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import type { AssetType } from "../../../types";

interface Props {
  modelValue: boolean;
  type: AssetType;
  url: string;
  title: string;
  poster?: string;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();
</script>

<template>
  <VideoViewer
    v-if="type === 'video'"
    :visible="modelValue"
    @update:visible="emit('update:modelValue', $event)"
    :src="url"
    :title="title"
  />

  <AudioViewer
    v-else-if="type === 'audio'"
    :visible="modelValue"
    @update:visible="emit('update:modelValue', $event)"
    :src="url"
    :poster="poster"
    :title="title"
  />

  <BaseDialog
    v-else
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="title"
    width="400px"
    :show-footer="false"
  >
    <div class="media-container">
      <div class="file-preview-placeholder">
        <FileIcon :filename="url" :size="64" />
        <p>此文件类型不支持在线预览</p>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.media-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  min-height: 200px;
}

.file-preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: white;
  padding: 40px;
}
</style>
