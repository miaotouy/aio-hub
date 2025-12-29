<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useAgentStore } from "../../agentStore";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";

import BaseDialog from "@/components/common/BaseDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import { ElCheckbox, ElCheckboxGroup, ElRadioGroup, ElRadio } from "element-plus";
import type { CheckboxValueType } from "element-plus";

const props = defineProps<{
  visible: boolean;
  initialSelection?: string[];
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  export: [
    agentIds: string[],
    options: {
      includeAssets: boolean;
      includeWorldbooks: boolean;
      embedWorldbooks: boolean;
      format: "json" | "yaml";
      exportType: "zip" | "folder" | "file" | "png";
      separateFolders: boolean;
      previewImage?: File | string;
    },
  ];
}>();

const agentStore = useAgentStore();

const selectedAgentIds = ref<string[]>([]);
const includeAssets = ref(true);
const includeWorldbooks = ref(true);
const embedWorldbooks = ref(false);
const exportFormat = ref<"json" | "yaml">("json");
const exportType = ref<"zip" | "folder" | "file" | "png">("zip");
const separateFolders = ref(false);

const hasWorldbooks = computed(() => {
  if (selectedAgentIds.value.length === 0) return false;
  return selectedAgentIds.value.some((id) => {
    const agent = agents.value.find((a) => a.id === id);
    return agent?.worldbookIds && agent.worldbookIds.length > 0;
  });
});

// PNG 导出相关状态
const previewImageSource = ref<"avatar" | "custom">("avatar");
const customPreviewFile = ref<File | null>(null);
const customPreviewUrl = ref<string>("");

// 监听导出类型变化，自动调整 includeAssets
watch(exportType, (newType) => {
  if (newType === "file") {
    includeAssets.value = false;
  } else if (newType === "png") {
    includeAssets.value = true;
    // 切换到 PNG 时，如果是多选，强制切换到自定义图片
    if (!isSingleMode.value) {
      previewImageSource.value = "custom";
    }
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
  selectedAgentIds.value = val ? agents.value.map((agent) => agent.id) : [];
};
const handleExport = async () => {
  if (selectedAgentIds.value.length === 0) {
    return;
  }

  let previewImage: File | string | undefined = undefined;

  if (exportType.value === "png") {
    if (previewImageSource.value === "avatar" && singleTargetAgent.value) {
      // 使用头像作为预览图
      // 尝试解析头像路径
      const avatarPath = resolveAvatarPath(singleTargetAgent.value, "agent");
      if (avatarPath) {
        previewImage = avatarPath;
      } else {
        // 如果没有头像，可能需要提示用户
        // 这里暂时不做处理，后端会报错
      }
    } else if (previewImageSource.value === "custom" && customPreviewFile.value) {
      previewImage = customPreviewFile.value;
    } else {
      // 必填项检查
      // 实际应用中应该在 UI 上禁用按钮
      return;
    }
  }

  emit("export", selectedAgentIds.value, {
    includeAssets: includeAssets.value,
    includeWorldbooks: includeWorldbooks.value,
    embedWorldbooks: embedWorldbooks.value,
    format: exportFormat.value,
    exportType: exportType.value,
    separateFolders: separateFolders.value,
    previewImage,
  });
  handleClose();
};

const handleClose = () => {
  emit("update:visible", false);
};

// 当对话框打开时，根据 props 初始化选中状态
const handleOpen = () => {
  if (props.initialSelection && props.initialSelection.length > 0) {
    selectedAgentIds.value = [...props.initialSelection];
  } else {
    selectedAgentIds.value = agents.value.map((agent) => agent.id);
  }

  // 初始化世界书包含状态
  includeWorldbooks.value = hasWorldbooks.value;

  // 重置状态
  exportType.value = "zip";
  previewImageSource.value = "avatar";
  customPreviewFile.value = null;
  // 释放之前的 Object URL（如果有）
  if (customPreviewUrl.value) {
    URL.revokeObjectURL(customPreviewUrl.value);
  }
  customPreviewUrl.value = "";
};

const handleFileChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    customPreviewFile.value = file;
    // 释放之前的 Object URL（如果有）
    if (customPreviewUrl.value) {
      URL.revokeObjectURL(customPreviewUrl.value);
    }
    // 创建本地预览 URL
    customPreviewUrl.value = URL.createObjectURL(file);
  }
};

