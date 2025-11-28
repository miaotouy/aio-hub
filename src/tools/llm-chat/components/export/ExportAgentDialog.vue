<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAgentStore } from '../../agentStore';
import { resolveAvatarPath } from '../../composables/useResolvedAvatar';

import BaseDialog from '@/components/common/BaseDialog.vue';
import Avatar from '@/components/common/Avatar.vue';
import { ElCheckbox, ElCheckboxGroup, ElRadioGroup, ElRadio } from 'element-plus';
import type { CheckboxValueType } from 'element-plus';

const props = defineProps<{
  visible: boolean;
  initialSelection?: string[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'export': [
    agentIds: string[],
    options: {
      includeAssets: boolean;
      format: 'json' | 'yaml';
      exportType: 'zip' | 'folder' | 'file';
      separateFolders: boolean;
    },
  ];
}>();

const agentStore = useAgentStore();

const selectedAgentIds = ref<string[]>([]);
const includeAssets = ref(true);
const exportFormat = ref<'json' | 'yaml'>('json');
const exportType = ref<'zip' | 'folder' | 'file'>('zip');
const separateFolders = ref(false);

// 监听导出类型变化，自动调整 includeAssets
watch(exportType, (newType) => {
  if (newType === 'file') {
    includeAssets.value = false;
  } else {
    includeAssets.value = true;
  }
});

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
  emit('export', selectedAgentIds.value, {
    includeAssets: includeAssets.value,
    format: exportFormat.value,
    exportType: exportType.value,
    separateFolders: separateFolders.value,
  });
  handleClose();
};

const handleClose = () => {
  emit('update:visible', false);
};

// 当对话框打开时，根据 props 初始化选中状态
const handleOpen = () => {
  if (props.initialSelection && props.initialSelection.length > 0) {
    selectedAgentIds.value = [...props.initialSelection];
  } else {
    selectedAgentIds.value = agents.value.map(agent => agent.id);
  }
};

const isSingleMode = computed(() => props.initialSelection?.length === 1);
const singleTargetAgent = computed(() => {
  if (!isSingleMode.value) return null;
  return agents.value.find(a => a.id === props.initialSelection![0]);
});
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :title="isSingleMode ? '导出智能体' : '批量导出智能体'"
    width="600px"
    @close="handleClose"
    @open="handleOpen"
  >
    <template #content>
      <div class="export-dialog-content">
        <!-- Agent 选择列表 (仅多选模式显示) -->
        <div v-if="!isSingleMode" class="agent-list-section">
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
              :value="agent.id"
              class="agent-checkbox-item"
            >
              <div class="agent-item">
                <Avatar
                  :src="resolveAvatarPath(agent, 'agent') || ''"
                  :alt="agent.name"
                  :size="18"
                  shape="square"
                  :radius="3"
                  class="agent-icon-avatar"
                />
                <span class="agent-name">{{ agent.displayName || agent.name }}</span>
              </div>
            </el-checkbox>
          </el-checkbox-group>
        </div>

        <!-- 单个 Agent 信息 (仅单选模式显示) -->
        <div v-else-if="singleTargetAgent" class="single-agent-info">
          <Avatar
            :src="resolveAvatarPath(singleTargetAgent, 'agent') || ''"
            :alt="singleTargetAgent.name"
            :size="48"
            shape="square"
            :radius="8"
          />
          <div class="info-text">
            <div class="name">{{ singleTargetAgent.displayName || singleTargetAgent.name }}</div>
            <div class="desc" v-if="singleTargetAgent.description">{{ singleTargetAgent.description }}</div>
          </div>
        </div>

        <!-- 导出选项 -->
        <div class="options-section">
          <h4>导出选项</h4>
          
          <div class="option-item">
            <span class="label">导出方式：</span>
            <el-radio-group v-model="exportType" size="small">
              <el-radio value="zip">ZIP 压缩包</el-radio>
              <el-radio value="folder">文件夹</el-radio>
              <el-radio value="file">仅配置文件</el-radio>
            </el-radio-group>
          </div>

          <div class="option-item">
            <el-checkbox
              v-model="includeAssets"
              label="包含图标等资产文件"
              :disabled="exportType === 'file'"
            />
          </div>

          <div class="option-item" v-if="!isSingleMode">
            <el-checkbox
              v-model="separateFolders"
              label="为每个智能体创建独立文件夹"
            />
          </div>
          
          <div class="option-item format-select">
            <span class="label">文件格式：</span>
            <el-radio-group v-model="exportFormat" size="small">
              <el-radio value="json">JSON</el-radio>
              <el-radio value="yaml">YAML</el-radio>
            </el-radio-group>
          </div>
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
        {{ isSingleMode ? '导出' : `导出 (${selectedAgentIds.length})` }}
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
  margin-right: 0;
}

.agent-checkbox-item :deep(.el-checkbox__label) {
  flex: 1;
  min-width: 0;
  display: flex;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.agent-icon-avatar {
  flex-shrink: 0;
}

.agent-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-item {
  margin-bottom: 8px;
}

.format-select {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.format-select .label {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.single-agent-info {
  display: flex;
  gap: 16px;
  padding: 16px;
  background-color: var(--bg-color-soft);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.single-agent-info .info-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.single-agent-info .name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
}

.single-agent-info .desc {
  font-size: 13px;
  color: var(--text-color-light);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>