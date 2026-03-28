<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import {
  Plus,
  Delete,
  Search,
  Edit,
  CopyDocument,
  ZoomIn,
  VideoPlay,
  Headset,
  Folder,
  Menu as IconMenu,
  Collection,
  Close,
  Operation,
  FolderAdd,
  MoreFilled,
} from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { useImageViewer } from "@/composables/useImageViewer";
import type { AgentAsset, AssetType, AssetGroup } from "../../../types";
import DropZone from "@/components/common/DropZone.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import VideoViewer from "@/components/common/VideoViewer.vue";
import AudioViewer from "@/components/common/AudioViewer.vue";
import { useClipboard } from "@vueuse/core";

const errorHandler = createModuleErrorHandler("AgentAssetsManager");
const logger = createModuleLogger("AgentAssetsManager");
const { copy } = useClipboard();
const imageViewer = useImageViewer();

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

const assets = ref<AgentAsset[]>([]);
const assetGroups = ref<AssetGroup[]>([]);
const isUploading = ref(false);
const searchQuery = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const selectedGroup = ref("all");

// 批量操作状态
const isSelectionMode = ref(false);
const selectedAssetIds = ref(new Set<string>());
const batchMoveDialogVisible = ref(false);
const batchTargetGroup = ref("");

// 拖拽状态
const draggingAssetId = ref<string | null>(null);

// 编辑对话框状态
const editDialogVisible = ref(false);
const editingAsset = ref<AgentAsset | null>(null);
const editForm = ref({
  id: "",
  description: "",
  group: "",
});

// 分组编辑对话框状态
const groupEditDialogVisible = ref(false);
const editingGroup = ref<AssetGroup | null>(null);
const groupEditForm = ref({
  id: "",
  displayName: "",
  description: "",
  icon: "",
  sortOrder: 0,
});

// 分组列表（基于 assetGroups，按 sortOrder 排序）
const sortedGroups = computed(() => {
  return [...assetGroups.value].sort((a, b) => {
    const orderA = a.sortOrder ?? 999;
    const orderB = b.sortOrder ?? 999;
    return orderA - orderB;
  });
});

// 获取分组的 ID 列表（用于判断是否存在）
const groupIds = computed(() => new Set(assetGroups.value.map((g) => g.id)));

// 检查是否存在未定义分组的资产（用于显示"未分组"）
const hasUngroupedAssets = computed(() => {
  return assets.value.some(
    (a) => !a.group || a.group === "default" || !groupIds.value.has(a.group)
  );
});

// 计算各分组数量
const groupCounts = computed(() => {
  const counts: Record<string, number> = {
    all: assets.value.length,
    default: assets.value.filter(
      (a) => !a.group || a.group === "default" || !groupIds.value.has(a.group ?? "")
    ).length,
  };

  assetGroups.value.forEach((group) => {
    counts[group.id] = assets.value.filter((a) => a.group === group.id).length;
  });

  return counts;
});

// 预览对话框状态（非图片资源）
const mediaPreviewVisible = ref(false);
const mediaPreviewUrl = ref("");
const mediaPreviewPoster = ref("");
const mediaPreviewType = ref<AssetType>("file");

// 同步外部数据
watch(
  () => props.modelValue,
  (newVal) => {
    assets.value = [...newVal];
  },
  { immediate: true, deep: true }
);

watch(
  () => props.assetGroups,
  (newVal) => {
    assetGroups.value = [...(newVal || [])];
  },
  { immediate: true, deep: true }
);

// 过滤后的资产列表
const filteredAssets = computed(() => {
  let result = assets.value;

  // 1. 分组过滤
  if (selectedGroup.value === "default") {
    // 未分组：group 为空、为 'default'、或引用了不存在的分组
    result = result.filter(
      (a) => !a.group || a.group === "default" || !groupIds.value.has(a.group)
    );
  } else if (selectedGroup.value !== "all") {
    result = result.filter((a) => a.group === selectedGroup.value);
  }

  // 2. 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (asset) =>
        asset.id.toLowerCase().includes(query) ||
        asset.filename.toLowerCase().includes(query) ||
        asset.description?.toLowerCase().includes(query)
    );
  }

  return result;
});

// 更新数据到父组件
const notifyUpdate = () => {
  emit("update:modelValue", assets.value);
};

const notifyGroupsUpdate = () => {
  emit("update:assetGroups", assetGroups.value);
};

// 切换选择模式
const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedAssetIds.value.clear();
};

