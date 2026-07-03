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
  <span class="markdown-html-inline" v-html="sanitizedContent"></span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DOMPurify from "dompurify";

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

// 净化 HTML 内容以防止 XSS 攻击
const sanitizedContent = computed(() => {
  return DOMPurify.sanitize(props.content, {
    ALLOWED_TAGS: [
      "span",
      "b",
      "i",
      "u",
      "s",
      "em",
      "strong",
      "code",
      "a",
      "br",
      "button",
      "mark",
      "small",
      "del",
      "ins",
      "sub",
      "sup",
      "abbr",
      "kbd",
      "q",
      "cite",
      "time",
      "img", // img is technically an inline-block, but often used inline
    ],
    ALLOWED_ATTR: [
      "class",
      "style",
      "title",
      "lang",
      "href",
      "target",
      "rel",
      "src",
      "alt",
      "width",
      "height",
      "datetime",
      "cite",
      "aria-label",
    ],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onmouseover"],
  });
});
</script>

<style scoped>
.markdown-html-inline {
  display: inline;
}
</style>
