<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { ElMessageBox, ElIcon } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import { useColorHistory } from '../composables/useColorHistory';
import type { ColorHistoryIndexItem } from '../composables/useColorHistory';
import { useAssetManager } from '@/composables/useAssetManager';
import { useImageViewer } from '@/composables/useImageViewer';
import { createModuleLogger } from '@/utils/logger';
import { customMessage } from '@/utils/customMessage';
import { format } from 'date-fns';
import BaseDialog from '@/components/common/BaseDialog.vue';
import Avatar from '@/components/common/Avatar.vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'load-record', recordId: string): void;
}>();

const logger = createModuleLogger('ColorPickerHistoryDialog');
const { loadHistoryIndex, deleteRecord, clearAllRecords } = useColorHistory();
const { getAssetUrl } = useAssetManager();
const imageViewer = useImageViewer();

// 分页相关状态
const PAGE_SIZE = 20; // 每页加载数量
const allHistory = ref<ColorHistoryIndexItem[]>([]); // 所有历史记录
const displayedHistory = ref<ColorHistoryIndexItem[]>([]); // 当前显示的记录
const currentPage = ref(1);
const hasMore = ref(true);
const isLoading = ref(false);
const isLoadingMore = ref(false);
const thumbnailUrls = ref<Record<string, string>>({});

const isDialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
});

async function fetchHistory() {
  isLoading.value = true;
  currentPage.value = 1;
  displayedHistory.value = [];
  try {
    const index = await loadHistoryIndex();
    allHistory.value = index.records;
    hasMore.value = allHistory.value.length > PAGE_SIZE;

    // 加载第一页
    await loadPage(1);
  } catch (error) {
    logger.error('加载历史记录索引失败', error);
    customMessage.error('加载历史记录失败');
  } finally {
    isLoading.value = false;
  }
}

async function loadPage(page: number) {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRecords = allHistory.value.slice(start, end);

  if (pageRecords.length === 0) {
    hasMore.value = false;
    return;
  }

  displayedHistory.value.push(...pageRecords);
  await generateThumbnails(pageRecords);

  hasMore.value = end < allHistory.value.length;
  currentPage.value = page;
}

async function loadMore() {
  if (!hasMore.value || isLoadingMore.value) return;

  isLoadingMore.value = true;
  try {
    await loadPage(currentPage.value + 1);
  } catch (error) {
    logger.error('加载更多历史记录失败', error);
  } finally {
    isLoadingMore.value = false;
  }
}

function handleScroll(event: Event) {
  const target = event.target as HTMLElement;
  const scrollTop = target.scrollTop;
  const scrollHeight = target.scrollHeight;
  const clientHeight = target.clientHeight;

  // 当滚动到距离底部 100px 时触发加载
  if (scrollHeight - scrollTop - clientHeight < 100) {
    loadMore();
  }
}

async function generateThumbnails(records: ColorHistoryIndexItem[]) {
  // 并行获取所有缩略图
  const promises = records.map(async (record) => {
    if (record.assetId && !thumbnailUrls.value[record.id]) {
      try {
        // 构建一个临时的 Asset-like 对象以使用 getAssetUrl
        const pseudoAsset = {
          id: record.assetId,
          path: record.assetPath,
          mimeType: record.assetMimeType,
          type: 'image' as const,
          sourceModule: 'color-picker',
          name: '',
          size: 0,
          createdAt: '',
          origins: [],
        };
        const url = await getAssetUrl(pseudoAsset, true); // true 表示使用缩略图
        if (url) {
          thumbnailUrls.value[record.id] = url;
        }
      } catch (error) {
        logger.warn('生成缩略图失败', { recordId: record.id, assetId: record.assetId });
      }
    }
  });
  await Promise.all(promises);
}

async function handlePreview(record: ColorHistoryIndexItem) {
  if (!record.assetId) return;

  try {
    // 构建完整的 Asset 对象以获取完整图片 URL
    const pseudoAsset = {
      id: record.assetId,
      path: record.assetPath,
      mimeType: record.assetMimeType,
      type: 'image' as const,
      sourceModule: 'color-picker',
      name: '',
      size: 0,
      createdAt: '',
      origins: [],
    };
    const fullImageUrl = await getAssetUrl(pseudoAsset, false); // false 表示获取完整图片
    if (fullImageUrl) {
      imageViewer.show(fullImageUrl);
    }
  } catch (error) {
    logger.error('预览图片失败', error, { recordId: record.id });
  }
}