// 切换资产选中状态
const toggleAssetSelection = (asset: AgentAsset) => {
  if (selectedAssetIds.value.has(asset.id)) {
    selectedAssetIds.value.delete(asset.id);
  } else {
    selectedAssetIds.value.add(asset.id);
  }
};

// 全选/取消全选
const toggleSelectAll = () => {
  if (selectedAssetIds.value.size === filteredAssets.value.length) {
    selectedAssetIds.value.clear();
  } else {
    filteredAssets.value.forEach((a) => selectedAssetIds.value.add(a.id));
  }
};

// 处理卡片点击
const handleAssetClick = (asset: AgentAsset) => {
  if (isSelectionMode.value) {
    toggleAssetSelection(asset);
  } else {
    handlePreview(asset);
  }
};

// 拖拽开始
const handleDragStart = (ev: DragEvent, asset: AgentAsset) => {
  draggingAssetId.value = asset.id;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", asset.id);
  }
};

// 拖拽结束
const handleDragEnd = () => {
  draggingAssetId.value = null;
};

// 处理放置到分组
const handleDropOnGroup = (group: string) => {
  const targetGroup = group === "all" ? "default" : group;

  // 确定要移动的资产 ID 列表
  let idsToMove: string[] = [];

  // 如果拖拽的是已选中的资产之一，则移动所有选中的资产
  if (draggingAssetId.value && selectedAssetIds.value.has(draggingAssetId.value)) {
    idsToMove = Array.from(selectedAssetIds.value);
  } else if (draggingAssetId.value) {
    // 否则只移动当前拖拽的资产
    idsToMove = [draggingAssetId.value];
  }

  if (idsToMove.length === 0) return;

  // 执行移动
  let movedCount = 0;
  assets.value.forEach((asset) => {
    if (idsToMove.includes(asset.id)) {
      if (asset.group !== targetGroup) {
        asset.group = targetGroup;
        movedCount++;
      }
    }
  });

  if (movedCount > 0) {
    notifyUpdate();
    const displayName = getGroupDisplayName(targetGroup);
    customMessage.success(`已将 ${movedCount} 个资产移动到 "${displayName}"`);
  }

  draggingAssetId.value = null;
};

