<script setup lang="ts">
import { computed, ref, reactive } from 'vue';
import { useAgentStore } from '../agentStore';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { Plus, Edit, Delete, MoreFilled } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { customMessage } from '@/utils/customMessage';
import type { ChatAgent, ChatMessageNode } from '../types';
import AgentPresetEditor from './AgentPresetEditor.vue';
import LlmModelSelector from '@/components/common/LlmModelSelector.vue';
import CreateAgentDialog from './CreateAgentDialog.vue';
import type { AgentPreset } from '../types';

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

// 对话框状态
const createDialogVisible = ref(false); // 创建选择对话框
const editDialogVisible = ref(false); // 编辑/创建对话框
const isEditMode = ref(false);
const editingAgentId = ref<string | null>(null);

// 编辑表单
const editForm = reactive({
  name: '',
  description: '',
  icon: '',
  profileId: '',
  modelId: '',
  modelCombo: '', // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  presetMessages: [] as ChatMessageNode[],
  temperature: 0.7,
  maxTokens: 4096,
});

// 监听 modelCombo 的变化，拆分为 profileId 和 modelId
const handleModelComboChange = (value: string) => {
  if (value) {
    const [profileId, modelId] = value.split(':');
    editForm.profileId = profileId;
    editForm.modelId = modelId;
    editForm.modelCombo = value;
  }
};

// 打开创建智能体选择对话框
const handleOpenCreateDialog = () => {
  createDialogVisible.value = true;
};

// 从空白创建
const handleCreateFromBlank = () => {
  const { enabledProfiles } = useLlmProfiles();
  if (enabledProfiles.value.length === 0 || enabledProfiles.value[0].models.length === 0) {
    customMessage.error('没有可用的模型配置，无法创建智能体');
    return;
  }

  isEditMode.value = false;
  editingAgentId.value = null;

  // 重置表单为默认值
  const defaultProfile = enabledProfiles.value[0];
  const defaultModel = defaultProfile.models[0];

  editForm.name = '';
  editForm.description = '';
  editForm.icon = '🤖';
  editForm.profileId = defaultProfile.id;
  editForm.modelId = defaultModel.id;
  editForm.modelCombo = `${defaultProfile.id}:${defaultModel.id}`;
  editForm.presetMessages = [
    {
      id: `preset-system-${Date.now()}`,
      parentId: null,
      childrenIds: [],
      content: '你是一个友好且乐于助人的 AI 助手。',
      role: 'system',
      status: 'complete',
      isEnabled: true,
      timestamp: new Date().toISOString(),
    },
  ];
  editForm.temperature = 0.7;
  editForm.maxTokens = 4096;

  editDialogVisible.value = true;
};

// 从预设创建
const handleCreateFromPreset = (preset: AgentPreset) => {
  const { enabledProfiles } = useLlmProfiles();
  if (enabledProfiles.value.length === 0 || enabledProfiles.value[0].models.length === 0) {
    customMessage.error('没有可用的模型配置，无法创建智能体');
    return;
  }

  isEditMode.value = false;
  editingAgentId.value = null;

  // 使用预设数据填充表单
  const defaultProfile = enabledProfiles.value[0];
  const defaultModel = defaultProfile.models[0];

  editForm.name = preset.name;
  editForm.description = preset.description;
  editForm.icon = preset.icon;
  editForm.profileId = defaultProfile.id;
  editForm.modelId = defaultModel.id;
  editForm.modelCombo = `${defaultProfile.id}:${defaultModel.id}`;
  // 深度复制 presetMessages，并确保它们有唯一的 ID
  editForm.presetMessages = JSON.parse(JSON.stringify(preset.presetMessages)).map((msg: any) => ({
    ...msg,
    id: `preset-${msg.role}-${Date.now()}-${Math.random()}`,
    parentId: null,
    childrenIds: [],
    status: 'complete',
    isEnabled: true,
    timestamp: new Date().toISOString(),
  }));
  editForm.temperature = preset.parameters.temperature;
  editForm.maxTokens = preset.parameters.maxTokens || 4096;

  editDialogVisible.value = true;
};

// 编辑智能体
const handleEdit = (agent: ChatAgent) => {
  isEditMode.value = true;
  editingAgentId.value = agent.id;
  
  // 加载现有智能体数据
  editForm.name = agent.name;
  editForm.description = agent.description || '';
  editForm.icon = agent.icon || '🤖';
  editForm.profileId = agent.profileId;
  editForm.modelId = agent.modelId;
  editForm.modelCombo = `${agent.profileId}:${agent.modelId}`;
  editForm.presetMessages = agent.presetMessages ? JSON.parse(JSON.stringify(agent.presetMessages)) : [];
  editForm.temperature = agent.parameters.temperature;
  editForm.maxTokens = agent.parameters.maxTokens;
  
  editDialogVisible.value = true;
};

