<script setup lang="ts">
import { reactive, watch, ref } from 'vue';
import { customMessage } from '@/utils/customMessage';
import type { ChatAgent, ChatMessageNode } from '../../types';
import AgentPresetEditor from './AgentPresetEditor.vue';
import LlmModelSelector from '@/components/common/LlmModelSelector.vue';
import BaseDialog from '@/components/common/BaseDialog.vue';
import IconPresetSelector from '@/components/common/IconPresetSelector.vue';
import Avatar from '@/components/common/Avatar.vue';
import { PRESET_ICONS, PRESET_ICONS_DIR } from '@/config/preset-icons';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Picture, Upload, RefreshLeft } from '@element-plus/icons-vue';
import { useUserProfileStore } from '../../userProfileStore';

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
    userProfileId: string | null;
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

// 用户档案 Store
const userProfileStore = useUserProfileStore();

// 预设图标对话框
const showPresetIconDialog = ref(false);

// 图像上传中状态
const isUploadingImage = ref(false);

// 编辑表单
const editForm = reactive({
  name: '',
  description: '',
  icon: '🤖',
  profileId: '',
  modelId: '',
  modelCombo: '', // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  userProfileId: null as string | null, // 绑定的用户档案 ID
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
    editForm.userProfileId = props.agent.userProfileId || null;
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
    editForm.userProfileId = null;
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
    userProfileId: editForm.userProfileId,
    presetMessages: editForm.presetMessages,
    parameters: {
      temperature: editForm.temperature,
      maxTokens: editForm.maxTokens,
    },
  });

  handleClose();
};

// 打开预设图标选择器
const openPresetIconSelector = () => {
  showPresetIconDialog.value = true;
};

// 选择预设图标
const selectPresetIcon = (icon: any) => {
  const iconPath = `${PRESET_ICONS_DIR}/${icon.path}`;
  editForm.icon = iconPath;
  showPresetIconDialog.value = false;
  customMessage.success('已选择预设图标');
};

// 上传自定义图像
const uploadCustomImage = async () => {
  try {
    // 打开文件选择对话框
    const selected = await open({
      multiple: false,
      filters: [{
        name: '图像文件',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']
      }]
    });

    if (!selected) return;

    isUploadingImage.value = true;

    // 从路径中提取文件名
    const fileName = selected.split(/[/\\]/).pop() || 'agent-icon.png';
    
    // 将文件保存到应用数据目录
    const savedPath = await invoke<string>('copy_file_to_app_data', {
      sourcePath: selected,
      subdirectory: 'agent-icons',
      newFilename: `${Date.now()}-${fileName}`
    });

    // 使用相对路径（应用会自动解析为应用数据目录下的路径）
    editForm.icon = `appdata://${savedPath}`;
    customMessage.success('图像上传成功');
  } catch (error) {
    console.error('上传图像失败:', error);
    customMessage.error(`上传图像失败: ${error}`);
  } finally {
    isUploadingImage.value = false;
  }
};

// 清除图标
const clearIcon = () => {
  editForm.icon = '🤖';
  customMessage.info('已重置为默认图标');
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
        <div class="icon-input-group">
          <el-input
            v-model="editForm.icon"
            placeholder="输入 emoji、路径或选择图像"
            class="icon-input"
          >
            <template #prepend>
              <Avatar
                :src="editForm.icon || '🤖'"
                alt="图标预览"
                :size="32"
                shape="square"
                :radius="4"
                :border="false"
              />
            </template>
            <template #append>
              <el-button-group>
                <el-button @click="openPresetIconSelector" title="选择预设图标">
                  <el-icon><Picture /></el-icon>
                </el-button>
                <el-button @click="uploadCustomImage" :loading="isUploadingImage" title="上传自定义图像">
                  <el-icon><Upload /></el-icon>
                </el-button>
                <el-button @click="clearIcon" title="重置为默认">
                  <el-icon><RefreshLeft /></el-icon>
                </el-button>
              </el-button-group>
            </template>
          </el-input>
        </div>
        <div class="form-hint">
          可以输入 emoji、从预设选择、上传图像或输入绝对路径
        </div>
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

      <!-- 用户档案绑定 -->
      <el-form-item label="用户档案">
        <el-select
          v-model="editForm.userProfileId"
          placeholder="选择用户档案（可选）"
          clearable
          style="width: 100%"
        >
          <el-option :value="null" label="无（使用全局设置）" />
          <el-option
            v-for="profile in userProfileStore.enabledProfiles"
            :key="profile.id"
            :value="profile.id"
            :label="profile.name"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <Avatar
                v-if="profile.icon"
                :src="profile.icon"
                :alt="profile.name"
                :size="20"
                shape="square"
                :radius="4"
              />
              <span>{{ profile.name }}</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-hint">
          如果设置，则覆盖全局默认的用户档案
        </div>
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

    <!-- 预设图标选择对话框 -->
    <BaseDialog
      :visible="showPresetIconDialog"
      @update:visible="showPresetIconDialog = $event"
      title="选择预设图标"
      width="80%"
      height="70vh"
    >
      <template #content>
        <IconPresetSelector
          :icons="PRESET_ICONS"
          :get-icon-path="(path: string) => `${PRESET_ICONS_DIR}/${path}`"
          show-search
          show-categories
          @select="selectPresetIcon"
        />
      </template>
    </BaseDialog>
  </BaseDialog>
</template>

<style scoped>
/* Icon input group */
.icon-input-group {
  width: 100%;
}

.icon-input {
  width: 100%;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 8px;
}
</style>