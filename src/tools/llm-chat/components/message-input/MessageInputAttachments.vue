<script setup lang="ts">
import AttachmentCard from "../AttachmentCard.vue";
import type { Asset } from "@/types/asset-management";

interface Props {
  attachments: Asset[];
  count: number;
  maxCount: number;
  getWillUseTranscription: (asset: Asset) => boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "remove", asset: Asset): void;
}>();
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
  border: 1px dashed var(--border-color);
  margin-bottom: 4px;
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachments-info {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  pointer-events: none;
  z-index: 1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.attachment-count {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
</style>