// 组件卸载时清理 Object URL
onBeforeUnmount(() => {
  if (customPreviewUrl.value) {
    URL.revokeObjectURL(customPreviewUrl.value);
  }
});

const isSingleMode = computed(() => props.initialSelection?.length === 1);
const singleTargetAgent = computed(() => {
  if (!isSingleMode.value) return null;
  return agents.value.find((a) => a.id === props.initialSelection![0]);
});

// 计算 PNG 导出时预览图是否就绪
const isPngPreviewReady = computed(() => {
  if (exportType.value !== "png") return true;

  if (previewImageSource.value === "avatar") {
    // 使用头像时，需要确保单选模式且智能体有头像
    if (!isSingleMode.value) return false;
    const avatarPath = singleTargetAgent.value
      ? resolveAvatarPath(singleTargetAgent.value, "agent")
      : null;
    return !!avatarPath;
  } else {
    // 使用自定义图片时，需要确保已上传文件
    return !!customPreviewFile.value;
  }
});

// 计算导出按钮是否可用
const canExport = computed(() => {
  return selectedAgentIds.value.length > 0 && isPngPreviewReady.value;
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
            <div class="desc" v-if="singleTargetAgent.description">
              {{ singleTargetAgent.description }}
            </div>
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
              <el-radio value="png">PNG 图片包</el-radio>
            </el-radio-group>
          </div>

          <!-- PNG 预览图设置 -->
          <div v-if="exportType === 'png'" class="option-item preview-setting">
            <span class="label">预览图设置：</span>
            <div class="preview-options">
              <el-radio-group v-model="previewImageSource" size="small" :disabled="!isSingleMode">
                <el-radio value="avatar">使用头像</el-radio>
                <el-radio value="custom">自定义图片</el-radio>
              </el-radio-group>

              <div v-if="!isSingleMode" class="hint-text">
                批量导出时必须使用自定义图片作为统一封面
              </div>
            </div>

            <div v-if="previewImageSource === 'custom'" class="custom-upload">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change="handleFileChange"
                class="file-input"
              />
              <div v-if="customPreviewUrl" class="preview-box">
                <img :src="customPreviewUrl" alt="Preview" />
              </div>
            </div>
          </div>

          <div class="option-item">
            <el-checkbox
              v-model="includeAssets"
              label="包含头像、表情、背景等私有资产文件"
              :disabled="exportType === 'file'"
            />
          </div>

          <div class="option-item">
            <el-checkbox
              v-model="includeWorldbooks"
              :disabled="exportType === 'file' || !hasWorldbooks"
            >
              包含关联的世界书
              <span v-if="!hasWorldbooks" class="disabled-reason"> (所选智能体未关联世界书) </span>
            </el-checkbox>
          </div>

          <div class="option-item sub-option" v-if="includeWorldbooks && exportType !== 'file'">
            <el-checkbox
              v-model="embedWorldbooks"
              label="将世界书内嵌到配置文件中 (默认打包为独立文件)"
            />
          </div>

          <div class="option-item" v-if="!isSingleMode">
            <el-checkbox v-model="separateFolders" label="为每个智能体创建独立文件夹" />
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
      <el-button type="primary" @click="handleExport" :disabled="!canExport">
        {{ isSingleMode ? "导出" : `导出 (${selectedAgentIds.length})` }}
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

.sub-option {
  margin-left: 24px;
  margin-top: -4px;
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

.preview-setting {
  border: 1px dashed var(--border-color);
  padding: 12px;
  border-radius: 6px;
  background-color: var(--bg-color-soft);
}

.preview-options {
  margin-top: 8px;
  margin-bottom: 8px;
}

.hint-text,
.disabled-reason {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.disabled-reason {
  margin-left: 4px;
  font-weight: normal;
}

.custom-upload {
  margin-top: 8px;
}

.file-input {
  font-size: 12px;
  width: 100%;
}

.preview-box {
  margin-top: 8px;
  width: 100px;
  height: 100px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color);
}

.preview-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
