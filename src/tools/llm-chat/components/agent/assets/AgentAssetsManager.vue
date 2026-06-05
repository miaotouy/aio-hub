<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus } from "@element-plus/icons-vue";
import { useImageViewer } from "@/composables/useImageViewer";
import { useClipboard } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import DropZone from "@/components/common/DropZone.vue";
import type { AgentAsset, AssetGroup, AssetType } from "../../../types";

import { useAgentAssetsManager } from "./useAgentAssetsManager";
import AgentAssetsSidebar from "./AgentAssetsSidebar.vue";
import AgentAssetsToolbar from "./AgentAssetsToolbar.vue";
import AgentAssetsGrid from "./AgentAssetsGrid.vue";
import AgentAssetEditDialog from "./AgentAssetEditDialog.vue";
import AgentGroupEditDialog from "./AgentGroupEditDialog.vue";
import AgentBatchMoveDialog from "./AgentBatchMoveDialog.vue";
import AgentMediaPreview from "./AgentMediaPreview.vue";

const logger = createModuleLogger("AgentAssetsManager");
const imageViewer = useImageViewer();
const { copy } = useClipboard();

interface Props {
  modelValue: AgentAsset[];
  assetGroups?: AssetGroup[];
  agentId: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  assetGroups: () => [],
  disabled: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: AgentAsset[]): void;
  (e: "update:assetGroups", value: AssetGroup[]): void;
  (e: "physical-change"): void;
}>();

// 核心逻辑 Composable
const manager = useAgentAssetsManager(props, emit);

// 文件输入引用
const fileInput = ref<HTMLInputElement | null>(null);

// 弹窗状态
const editDialogVisible = ref(false);
const editingAsset = ref<AgentAsset | null>(null);

const groupEditDialogVisible = ref(false);
const editingGroup = ref<AssetGroup | null>(null);

const batchMoveDialogVisible = ref(false);

const mediaPreviewVisible = ref(false);
const mediaPreviewUrl = ref("");
const mediaPreviewPoster = ref("");
const mediaPreviewType = ref<AssetType>("file");
const mediaPreviewTitle = ref("");

// 处理资产点击
const handleAssetClick = (asset: AgentAsset) => {
  if (manager.isSelectionMode.value) {
    manager.toggleAssetSelection(asset);
  } else {
    handlePreview(asset);
  }
};

// 预览资产
const handlePreview = async (asset: AgentAsset) => {
  const url = await manager.getAssetUrl(asset);
  if (!url) return;

  if (asset.type === "image") {
    imageViewer.show(url);
  } else {
    mediaPreviewType.value = asset.type;
    mediaPreviewUrl.value = url;
    mediaPreviewPoster.value = "";
    mediaPreviewTitle.value = asset.filename || "预览";

    if (asset.type === "audio" && asset.thumbnailPath) {
      try {
        const fullPath = await invoke<string>("get_agent_asset_path", {
          agentId: props.agentId,
          assetPath: asset.thumbnailPath,
        });
        mediaPreviewPoster.value = convertFileSrc(fullPath);
      } catch (error) {
        logger.warn("加载预览封面失败", error);
      }
    }

    mediaPreviewVisible.value = true;
  }
};

// 复制资产引用
const handleCopyId = (asset: AgentAsset) => {
  const group = asset.group || "default";
  const ext = getFileExtension(asset.filename);
  const refText = ext
    ? `agent-asset://${group}/${asset.id}.${ext}`
    : `agent-asset://${group}/${asset.id}`;
  copy(refText);
  customMessage.success(`已复制引用: ${refText}`);
};

const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) return "";
  return filename.substring(lastDot + 1).toLowerCase();
};

// 打开编辑弹窗
const openEditDialog = (asset: AgentAsset) => {
  editingAsset.value = asset;
  editDialogVisible.value = true;
};

// 保存编辑
const handleSaveEdit = (form: {
  id: string;
  description: string;
  group: string;
}) => {
  if (!editingAsset.value) return;
  const success = manager.saveEdit(editingAsset.value, form);
  if (success) {
    editDialogVisible.value = false;
  }
};

// 打开创建分组弹窗
const openCreateGroupDialog = () => {
  editingGroup.value = null;
  groupEditDialogVisible.value = true;
};

// 打开编辑分组弹窗
const openEditGroupDialog = (group: AssetGroup) => {
  editingGroup.value = group;
  groupEditDialogVisible.value = true;
};

// 保存分组
const handleSaveGroup = (
  form: {
    id: string;
    displayName: string;
    description: string;
    icon: string;
    sortOrder: number;
  },
  isEdit: boolean
) => {
  const success = manager.saveGroup(form, isEdit);
  if (success) {
    groupEditDialogVisible.value = false;
  }
};

// 打开批量移动弹窗
const openBatchMoveDialog = () => {
  if (manager.selectedAssetIds.value.size === 0) return;
  batchMoveDialogVisible.value = true;
};

// 确认批量移动
const handleBatchMoveConfirm = (targetGroup: string) => {
  manager.handleBatchMove(targetGroup);
  batchMoveDialogVisible.value = false;
};

