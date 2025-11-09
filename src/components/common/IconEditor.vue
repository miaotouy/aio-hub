<script setup lang="ts">
import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import BaseDialog from "@/components/common/BaseDialog.vue";
import IconPresetSelector from "@/components/common/IconPresetSelector.vue";
import Avatar from "@/components/common/Avatar.vue";
import { PRESET_ICONS, PRESET_ICONS_DIR } from "@/config/preset-icons";
import { open } from "@tauri-apps/plugin-dialog";
import { Picture, Upload, RefreshLeft } from "@element-plus/icons-vue";
import { useImageViewer } from "@/composables/useImageViewer";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { invoke } from "@tauri-apps/api/core";
import { extname } from "@tauri-apps/api/path";

interface Props {
  modelValue: string;
  mode?: "path" | "upload";
  /** 在 'upload' 模式下必须提供，用于确定上传目录 */
  entityId?: string;
  /** 在 'upload' 模式下必须提供，用于确定上传目录 */
  profileType?: "agent" | "user";
}
const props = withDefaults(defineProps<Props>(), {
  mode: "path",
  entityId: "",
  profileType: "agent",
});

interface Emits {
  (e: "update:modelValue", value: string): void;
}
const emit = defineEmits<Emits>();

// 图片查看器
const imageViewer = useImageViewer();

// 预设图标对话框
const showPresetIconDialog = ref(false);

// 图像上传中状态
const isUploadingImage = ref(false);

// 打开预设图标选择器
const openPresetIconSelector = () => {
  showPresetIconDialog.value = true;
};

// 选择预设图标
const selectPresetIcon = (icon: any) => {
  const iconPath = `${PRESET_ICONS_DIR}/${icon.path}`;
  emit("update:modelValue", iconPath);
  showPresetIconDialog.value = false;
  customMessage.success("已选择预设图标");
};

// 上传自定义图像
const uploadCustomImage = async () => {
  try {
    const selectedPath = await open({
      multiple: false,
      filters: [
        { name: "图像文件", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"] },
      ],
    });

    if (!selectedPath) return;

    isUploadingImage.value = true;

    if (props.mode === "upload") {
      // **上传模式：与 assets 解耦**
      if (!props.entityId) {
        customMessage.error("上传失败：缺少 entityId");
        isUploadingImage.value = false;
        return;
      }

      const extension = await extname(selectedPath);
      const newFilename = `avatar${extension ? `.${extension.slice(1)}` : ""}`;

      let subdirectory = "";
      if (props.profileType === "agent") {
        subdirectory = `llm-chat/agents/${props.entityId}`;
      } else if (props.profileType === "user") {
        subdirectory = `llm-chat/user-profiles/${props.entityId}`;
      } else {
        customMessage.error(`上传失败：未知的 profileType '${props.profileType}'`);
        isUploadingImage.value = false;
        return;
      }

      await invoke("copy_file_to_app_data", {
        sourcePath: selectedPath,
        subdirectory,
        newFilename,
      });

      // v-model 只存储文件名
      emit("update:modelValue", newFilename);
      customMessage.success("专属头像上传成功");
    } else {
      // **路径模式：保留原有逻辑，使用 assetManager**
      const asset = await assetManagerEngine.importAssetFromPath(selectedPath, {
        origin: { type: "local", source: `icon-editor` },
        enableDeduplication: true,
        subfolder: "user-icons",
        generateThumbnail: false,
      });
      emit("update:modelValue", `appdata://${asset.path}`);
      customMessage.success("图像上传成功");
    }
  } catch (error) {
    console.error("上传图像失败:", error);
    customMessage.error(`上传图像失败: ${error}`);
  } finally {
    isUploadingImage.value = false;
  }
};

// 清除图标
const clearIcon = () => {
  // 在 upload 模式下，也应该有一个默认值，但暂时先统一处理
  emit("update:modelValue", "🤖");
  customMessage.info("已重置为默认图标");
};

// 检查图标是否为可点击的图片路径
const sanitizedModelValue = computed(() => {
  if (!props.modelValue) return "";
  // 移除开头和结尾多余的空格和引号
  return props.modelValue.trim().replace(/^"|"$/g, "").trim();
});

const isImagePath = computed(() => {
  return (
    sanitizedModelValue.value &&
    (sanitizedModelValue.value.startsWith("/") ||
      sanitizedModelValue.value.startsWith("appdata://") ||
      sanitizedModelValue.value.startsWith("http://") ||
      sanitizedModelValue.value.startsWith("https://") ||
      sanitizedModelValue.value.startsWith("data:") ||
      /^[A-Za-z]:[\\/]/.test(sanitizedModelValue.value) || // Windows 绝对路径（支持正反斜杠）
      sanitizedModelValue.value.startsWith("\\\\")) // UNC 路径
  );
});

// 点击图标放大查看
const handleIconClick = () => {
  // 只有当图标是图片路径时才打开查看器（不是 emoji）
  if (isImagePath.value) {
    imageViewer.show(sanitizedModelValue.value);
  }
};
</script>

<template>
  <div class="icon-editor-layout">
    <div class="icon-preview-container">
      <el-tooltip
        :content="isImagePath ? '点击放大查看' : ''"
        :disabled="!isImagePath"
        placement="top"
      >
        <Avatar
          :src="modelValue || '🤖'"
          alt="图标预览"
          :size="96"
          shape="square"
          :radius="8"
          :border="false"
          :class="{ 'clickable-avatar': isImagePath }"
          @click="handleIconClick"
        />
      </el-tooltip>
    </div>
    <div class="icon-controls-container">
      <!-- 路径模式：显示输入框和完整按钮组 -->
      <template v-if="mode === 'path'">
        <el-input
          :model-value="modelValue"
          @update:model-value="$emit('update:modelValue', $event)"
          placeholder="输入 emoji、路径或选择图像"
          class="icon-input"
        >
          <template #append>
            <el-button-group>
              <el-button @click="openPresetIconSelector" title="选择预设图标">
                <el-icon><Picture /></el-icon>
              </el-button>
              <el-button
                @click="uploadCustomImage"
                :loading="isUploadingImage"
                title="上传自定义图像"
              >
                <el-icon><Upload /></el-icon>
              </el-button>
              <el-button @click="clearIcon" title="重置为默认">
                <el-icon><RefreshLeft /></el-icon>
              </el-button>
            </el-button-group>
          </template>
        </el-input>
        <div class="form-hint">可以输入 emoji、从预设选择、上传图像或输入绝对路径</div>
      </template>

      <!-- 上传模式：只显示上传和重置按钮 -->
      <template v-else-if="mode === 'upload'">
        <div class="upload-mode-controls">
          <el-button
            @click="uploadCustomImage"
            :loading="isUploadingImage"
            type="primary"
            :icon="Upload"
          >
            上传专属头像
          </el-button>
          <el-button @click="clearIcon" :icon="RefreshLeft"> 重置 </el-button>
        </div>
        <div class="form-hint">
          上传的头像将与该智能体绑定存储，删除智能体时会一并清除。
        </div>
      </template>
    </div>
  </div>

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
</template>

<style scoped>
.icon-editor-layout {
  display: flex;
  flex-direction: row;
  gap: 16px;
  width: 100%;
  align-items: flex-start;
}

.icon-preview-container {
  flex-shrink: 0;
}

.icon-controls-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.upload-mode-controls {
  display: flex;
  gap: 12px;
}

.icon-input {
  width: 100%;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 8px;
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