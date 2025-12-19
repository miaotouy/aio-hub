<script setup lang="ts">
import { computed } from 'vue';
import BaseDialog from '@/components/common/BaseDialog.vue';
import AgentAssetsManager from './AgentAssetsManager.vue';
import type { AgentAsset } from '../../types';

interface Props {
  modelValue: boolean;
  assets: AgentAsset[];
  agentId: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:assets', value: AgentAsset[]): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const localAssets = computed({
  get: () => props.assets,
  set: (val) => emit('update:assets', val)
});
</script>

<template>
  <BaseDialog
    v-model="visible"
    :title="`资产管理 - ${agentId}`"
    width="90%"
    height="85vh"
    :show-footer="false"
    append-to-body
    class="agent-assets-dialog"
  >
    <AgentAssetsManager
      v-model="localAssets"
      :agent-id="agentId"
    />
  </BaseDialog>
</template>

<style scoped>
.agent-assets-dialog :deep(.el-dialog__body) {
  padding: 0;
  height: calc(100% - 50px); /* 减去 header 高度 */
  overflow: hidden;
}
</style>