// 批量删除
const handleBatchDelete = async () => {
  if (selectedAssetIds.value.size === 0) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedAssetIds.value.size} 个资产吗？此操作不可恢复。`,
      "批量删除确认",
      {
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
  } catch {
    return;
  }

  const assetsToDelete = assets.value.filter((a) => selectedAssetIds.value.has(a.id));
  const assetPaths = assetsToDelete.map((a) => a.path);

  try {
    await invoke("batch_delete_agent_assets", {
      agentId: props.agentId,
      assetPaths,
    });

    // 从本地列表中移除
    assets.value = assets.value.filter((a) => !selectedAssetIds.value.has(a.id));

    customMessage.success(`成功删除 ${assetsToDelete.length} 个资产`);
    notifyUpdate();
    emit("physical-change");
  } catch (error) {
    logger.error("批量删除资产失败", error);
    errorHandler.error(error, "批量删除资产失败");
  }

  selectedAssetIds.value.clear();
  isSelectionMode.value = false;
};

// 打开批量移动弹窗
const openBatchMoveDialog = () => {
  if (selectedAssetIds.value.size === 0) return;
  batchTargetGroup.value = "";
  batchMoveDialogVisible.value = true;
};

// 执行批量移动
const handleBatchMove = () => {
  if (!batchTargetGroup.value) {
    customMessage.warning("请选择目标分组");
    return;
  }

  const target = batchTargetGroup.value;
  let count = 0;

  assets.value.forEach((asset) => {
    if (selectedAssetIds.value.has(asset.id)) {
      if (asset.group !== target) {
        asset.group = target;
        count++;
      }
    }
  });

  notifyUpdate();
  const displayName = getGroupDisplayName(target);
  customMessage.success(`已移动 ${count} 个资产到 "${displayName}"`);
  batchMoveDialogVisible.value = false;
  selectedAssetIds.value.clear();
  isSelectionMode.value = false;
};

// ========== 分组管理 ==========

/**
 * 打开创建分组对话框
 */
const openCreateGroupDialog = () => {
  editingGroup.value = null;
  groupEditForm.value = {
    id: "",
    displayName: "",
    description: "",
    icon: "📁",
    sortOrder: assetGroups.value.length,
  };
  groupEditDialogVisible.value = true;
};

/**
 * 打开编辑分组对话框
 */
const openEditGroupDialog = (group: AssetGroup) => {
  editingGroup.value = group;
  groupEditForm.value = {
    id: group.id,
    displayName: group.displayName,
    description: group.description || "",
    icon: group.icon || "📁",
    sortOrder: group.sortOrder ?? 0,
  };
  groupEditDialogVisible.value = true;
};

/**
 * 保存分组（创建或更新）
 */
const saveGroup = () => {
  const { id, displayName, description, icon, sortOrder } = groupEditForm.value;

  if (!id.trim()) {
    customMessage.warning("请输入分组 ID");
    return;
  }

  if (!displayName.trim()) {
    customMessage.warning("请输入分组名称");
    return;
  }

  // ID 格式校验：只允许字母、数字、下划线、连字符
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    customMessage.warning("分组 ID 只能包含字母、数字、下划线和连字符");
    return;
  }

  if (editingGroup.value) {
    // 更新现有分组
    const oldId = editingGroup.value.id;
    const index = assetGroups.value.findIndex((g) => g.id === oldId);
    if (index > -1) {
      assetGroups.value[index] = {
        id,
        displayName,
        description: description || undefined,
        icon: icon || undefined,
        sortOrder,
      };

      // 如果 ID 变更，更新所有引用该分组的资产
      if (oldId !== id) {
        assets.value.forEach((asset) => {
          if (asset.group === oldId) {
            asset.group = id;
          }
        });
        notifyUpdate();
      }
    }
    customMessage.success("分组已更新");
  } else {
    // 创建新分组
    if (assetGroups.value.some((g) => g.id === id)) {
      customMessage.warning("该分组 ID 已存在");
      return;
    }

    assetGroups.value.push({
      id,
      displayName,
      description: description || undefined,
      icon: icon || undefined,
      sortOrder,
    });
    customMessage.success("分组已创建");
  }

  notifyGroupsUpdate();
  groupEditDialogVisible.value = false;
};

/**
 * 复制分组宏到剪贴板
 * 格式: {{assets::groupId}}
 */
const copyGroupMacro = (groupId: string) => {
  const macro = `{{assets::${groupId}}}`;
  copy(macro);
  const displayName = getGroupDisplayName(groupId);
  customMessage.success(`已复制宏: ${macro} (${displayName})`);
};

/**
 * 删除分组
 */
const deleteGroup = async (group: AssetGroup) => {
  const assetsInGroup = assets.value.filter((a) => a.group === group.id).length;
  const message =
    assetsInGroup > 0
      ? `确定要删除分组 "${group.displayName}" 吗？其中的 ${assetsInGroup} 个资产将移至"未分组"。<br>`
      : `确定要删除分组 "${group.displayName}" 吗？`;

  try {
    await ElMessageBox.confirm(message, "删除分组确认", {
      confirmButtonText: "确定删除",
      cancelButtonText: "取消",
      type: "warning",
      dangerouslyUseHTMLString: true,
    });
  } catch {
    return;
  }

  // 将该分组的资产移至未分组
  assets.value.forEach((asset) => {
    if (asset.group === group.id) {
      asset.group = "default";
    }
  });

  // 删除分组
  const index = assetGroups.value.findIndex((g) => g.id === group.id);
  if (index > -1) {
    assetGroups.value.splice(index, 1);
  }

  // 如果当前选中的是被删除的分组，切换到全部
  if (selectedGroup.value === group.id) {
    selectedGroup.value = "all";
  }

  notifyUpdate();
  notifyGroupsUpdate();
  customMessage.success("分组已删除");
};

/**
 * 获取分组显示名称
 */
const getGroupDisplayName = (groupId: string) => {
  if (!groupId || groupId === "default") return "未分组";
  const group = assetGroups.value.find((g) => g.id === groupId);
  return group?.displayName || groupId;
};

/**
 * 打开资产目录
 */
const handleOpenAssetsDir = async () => {
  try {
    const appDir = await getAppConfigDir();
    const assetsPath = await join(appDir, "llm-chat", "agents", props.agentId, "assets");
    logger.info("尝试打开资产目录", {
      appDir,
      agentId: props.agentId,
      assetsPath,
    });
    await invoke("open_file_directory", { filePath: assetsPath });
  } catch (error) {
    logger.error("打开资产目录失败", error);
    errorHandler.error(error, "打开资产目录失败");
  }
};

/**
 * 获取资产的真实 URL
 */
const getAssetUrl = async (asset: AgentAsset) => {
  try {
    const fullPath = await invoke<string>("get_agent_asset_path", {
      agentId: props.agentId,
      assetPath: asset.path,
    });
    return convertFileSrc(fullPath);
  } catch (error) {
    logger.error("获取资产路径失败", error);
    return "";
  }
};

/**
 * 从文件名提取不带扩展名的基础名称
 */
const extractBaseName = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot > 0) {
    return fileName.substring(0, lastDot);
  }
  return fileName;
};

/**
 * 处理文件上传
 */
const handleFileUpload = async (paths: string[]) => {
  if (props.disabled || !props.agentId) return;

  isUploading.value = true;
  let skipCount = 0;
  try {
    for (const path of paths) {
      const fileName = path.split(/[/\\]/).pop() || "file";

      // 检查是否已存在同名文件
      if (assets.value.some((a) => a.filename === fileName)) {
        skipCount++;
        continue;
      }

      const data = await invoke<number[]>("read_file_binary", { path });

      // 使用原始文件名（去扩展名）作为自定义 ID
      const customId = extractBaseName(fileName);

      const info = await invoke<any>("save_agent_asset", {
        agentId: props.agentId,
        fileName,
        data: new Uint8Array(data),
        customId,
      });

      // 从返回的 filename 中提取实际的 ID（去扩展名）
      const actualId = extractBaseName(info.filename);

      const newAsset: AgentAsset = {
        id: actualId,
        path: info.path,
        filename: fileName,
        type: inferAssetType(info.mimeType),
        size: info.size,
        mimeType: info.mimeType,
        usage: "inline",
        group:
          selectedGroup.value === "all" || selectedGroup.value === "default"
            ? "default"
            : selectedGroup.value,
        thumbnailPath: info.thumbnailPath,
      };

      assets.value.push(newAsset);
    }

    notifyUpdate();
    emit("physical-change");

    const successCount = paths.length - skipCount;
    if (successCount > 0) {
      customMessage.success(
        `成功上传 ${successCount} 个资产${skipCount > 0 ? `（跳过 ${skipCount} 个同名资产）` : ""}`
      );
    } else if (skipCount > 0) {
      customMessage.warning(`所选资产已全部存在，已跳过`);
    }
  } catch (error) {
    errorHandler.error(error, "上传资产失败");
  } finally {
    isUploading.value = false;
    // 重置 input 防止重复选择同一文件不触发 change
    if (fileInput.value) fileInput.value.value = "";
  }
};

const inferAssetType = (mimeType: string): AssetType => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
};

/**
 * 删除资产
 */
const handleDeleteAsset = async (asset: AgentAsset) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除资产 "${asset.filename}" 吗？此操作不可恢复。`,
      "删除确认",
      {
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    await invoke("delete_agent_asset", {
      agentId: props.agentId,
      assetPath: asset.path,
    });

    const index = assets.value.findIndex(a => a.id === asset.id);
    if (index > -1) {
      assets.value.splice(index, 1);
      notifyUpdate();
      emit("physical-change");
      customMessage.success("资产已删除");
    }
  } catch (error) {
    if (error === "cancel") return;
    logger.error("删除资产失败", error);
    errorHandler.error(error, "删除资产失败");
  }
};
/**
 * 预览资产
 */
