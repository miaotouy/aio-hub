<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAgentStore } from '../../agentStore';

import BaseDialog from '@/components/common/BaseDialog.vue';
import { ElCheckbox, ElCheckboxGroup } from 'element-plus';
import type { CheckboxValueType } from 'element-plus';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'export': [agentIds: string[], options: { includeAssets: boolean }];
}>();

const agentStore = useAgentStore();

const selectedAgentIds = ref<string[]>([]);
const includeAssets = ref(true);

const agents = computed(() => agentStore.agents);
const isIndeterminate = computed(() => {
  const selectedCount = selectedAgentIds.value.length;
  return selectedCount > 0 && selectedCount < agents.value.length;
});
const isAllSelected = computed(() => {
  return selectedAgentIds.value.length === agents.value.length && agents.value.length > 0;
});

const handleCheckAllChange = (val: CheckboxValueType) => {
  selectedAgentIds.value = val ? agents.value.map(agent => agent.id) : [];
};

const handleExport = () => {
  if (selectedAgentIds.value.length === 0) {
    // 可以在这里加一个提示，但通常按钮会是禁用状态
    return;
  }
  emit('export', selectedAgentIds.value, { includeAssets: includeAssets.value });
  handleClose();
};

const handleClose = () => {
  emit('update:visible', false);
};

// 当对话框打开时，默认全选
const handleOpen = () => {
  selectedAgentIds.value = agents.value.map(agent => agent.id);
};
</script>

<template>
  <BaseDialog
    :visible="visible"
    title="导出智能体"
    width="600px"
    @update:visible="handleClose"
    @open="handleOpen"
  >
    <template #content>
      <div class="export-dialog-content">
        <!-- Agent 选择列表 -->
        <div class="agent-list-section">
          <h4>选择要导出的智能体</h4>
          <el-checkbox
            :indeterminate="isIndeterminate"
            v-model="isAllSelected"
            @change="handleCheckAllChange"
          >
            全选
          </el-checkbox>
          <el-checkbox-group v-model="selectedAgentIds" class="agent-checkbox-group">
            <el-checkbox
              v-for="agent in agents"
              :key="agent.id"
              :label="agent.id"
              class="agent-checkbox-item"
            >
              <div class="agent-item">
                <span class="agent-icon">{{ agent.icon || '🤖' }}</span>
                <span class="agent-name">{{ agent.name }}</span>
              </div>
            </el-checkbox>
          </el-checkbox-group>
        </div>

        <!-- 导出选项 -->
        <div class="options-section">
          <h4>导出选项</h4>
          <el-checkbox v-model="includeAssets" label="包含图标等资产文件" />
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        @click="handleExport"
        :disabled="selectedAgentIds.length === 0"
      >
        导出 ({{ selectedAgentIds.length }})
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.export-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.agent-list-section h4,
.options-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.agent-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 8px;
}

.agent-checkbox-item {
  width: 100%;
}

.agent-checkbox-item :deep(.el-checkbox__label) {
  width: 100%;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.agent-icon {
  font-size: 18px;
  line-height: 1;
}

.agent-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
}
</style>