async function handleLoad(record: ColorHistoryIndexItem) {
  emit('load-record', record.id);
  isDialogVisible.value = false;
}

async function handleDelete(record: ColorHistoryIndexItem) {
  try {
    await ElMessageBox.confirm(
      '确定要删除这条历史记录吗？如果关联的图片未被其他记录引用，它将被移入回收站。',
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    await deleteRecord(record.id);

    // 从所有记录中移除
    allHistory.value = allHistory.value.filter((r) => r.id !== record.id);
    // 从显示记录中移除
    displayedHistory.value = displayedHistory.value.filter((r) => r.id !== record.id);
    // 移除缩略图
    delete thumbnailUrls.value[record.id];

    // 更新 hasMore 状态
    hasMore.value = displayedHistory.value.length < allHistory.value.length;

    customMessage.success('已删除历史记录');
    logger.info('历史记录已删除', { recordId: record.id });
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('删除历史记录失败', error, { recordId: record.id });
      customMessage.error('删除失败');
    }
  }
}

async function handleClearAll() {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有历史记录吗？此操作不可恢复。',
      '确认清空',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    
    await clearAllRecords();
    allHistory.value = [];
    displayedHistory.value = [];
    thumbnailUrls.value = {};
    hasMore.value = false;
    
    customMessage.success('已清空所有历史记录');
    logger.info('已清空所有历史记录');
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('清空历史记录失败', error);
      customMessage.error('清空失败');
    }
  }
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      fetchHistory();
    }
  }
);
</script>

<template>
  <BaseDialog
    v-model="isDialogVisible"
    title="颜色分析历史"
    width="80%"
    height="70vh"
    :show-close="true"
    :show-footer="true"
  >
    <div class="history-dialog-content" v-loading="isLoading">
      <div v-if="displayedHistory.length > 0" class="history-list-container" @scroll="handleScroll">
        <el-scrollbar>
          <div class="history-grid">
            <div
              v-for="record in displayedHistory"
              :key="record.id"
              class="history-card"
            >
              <div class="card-image" @click="handlePreview(record)">
                <Avatar 
                  :src="thumbnailUrls[record.id]" 
                  :alt="record.sourceImageName" 
                  :size="120"
                  shape="square"
                />
              </div>
              
              <div class="card-content">
                <div class="card-header">
                  <div class="file-name" :title="record.sourceImageName">
                    {{ record.sourceImageName }}
                  </div>
                  <div class="timestamp">
                    {{ format(new Date(record.createdAt), 'yyyy-MM-dd HH:mm') }}
                  </div>
                </div>
                
                <div class="color-preview">
                  <div
                    v-for="(color, index) in record.colorPreview"
                    :key="index"
                    class="color-swatch"
                    :style="{ backgroundColor: color }"
                    :title="color"
                  ></div>
                </div>
                
                <div class="card-actions">
                  <el-button size="small" @click="handleLoad(record)">
                    加载
                  </el-button>
                  <el-button size="small" type="danger" @click="handleDelete(record)">
                    删除
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 加载更多提示 -->
          <div v-if="isLoadingMore" class="loading-more">
            <el-icon class="is-loading">
              <Loading />
            </el-icon>
            <span>加载中...</span>
          </div>
          <div v-else-if="!hasMore && displayedHistory.length > 0" class="no-more">
            已加载全部 {{ allHistory.length }} 条记录
          </div>
        </el-scrollbar>
      </div>
      <div v-else class="empty-state">
        <el-empty description="暂无历史记录" />
      </div>
    </div>

    <template #footer>
      <el-button 
        type="danger" 
        plain 
        :disabled="displayedHistory.length === 0"
        @click="handleClearAll"
      >
        清空所有历史
      </el-button>
      <el-button @click="isDialogVisible = false">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.history-dialog-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.history-list-container {
  flex-grow: 1;
  margin: -16px; /* 抵消 BaseDialog 的 padding */
  height: 100%;
  overflow-y: auto;
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  padding: 16px;
}

.history-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.history-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.card-image {
  width: 100%;
  height: 120px;
  cursor: pointer;
  overflow: hidden;
  background-color: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-image :deep(.el-avatar) {
  width: 100%;
  height: 100%;
}

.card-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timestamp {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.color-preview {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  min-height: 24px;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.color-swatch:hover {
  transform: scale(1.1);
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}

.card-actions .el-button {
  flex: 1;
}

.loading-more,
.no-more {
  text-align: center;
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.no-more {
  border-top: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-fill-color-blank);
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>