<script setup lang="ts">
import { computed } from 'vue';
import type { PluginManifest } from '@/services/plugin-types';
import BaseDialog from '@/components/common/BaseDialog.vue';
import { ElButton, ElDescriptions, ElDescriptionsItem, ElTag, ElAlert } from 'element-plus';

/**
 * 安装类型枚举
 */
export type InstallType = 'new' | 'upgrade' | 'downgrade' | 'reinstall' | 'conflict';

/**
 * 预检结果接口
 */
export interface PreflightResult {
  /** ZIP 文件路径 */
  zipPath: string;
  /** 插件元数据 */
  manifest: PluginManifest;
  /** 安装类型 */
  installType: InstallType;
  /** 现有插件的版本（如果存在） */
  existingVersion?: string;
  /** 冲突信息（如果有） */
  conflicts?: string[];
}

const props = defineProps<{
  visible: boolean;
  preflightResult: PreflightResult | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'confirm': [result: PreflightResult];
  'cancel': [];
}>();

// 安装类型标签配置
const installTypeConfig = computed(() => {
  if (!props.preflightResult) return null;
  
  const configs = {
    new: {
      label: '新安装',
      type: 'success' as const,
      description: '这是一个全新的插件，将被安装到系统中。',
    },
    upgrade: {
      label: '升级安装',
      type: 'primary' as const,
      description: `将从版本 ${props.preflightResult.existingVersion} 升级到 ${props.preflightResult.manifest.version}。`,
    },
    downgrade: {
      label: '降级安装',
      type: 'warning' as const,
      description: `将从版本 ${props.preflightResult.existingVersion} 降级到 ${props.preflightResult.manifest.version}。这可能导致功能丢失或不兼容问题。`,
    },
    reinstall: {
      label: '重新安装',
      type: 'info' as const,
      description: `将重新安装相同版本 ${props.preflightResult.manifest.version}。现有配置将被保留。`,
    },
    conflict: {
      label: '冲突',
      type: 'error' as const,
      description: '检测到以下冲突，请先解决后再尝试安装。',
    },
  };
  
  return configs[props.preflightResult.installType];
});

// 是否有冲突
const hasConflict = computed(() => {
  return props.preflightResult?.installType === 'conflict';
});

// 是否可以安装（无冲突）
const canInstall = computed(() => {
  return props.preflightResult && !hasConflict.value;
});

function handleConfirm() {
  if (props.preflightResult && canInstall.value) {
    emit('confirm', props.preflightResult);
  }
}

function handleCancel() {
  emit('update:visible', false);
  emit('cancel');
}
</script>

<template>
  <BaseDialog
    :model-value="visible"
    title="插件安装预检"
    width="700px"
    :close-on-backdrop-click="!loading"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template #content>
      <div v-if="preflightResult" class="preflight-content">
        <!-- 安装类型警告 -->
        <ElAlert
          :title="installTypeConfig?.label || ''"
          :type="installTypeConfig?.type || 'info'"
          :description="installTypeConfig?.description"
          :closable="false"
          show-icon
          class="install-type-alert"
        />

        <!-- 冲突列表 -->
        <div v-if="hasConflict && preflightResult.conflicts" class="conflicts-section">
          <h4 class="section-title">检测到的冲突：</h4>
          <ul class="conflict-list">
            <li v-for="(conflict, index) in preflightResult.conflicts" :key="index">
              {{ conflict }}
            </li>
          </ul>
        </div>

        <!-- 插件信息 -->
        <div class="plugin-info-section">
          <h4 class="section-title">插件信息</h4>
          <ElDescriptions :column="2" border>
            <ElDescriptionsItem label="插件 ID">
              <code class="plugin-id">{{ preflightResult.manifest.id }}</code>
            </ElDescriptionsItem>
            <ElDescriptionsItem label="名称">
              {{ preflightResult.manifest.name }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="版本">
              <ElTag size="small">{{ preflightResult.manifest.version }}</ElTag>
            </ElDescriptionsItem>
            <ElDescriptionsItem label="类型">
              <ElTag :type="preflightResult.manifest.type === 'javascript' ? 'success' : 'primary'" size="small">
                {{ preflightResult.manifest.type }}
              </ElTag>
            </ElDescriptionsItem>
            <ElDescriptionsItem label="作者" :span="2">
              {{ preflightResult.manifest.author }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="描述" :span="2">
              {{ preflightResult.manifest.description }}
            </ElDescriptionsItem>
            <ElDescriptionsItem v-if="preflightResult.manifest.tags?.length" label="标签" :span="2">
              <ElTag
                v-for="tag in preflightResult.manifest.tags"
                :key="tag"
                size="small"
                class="tag-item"
              >
                {{ tag }}
              </ElTag>
            </ElDescriptionsItem>
            <ElDescriptionsItem label="应用版本要求" :span="1">
              {{ preflightResult.manifest.host.appVersion || '未指定' }}
            </ElDescriptionsItem>
            <ElDescriptionsItem label="API 版本要求" :span="1">
              {{ preflightResult.manifest.host.apiVersion || '未指定' }}
            </ElDescriptionsItem>
            <ElDescriptionsItem v-if="preflightResult.manifest.ui" label="提供 UI" :span="2">
              <ElTag type="success" size="small">是</ElTag>
              <span class="ui-info">
                ({{ preflightResult.manifest.ui.displayName || preflightResult.manifest.name }})
              </span>
            </ElDescriptionsItem>
            <ElDescriptionsItem label="暴露方法数" :span="2">
              {{ preflightResult.manifest.methods?.length ?? 0 }} 个
            </ElDescriptionsItem>
            <ElDescriptionsItem v-if="preflightResult.manifest.settingsSchema" label="配置项" :span="2">
              <ElTag type="info" size="small">
                {{ Object.keys(preflightResult.manifest.settingsSchema.properties).length }} 个配置项
              </ElTag>
            </ElDescriptionsItem>
          </ElDescriptions>
        </div>

        <!-- 方法列表 -->
        <div v-if="preflightResult.manifest.methods && preflightResult.manifest.methods.length > 0" class="methods-section">
          <h4 class="section-title">暴露的方法</h4>
          <div class="methods-list">
            <ElTag
              v-for="method in preflightResult.manifest.methods"
              :key="method.name"
              size="small"
              class="method-tag"
            >
              {{ method.name }}
            </ElTag>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <p>未检测到插件信息</p>
      </div>
    </template>

    <template #footer>
      <ElButton @click="handleCancel" :disabled="loading">
        取消
      </ElButton>
      <ElButton
        type="primary"
        @click="handleConfirm"
        :disabled="!canInstall || loading"
        :loading="loading"
      >
        {{ hasConflict ? '无法安装' : '确认安装' }}
      </ElButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.preflight-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.install-type-alert {
  margin-bottom: 4px;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.conflicts-section {
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.conflict-list {
  margin: 8px 0 0 0;
  padding-left: 24px;
  color: var(--el-color-danger);
}

.conflict-list li {
  margin-bottom: 4px;
}

.plugin-id {
  padding: 2px 6px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  color: var(--el-color-primary);
}

.tag-item {
  margin-right: 8px;
  margin-bottom: 4px;
}

.ui-info {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.methods-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.method-tag {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>