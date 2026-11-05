<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useLlmChatStore } from "../stores/llmChatStore";
import { BranchNavigator } from "../utils/BranchNavigator";
import type { ChatMessageNode } from "../types";

const props = defineProps<{
  message: ChatMessageNode;
}>();

const chatStore = useLlmChatStore();

const branchInfo = computed(() => {
  if (!chatStore.currentSession) return { index: 0, total: 0 };
  return BranchNavigator.getSiblingIndex(
    chatStore.currentSession,
    props.message.id
  );
});

const hasMultipleBranches = computed(() => branchInfo.value.total > 1);

const handlePrev = () => {
  chatStore.switchSibling(props.message.id, "prev");
};

const handleNext = () => {
  chatStore.switchSibling(props.message.id, "next");
};
</script>

<template>
  <div v-if="hasMultipleBranches" class="branch-switcher" @click.stop>
    <button class="nav-btn" aria-label="上一条分支" @click="handlePrev">
      <ChevronLeft :size="14" />
    </button>
    <span class="branch-info">
      {{ branchInfo.index + 1 }} / {{ branchInfo.total }}
    </span>
    <button class="nav-btn" aria-label="下一条分支" @click="handleNext">
      <ChevronRight :size="14" />
    </button>
  </div>
</template>

<style scoped>
.branch-switcher {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  background: var(--container-bg);
  border-radius: var(--app-radius-lg);
  font-size: var(--font-size-xs);
  color: var(--text-color-light);
  user-select: none;
  margin-top: 4px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  min-width: 44px;
  min-height: 44px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
}

.nav-btn:active {
  background: var(--container-bg);
}

.branch-info {
  min-width: 32px;
  text-align: center;
  font-weight: 500;
}
</style>
