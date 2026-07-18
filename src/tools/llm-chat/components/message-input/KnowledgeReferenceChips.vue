<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { X } from "lucide-vue-next";
import { useChatInputManager } from "../../composables/input/useChatInputManager";

const inputManager = useChatInputManager();
</script>

<template>
  <div
    v-if="inputManager.knowledgeReference.value"
    class="knowledge-reference-chips"
    aria-label="已引用的 Knowledge 资料库"
  >
    <el-tooltip
      v-for="library in inputManager.knowledgeReference.value.libraries"
      :key="library.id"
      :content="
        library.name + ' · ' + library.id + ' · ' + library.availability
      "
      placement="top"
      :show-after="350"
    >
      <span
        class="knowledge-chip"
        :class="{ unavailable: library.availability !== 'available' }"
      >
        <span class="chip-name">{{ library.name }}</span>
        <button
          type="button"
          class="chip-remove"
          :aria-label="'移除资料库 ' + library.name"
          :title="'移除 ' + library.name"
          @click="inputManager.removeKnowledgeLibrary(library.id)"
        >
          <X :size="12" />
        </button>
      </span>
    </el-tooltip>
  </div>
</template>

<style scoped>
.knowledge-reference-chips {
  display: flex;
  width: 100%;
  min-width: 0;
  gap: 6px;
  overflow-x: auto;
  padding: 1px 2px 3px;
  scrollbar-width: thin;
}

.knowledge-chip {
  display: inline-flex;
  max-width: min(240px, 72vw);
  height: 25px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 8px;
  border: var(--border-width) solid
    color-mix(in srgb, var(--primary-color) 42%, var(--border-color));
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary-color) 8%, var(--input-bg));
  color: var(--text-color-primary);
  font-size: 12px;
}

.knowledge-chip.unavailable {
  border-color: var(--error-color);
}

.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.chip-remove:hover,
.chip-remove:focus-visible {
  background: color-mix(in srgb, var(--error-color) 12%, transparent);
  color: var(--error-color);
}
</style>
