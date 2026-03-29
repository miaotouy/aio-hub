<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { ElMessageBox, ElAvatar, ElIcon } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import { useColorHistory } from '../composables/useColorHistory';
import type { ColorHistoryIndexItem } from '../composables/useColorHistory';
import { calculateColorDistance } from '../composables/useColorConverter';
import { useAssetManager } from '@/composables/useAssetManager';
import { useImageViewer } from '@/composables/useImageViewer';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import { format } from 'date-fns';
import BaseDialog from '@/components/common/BaseDialog.vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'load-record', recordId: string): void;
}>();

const logger = createModuleLogger('ColorPickerHistoryDialog');
const errorHandler = createModuleErrorHandler('ColorPickerHistoryDialog');
const { loadHistoryIndex, deleteRecord, clearAllRecords } = useColorHistory();
const { getAssetBasePath, convertToAssetProtocol } = useAssetManager();
const imageViewer = useImageViewer();

// 分页相关状态
const PAGE_SIZE = 20; // 每页加载数量
const allHistory = ref<ColorHistoryIndexItem[]>([]); // 所有历史记录
const displayedHistory = ref<ColorHistoryIndexItem[]>([]); // 当前显示的记录
const currentPage = ref(1);
const hasMore = ref(true);
const isLoadingMore = ref(false);
const thumbnailUrls = ref<Record<string, string>>({});
const assetBasePath = ref('');

// 搜索状态
const searchQuery = ref('');
const searchColor = ref('');
const colorThreshold = ref(60);

const isDialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
});

// 过滤后的历史记录
const filteredHistory = computed(() => {
  let result = allHistory.value;

  // 文本搜索
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(item =>
      item.sourceImageName.toLowerCase().includes(query)
    );
  }

  // 颜色搜索
  if (searchColor.value && /^#[0-9A-F]{6}$/i.test(searchColor.value)) {
    const targetColor = searchColor.value;
    const THRESHOLD = colorThreshold.value;
    
    result = result.filter(item => {
      // 检查预览颜色中是否有相似的颜色
      return item.colorPreview.some(color => {
        const distance = calculateColorDistance(color, targetColor);
        return distance < THRESHOLD;
      });
    });
  }

  return result;
});

// 监听过滤结果变化，重置分页
watch(filteredHistory, () => {
  currentPage.value = 1;
  displayedHistory.value = [];
  // 重新加载第一页
  loadPage(1);
});

async function fetchHistory() {
  currentPage.value = 1;
  displayedHistory.value = [];
  try {
    const index = await loadHistoryIndex();
    allHistory.value = index.records;
    // hasMore 的初始状态会在 watch(filteredHistory) 中被正确设置，因为 allHistory 赋值会触发 computed 更新
  } catch (error) {
    errorHandler.error(error, '加载历史记录索引失败');
  }
}

async function loadPage(page: number) {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRecords = filteredHistory.value.slice(start, end);

  if (pageRecords.length === 0) {
    if (page === 1) {
      displayedHistory.value = [];
    }
    hasMore.value = false;
    return;
  }

  if (page === 1) {
    displayedHistory.value = [...pageRecords];
  } else {
    displayedHistory.value.push(...pageRecords);
  }
  
  updateImageUrls(pageRecords);

  hasMore.value = end < filteredHistory.value.length;
  currentPage.value = page;
}

