import { ref, watch, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { useClipboard } from "@vueuse/core";
import type { AgentAsset, AssetType, AssetGroup } from "../../../types";

const errorHandler = createModuleErrorHandler("AgentAssetsManager");
const logger = createModuleLogger("AgentAssetsManager");

interface Props {
  modelValue: AgentAsset[];
  assetGroups?: AssetGroup[];
  agentId: string;
  disabled?: boolean;
}

export function useAgentAssetsManager(props: Props, emit: any) {
  const { copy } = useClipboard();

  const assets = ref<AgentAsset[]>([]);
  const assetGroups = ref<AssetGroup[]>([]);
  const isUploading = ref(false);
  const searchQuery = ref("");
  const selectedGroup = ref("all");
  const sortBy = ref("default");

  // 批量操作状态
  const isSelectionMode = ref(false);
  const selectedAssetIds = ref(new Set<string>());

  // 拖拽状态
  const draggingAssetId = ref<string | null>(null);

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
        (a) =>
          !a.group ||
          a.group === "default" ||
          !groupIds.value.has(a.group ?? "")
      ).length,
    };

    assetGroups.value.forEach((group) => {
      counts[group.id] = assets.value.filter(
        (a) => a.group === group.id
      ).length;
    });

    return counts;
  });

  // 过滤并排序后的资产列表
  const filteredAssets = computed(() => {
    let result = [...assets.value];

    // 1. 分组过滤
    if (selectedGroup.value === "default") {
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

    // 3. 排序
    if (sortBy.value !== "default") {
      result.sort((a, b) => {
        if (sortBy.value === "name-asc") {
          return a.filename.localeCompare(b.filename, "zh-CN");
        } else if (sortBy.value === "name-desc") {
          return b.filename.localeCompare(a.filename, "zh-CN");
        } else if (sortBy.value === "id-asc") {
          return a.id.localeCompare(b.id, "zh-CN");
        } else if (sortBy.value === "id-desc") {
          return b.id.localeCompare(a.id, "zh-CN");
        } else if (sortBy.value === "size-asc") {
          return (a.size ?? 0) - (b.size ?? 0);
        } else if (sortBy.value === "size-desc") {
          return (b.size ?? 0) - (a.size ?? 0);
        }
        return 0;
      });
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

    if (
      draggingAssetId.value &&
      selectedAssetIds.value.has(draggingAssetId.value)
    ) {
      idsToMove = Array.from(selectedAssetIds.value);
    } else if (draggingAssetId.value) {
      idsToMove = [draggingAssetId.value];
    }

    if (idsToMove.length === 0) return;

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
          lockScroll: false, // 遵守规范：Tauri 环境下必须设置 lockScroll: false
        }
      );
    } catch {
      return;
    }

    const assetsToDelete = assets.value.filter((a) =>
      selectedAssetIds.value.has(a.id)
    );
    const assetPaths = assetsToDelete.map((a) => a.path);

    try {
      await invoke("batch_delete_agent_assets", {
        agentId: props.agentId,
        assetPaths,
      });

      assets.value = assets.value.filter(
        (a) => !selectedAssetIds.value.has(a.id)
      );

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

  // 执行批量移动
  const handleBatchMove = (targetGroup: string) => {
    if (!targetGroup) {
      customMessage.warning("请选择目标分组");
      return;
    }

    let count = 0;
    assets.value.forEach((asset) => {
      if (selectedAssetIds.value.has(asset.id)) {
        if (asset.group !== targetGroup) {
          asset.group = targetGroup;
          count++;
        }
      }
    });

    notifyUpdate();
    const displayName = getGroupDisplayName(targetGroup);
    customMessage.success(`已移动 ${count} 个资产到 "${displayName}"`);
    selectedAssetIds.value.clear();
    isSelectionMode.value = false;
  };

  // 保存分组（创建或更新）
  const saveGroup = (
    groupForm: {
      id: string;
      displayName: string;
      description?: string;
      icon?: string;
      sortOrder: number;
    },
    isEdit: boolean
  ) => {
    const { id, displayName, description, icon, sortOrder } = groupForm;

    if (!id.trim()) {
      customMessage.warning("请输入分组 ID");
      return false;
    }

    if (!displayName.trim()) {
      customMessage.warning("请输入分组名称");
      return false;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      customMessage.warning("分组 ID 只能包含字母、数字、下划线和连字符");
      return false;
    }

    if (isEdit) {
      const index = assetGroups.value.findIndex((g) => g.id === id);
      if (index > -1) {
        assetGroups.value[index] = {
          id,
          displayName,
          description: description || undefined,
          icon: icon || undefined,
          sortOrder,
        };
      }
      customMessage.success("分组已更新");
    } else {
      if (assetGroups.value.some((g) => g.id === id)) {
        customMessage.warning("该分组 ID 已存在");
        return false;
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
    return true;
  };

  // 复制分组宏到剪贴板
  const copyGroupMacro = (groupId: string) => {
    const macro = `{{assets::${groupId}}}`;
    copy(macro);
    const displayName = getGroupDisplayName(groupId);
    customMessage.success(`已复制宏: ${macro} (${displayName})`);
  };

  // 删除分组
  const deleteGroup = async (group: AssetGroup) => {
    const assetsInGroup = assets.value.filter(
      (a) => a.group === group.id
    ).length;
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
        lockScroll: false, // 遵守规范：Tauri 环境下必须设置 lockScroll: false
      });
    } catch {
      return;
    }

    assets.value.forEach((asset) => {
      if (asset.group === group.id) {
        asset.group = "default";
      }
    });

    const index = assetGroups.value.findIndex((g) => g.id === group.id);
    if (index > -1) {
      assetGroups.value.splice(index, 1);
    }

    if (selectedGroup.value === group.id) {
      selectedGroup.value = "all";
    }

    notifyUpdate();
    notifyGroupsUpdate();
    customMessage.success("分组已删除");
  };

  // 获取分组显示名称
  const getGroupDisplayName = (groupId: string) => {
    if (!groupId || groupId === "default") return "未分组";
    const group = assetGroups.value.find((g) => g.id === groupId);
    return group?.displayName || groupId;
  };

  // 打开资产目录
  const handleOpenAssetsDir = async () => {
    try {
      const appDir = await getAppConfigDir();
      const assetsPath = await join(
        appDir,
        "llm-chat",
        "agents",
        props.agentId,
        "assets"
      );
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

  // 获取资产的真实 URL
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

  const extractBaseName = (fileName: string): string => {
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot > 0) {
      return fileName.substring(0, lastDot);
    }
    return fileName;
  };

  const inferAssetType = (mimeType: string): AssetType => {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "file";
  };

  // 处理文件上传
  const handleFileUpload = async (paths: string[]) => {
    if (props.disabled || !props.agentId) return;

    isUploading.value = true;
    let skipCount = 0;
    try {
      for (const path of paths) {
        const fileName = path.split(/[/\\]/).pop() || "file";

        if (assets.value.some((a) => a.filename === fileName)) {
          skipCount++;
          continue;
        }

        const data = await invoke<number[]>("read_file_binary", { path });
        const customId = extractBaseName(fileName);

        const info = await invoke<any>("save_agent_asset", {
          agentId: props.agentId,
          fileName,
          data: new Uint8Array(data),
          customId,
        });

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
    }
  };

  // 删除资产
  const handleDeleteAsset = async (asset: AgentAsset) => {
    try {
      await ElMessageBox.confirm(
        `确定要删除资产 "${asset.filename}" 吗？此操作不可恢复。`,
        "删除确认",
        {
          confirmButtonText: "确定删除",
          cancelButtonText: "取消",
          type: "warning",
          lockScroll: false, // 遵守规范：Tauri 环境下必须设置 lockScroll: false
        }
      );

      await invoke("delete_agent_asset", {
        agentId: props.agentId,
        assetPath: asset.path,
      });

      const index = assets.value.findIndex((a) => a.id === asset.id);
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

  // 保存编辑
  const saveEdit = (
    editingAsset: AgentAsset,
    editForm: { id: string; description: string; group: string }
  ) => {
    const idExists = assets.value.some(
      (a) => a.id === editForm.id && a !== editingAsset
    );
    if (idExists) {
      customMessage.warning("该 ID 已存在，请使用唯一的 ID");
      return false;
    }

    editingAsset.id = editForm.id;
    editingAsset.description = editForm.description;
    editingAsset.group = editForm.group;

    notifyUpdate();
    customMessage.success("资产信息已更新");
    return true;
  };

  return {
    assets,
    assetGroups,
    isUploading,
    searchQuery,
    selectedGroup,
    sortBy,
    isSelectionMode,
    selectedAssetIds,
    draggingAssetId,
    sortedGroups,
    groupIds,
    hasUngroupedAssets,
    groupCounts,
    filteredAssets,
    toggleSelectionMode,
    toggleAssetSelection,
    toggleSelectAll,
    handleDragStart,
    handleDragEnd,
    handleDropOnGroup,
    handleBatchDelete,
    handleBatchMove,
    saveGroup,
    copyGroupMacro,
    deleteGroup,
    getGroupDisplayName,
    handleOpenAssetsDir,
    getAssetUrl,
    handleFileUpload,
    handleDeleteAsset,
    saveEdit,
  };
}
