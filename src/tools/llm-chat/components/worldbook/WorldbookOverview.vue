<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useWorldbookStore } from "../../stores/worldbookStore";
import { Book, Settings2, Plus } from "lucide-vue-next";
import { importSTWorldbook } from "../../services/worldbookImportService";
import { customMessage } from "@/utils/customMessage";

const emit = defineEmits<{
  (e: "manage"): void;
}>();

const worldbookStore = useWorldbookStore();

onMounted(async () => {
  await worldbookStore.loadWorldbooks();
});

const count = computed(() => worldbookStore.worldbooks.length);
const recentBooks = computed(() =>
  [...worldbookStore.worldbooks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3)
);

const handleQuickImport = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const id = await importSTWorldbook(file);
      if (id) {
        customMessage.success("世界书导入成功");
        await worldbookStore.loadWorldbooks();
      }
    }
  };
  input.click();
};
</script>

<template>
  <div class="worldbook-overview">
    <div class="actions-section">
      <el-button :icon="Plus" plain size="small" @click="handleQuickImport"> 快速导入 </el-button>
      <el-button type="primary" :icon="Settings2" size="small" @click="emit('manage')">
        管理库
      </el-button>
    </div>

    <div class="stats-section">
      <div class="stat-item">
        <div class="stat-value">{{ count }}</div>
        <div class="stat-label">本世界书</div>
      </div>
      <div class="vertical-divider"></div>
      <div class="recent-list">
        <div v-if="recentBooks.length === 0" class="empty-hint">暂无世界书</div>
        <div v-for="book in recentBooks" :key="book.id" class="recent-item">
          <el-icon class="item-icon"><Book /></el-icon>
          <span class="item-name">{{ book.name }}</span>
          <span class="item-count">{{ book.entryCount }} 条目</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.worldbook-overview {
  width: 100%;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 160px;
}

.stats-section {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 24px;
  flex: 1;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: var(--el-color-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.vertical-divider {
  width: 1px;
  height: 60px;
  background-color: var(--border-color);
  opacity: 0.6;
}

.recent-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.item-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  background: var(--input-bg);
  padding: 0 6px;
  border-radius: 10px;
}

.empty-hint {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.actions-section {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 16px;
  background-color: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid var(--border-color);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}
</style>
