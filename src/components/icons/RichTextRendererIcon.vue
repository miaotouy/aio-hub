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
  <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M960 0a64 64 0 0 1 64 64v896a64 64 0 0 1-64 64H64a64 64 0 0 1-64-64V64a64 64 0 0 1 64-64h896z m-71.44 71.44H135.44a64 64 0 0 0-64 64v732.896l178.816-135.312a69.632 69.632 0 0 1 77.76-4.24l3.136 1.984 175.696 118.176 231.2-291.44a71.664 71.664 0 0 1 113.76 1.888l100.736 135.376V135.44a64 64 0 0 0-64-64zM461.728 224a31.92 31.92 0 0 1 0 63.792h-95.584v255.392a31.92 31.92 0 0 1-63.824 0V287.792h-95.568a31.92 31.92 0 0 1 0-63.792h254.976z m318.88 175.312a31.92 31.92 0 0 1 0 63.792H589.344a31.92 31.92 0 0 1 0-63.792h191.264z m0-175.312a31.92 31.92 0 0 1 0 63.792H589.344a31.92 31.92 0 0 1 0-63.792h191.264z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup lang="ts">
// 使用 currentColor 确保图标颜色能够继承父级文本颜色
defineOptions({
  name: "RichTextRendererIcon",
});
</script>
