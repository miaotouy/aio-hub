<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useWorldbookStore } from '../../worldbookStore';
import { importSTWorldbook } from '../../services/worldbookImportService';
import { customMessage } from '@/utils/customMessage';
import { Book, Plus, Trash2, Eye, Download, Search } from 'lucide-vue-next';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import WorldbookDetail from './WorldbookDetail.vue';

const worldbookStore = useWorldbookStore();
const searchQuery = ref('');
const selectedWbId = ref<string | null>(null);
const showDetail = ref(false);

onMounted(async () => {
  await worldbookStore.loadWorldbooks();
});

const handleImport = async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const id = await importSTWorldbook(file);
      if (id) {
        customMessage.success('世界书导入成功');
        await worldbookStore.loadWorldbooks();
      }
    }
  };
  input.click();
};

const handleDelete = async (id: string) => {
  try {
    await worldbookStore.deleteWorldbook(id);
    customMessage.success('世界书已删除');
  } catch (error) {
    customMessage.error('删除失败');
  }
};

const openDetail = (id: string) => {
  selectedWbId.value = id;
  showDetail.value = true;
};

const worldbooks = computed(() => {
  if (!searchQuery.value) return worldbookStore.worldbooks;
  const q = searchQuery.value.toLowerCase();
  return worldbookStore.worldbooks.filter(wb =>
    wb.name.toLowerCase().includes(q) ||
    wb.description?.toLowerCase().includes(q)
  );
});
</script>

<template>
  <div class="worldbook-full-manager">
    <div class="header-actions">
      <el-input
        v-model="searchQuery"
        placeholder="搜索世界书..."
        :prefix-icon="Search"
        clearable
        class="search-input"
      />
      <el-button type="primary" :icon="Plus" @click="handleImport">
        导入世界书
      </el-button>
    </div>

    <el-table :data="worldbooks" style="width: 100%" height="100%">
      <el-table-column label="名称" min-width="180">
        <template #default="{ row }">
          <div class="wb-name-cell">
            <el-icon class="wb-icon"><Book /></el-icon>
            <span class="wb-name">{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="entryCount" label="条目数" width="100" align="center" />
      <el-table-column label="最后更新" width="180">
        <template #default="{ row }">
          <span class="time-text">
            {{ formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true, locale: zhCN }) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button-group>
            <el-tooltip content="预览条目" placement="top">
              <el-button :icon="Eye" size="small" @click="openDetail(row.id)" />
            </el-tooltip>
            <el-tooltip content="导出" placement="top">
              <el-button :icon="Download" size="small" disabled />
            </el-tooltip>
            <el-popconfirm title="确定删除这本世界书吗？" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button :icon="Trash2" size="small" type="danger" plain />
              </template>
            </el-popconfirm>
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <!-- 详情抽屉/弹窗 -->
    <el-drawer
      v-model="showDetail"
      title="世界书预览"
      size="60%"
      destroy-on-close
    >
      <WorldbookDetail v-if="selectedWbId" :id="selectedWbId" />
    </el-drawer>
  </div>
</template>

<style scoped>
.worldbook-full-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 600px; /* 默认高度，在弹窗中会被撑开 */
  max-height: 80vh;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.search-input {
  flex: 1;
  max-width: 300px;
}

.wb-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wb-icon {
  color: var(--el-color-primary);
  font-size: 18px;
}

.wb-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.time-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

:deep(.el-table) {
  background-color: transparent;
  --el-table-border-color: var(--border-color);
  --el-table-header-bg-color: var(--card-bg);
  --el-table-tr-bg-color: transparent;
}
</style>