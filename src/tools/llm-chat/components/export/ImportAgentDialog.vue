<script setup lang="ts">
import { ref, watch } from 'vue';
import type { AgentImportPreflightResult, ResolvedAgentToImport } from '../../agentStore';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import BaseDialog from '@/components/common/BaseDialog.vue';
import { ElAlert, ElDescriptions, ElDescriptionsItem, ElTag, ElSelect, ElOption, ElInput, ElRadioGroup, ElRadio } from 'element-plus';

const props = defineProps<{
  visible: boolean;
  preflightResult: AgentImportPreflightResult | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'confirm': [resolvedAgents: ResolvedAgentToImport[]];
  'cancel': [];
}>();

const { enabledProfiles } = useLlmProfiles();

// 为每个导入的 Agent 创建解决方案的响应式数据
const resolvedAgents = ref<ResolvedAgentToImport[]>([]);

// 当预检结果变化时，初始化 resolvedAgents
const initializeResolvedAgents = (result: AgentImportPreflightResult) => {
  resolvedAgents.value = result.agents.map((agent, index) => {
    const conflict = result.nameConflicts.find(c => c.agentIndex === index);
    const unmatched = result.unmatchedModels.find(m => m.agentIndex === index);

    // 尝试为不匹配的模型找一个可用的
    let finalProfileId = '';
    let finalModelId = agent.modelId;
    if (unmatched) {
      const firstProfile = enabledProfiles.value[0];
      if (firstProfile && firstProfile.models.length > 0) {
        finalProfileId = firstProfile.id;
        finalModelId = firstProfile.models[0].id;
      }
    }

    return {
      ...agent,
      finalProfileId,
      finalModelId,
      overwriteExisting: !!conflict,
      newName: conflict ? `${agent.name}_imported` : undefined,
    };
  });
};

// 监听 props 变化以初始化数据
watch(() => props.preflightResult, (newResult) => {
  if (newResult) {
    initializeResolvedAgents(newResult);
  }
}, { immediate: true });

const handleConfirm = () => {
  if (!props.preflightResult) return;
  emit('confirm', resolvedAgents.value);
};

const handleCancel = () => {
  emit('update:visible', false);
  emit('cancel');
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="导入智能体预检"
    width="800px"
    :close-on-backdrop-click="!loading"
  >
    <template #content>
      <div v-if="preflightResult" class="import-dialog-content">
        <!-- 总体情况 -->
        <ElAlert
          title="即将导入智能体"
          type="info"
          :closable="false"
          show-icon
          class="summary-alert"
        >
          <template #default>
            <p>即将导入 <strong>{{ preflightResult.agents.length }}</strong> 个智能体。</p>
            <p v-if="preflightResult.nameConflicts.length > 0" class="conflict-detail">
              发现 <strong>{{ preflightResult.nameConflicts.length }}</strong> 个名称冲突。
            </p>
            <p v-if="preflightResult.unmatchedModels.length > 0" class="conflict-detail">
              发现 <strong>{{ preflightResult.unmatchedModels.length }}</strong> 个模型不匹配。
            </p>
          </template>
        </ElAlert>

        <!-- Agent 列表 -->
        <div class="agents-list-section">
          <h4>请确认以下智能体的导入方式</h4>
          <div
            v-for="(agent, index) in preflightResult.agents"
            :key="index"
            class="agent-resolve-item"
          >
            <ElDescriptions :column="2" border>
              <ElDescriptionsItem label="名称">
                {{ agent.name }}
              </ElDescriptionsItem>
              <ElDescriptionsItem label="状态">
                <ElTag v-if="preflightResult.nameConflicts.find(c => c.agentIndex === index)" type="warning" size="small">
                  名称冲突
                </ElTag>
                <ElTag v-if="preflightResult.unmatchedModels.find(m => m.agentIndex === index)" type="danger" size="small">
                  模型不匹配
                </ElTag>
                <ElTag v-else type="success" size="small">
                  可直接导入
                </ElTag>
              </ElDescriptionsItem>
            </ElDescriptions>

            <!-- 冲突解决选项 -->
            <div class="resolve-options">
              <!-- 名称冲突解决 -->
              <div v-if="preflightResult.nameConflicts.find(c => c.agentIndex === index)" class="option-group">
                <h5>名称冲突解决</h5>
                <ElRadioGroup v-model="resolvedAgents[index].overwriteExisting">
                  <ElRadio :label="true">覆盖现有智能体</ElRadio>
                  <ElRadio :label="false">重命名后导入</ElRadio>
                </ElRadioGroup>
                <ElInput
                  v-if="!resolvedAgents[index].overwriteExisting"
                  v-model="resolvedAgents[index].newName"
                  placeholder="请输入新名称"
                  size="small"
                />
              </div>

              <!-- 模型不匹配解决 -->
              <div v-if="preflightResult.unmatchedModels.find(m => m.agentIndex === index)" class="option-group">
                <h5>模型重映射</h5>
                <p class="help-text">原模型 ({{ agent.modelId }}) 不可用，请选择一个新模型：</p>
                <ElSelect v-model="resolvedAgents[index].finalProfileId" placeholder="选择 Profile" size="small">
                  <ElOption
                    v-for="profile in enabledProfiles"
                    :key="profile.id"
                    :label="profile.name"
                    :value="profile.id"
                  />
                </ElSelect>
                <ElSelect
                  v-model="resolvedAgents[index].finalModelId"
                  placeholder="选择模型"
                  size="small"
                  style="margin-left: 8px;"
                >
                  <ElOption
                    v-for="model in (enabledProfiles.find(p => p.id === resolvedAgents[index].finalProfileId)?.models || [])"
                    :key="model.id"
                    :label="model.name"
                    :value="model.id"
                  />
                </ElSelect>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <p>未检测到有效的智能体导出文件</p>
      </div>
    </template>

    <template #footer>
      <ElButton @click="handleCancel" :disabled="loading">
        取消
      </ElButton>
      <ElButton
        type="primary"
        @click="handleConfirm"
        :disabled="!preflightResult || loading"
        :loading="loading"
      >
        确认导入
      </ElButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.import-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.summary-alert {
  margin-bottom: 4px;
}

.summary-alert p {
  margin: 4px 0;
}

.conflict-detail {
  color: var(--el-color-warning);
}

.agents-list-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.agent-resolve-item {
  margin-bottom: 24px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 16px;
  background-color: var(--el-bg-color-page);
}

.resolve-options {
  margin-top: 16px;
}

.option-group {
  margin-bottom: 16px;
}

.option-group h5 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 500;
}

.help-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px 0;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>