// 处理文件上传
const handleUploadClick = () => {
  fileInput.value?.click();
};

const handleFileInputChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  const paths = files.map((f) => (f as any).path || f.name);
  manager.handleFileUpload(paths);
  // 重置 input 防止重复选择同一文件不触发 change
  input.value = "";
};

// DropZone hint 计算
const dropZoneHint = computed(() => {
  const base = "支持图片、音频、视频等多种格式";
  if (
    manager.selectedGroup.value !== "all" &&
    manager.selectedGroup.value !== "default"
  ) {
    return `${base} (将自动添加到 ${manager.getGroupDisplayName(manager.selectedGroup.value)} 分组)`;
  }
  return base;
});
</script>

<template>
  <div class="agent-assets-manager" :class="{ 'is-disabled': disabled }">
    <!-- 侧边栏：分组 -->
    <AgentAssetsSidebar
      :selected-group="manager.selectedGroup.value"
      :sorted-groups="manager.sortedGroups.value"
      :group-counts="manager.groupCounts.value"
      :has-ungrouped-assets="manager.hasUngroupedAssets.value"
      @update:selected-group="manager.selectedGroup.value = $event"
      @create-group="openCreateGroupDialog"
      @edit-group="openEditGroupDialog"
      @delete-group="manager.deleteGroup"
      @copy-group-macro="manager.copyGroupMacro"
      @drop-on-group="manager.handleDropOnGroup"
    />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部工具栏 -->
      <AgentAssetsToolbar
        :is-selection-mode="manager.isSelectionMode.value"
        :selected-count="manager.selectedAssetIds.value.size"
        :filtered-total="manager.filteredAssets.value.length"
        :is-uploading="manager.isUploading.value"
        :search-query="manager.searchQuery.value"
        :sort-by="manager.sortBy.value"
        @update:search-query="manager.searchQuery.value = $event"
        @update:sort-by="manager.sortBy.value = $event"
        @toggle-selection-mode="manager.toggleSelectionMode"
        @toggle-select-all="manager.toggleSelectAll"
        @batch-move="openBatchMoveDialog"
        @batch-delete="manager.handleBatchDelete"
        @open-assets-dir="manager.handleOpenAssetsDir"
        @upload-click="handleUploadClick"
      />

      <!-- 主体区域 -->
      <div class="main-body">
        <!-- 空状态 -->
        <div
          v-if="manager.filteredAssets.value.length === 0"
          class="empty-state"
        >
          <el-empty
            :description="
              manager.searchQuery.value
                ? '未找到匹配的资产'
                : '暂无资产，拖拽文件或点击上传按钮添加'
            "
            :image-size="100"
          />
        </div>

        <!-- 资产列表网格 -->
        <AgentAssetsGrid
          v-else
          :assets="manager.filteredAssets.value"
          :agent-id="agentId"
          :is-selection-mode="manager.isSelectionMode.value"
          :selected-asset-ids="manager.selectedAssetIds.value"
          @asset-click="handleAssetClick"
          @toggle-selection="manager.toggleAssetSelection"
          @preview="handlePreview"
          @copy-id="handleCopyId"
          @edit="openEditDialog"
          @delete="manager.handleDeleteAsset"
          @drag-start="manager.handleDragStart"
          @drag-end="manager.handleDragEnd"
        />

        <!-- 覆盖层模式的 DropZone -->
        <DropZone
          overlay
          hide-content
          show-overlay-on-drag
          placeholder="上传到当前分组"
          :hint="dropZoneHint"
          :icon="Plus"
          :disabled="disabled || !agentId"
          @drop="manager.handleFileUpload"
        />
      </div>

      <!-- 隐藏的文件输入 -->
      <input
        ref="fileInput"
        type="file"
        multiple
        style="display: none"
        @change="handleFileInputChange"
      />
    </div>

    <!-- 弹窗群 -->
    <AgentAssetEditDialog
      v-model="editDialogVisible"
      :asset="editingAsset"
      :sorted-groups="manager.sortedGroups.value"
      @save="handleSaveEdit"
    />

    <AgentGroupEditDialog
      v-model="groupEditDialogVisible"
      :group="editingGroup"
      :default-sort-order="manager.assetGroups.value.length"
      @save="handleSaveGroup"
    />

    <AgentBatchMoveDialog
      v-model="batchMoveDialogVisible"
      :sorted-groups="manager.sortedGroups.value"
      @confirm="handleBatchMoveConfirm"
    />

    <AgentMediaPreview
      v-model="mediaPreviewVisible"
      :type="mediaPreviewType"
      :url="mediaPreviewUrl"
      :title="mediaPreviewTitle"
      :poster="mediaPreviewPoster"
    />
  </div>
</template>

<style scoped>
.agent-assets-manager {
  display: flex;
  height: 100%;
  min-height: 400px;
  background-color: var(--el-bg-color);
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background-color: var(--el-bg-color);
  position: relative;
}

.main-body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}
</style>
