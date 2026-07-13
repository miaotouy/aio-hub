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
  <el-button
    size="small"
    link
    :type="copied ? 'success' : 'primary'"
    :icon="copied ? Check : CopyDocument"
    @click="handleCopy"
  >
    {{ copied ? "已复制" : "复制" }}
  </el-button>
</template>

<script setup lang="ts">
import { ElButton } from "element-plus";
import { CopyDocument, Check } from "@element-plus/icons-vue";
import { useClipboard } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";

const props = defineProps<{
  text: string;
}>();

const { copy, copied } = useClipboard();

const handleCopy = () => {
  if (props.text) {
    copy(props.text);
    customMessage.success("已复制");
  }
};
</script>
