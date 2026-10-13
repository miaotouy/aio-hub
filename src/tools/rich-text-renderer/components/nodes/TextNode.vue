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
  <span><InlineContent /></span>
</template>

<script setup lang="ts">
import { h, inject, type VNode } from "vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";
import { unescapeVcpMarkers } from "../../utils/vcp-utils";

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

const context = inject<RichTextContext | null>(RICH_TEXT_CONTEXT_KEY, null);

// 仅处理文本节点，图片地址、HTML 属性和代码节点沿用各自的解析路径。
const InlineContent = () => {
  const content = unescapeVcpMarkers(props.content);
  if (!context?.renderFilePlaceholder || !content.includes("【file::")) {
    return content;
  }

  const children: (string | VNode)[] = [];
  let cursor = 0;
  for (const match of content.matchAll(/【file::([^\s】]+)】/g)) {
    children.push(content.slice(cursor, match.index));
    const preview = context.renderFilePlaceholder(match[1]);
    children.push(
      preview
        ? h("span", { class: "file-placeholder-preview", key: match.index }, [
            preview,
          ])
        : match[0]
    );
    cursor = match.index + match[0].length;
  }
  children.push(content.slice(cursor));
  return children;
};
</script>

<style scoped>
:deep(.file-placeholder-preview) {
  display: inline-flex;
  max-width: 100%;
  margin: 4px 0;
  vertical-align: middle;
}
</style>