const handlePreview = async (asset: AgentAsset) => {
  const url = await getAssetUrl(asset);
  if (!url) return;

  if (asset.type === "image") {
    imageViewer.show(url);
  } else {
    mediaPreviewType.value = asset.type;
    mediaPreviewUrl.value = url;
    mediaPreviewPoster.value = "";

    // 如果是音频且有缩略图，加载缩略图作为封面
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

/**
 * 获取文件后缀名
 */
const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) return "";
  return filename.substring(lastDot + 1).toLowerCase();
};

/**
 * 生成完整的资产引用路径
 * 格式: agent-asset://{group}/{id}.{ext}
 */
const buildAssetRef = (asset: AgentAsset): string => {
  const group = asset.group || "default";
  const ext = getFileExtension(asset.filename);
  return ext ? `agent-asset://${group}/${asset.id}.${ext}` : `agent-asset://${group}/${asset.id}`;
};

/**
 * 复制资产引用
 */
const handleCopyId = (asset: AgentAsset) => {
  const refText = buildAssetRef(asset);
  copy(refText);
  customMessage.success(`已复制引用: ${refText}`);
};

/**
 * 打开编辑对话框
 */
const openEditDialog = (asset: AgentAsset) => {
  editingAsset.value = asset;
  editForm.value = {
    id: asset.id,
    description: asset.description || "",
    group: asset.group || "default",
  };
  editDialogVisible.value = true;
};

