<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { ElMessageBox, ElAvatar, ElIcon } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { useClipboard } from "@vueuse/core";
import { useOcrHistory } from "../composables/useOcrHistory";
import type { OcrHistoryIndexItem } from "../types";
import { useAssetManager } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import { format } from "date-fns";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "load-record", recordId: string): void;
  (e: "re-recognize", recordId: string): void;
}>();

const logger = createModuleLogger("HistoryDialog");
const { loadHistoryIndex, deleteRecord, loadFullRecord: loadHistoryRecord } = useOcrHistory();
const { getAssetBasePath, convertToAssetProtocol } = useAssetManager();
const imageViewer = useImageViewer();
const { copy, copied } = useClipboard();

// 分页相关状态
const PAGE_SIZE = 20; // 每页加载数量
const allHistory = ref<OcrHistoryIndexItem[]>([]); // 所有历史记录
const displayedHistory = ref<OcrHistoryIndexItem[]>([]); // 当前显示的记录
const currentPage = ref(1);
const hasMore = ref(true);
const isLoading = ref(false);
const isLoadingMore = ref(false);
const thumbnailUrls = ref<Record<string, string>>({});
const assetBasePath = ref("");

const isDialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit("update:visible", val),
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
    logger.error("加载历史记录索引失败", error);
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
  updateImageUrls(pageRecords);

  hasMore.value = end < allHistory.value.length;
  currentPage.value = page;
}

async function loadMore() {
  if (!hasMore.value || isLoadingMore.value) return;

  isLoadingMore.value = true;
  try {
    await loadPage(currentPage.value + 1);
  } catch (error) {
    logger.error("加载更多历史记录失败", error);
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

function updateImageUrls(records: OcrHistoryIndexItem[]) {
  if (!assetBasePath.value) return;

  records.forEach((record) => {
    if (record.assetId && !thumbnailUrls.value[record.id]) {
      // 默认尝试使用缩略图路径 (.thumbnails/{uuid}.jpg)
      const thumbPath = `.thumbnails/${record.assetId}.jpg`;
      thumbnailUrls.value[record.id] = convertToAssetProtocol(thumbPath, assetBasePath.value);
    }
  });
}

function handleImageError(record: OcrHistoryIndexItem) {
  if (!record.assetId || !record.assetPath || !assetBasePath.value) return true;

  const currentSrc = thumbnailUrls.value[record.id];
  const originalSrc = convertToAssetProtocol(record.assetPath, assetBasePath.value);

  // 如果当前是缩略图，尝试降级到原图
  if (currentSrc && currentSrc.includes(".thumbnails")) {
    thumbnailUrls.value[record.id] = originalSrc;
    return false; // 阻止默认的 error 行为，尝试加载新 URL
  }

  return true; // 已经是原图还报错，显示 fallback
}

function handlePreview(record: OcrHistoryIndexItem) {
  if (!record.assetId || !record.assetPath || !assetBasePath.value) return;

  try {
    const fullImageUrl = convertToAssetProtocol(record.assetPath, assetBasePath.value);
    if (fullImageUrl) {
      imageViewer.show(fullImageUrl);
    }
  } catch (error) {
    logger.error("预览图片失败", error, { recordId: record.id });
  }
}

async function handleDelete(record: OcrHistoryIndexItem) {
  try {
    await ElMessageBox.confirm(
      "确定要删除这条历史记录吗？如果关联的图片未被其他记录引用，它将被移入回收站。",
      "确认删除",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
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

    logger.info("历史记录已删除", { recordId: record.id });
  } catch (error) {
    if (error !== "cancel") {
      logger.error("删除历史记录失败", error, { recordId: record.id });
    }
  }
}

async function handleCopy(record: OcrHistoryIndexItem) {
  try {
    const fullRecord = await loadHistoryRecord(record.id);
    if (fullRecord && fullRecord.results && fullRecord.results.length > 0) {
      const fullText = fullRecord.results.map((r) => r.text).join("\n");
      await copy(fullText);
      if (copied.value) {
        customMessage.success("已复制全部内容");
      }
    } else {
      customMessage.warning("未能加载到有效的文本内容");
    }
  } catch (error) {
    logger.error("复制失败", error, { recordId: record.id });
    customMessage.error("复制失败");
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
          logger.error("获取资产根目录失败", error);
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
    title="OCR 历史记录"
    width="80%"
  >
    <div class="history-dialog-content">
      <div class="table-wrapper" @scroll="handleScroll">
        <el-table :data="displayedHistory" height="60vh" empty-text="暂无历史记录" v-loading="isLoading">
          <el-table-column label="预览" width="100">
            <template #default="{ row }">
              <el-avatar
                shape="square"
                :size="60"
                :src="thumbnailUrls[row.id]"
                class="thumbnail-preview"
                @click="handlePreview(row)"
                @error="() => handleImageError(row)"
              >
                🖼️
              </el-avatar>
            </template>
          </el-table-column>
          <el-table-column label="识别内容">
            <template #default="{ row }">
              <div class="text-preview">{{ row.textPreview }}</div>
            </template>
          </el-table-column>
          <el-table-column label="引擎" width="160">
            <template #default="{ row }">
              <div class="engine-info">
                <el-tag size="small">{{ row.engine }}</el-tag>
                <el-tooltip
                  v-if="row.engineDetail"
                  :content="row.engineDetail"
                  placement="top"
                  :show-after="300"
                >
                  <span class="engine-detail">
                    {{ row.engineDetail }}
                  </span>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="识别时间" width="180">
            <template #default="{ row }">
              <span>{{ format(new Date(row.createdAt), "yyyy-MM-dd HH:mm:ss") }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="$emit('load-record', row.id)">追加</el-button>
              <el-button size="small" @click="handleCopy(row)">复制</el-button>
              <el-button size="small" @click="$emit('re-recognize', row.id)">重识别</el-button>
              <el-button type="danger" size="small" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

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
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.history-dialog-content {
  min-height: 60vh;
}

.table-wrapper {
  height: 60vh;
  overflow-y: auto;
  position: relative;
}

.text-preview {
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.thumbnail-preview {
  cursor: pointer;
  transition: transform 0.2s;
}

.thumbnail-preview:hover {
  transform: scale(1.05);
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

.engine-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.engine-detail {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
</style>
