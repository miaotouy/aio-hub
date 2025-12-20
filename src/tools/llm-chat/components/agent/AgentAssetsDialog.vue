<script setup lang="ts">
import { computed } from 'vue';
import BaseDialog from '@/components/common/BaseDialog.vue';
import AgentAssetsManager from './AgentAssetsManager.vue';
import type { AgentAsset, AssetGroup } from '../../types';

interface Props {
  modelValue: boolean;
  assets: AgentAsset[];
  assetGroups?: AssetGroup[];
  agentId: string;
  agentName?: string; // 用于标题显示的智能体名称
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:assets', value: AgentAsset[]): void;
  (e: 'update:assetGroups', value: AssetGroup[]): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const localAssets = computed({
  get: () => props.assets,
  set: (val) => emit('update:assets', val)
});

const localAssetGroups = computed({
  get: () => props.assetGroups || [],
  set: (val) => emit('update:assetGroups', val)
});
</script>

<template>
  <BaseDialog
    v-model="visible"
    :title="`资产管理 - ${agentName || agentId}`"
    width="90%"
    height="85vh"
    :show-footer="false"
    append-to-body
    class="agent-assets-dialog"
  >
    <AgentAssetsManager
      v-model="localAssets"
      v-model:asset-groups="localAssetGroups"
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