/**
 * 保存编辑
 */
const saveEdit = () => {
  if (!editingAsset.value) return;

  // 检查 ID 是否冲突（排除自己）
  const idExists = assets.value.some((a) => a.id === editForm.value.id && a !== editingAsset.value);
  if (idExists) {
    customMessage.warning("该 ID 已存在，请使用唯一的 ID");
    return;
  }

  editingAsset.value.id = editForm.value.id;
  editingAsset.value.description = editForm.value.description;
  editingAsset.value.group = editForm.value.group;

  notifyUpdate();
  editDialogVisible.value = false;
  customMessage.success("资产信息已更新");
};

// 格式化文件大小
const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "--";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

// 异步加载图片 URL 的组件逻辑
const AssetThumbnail = {
  props: ["asset", "agentId"],
  setup(props: any) {
    const src = ref("");

    // 立即获取 URL
    invoke<string>("get_agent_asset_path", {
      agentId: props.agentId,
      assetPath: props.asset.path,
    }).then((path) => {
      src.value = convertFileSrc(path);
    });

    return { src };
  },
  template: `<img v-if="src" :src="src" class="w-full h-full object-cover" loading="lazy" />`,
};

// 异步加载缩略图 URL 的组件逻辑（用于音频封面等）
const ThumbnailPreview = {
  props: ["thumbnailPath", "agentId", "fallbackIcon"],
  setup(props: any) {
    const src = ref("");
    const loaded = ref(false);

    // 如果有缩略图路径，获取 URL
    if (props.thumbnailPath) {
      invoke<string>("get_agent_asset_path", {
        agentId: props.agentId,
        assetPath: props.thumbnailPath,
      })
        .then((path) => {
          src.value = convertFileSrc(path);
          loaded.value = true;
        })
        .catch(() => {
          loaded.value = false;
        });
    }

    return { src, loaded };
  },
  template: `
    <img v-if="loaded && src" :src="src" class="w-full h-full object-cover" loading="lazy" />
    <slot v-else name="fallback"></slot>
  `,
};
</script>

