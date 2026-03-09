<script setup lang="ts">
import { Trash2 } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import AttachmentCard from "../AttachmentCard.vue";
import type { Asset } from "@/types/asset-management";

interface Props {
  attachments: Asset[];
  count: number;
  maxCount: number;
  getWillUseTranscription: (asset: Asset) => boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "remove", asset: Asset): void;
  (e: "clear"): void;
}>();

const handleClear = async () => {
  try {
    await ElMessageBox.confirm("确定要清空所有附件吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    emit("clear");
  } catch {
    // 用户取消
  }
};
</script>

<template>
  <div class="attachments-area">
    <div class="attachments-list">
      <AttachmentCard
        v-for="asset in attachments"
        :key="asset.id"
        :asset="asset"
        :all-assets="attachments"
        :removable="true"
        size="small"
        :will-use-transcription="getWillUseTranscription(asset)"
        @remove="emit('remove', asset)"
      />
    </div>
    <!-- 附件数量浮动显示 -->
    <div class="attachments-info">
      <span class="attachment-count"> {{ count }} / {{ maxCount }} </span>
      <div class="divider"></div>
      <el-button type="danger" link class="clear-btn" title="清空所有附件" @click="handleClear">
        <template #icon>
          <Trash2 :size="12" />
        </template>
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.attachments-area {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 10px;
  border-radius: 12px;
  background: var(--input-bg, var(--container-bg));
  border: 1px solid var(--border-color);
  margin-bottom: 4px;
  max-height: 200px;
  overflow-y: auto;
}

/* 优化滚动条 */
.attachments-area::-webkit-scrollbar {
  width: 4px;
}

.attachments-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachments-info {
  position: sticky;
  top: 0;
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  z-index: 1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.attachment-count {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.divider {
  width: 1px;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
}

.clear-btn {
  padding: 2px;
  height: auto;
  margin-left: -2px;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s ease;
}

.clear-btn:hover {
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), 0.1);
}

.clear-btn:active {
  transform: scale(0.9);
}

.clear-btn :deep(.el-icon) {
  font-size: 12px;
}
</style>
