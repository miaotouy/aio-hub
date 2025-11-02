<template>
  <el-form :model="formData" label-width="80px" label-position="left">
    <el-form-item label="名称" :required="required">
      <el-input
        v-model="formData.name"
        placeholder="例如: 魔法少年"
        maxlength="50"
        show-word-limit
        @input="handleInput"
      />
    </el-form-item>

    <el-form-item label="头像">
      <div class="icon-input-group">
        <el-input
          v-model="formData.icon"
          :placeholder="iconPlaceholder"
          class="icon-input"
          @input="handleInput"
        >
          <template #prepend>
            <el-tooltip
              :content="(formData.icon && (formData.icon.includes('/') || formData.icon.startsWith('appdata://'))) ? '点击放大查看' : ''"
              :disabled="!(formData.icon && (formData.icon.includes('/') || formData.icon.startsWith('appdata://')))"
              placement="top"
            >
              <Avatar
                :src="formData.icon || ''"
                :alt="formData.name"
                :size="32"
                shape="square"
                :radius="4"
                :border="false"
                :class="{ 'clickable-avatar': formData.icon && (formData.icon.includes('/') || formData.icon.startsWith('appdata://')) }"
                @click="handleIconClick"
              />
            </el-tooltip>
          </template>
          <template #append>
            <el-button-group>
              <el-button @click="handleOpenPresetIconSelector" title="选择预设图标">
                <el-icon><Picture /></el-icon>
              </el-button>
              <el-button
                v-if="showUpload"
                @click="handleUploadCustomImage"
                :loading="uploadLoading"
                title="上传自定义图像"
              >
                <el-icon><Upload /></el-icon>
              </el-button>
              <el-button
                v-if="showClear"
                @click="handleClearIcon"
                title="清除图标"
              >
                <el-icon><RefreshLeft /></el-icon>
              </el-button>
            </el-button-group>
          </template>
        </el-input>
      </div>
      <div class="form-hint">
        {{ iconHint }}
      </div>
    </el-form-item>

    <el-form-item label="描述" :required="required">
      <el-input
        v-model="formData.content"
        type="textarea"
        :rows="descriptionRows"
        placeholder="请输入用户角色描述，如：我是一个资深魔法少年，来自xxxx家族..."
        maxlength="20000"
        show-word-limit
        @input="handleInput"
      />
      <div class="form-hint">
        此描述将作为用户角色在对话中的身份信息
      </div>
    </el-form-item>

    <!-- 可选的元数据显示 -->
    <template v-if="showMetadata">
      <el-divider />

      <el-form-item label="创建时间">
        <div class="info-text">{{ formatDateTime(formData.createdAt) }}</div>
      </el-form-item>

      <el-form-item v-if="formData.lastUsedAt" label="最后使用">
        <div class="info-text">{{ formatDateTime(formData.lastUsedAt) }}</div>
      </el-form-item>
    </template>
  </el-form>

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
        @select="handleSelectPresetIcon"
      />
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Picture, Upload, RefreshLeft } from '@element-plus/icons-vue';
import Avatar from '@/components/common/Avatar.vue';
import BaseDialog from '@/components/common/BaseDialog.vue';
import IconPresetSelector from '@/components/common/IconPresetSelector.vue';
import { PRESET_ICONS, PRESET_ICONS_DIR } from '@/config/preset-icons';
import { customMessage } from '@/utils/customMessage';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useImageViewer } from '@/composables/useImageViewer';

interface UserProfileFormData {
  name: string;
  icon?: string;
  content: string;
  createdAt?: string;
  lastUsedAt?: string;
}

interface Props {
  /** 表单数据 */
  modelValue: UserProfileFormData;
  /** 是否显示上传按钮 */
  showUpload?: boolean;
  /** 是否显示清除按钮 */
  showClear?: boolean;
  /** 是否显示元数据（创建时间等） */
  showMetadata?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 描述框行数 */
  descriptionRows?: number;
  /** 图标输入框提示文本 */
  iconPlaceholder?: string;
  /** 图标输入框提示信息 */
  iconHint?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showUpload: true,
  showClear: false,
  showMetadata: false,
  required: false,
  descriptionRows: 12,
  iconPlaceholder: '输入 emoji、路径或选择图像（可选）',
  iconHint: '可以输入 emoji、从预设选择、上传图像或输入绝对路径'
});

const emit = defineEmits<{
  'update:modelValue': [value: UserProfileFormData];
}>();

// 内部表单数据
const formData = ref<UserProfileFormData>({ ...props.modelValue });

// 监听外部数据变化
watch(() => props.modelValue, (newValue) => {
  formData.value = { ...newValue };
}, { deep: true });

// 图片查看器
const imageViewer = useImageViewer();

// 预设图标对话框
const showPresetIconDialog = ref(false);

// 上传加载状态
const uploadLoading = ref(false);

// 处理输入变化
const handleInput = () => {
  emit('update:modelValue', { ...formData.value });
};

// 打开预设图标选择器
const handleOpenPresetIconSelector = () => {
  showPresetIconDialog.value = true;
};

// 选择预设图标
const handleSelectPresetIcon = (icon: any) => {
  const iconPath = `${PRESET_ICONS_DIR}/${icon.path}`;
  formData.value.icon = iconPath;
  showPresetIconDialog.value = false;
  handleInput();
  customMessage.success('已选择预设图标');
};

// 上传自定义图像
const handleUploadCustomImage = async () => {
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

    uploadLoading.value = true;

    // 从路径中提取文件名
    const fileName = selected.split(/[/\\]/).pop() || 'profile-icon.png';
    
    // 将文件保存到应用数据目录
    const savedPath = await invoke<string>('copy_file_to_app_data', {
      sourcePath: selected,
      subdirectory: 'profile-icons',
      newFilename: `${Date.now()}-${fileName}`
    });

    // 使用相对路径（应用会自动解析为应用数据目录下的路径）
    formData.value.icon = `appdata://${savedPath}`;
    handleInput();
    customMessage.success('图像上传成功');
  } catch (error) {
    console.error('上传图像失败:', error);
    customMessage.error(`上传图像失败: ${error}`);
  } finally {
    uploadLoading.value = false;
  }
};

// 清除图标
const handleClearIcon = () => {
  formData.value.icon = undefined;
  handleInput();
  customMessage.info('已清除图标');
};

// 格式化日期时间（完整格式）
const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
};

// 点击头像放大查看
const handleIconClick = () => {
  const icon = formData.value.icon;
  // 只有当头像是图片路径时才打开查看器（不是 emoji）
  if (icon && (icon.includes('/') || icon.startsWith('appdata://'))) {
    imageViewer.show(icon);
  }
};
</script>

<style scoped>
/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

/* 信息文本 */
.info-text {
  font-size: 14px;
  color: var(--text-color);
}

/* Icon input group */
.icon-input-group {
  width: 100%;
}

.icon-input {
  width: 100%;
}

/* 可点击的头像 */
.clickable-avatar {
  cursor: pointer;
  transition: opacity 0.2s;
}

.clickable-avatar:hover {
  opacity: 0.8;
}
</style>