<template>
  <div class="agent-assets-manager" :class="{ 'is-disabled': disabled }">
    <!-- 侧边栏：分组 -->
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="title">资产分组</span>
        <el-tooltip content="创建分组" :show-after="500">
          <el-button :icon="Plus" circle size="small" @click="openCreateGroupDialog" />
        </el-tooltip>
      </div>
      <div class="group-list">
        <div
          class="group-item"
          :class="{ active: selectedGroup === 'all' }"
          @click="selectedGroup = 'all'"
          @dragover.prevent
          @drop="handleDropOnGroup('all')"
        >
          <el-icon><IconMenu /></el-icon>
          <span class="name">全部资产</span>
          <span class="count">{{ groupCounts.all }}</span>
        </div>

        <div
          v-if="hasUngroupedAssets || assetGroups.length === 0"
          class="group-item"
          :class="{ active: selectedGroup === 'default' }"
          @click="selectedGroup = 'default'"
          @dragover.prevent
          @drop="handleDropOnGroup('default')"
        >
          <el-icon><Collection /></el-icon>
          <span class="name">未分组</span>
          <span class="count">{{ groupCounts.default }}</span>
        </div>

        <div class="divider" v-if="sortedGroups.length > 0"></div>
        <div class="group-label" v-if="sortedGroups.length > 0">自定义分组</div>

        <div
          v-for="group in sortedGroups"
          :key="group.id"
          class="group-item"
          :class="{ active: selectedGroup === group.id }"
          @click="selectedGroup = group.id"
          @dragover.prevent
          @drop="handleDropOnGroup(group.id)"
        >
          <span v-if="group.icon" class="group-icon-emoji">{{ group.icon }}</span>
          <el-icon v-else><Folder /></el-icon>
          <span class="name" :title="group.description">{{ group.displayName }}</span>
          <span class="count">{{ groupCounts[group.id] || 0 }}</span>
          <el-dropdown
            trigger="click"
            @command="
              (cmd: string) => {
                if (cmd === 'edit') openEditGroupDialog(group);
                else if (cmd === 'delete') deleteGroup(group);
                else if (cmd === 'copyMacro') copyGroupMacro(group.id);
              }
            "
            @click.stop
          >
            <el-button :icon="MoreFilled" circle size="small" class="group-menu-btn" @click.stop />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit" :icon="Edit">编辑分组</el-dropdown-item>
                <el-dropdown-item command="copyMacro" :icon="CopyDocument"
                  >复制分组宏</el-dropdown-item
                >
                <el-dropdown-item command="delete" :icon="Delete" divided
                  >删除分组</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部工具栏 -->
      <div class="toolbar">
        <div class="left-tools">
          <template v-if="isSelectionMode">
            <span class="selection-count">已选 {{ selectedAssetIds.size }} 项</span>
            <el-divider direction="vertical" />
            <el-button size="small" @click="toggleSelectAll">
              {{
                selectedAssetIds.size > 0 && selectedAssetIds.size === filteredAssets.length
                  ? "取消全选"
                  : "全选"
              }}
            </el-button>
          </template>
          <div class="search-box">
            <el-input
              v-model="searchQuery"
              placeholder="搜索资产 (ID、文件名)..."
              :prefix-icon="Search"
              clearable
              size="small"
            />
          </div>
        </div>

        <div class="actions">
          <template v-if="isSelectionMode">
            <el-button size="small" :icon="Close" @click="toggleSelectionMode">退出批量</el-button>
            <el-divider direction="vertical" />
            <el-button-group size="small">
              <el-button
                :icon="FolderAdd"
                @click="openBatchMoveDialog"
                :disabled="selectedAssetIds.size === 0"
              >
                移动到...
              </el-button>
              <el-button
                type="danger"
                :icon="Delete"
                @click="handleBatchDelete"
                :disabled="selectedAssetIds.size === 0"
              >
                删除
              </el-button>
            </el-button-group>
          </template>
          <template v-else>
            <el-tooltip content="批量管理资产" :show-after="500" placement="top">
              <el-button size="small" :icon="Operation" @click="toggleSelectionMode">
                批量
              </el-button>
            </el-tooltip>
            <el-tooltip content="打开本地资产目录" :show-after="500" placement="top">
              <el-button size="small" :icon="Folder" @click="handleOpenAssetsDir" />
            </el-tooltip>
            <el-button
              size="small"
              type="primary"
              :icon="Plus"
              :loading="isUploading"
              @click="fileInput?.click()"
            >
              上传
            </el-button>
          </template>

          <input
            ref="fileInput"
            type="file"
            multiple
            style="display: none"
            @change="
              (e) =>
                handleFileUpload(
                  Array.from((e.target as HTMLInputElement).files || []).map(
                    (f) => (f as any).path || f.name
                  )
                )
            "
          />
        </div>
      </div>

      <!-- 主体区域 -->
      <div class="main-body">
        <!-- 资产列表网格 -->
        <div v-if="filteredAssets.length === 0" class="empty-state">
          <el-empty
            :description="searchQuery ? '未找到匹配的资产' : '暂无资产，拖拽文件或点击上传按钮添加'"
            :image-size="100"
          />
        </div>

        <div v-else class="assets-grid-container">
          <div class="assets-grid">
            <div
              v-for="asset in filteredAssets"
              :key="asset.path"
              class="asset-card"
              :class="{
                'is-selected': selectedAssetIds.has(asset.id),
                'is-selection-mode': isSelectionMode,
              }"
              draggable="true"
              @dragstart="handleDragStart($event, asset)"
              @dragend="handleDragEnd"
              @click="handleAssetClick(asset)"
            >
              <!-- 选中遮罩 (Selection Mode) -->
              <div class="selection-overlay" v-if="isSelectionMode">
                <el-checkbox
                  :model-value="selectedAssetIds.has(asset.id)"
                  @change="toggleAssetSelection(asset)"
                  @click.stop
                />
              </div>

              <!-- 预览区域 -->
              <div class="asset-preview">
                <!-- 图片类型 -->
                <component
                  v-if="asset.type === 'image'"
                  :is="AssetThumbnail"
                  :asset="asset"
                  :agent-id="agentId"
                />

                <!-- 音频类型（可能有封面缩略图） -->
                <template v-else-if="asset.type === 'audio'">
                  <component
                    v-if="asset.thumbnailPath"
                    :is="ThumbnailPreview"
                    :thumbnail-path="asset.thumbnailPath"
                    :agent-id="agentId"
                  >
                    <template #fallback>
                      <div class="generic-preview audio">
                        <el-icon :size="48"><Headset /></el-icon>
                      </div>
                    </template>
                  </component>
                  <div v-else class="generic-preview audio">
                    <el-icon :size="48"><Headset /></el-icon>
                  </div>
                </template>

                <!-- 其他类型 -->
                <div v-else class="generic-preview" :class="asset.type">
                  <el-icon v-if="asset.type === 'video'" :size="48"><VideoPlay /></el-icon>
                  <FileIcon v-else :filename="asset.filename" :size="48" />
                </div>

                <!-- 悬停遮罩 (非选择模式下显示) -->
                <div class="asset-overlay" @click.stop v-if="!isSelectionMode">
                  <div class="overlay-actions">
                    <el-tooltip content="预览" :show-after="500" placement="top">
                      <el-button circle size="small" :icon="ZoomIn" @click="handlePreview(asset)" />
                    </el-tooltip>
                    <el-tooltip content="复制引用路径" :show-after="500" placement="top">
                      <el-button
                        circle
                        size="small"
                        :icon="CopyDocument"
                        @click="handleCopyId(asset)"
                      />
                    </el-tooltip>
                    <el-tooltip content="编辑信息" :show-after="500" placement="top">
                      <el-button
                        circle
                        size="small"
                        :icon="Edit"
                        type="primary"
                        plain
                        @click="openEditDialog(asset)"
                      />
                    </el-tooltip>
                    <el-tooltip content="删除" :show-after="500" placement="top">
                      <el-button
                        circle
                        size="small"
                        :icon="Delete"
                        type="danger"
                        plain
                        @click="handleDeleteAsset(asset)"
                      />
                    </el-tooltip>
                  </div>
                </div>

                <!-- 类型标签 -->
                <div class="asset-type-tag">
                  {{ asset.type.toUpperCase() }}
                </div>
              </div>

              <!-- 信息区域 -->
              <div class="asset-info">
                <div class="asset-id" :title="asset.id">
                  {{ asset.id }}
                </div>
                <div class="asset-meta">
                  <span class="filename" :title="asset.filename">{{ asset.filename }}</span>
                  <span class="size">{{ formatSize(asset.size) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 覆盖层模式的 DropZone -->
        <DropZone
          overlay
          show-overlay-on-drag
          placeholder="上传到当前分组"
          :hint="`支持图片、音频、视频等多种格式${selectedGroup !== 'all' && selectedGroup !== 'default' ? ' (将自动添加到 ' + getGroupDisplayName(selectedGroup) + ' 分组)' : ''}`"
          :icon="Plus"
          :disabled="disabled || !agentId"
          @drop="handleFileUpload"
        />
      </div>
    </div>

    <!-- 批量移动弹窗 -->
    <BaseDialog v-model="batchMoveDialogVisible" title="批量移动到分组" width="400px">
      <el-form label-width="80px">
        <el-form-item label="目标分组">
          <el-select
            v-model="batchTargetGroup"
            placeholder="选择分组"
            style="width: 100%"
            filterable
          >
            <el-option label="未分组" value="default" />
            <el-option
              v-for="group in sortedGroups"
              :key="group.id"
              :label="group.displayName"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="sortedGroups.length === 0">
          <div class="form-tip">暂无自定义分组，请先在侧边栏创建分组</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchMoveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBatchMove">确定移动</el-button>
      </template>
    </BaseDialog>

    <!-- 编辑对话框 -->
    <BaseDialog v-model="editDialogVisible" title="编辑资产信息" width="400px">
      <el-form :model="editForm" label-width="60px" @submit.prevent="saveEdit">
        <el-form-item label="ID" required>
          <el-input v-model="editForm.id" placeholder="唯一标识符，用于引用" />
          <div class="form-tip">
            在对话中使用
            <code
              >agent-asset://{{ editForm.group || "default" }}/{{ editForm.id || "ID" }}.{{
                editingAsset ? getFileExtension(editingAsset.filename) || "ext" : "ext"
              }}</code
            >
            引用此资产
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="2"
            placeholder="资产描述（可选）"
          />
        </el-form-item>
        <el-form-item label="分组">
          <el-select
            v-model="editForm.group"
            placeholder="选择或输入分组 ID"
            filterable
            allow-create
            default-first-option
            style="width: 100%"
          >
            <el-option label="未分组 (default)" value="default" />
            <el-option
              v-for="group in sortedGroups"
              :key="group.id"
              :label="`${group.displayName} (${group.id})`"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </BaseDialog>

    <!-- 分组编辑对话框 -->
    <BaseDialog
      v-model="groupEditDialogVisible"
      :title="editingGroup ? '编辑分组' : '创建分组'"
      width="400px"
    >
      <el-form :model="groupEditForm" label-width="80px" @submit.prevent="saveGroup">
        <el-form-item label="ID" required>
          <el-input
            v-model="groupEditForm.id"
            placeholder="分组唯一标识 (英文)"
            :disabled="!!editingGroup"
          />
          <div class="form-tip" v-if="!editingGroup">
            创建后 ID 不可修改，只能包含字母、数字、下划线和连字符
          </div>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="groupEditForm.displayName" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input
            v-model="groupEditForm.icon"
            placeholder="Emoji 或图标字符"
            style="width: 100px"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number
            v-model="groupEditForm.sortOrder"
            :min="0"
            :step="1"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="groupEditForm.description"
            type="textarea"
            :rows="2"
            placeholder="分组描述（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupEditDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGroup">保存</el-button>
      </template>
    </BaseDialog>

    <!-- 视频预览 -->
    <VideoViewer
      v-if="mediaPreviewType === 'video'"
      v-model:visible="mediaPreviewVisible"
      :src="mediaPreviewUrl"
      :title="editingAsset?.filename || '视频预览'"
    />

    <!-- 音频预览 -->
    <AudioViewer
      v-else-if="mediaPreviewType === 'audio'"
      v-model:visible="mediaPreviewVisible"
      :src="mediaPreviewUrl"
      :poster="mediaPreviewPoster"
      :title="editingAsset?.filename || '音频预览'"
    />

    <!-- 文件预览对话框 -->
    <BaseDialog
      v-else
      v-model="mediaPreviewVisible"
      :title="editingAsset?.filename || '预览'"
      width="400px"
      :show-footer="false"
    >
      <div class="media-container">
        <div class="file-preview-placeholder">
          <FileIcon :filename="mediaPreviewUrl" :size="64" />
          <p>此文件类型不支持在线预览</p>
        </div>
      </div>
    </BaseDialog>
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

