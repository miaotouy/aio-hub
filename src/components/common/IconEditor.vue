<script setup lang="ts">
import { ref } from "vue";
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

interface Props {
  modelValue: string;
}
const props = defineProps<Props>();

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
    // 打开文件选择对话框
    const selectedPath = await open({
      multiple: false,
      filters: [
        {
          name: "图像文件",
          extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"],
        },
      ],
    });

    if (!selectedPath) return;

    isUploadingImage.value = true;

    // 直接使用 assetManagerEngine 从路径导入资产
    const asset = await assetManagerEngine.importAssetFromPath(selectedPath, {
      origin: { type: "local", source: `icon-editor` },
      enableDeduplication: true,
      subfolder: "user-icons", // 通用图标目录
      generateThumbnail: false,
    });

    // 使用 assetManager 返回的规范化 appdata:// 路径
    emit("update:modelValue", `appdata://${asset.path}`);
    customMessage.success("图像上传成功");
  } catch (error) {
    console.error("上传图像失败:", error);
    customMessage.error(`上传图像失败: ${error}`);
  } finally {
    isUploadingImage.value = false;
  }
};

// 清除图标
const clearIcon = () => {
  emit("update:modelValue", "🤖");
  customMessage.info("已重置为默认图标");
};

// 点击图标放大查看
const handleIconClick = async () => {
  const icon = props.modelValue || "🤖";
  // 只有当图标是图片路径时才打开查看器（不是 emoji）
  if (icon.includes("/") || icon.startsWith("appdata://")) {
    let imageUrl = icon;

    // 如果是 appdata 协议，则转换为 Blob URL 以便查看器显示
    if (icon.startsWith("appdata://")) {
      try {
        const relativePath = icon.substring(10);
        const bytes = await invoke<number[]>("get_asset_binary", { relativePath });
        const uint8Array = new Uint8Array(bytes);
        // MIME type is not critical here as browsers can often infer it.
        const blob = new Blob([uint8Array]);
        imageUrl = URL.createObjectURL(blob);
      } catch (error) {
        console.error("创建图片预览 URL 失败:", error);
        customMessage.error("无法创建图片预览");
        return;
      }
    }

    imageViewer.show(imageUrl);
  }
};
</script>

<template>
  <div class="icon-editor-layout">
    <div class="icon-preview-container">
      <el-tooltip
        :content="
          modelValue.includes('/') || modelValue.startsWith('appdata://') ? '点击放大查看' : ''
        "
        :disabled="!(modelValue.includes('/') || modelValue.startsWith('appdata://'))"
        placement="top"
      >
        <Avatar
          :src="modelValue || '🤖'"
          alt="图标预览"
          :size="96"
          shape="square"
          :radius="8"
          :border="false"
          :class="{
            'clickable-avatar':
              modelValue.includes('/') || modelValue.startsWith('appdata://'),
          }"
          @click="handleIconClick"
        />
      </el-tooltip>
    </div>
    <div class="icon-controls-container">
      <el-input
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', $event)"
        placeholder="输入 emoji、路径或选择图像"
        class="icon-input"
      >
        <template #append>
          <el-button-group>
            <el-button @click="openPresetIconSelector" title="选择预设图标">
              <el-icon>
                <Picture />
              </el-icon>
            </el-button>
            <el-button
              @click="uploadCustomImage"
              :loading="isUploadingImage"
              title="上传自定义图像"
            >
              <el-icon>
                <Upload />
              </el-icon>
            </el-button>
            <el-button @click="clearIcon" title="重置为默认">
              <el-icon>
                <RefreshLeft />
              </el-icon>
            </el-button>
          </el-button-group>
        </template>
      </el-input>
      <div class="form-hint">可以输入 emoji、从预设选择、上传图像或输入绝对路径</div>
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