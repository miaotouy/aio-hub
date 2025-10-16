<script setup lang="ts">
import { computed } from 'vue';
import { useAgentStore } from '../agentStore';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { Plus, Edit, Delete } from '@element-plus/icons-vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import type { ChatAgent } from '../types';

interface Props {
  currentAgentId: string;
}

interface Emits {
  (e: 'change', agentId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const agentStore = useAgentStore();
const { getProfileById } = useLlmProfiles();

// 按最后使用时间排序的智能体列表
const sortedAgents = computed(() => agentStore.sortedAgents);

// 选择智能体
const selectAgent = (agentId: string) => {
  emit('change', agentId);
};

// 判断智能体是否被选中
const isAgentSelected = (agentId: string) => {
  return agentId === props.currentAgentId;
};

// 获取智能体的模型信息
const getAgentModelInfo = (agent: any) => {
  const profile = getProfileById(agent.profileId);
  if (!profile) return { profileName: '未知服务', modelName: '未知模型' };
  
  const model = profile.models.find(m => m.id === agent.modelId);
  return {
    profileName: profile.name,
    modelName: model?.name || '未知模型',
  };
};

// 添加智能体
const handleAdd = () => {
  ElMessageBox.prompt('请输入智能体名称', '创建新智能体', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPattern: /\S/, // a non-whitespace character
    inputErrorMessage: '名称不能为空',
  })
    .then(({ value }) => {
      const { enabledProfiles } = useLlmProfiles();
      if (enabledProfiles.value.length === 0 || enabledProfiles.value[0].models.length === 0) {
        ElMessage.error('没有可用的模型配置，无法创建智能体');
        return;
      }
      const defaultProfile = enabledProfiles.value[0];
      const defaultModel = defaultProfile.models[0];
      
      const newAgentId = agentStore.createAgent(value, defaultProfile.id, defaultModel.id, {
        description: '新创建的智能体',
        icon: '🤖',
      });
      ElMessage.success(`智能体 "${value}" 创建成功`);
      // 自动选中新创建的智能体
      selectAgent(newAgentId);
    })
    .catch(() => {
      // 用户取消
    });
};

// 编辑智能体（占位）
const handleEdit = (agent: ChatAgent) => {
  ElMessage.info(`编辑功能待实现: ${agent.name}`);
  // 未来可以路由到专门的编辑页面
  // router.push(`/settings/llm/agents/${agent.id}`);
};

// 删除智能体
const handleDelete = (agent: ChatAgent) => {
  if (agent.isBuiltIn) {
    ElMessage.warning('不能删除内置的默认智能体。');
    return;
  }
  ElMessageBox.confirm(`确定要删除智能体 "${agent.name}" 吗？此操作不可撤销。`, '确认删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      agentStore.deleteAgent(agent.id);
      ElMessage.success('智能体已删除');
    })
    .catch(() => {
      // 用户取消
    });
};
</script>

<template>
  <div class="agents-sidebar-content">
    <div class="agents-list">
      <div v-if="sortedAgents.length === 0" class="empty-state">
        <p>暂无智能体</p>
        <p class="hint">点击下方按钮创建智能体</p>
      </div>

      <div
        v-for="agent in sortedAgents"
        :key="agent.id"
        :class="['agent-item', { selected: isAgentSelected(agent.id) }]"
        @click="selectAgent(agent.id)"
      >
        <div class="agent-icon">{{ agent.icon || '🙄' }}</div>
        <div class="agent-info">
          <div class="agent-name">{{ agent.name }}</div>
          <div class="agent-model">
            {{ getAgentModelInfo(agent).profileName }} | {{ getAgentModelInfo(agent).modelName }}
          </div>
          <div v-if="agent.description" class="agent-desc">
            {{ agent.description }}
          </div>
        </div>
        <div class="agent-actions">
          <el-button text circle :icon="Edit" @click.stop="handleEdit(agent)" />
          <el-button text circle :icon="Delete" @click.stop="handleDelete(agent)" :disabled="agent.isBuiltIn" />
        </div>
      </div>
    </div>

    <!-- 底部常驻添加按钮 -->
    <div class="agents-footer">
      <el-button type="primary" @click="handleAdd" :icon="Plus" style="width: 100%;">
        添加智能体
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.agents-sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-light);
}

.agents-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  padding-bottom: 0;
}

.agents-footer {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--border-color);
  background-color: var(--card-bg);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.7;
}

.agent-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  border-left: 3px solid transparent;
}

.agent-item:hover {
  background-color: var(--hover-bg);
}

.agent-item.selected {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  border-left-color: var(--primary-color);
}

.agent-item:hover .agent-actions {
  opacity: 1;
}

.agent-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.agent-actions .el-button {
  width: 28px;
  height: 28px;
  font-size: 14px;
}

.agent-icon {
  font-size: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.agent-model {
  font-size: 12px;
  color: var(--text-color-light);
  margin-bottom: 2px;
}

.agent-desc {
  font-size: 11px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
}

/* 滚动条样式 */
.agents-list::-webkit-scrollbar {
  width: 6px;
}

.agents-list::-webkit-scrollbar-track {
  background: transparent;
}

.agents-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.agents-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>