async function loadMore() {
  if (!hasMore.value || isLoadingMore.value) return;

  isLoadingMore.value = true;
  try {
    await loadPage(currentPage.value + 1);
  } catch (error) {
    errorHandler.error(error, '加载更多历史记录失败');
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

function updateImageUrls(records: ColorHistoryIndexItem[]) {
  if (!assetBasePath.value) return;
  
  records.forEach((record) => {
    if (record.assetId && !thumbnailUrls.value[record.id]) {
      // 默认尝试使用缩略图路径 (.thumbnails/{uuid}.jpg)
      // 使用 convertToAssetProtocol 直接生成 asset:// 链接，无需异步读取文件
      const thumbPath = `.thumbnails/${record.assetId}.jpg`;
      thumbnailUrls.value[record.id] = convertToAssetProtocol(thumbPath, assetBasePath.value);
    }
  });
}

function handleImageError(record: ColorHistoryIndexItem) {
  if (!record.assetId || !record.assetPath || !assetBasePath.value) return true;

  const currentSrc = thumbnailUrls.value[record.id];
  const originalSrc = convertToAssetProtocol(record.assetPath, assetBasePath.value);

  // 如果当前是缩略图（包含 .thumbnails），尝试降级到原图
  if (currentSrc && currentSrc.includes('.thumbnails')) {
    thumbnailUrls.value[record.id] = originalSrc;
    // 返回 false 阻止默认的 error 行为（显示 fallback slot），
    // 因为我们修改了 src，el-avatar 会尝试加载新 URL
    return false;
  }
  
  // 如果已经是原图还报错，则显示默认的 fallback slot
  return true;
}

function handlePreview(record: ColorHistoryIndexItem) {
  if (!record.assetId || !record.assetPath || !assetBasePath.value) return;

  try {
    const fullImageUrl = convertToAssetProtocol(record.assetPath, assetBasePath.value);
    if (fullImageUrl) {
      imageViewer.show(fullImageUrl);
    }
  } catch (error) {
    errorHandler.error(error, '预览图片失败', { context: { recordId: record.id } });
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
      errorHandler.error(error, '删除历史记录失败', { context: { recordId: record.id } });
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
      errorHandler.error(error, '清空历史记录失败');
    }
  }
}

watch(
  () => props.visible,
  async (isVisible) => {
    if (isVisible) {
      if (!assetBasePath.value) {
        try {
          assetBasePath.value = await getAssetBasePath();
        } catch (error) {
          errorHandler.error(error, '获取资产根目录失败');
        }
      }
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
    height="80vh"
    :show-close-button="true"
  >
    <div class="history-dialog-content">
      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索文件名..."
          clearable
          prefix-icon="Search"
          class="search-input"
        />
        <div class="color-search">
          <span class="label">颜色筛选:</span>
          <el-color-picker
            v-model="searchColor"
            size="default"
            :predefine="['#ff4500', '#ff8c00', '#ffd700', '#90ee90', '#00ced1', '#1e90ff', '#c71585']"
          />
          
          <template v-if="searchColor">
            <div class="threshold-control">
              <span class="label">容差: {{ colorThreshold }}</span>
              <el-slider
                v-model="colorThreshold"
                :min="0"
                :max="200"
                :step="5"
                size="small"
                style="width: 120px"
              />
            </div>
            <el-button link @click="searchColor = ''" size="small">清除</el-button>
          </template>
        </div>
      </div>

      <div v-if="displayedHistory.length > 0" class="history-list-container" @scroll="handleScroll">
        <el-scrollbar>
          <div class="history-grid">
            <div
              v-for="record in displayedHistory"
              :key="record.id"
              class="history-card"
            >
              <div class="card-image">
                <el-icon v-if="record.assetId && !thumbnailUrls[record.id]" class="is-loading" :size="28">
                  <Loading />
                </el-icon>
                <el-avatar
                  v-else
                  shape="square"
                  :size="120"
                  :src="thumbnailUrls[record.id]"
                  class="thumbnail-preview"
                  @click="handlePreview(record)"
                  @error="() => handleImageError(record)"
                >
                  🖼️
                </el-avatar>
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
        <el-empty :description="searchQuery || searchColor ? '没有找到匹配的记录' : '暂无历史记录'" />
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
  gap: 16px;
}

.search-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  padding-bottom: 4px;
}

.search-input {
  width: 340px;
}

.color-search {
  display: flex;
  align-items: center;
  gap: 8px;
}

.threshold-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid var(--el-border-color);
}

.label {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.history-list-container {
  flex-grow: 1;
  margin: 0 -16px -16px -16px; /* 抵消 BaseDialog 的 padding，但保留顶部间距 */
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
  border: var(--border-width) solid var(--border-color);
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

.thumbnail-preview {
  cursor: pointer;
  transition: transform 0.2s;
  width: 100%;
  height: 100%;
}

.thumbnail-preview:hover {
  transform: scale(1.05);
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
  border: var(--border-width) solid var(--border-color);
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