<script setup lang="ts">
import { ref, computed } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import { customMessage } from "@/utils/customMessage";
import CaiuList from "./CaiuList.vue";
import CaiuDetail from "./CaiuDetail.vue";

const props = defineProps<{
  id: string;
  isSelectionMode: boolean;
  selectedEntryIds: Set<string>;
  layoutMode: "large" | "medium" | "small";
}>();

const emit = defineEmits<{
  (e: "update:selectedEntryIds", value: Set<string>): void;
  (e: "back"): void;
}>();

const kbStore = useKnowledgeBaseStore();
const { addEntry } = useKnowledgeBase();

const searchQuery = ref("");

// 响应式布局逻辑
// 只有在 small 模式下才需要单栏切换逻辑
const isSingleColumn = computed(() => props.layoutMode === "small");
const showDetail = computed(() => !!kbStore.activeEntryId);

const handleAddEntry = async () => {
  const entryId = await addEntry(`新条目_${new Date().toLocaleTimeString()}`, "", {
    select: true,
    sync: true,
  });
  if (entryId) {
    customMessage.success("新条目已创建");
  }
};
</script>

<template>
  <div class="caiu-manager" :class="[`is-${layoutMode}`]">
    <!-- 列表栏 (在非单栏模式下常驻，单栏模式下未选中详情时显示) -->
    <aside v-if="!isSingleColumn || !showDetail" class="list-sidebar">
      <CaiuList
        v-model:search-query="searchQuery"
        :is-selection-mode="isSelectionMode"
        :selected-entry-ids="selectedEntryIds"
        @update:selected-entry-ids="(val) => emit('update:selectedEntryIds', val)"
        @add="handleAddEntry"
      />
    </aside>

    <!-- 详情栏 (在非单栏模式下常驻，单栏模式下选中详情时显示) -->
    <main v-if="!isSingleColumn || showDetail" class="detail-main">
      <CaiuDetail :is-wide="!isSingleColumn" @close="kbStore.activeEntryId = null" />
    </main>
  </div>
</template>

<style scoped>
.caiu-manager {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--card-bg);
}

.list-sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  background-color: var(--sidebar-bg);
}
.is-small .list-sidebar {
  width: 100%;
  border-right: none;
}

.detail-main {
  flex: 1;
  min-width: 0;
  background-color: transparent;
}

.is-small .detail-main {
  width: 100%;
}
</style>