/* Sidebar */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-page);
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.group-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  font-size: 13px;
  transition: all 0.2s;
  margin-bottom: 2px;
}

.group-item:hover {
  background-color: var(--el-fill-color);
}

.group-item.active {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  color: var(--el-color-primary);
}

.group-item .el-icon {
  margin-right: 8px;
  font-size: 16px;
}

.group-item .name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-item .count {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  background-color: var(--el-fill-color-darker);
  padding: 2px 6px;
  border-radius: 10px;
}

.group-item.active .count {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-primary);
}

.divider {
  height: 1px;
  background-color: var(--el-border-color-lighter);
  margin: 8px 4px;
}

.group-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 12px;
  margin-top: 4px;
}

/* Main Content */
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

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;
}

.left-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.selection-count {
  font-size: 13px;
  color: var(--el-text-color-regular);
  font-weight: 500;
  white-space: nowrap;
}

.search-box {
  flex: 1;
  max-width: 240px;
}

/* overlay 模式由组件内部处理 */

.assets-grid-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  /* 预留一点 padding 确保卡片阴影和 DropZone 效果不被截断 */
  padding: 16px;
  box-sizing: border-box;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

/* Grid Layout */
.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

/* Asset Card */
.asset-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
}

.asset-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--el-color-primary-light-5);
}

