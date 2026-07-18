<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { BookOpenCheck } from "lucide-vue-next";
import type { KnowledgeReference } from "@/tools/knowledge-base/types";

defineProps<{ reference: KnowledgeReference }>();
</script>

<template>
  <div class="message-knowledge-reference" aria-label="本消息引用的资料库">
    <BookOpenCheck :size="14" aria-hidden="true" />
    <el-tooltip
      v-for="library in reference.libraries"
      :key="library.id"
      :content="library.name + ' · ' + library.id"
      placement="top"
      :show-after="350"
    >
      <span
        class="message-reference-chip"
        :class="{ unavailable: library.availability !== 'available' }"
      >
        {{ library.name }}
      </span>
    </el-tooltip>
  </div>
</template>

<style scoped>
.message-knowledge-reference {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0 7px;
  color: var(--text-color-secondary);
  scrollbar-width: thin;
}

.message-reference-chip {
  display: inline-flex;
  max-width: min(260px, 75vw);
  height: 23px;
  flex: 0 0 auto;
  align-items: center;
  overflow: hidden;
  padding: 0 8px;
  border: var(--border-width) solid
    color-mix(in srgb, var(--primary-color) 38%, var(--border-color));
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary-color) 7%, var(--input-bg));
  color: var(--text-color-primary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-reference-chip.unavailable {
  border-color: var(--error-color);
}
</style>
