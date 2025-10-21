<script setup lang="ts">
import { reactive, watch } from 'vue';
import { customMessage } from '@/utils/customMessage';
import type { ChatAgent, ChatMessageNode } from '../../types';
import AgentPresetEditor from './AgentPresetEditor.vue';
import LlmModelSelector from '@/components/common/LlmModelSelector.vue';
import BaseDialog from '@/components/common/BaseDialog.vue';

interface Props {
  visible: boolean;
  mode: 'create' | 'edit';
  agent?: ChatAgent | null;
  initialData?: {
    name?: string;
    description?: string;
    icon?: string;
    profileId?: string;
    modelId?: string;
    presetMessages?: ChatMessageNode[];
    temperature?: number;
    maxTokens?: number;
  } | null;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'save', data: {
    name: string;
    description: string;
    icon: string;
    profileId: string;
    modelId: string;
    presetMessages: ChatMessageNode[];
    parameters: {
      temperature: number;
      maxTokens: number;
    };
  }): void;
}

const props = withDefaults(defineProps<Props>(), {
  agent: null,
  initialData: null,
});

const emit = defineEmits<Emits>();

// 编辑表单
const editForm = reactive({
  name: '',
  description: '',
  icon: '🤖',
  profileId: '',
  modelId: '',
  modelCombo: '', // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  presetMessages: [] as ChatMessageNode[],
  temperature: 0.7,
  maxTokens: 4096,
});

// 监听对话框打开，加载数据
watch(() => props.visible, (newVisible) => {
  if (newVisible) {
    loadFormData();
  }
});

// 加载表单数据
const loadFormData = () => {
  if (props.mode === 'edit' && props.agent) {
    // 编辑模式：加载现有智能体数据
    editForm.name = props.agent.name;
    editForm.description = props.agent.description || '';
    editForm.icon = props.agent.icon || '🤖';
    editForm.profileId = props.agent.profileId;
    editForm.modelId = props.agent.modelId;
    editForm.modelCombo = `${props.agent.profileId}:${props.agent.modelId}`;
    editForm.presetMessages = props.agent.presetMessages 
      ? JSON.parse(JSON.stringify(props.agent.presetMessages)) 
      : [];
    editForm.temperature = props.agent.parameters.temperature;
    editForm.maxTokens = props.agent.parameters.maxTokens;
  } else if (props.mode === 'create' && props.initialData) {
    // 创建模式：使用初始数据
    editForm.name = props.initialData.name || '';
    editForm.description = props.initialData.description || '';
    editForm.icon = props.initialData.icon || '🤖';
    editForm.profileId = props.initialData.profileId || '';
    editForm.modelId = props.initialData.modelId || '';
    editForm.modelCombo = props.initialData.profileId && props.initialData.modelId
      ? `${props.initialData.profileId}:${props.initialData.modelId}`
      : '';
    editForm.presetMessages = props.initialData.presetMessages 
      ? JSON.parse(JSON.stringify(props.initialData.presetMessages))
      : [];
    editForm.temperature = props.initialData.temperature ?? 0.7;
    editForm.maxTokens = props.initialData.maxTokens ?? 4096;
  }
};

// 监听 modelCombo 的变化，拆分为 profileId 和 modelId
const handleModelComboChange = (value: string) => {
  if (value) {
    const [profileId, modelId] = value.split(':');
    editForm.profileId = profileId;
    editForm.modelId = modelId;
    editForm.modelCombo = value;
  }
};

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};

// 保存智能体
const handleSave = () => {
  if (!editForm.name.trim()) {
    customMessage.warning('智能体名称不能为空');
    return;
  }

  if (!editForm.profileId || !editForm.modelId) {
    customMessage.warning('请选择模型');
    return;
  }

  // 触发保存事件
  emit('save', {
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

  handleClose();
};
</script>
<template>
  <BaseDialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    :title="mode === 'edit' ? '编辑智能体' : '创建智能体'"
    width="80%"
    height="85vh"
    :close-on-backdrop-click="false"
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
          height="300px"
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
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave">
        {{ mode === 'edit' ? '保存' : '创建' }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 🎉 不需要任何样式覆盖！BaseDialog 自动处理所有布局和滚动 */
</style>