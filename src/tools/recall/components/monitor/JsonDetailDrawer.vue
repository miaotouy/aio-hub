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
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { computed } from "vue";

const props = defineProps<{
  modelValue: boolean;
  data: any;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const jsonString = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2);
  } catch (e) {
    return String(props.data);
  }
});
</script>

<template>
  <BaseDialog
    v-model="visible"
    :title="title || '原始数据'"
    width="800px"
    height="70vh"
  >
    <div class="json-detail-container">
      <RichCodeEditor
        v-model="jsonString"
        language="json"
        readonly
        height="100%"
      />
    </div>
  </BaseDialog>
</template>

<style scoped>
.json-detail-container {
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  box-sizing: border-box;
}
</style>
