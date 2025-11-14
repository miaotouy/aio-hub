<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { ElMessageBox, ElAvatar } from 'element-plus';
import { useOcrHistory } from '../composables/useOcrHistory';
import type { OcrHistoryIndexItem } from '../types';
import { useAssetManager } from '@/composables/useAssetManager';
import { createModuleLogger } from '@/utils/logger';
import { format } from 'date-fns';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'load-record', recordId: string): void;
  (e: 're-recognize', recordId:string): void;
}>();

const logger = createModuleLogger('HistoryDialog');
const { loadHistoryIndex, deleteRecord } = useOcrHistory();
const { getAssetUrl } = useAssetManager();

const history = ref<OcrHistoryIndexItem[]>([]);
const isLoading = ref(false);
const thumbnailUrls = ref<Record<string, string>>({});

const isDialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
});

async function fetchHistory() {
  isLoading.value = true;
  try {
    const index = await loadHistoryIndex();
    history.value = index.records;
    await generateThumbnails(history.value);
  } catch (error) {
    logger.error('加载历史记录索引失败', error);
  } finally {
    isLoading.value = false;
  }
}

async function generateThumbnails(records: OcrHistoryIndexItem[]) {
  // 并行获取所有缩略图
  const promises = records.map(async (record) => {
    if (record.assetId && !thumbnailUrls.value[record.id]) {
      try {
        // 构建一个临时的 Asset-like 对象以使用 getAssetUrl
        const pseudoAsset = {
          id: record.assetId,
          path: record.assetPath,
          mimeType: record.assetMimeType,
          // getAssetUrl 需要的其他字段可以暂时为空
          type: 'image' as const,
          sourceModule: '',
          name: '',
          size: 0,
          createdAt: '',
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

async function handleDelete(record: OcrHistoryIndexItem) {
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
    await fetchHistory(); // 重新加载列表
    logger.info('历史记录已删除', { recordId: record.id });
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('删除历史记录失败', error, { recordId: record.id });
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
    title="OCR 历史记录"
    width="60%"
    top="10vh"
    append-to-body
    destroy-on-close
  >
    <div class="history-dialog-content" v-loading="isLoading">
      <el-table :data="history" height="60vh" empty-text="暂无历史记录">
        <el-table-column label="预览" width="100">
          <template #default="{ row }">
            <el-avatar shape="square" :size="60" :src="thumbnailUrls[row.id]">
              🖼️
            </el-avatar>
          </template>
        </el-table-column>
        <el-table-column label="识别内容">
          <template #default="{ row }">
            <div class="text-preview">{{ row.textPreview }}</div>
          </template>
        </el-table-column>
        <el-table-column label="引擎" width="120">
          <template #default="{ row }">
            <el-tag>{{ row.engine }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="识别时间" width="180">
          <template #default="{ row }">
            <span>{{ format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm:ss') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="$emit('load-record', row.id)">追加</el-button>
            <el-button size="small" @click="$emit('re-recognize', row.id)">重识别</el-button>
            <el-button type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </BaseDialog>
</template>

<style scoped>
.history-dialog-content {
  min-height: 60vh;
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
</style>