.asset-card.is-selection-mode {
  cursor: pointer;
}

.asset-card.is-selected {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.selection-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  pointer-events: none; /* 让点击穿透到 card，除非点 checkbox */
}

.selection-overlay .el-checkbox {
  pointer-events: auto;
  --el-checkbox-bg-color: white;
}

.asset-preview {
  aspect-ratio: 1 / 1;
  position: relative;
  background-color: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.asset-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.generic-preview {
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.generic-preview.video {
  background-color: #f0f9eb;
  color: var(--el-color-success);
}
.generic-preview.audio {
  background-color: #fdf6ec;
  color: var(--el-color-warning);
}

.asset-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  backdrop-filter: blur(2px);
}

.asset-card:hover .asset-overlay {
  opacity: 1;
}

.overlay-actions {
  display: flex;
  gap: 8px;
  transform: translateY(10px);
  transition: transform 0.2s;
}

.asset-card:hover .overlay-actions {
  transform: translateY(0);
}

.asset-type-tag {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
  font-weight: bold;
}

.asset-info {
  padding: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.asset-id {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.filename {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}

.size {
  flex-shrink: 0;
  font-family: monospace;
}

.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

code {
  background-color: var(--el-fill-color);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
}

.media-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  min-height: 200px;
}

.file-preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: white;
  padding: 40px;
}
</style>
