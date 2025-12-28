<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useWorldbookStore } from "../../worldbookStore";
import { Book, Plus, Search } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";

const props = defineProps<{
  modelValue: string[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

const worldbookStore = useWorldbookStore();
const showDialog = ref(false);
const searchQuery = ref("");
const isLoading = ref(false);

onMounted(async () => {
  await worldbookStore.loadWorldbooks();
});

// 每次打开选择对话框时重新加载世界书列表，确保能看到最新导入的世界书
watch(showDialog, async (newVal) => {
  if (newVal) {
    isLoading.value = true;
    try {
      await worldbookStore.loadWorldbooks();
    } finally {
      isLoading.value = false;
    }
  }
});

const selectedIds = computed({
  get: () => props.modelValue || [],
  set: (val) => emit("update:modelValue", val),
});

const selectedWorldbooks = computed(() => {
  return worldbookStore.worldbooks.filter((wb) => selectedIds.value.includes(wb.id));
});

const availableWorldbooks = computed(() => {
  const q = searchQuery.value.toLowerCase();
  return worldbookStore.worldbooks.filter(
    (wb) => !selectedIds.value.includes(wb.id) && wb.name.toLowerCase().includes(q)
  );
});

const removeWb = (id: string) => {
  selectedIds.value = selectedIds.value.filter((i) => i !== id);
};

const addWb = (id: string) => {
  selectedIds.value = [...selectedIds.value, id];
};
</script>

<template>
  <div class="worldbook-selector">
    <div class="selected-tags">
      <el-tag
        v-for="wb in selectedWorldbooks"
        :key="wb.id"
        closable
        @close="removeWb(wb.id)"
        class="wb-tag"
        type="primary"
        effect="light"
      >
        <el-icon class="mr-1"><Book /></el-icon>
        {{ wb.name }}
      </el-tag>
      <el-button size="small" :icon="Plus" @click="showDialog = true" class="add-btn">
        关联世界书
      </el-button>
    </div>

    <BaseDialog v-model="showDialog" title="选择要关联的世界书" width="80vw">
      <div class="selector-dialog-content">
        <el-input
          v-model="searchQuery"
          placeholder="搜索世界书..."
          :prefix-icon="Search"
          clearable
          class="search-input"
        />

        <div class="wb-list" v-loading="isLoading">
          <el-empty
            v-if="!isLoading && availableWorldbooks.length === 0"
            description="没有可选的世界书"
          />

          <div v-for="wb in availableWorldbooks" :key="wb.id" class="wb-item" @click="addWb(wb.id)">
            <div class="wb-info">
              <el-icon class="wb-icon"><Book /></el-icon>
              <span class="wb-name">{{ wb.name }}</span>
              <span class="wb-count">({{ wb.entryCount }} 条目)</span>
            </div>
            <el-icon class="add-icon"><Plus /></el-icon>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="showDialog = false">完成</el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.worldbook-selector {
  width: 100%;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
  align-items: center;
}

.wb-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mr-1 {
  margin-right: 4px;
}

.add-btn {
  border-style: dashed;
}

.selector-dialog-content {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.search-input {
  margin-bottom: 16px;
}

.wb-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.wb-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.wb-item:hover {
  background-color: var(--el-fill-color-light);
}

.wb-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
}

.wb-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wb-icon {
  color: var(--el-color-primary);
}

.wb-name {
  font-weight: 500;
}

.wb-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.add-icon {
  color: var(--el-text-color-placeholder);
}

.wb-item:hover .add-icon {
  color: var(--el-color-primary);
}
</style>