// 保存智能体
const handleSaveAgent = () => {
  if (!editForm.name.trim()) {
    customMessage.warning('智能体名称不能为空');
    return;
  }

  if (!editForm.profileId || !editForm.modelId) {
    customMessage.warning('请选择模型');
    return;
  }

  if (isEditMode.value && editingAgentId.value) {
    // 更新模式
    agentStore.updateAgent(editingAgentId.value, {
      name: editForm.name,
      description: editForm.description,
      icon: editForm.icon,
      profileId: editForm.profileId,
      modelId: editForm.modelId,
      presetMessages: editForm.presetMessages,
      parameters: {
        temperature: editForm.temperature,
        maxTokens: editForm.maxTokens,
      },
    });
    customMessage.success('智能体已更新');
  } else {
    // 创建模式
    const newAgentId = agentStore.createAgent(
      editForm.name,
      editForm.profileId,
      editForm.modelId,
      {
        description: editForm.description,
        icon: editForm.icon,
        presetMessages: editForm.presetMessages,
        parameters: {
          temperature: editForm.temperature,
          maxTokens: editForm.maxTokens,
        },
      }
    );
    customMessage.success(`智能体 "${editForm.name}" 创建成功`);
    // 自动选中新创建的智能体
    selectAgent(newAgentId);
  }

  editDialogVisible.value = false;
};

// 删除智能体
const handleDelete = (agent: ChatAgent) => {
  if (agent.isBuiltIn) {
    customMessage.warning('不能删除内置的默认智能体。');
    return;
  }
  ElMessageBox.confirm(`确定要删除智能体 "${agent.name}" 吗？此操作不可撤销。`, '确认删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      agentStore.deleteAgent(agent.id);
      customMessage.success('智能体已删除');
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
          <!-- 只在选中时显示详细信息 -->
          <template v-if="isAgentSelected(agent.id)">
            <div class="agent-model">
              {{ getAgentModelInfo(agent).profileName }} | {{ getAgentModelInfo(agent).modelName }}
            </div>
            <div v-if="agent.description" class="agent-desc">
              {{ agent.description }}
            </div>
          </template>
        </div>
        <!-- 三点菜单 -->
        <div class="agent-actions">
          <el-dropdown trigger="click" @click.stop>
            <el-button text circle :icon="MoreFilled" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleEdit(agent)">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-dropdown-item>
                <el-dropdown-item
                  @click="handleDelete(agent)"
                  :disabled="agent.isBuiltIn"
                  divided
                >
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 底部常驻添加按钮 -->
    <div class="agents-footer">
      <el-button type="primary" @click="handleOpenCreateDialog" :icon="Plus" style="width: 100%;">
        添加智能体
      </el-button>
    </div>

    <!-- 创建智能体选择对话框 -->
    <CreateAgentDialog
      v-model:visible="createDialogVisible"
      @create-from-preset="handleCreateFromPreset"
      @create-from-blank="handleCreateFromBlank"
    />

    <!-- 智能体编辑对话框 -->
    <el-dialog
      v-model="editDialogVisible"
      :title="isEditMode ? '编辑智能体' : '创建智能体'"
      width="900px"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm" label-width="100px" label-position="left">
        <!-- 基本信息 -->
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" placeholder="输入智能体名称" />
        </el-form-item>

        <el-form-item label="图标">
          <el-input v-model="editForm.icon" placeholder="输入 emoji 图标" maxlength="2" style="width: 120px;" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="2"
            placeholder="智能体的简短描述..."
          />
        </el-form-item>

        <!-- 模型选择 -->
        <el-form-item label="模型" required>
          <LlmModelSelector
            v-model="editForm.modelCombo"
            @update:model-value="handleModelComboChange"
          />
        </el-form-item>

        <!-- 预设消息编辑器 -->
        <el-form-item label="预设消息">
          <AgentPresetEditor
            v-model="editForm.presetMessages"
            height="400px"
          />
        </el-form-item>

        <!-- 参数配置 -->
        <el-form-item label="Temperature">
          <el-slider
            v-model="editForm.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            show-input
            :input-size="'small'"
          />
        </el-form-item>

        <el-form-item label="Max Tokens">
          <el-input-number
            v-model="editForm.maxTokens"
            :min="1"
            :max="100000"
            :step="100"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveAgent">
          {{ isEditMode ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
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
  align-items: center;
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
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.agent-item.selected .agent-actions {
  opacity: 1;
}

.agent-actions .el-button {
  width: 28px;
  height: 28px;
  font-size: 16px;
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