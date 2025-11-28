<script setup lang="ts">
import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import BaseDialog from "@/components/common/BaseDialog.vue";
import IconPresetSelector from "@/components/common/IconPresetSelector.vue";
import Avatar from "@/components/common/Avatar.vue";
import { PRESET_ICONS, PRESET_ICONS_DIR } from "@/config/preset-icons";
import { open } from "@tauri-apps/plugin-dialog";
import { Star, Upload, RefreshLeft, FolderOpened } from "@element-plus/icons-vue";
import { useImageViewer } from "@/composables/useImageViewer";
import { invoke } from "@tauri-apps/api/core";
import { extname } from "@tauri-apps/api/path";

/**
 * 判断一个图标字符串是否像一个内置的文件名
 */
function isLikelyFilename(icon: string): boolean {
  return icon.includes(".") && !icon.includes("/") && !icon.includes("\\");
}

interface Props {
  modelValue: string;
  /** 用于上传专属头像，必须提供才能使用上传功能 */
  entityId?: string;
  /** 用于确定上传目录 */
  profileType?: "agent" | "user";
  /** 用于 Avatar 的回退文本，建议使用 name 而非 displayName */
  nameForFallback?: string;
}
const props = withDefaults(defineProps<Props>(), {
  entityId: "",
  profileType: "agent",
  nameForFallback: "图标",
});

export interface IconUpdatePayload {
  value: string;
  source: "input" | "upload" | "preset" | "clear";
}

interface Emits {
  (e: "update:modelValue", value: string): void;
  (e: "update:icon", payload: IconUpdatePayload): void;
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
  emit("update:icon", { value: iconPath, source: "preset" });
  showPresetIconDialog.value = false;
  customMessage.success("已选择预设图标");
};

// 选择本地图像 (路径模式)
const selectLocalImage = async () => {
  try {
    const selectedPath = await open({
      multiple: false,
      filters: [
        { name: "图像文件", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"] },
      ],
    });

    if (selectedPath && typeof selectedPath === "string") {
      emit("update:icon", { value: selectedPath, source: "input" });
    }
  } catch (error) {
    console.error("选择本地图像失败:", error);
    customMessage.error(`选择本地图像失败: ${error}`);
  }
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

    // **上传逻辑：与 assets 解耦**
    if (!props.entityId) {
      customMessage.error("上传失败：缺少 entityId");
      return;
    }

    isUploadingImage.value = true;

    const extension = await extname(selectedPath);
    const newFilename = `avatar${extension ? `.${extension.slice(1)}` : ""}`;

    let subdirectory = "";
    if (props.profileType === "agent") {
      subdirectory = `llm-chat/agents/${props.entityId}`;
    } else if (props.profileType === "user") {
      subdirectory = `llm-chat/user-profiles/${props.entityId}`;
    } else {
      customMessage.error(`上传失败：未知的 profileType '${props.profileType}'`);
      return;
    }

    await invoke("copy_file_to_app_data", {
      sourcePath: selectedPath,
      subdirectory,
      newFilename,
    });

    // v-model 只存储文件名
    emit("update:icon", { value: newFilename, source: "upload" });
    customMessage.success("专属头像上传成功");
  } catch (error) {
    console.error("上传图像失败:", error);
    customMessage.error(`上传图像失败: ${error}`);
  } finally {
    isUploadingImage.value = false;
  }
};

// 清除图标
const clearIcon = () => {
  // 清空图标，让 Avatar 组件自动显示回退文本
  emit("update:icon", { value: "", source: "clear" });
  customMessage.info("已重置为默认图标");
};

// 解析最终的头像显示路径
const resolvedAvatarSrc = computed(() => {
  if (!props.modelValue) return "";

  const icon = props.modelValue.trim();
  if (!icon) return "";

  // 如果提供了 entityId 且是文件名格式，优先解析为 appdata:// 路径
  // 这允许用户上传头像后，modelValue 仅存储文件名，保持数据整洁
  if (props.entityId && isLikelyFilename(icon)) {
    if (props.profileType === "agent") {
      return `appdata://llm-chat/agents/${props.entityId}/${icon}`;
    } else if (props.profileType === "user") {
      return `appdata://llm-chat/user-profiles/${props.entityId}/${icon}`;
    }
  }

  // 其他情况直接返回原值（emoji、URL、路径等）
  return icon;
});

// 检查图标是否为可点击的图片路径
const sanitizedModelValue = computed(() => {
  return resolvedAvatarSrc.value.trim().replace(/^"|"$/g, "").trim();
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
  <div class="avatar-selector-layout">
    <div class="avatar-preview-container">
      <el-tooltip
        :content="isImagePath ? '点击放大查看' : ''"
        :disabled="!isImagePath"
        placement="top"
      >
        <Avatar
          :src="resolvedAvatarSrc"
          :alt="nameForFallback"
          :size="128"
          shape="square"
          :radius="8"
          :border="false"
          :class="{ 'clickable-avatar': isImagePath }"
          @click="handleIconClick"
        />
      </el-tooltip>
    </div>
    <div class="icon-controls-container">
      <el-input
        :model-value="modelValue"
        @update:model-value="$emit('update:icon', { value: $event, source: 'input' })"
        placeholder="输入 Emoji / 路径 / 上传头像"
        class="icon-input"
      >
        <template #append>
          <el-button-group>
            <el-tooltip content="选择预设图标" placement="top">
              <el-button @click="openPresetIconSelector">
                <el-icon><Star /></el-icon>
              </el-button>
            </el-tooltip>
            
            <el-tooltip content="引用本地图像 (绝对路径)" placement="top">
              <el-button @click="selectLocalImage">
                <el-icon><FolderOpened /></el-icon>
              </el-button>
            </el-tooltip>

            <el-tooltip
              v-if="entityId"
              content="上传专属头像 (存入 AppData)"
              placement="top"
            >
              <el-button @click="uploadCustomImage" :loading="isUploadingImage">
                <el-icon><Upload /></el-icon>
              </el-button>
            </el-tooltip>

            <el-tooltip content="重置为默认" placement="top">
              <el-button @click="clearIcon">
                <el-icon><RefreshLeft /></el-icon>
              </el-button>
            </el-tooltip>
          </el-button-group>
        </template>
      </el-input>
      <div class="form-hint">
        支持 Emoji、预设图标、本地路径引用{{ entityId ? '或上传专属头像' : '' }}。
      </div>
    </div>
  </div>

  <!-- 预设图标选择对话框 -->
  <BaseDialog v-model="showPresetIconDialog" title="选择预设图标" width="80%" height="70vh">
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
.avatar-selector-layout {
  display: flex;
  flex-direction: row;
  gap: 16px;
  width: 100%;
  align-items: flex-start;
}

.avatar-preview-container {
  flex-shrink: 0;
}

.icon-controls-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.icon-input {
  width: 100%;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 6px;
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
