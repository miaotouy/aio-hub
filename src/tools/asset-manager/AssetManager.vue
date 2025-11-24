<template>
  <div class="asset-manager-container">
    <!-- 工具栏 -->
    <Toolbar
      v-model:view-mode="viewMode"
      v-model:grid-card-size="gridCardSize"
      v-model:search-query="listPayload.searchQuery"
      v-model:sort-by="listPayload.sortBy"
      v-model:group-by="groupBy"
      :selected-count="selectedCount"
      :has-duplicates="!!(duplicateResult && duplicateResult.totalGroups > 0)"
      :sidebar-collapsed="isSidebarCollapsed"
      @rebuild-index="handleRebuildIndex"
      @find-duplicates="handleFindDuplicates"
      @select-duplicates="handleSelectRedundantDuplicates"
      @clear-duplicates="handleClearDuplicates"
      @delete-selected="handleDeleteSelected"
      @clear-selection="clearSelection"
      @toggle-sidebar="isSidebarCollapsed = !isSidebarCollapsed"
      @refresh="handleRefresh"
    />

    <!-- 重建索引进度条 -->
    <div v-if="rebuildProgress.total > 0" class="progress-container">
      <el-progress
        :percentage="Math.round((rebuildProgress.current / rebuildProgress.total) * 100)"
        :stroke-width="12"
        striped
        striped-flow
      >
        <span
          >重建索引: {{ rebuildProgress.current }} / {{ rebuildProgress.total }} ({{
            rebuildProgress.currentType
          }})</span
        >
      </el-progress>
    </div>

    <!-- 主体区域 -->
    <el-container class="main-container">
      <!-- 左侧边栏 -->
      <el-aside v-if="!isSidebarCollapsed" width="220px" class="sidebar-container">
        <Sidebar
          v-model:selected-type="listPayload.filterType"
          v-model:selected-source-module="listPayload.filterSourceModule"
          v-model:selected-origin="listPayload.filterOrigin"
          v-model:show-duplicates-only="listPayload.showDuplicatesOnly"
          :total-assets="totalAssets"
          :total-size="totalSize"
          :type-counts="typeCounts"
          :source-module-counts="sourceModuleCounts"
          :origin-counts="originCounts"
        />
      </el-aside>

      <!-- 主视图区 -->
      <el-main ref="mainViewContainerRef" class="main-view-container">
        <!-- 加载状态 -->
        <div v-if="isLoading" class="loading-container">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>加载中...</span>
        </div>

        <!-- 错误提示 -->
        <el-alert v-else-if="error" type="error" :closable="false" show-icon>
          {{ error }}
        </el-alert>

        <!-- 空状态 -->
        <el-empty v-else-if="assets.length === 0" description="还没有任何资产" />

        <!-- 资产分组视图 -->
        <template v-else>
          <AssetGroup
            v-for="group in groupedAssets"
            :key="group.month"
            :group-key="group.month"
            :label="group.label"
            :assets="group.assets"
            :view-mode="viewMode"
            :grid-card-size="gridCardSize"
            :duplicate-hashes="duplicateHashes"
            :selected-ids="selectedAssetIds"
            @selection-change="handleAssetSelection"
            @select="handleSelectAsset"
            @delete="handleDeleteAsset"
            @show-in-folder="handleShowInFolder"
            @select-all="handleSelectAll"
            @deselect-all="handleDeselectAll"
          />
        </template>
        <!-- 加载更多 -->
        <div v-if="isAppending" class="loading-more">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>加载更多...</span>
        </div>
      </el-main>
    </el-container>

    <!-- 文档预览弹窗 -->
    <BaseDialog
      v-model="isPreviewDialogVisible"
      :title="selectedAssetForPreview?.name"
      width="80vw"
      height="80vh"
      content-class="document-preview-content"
    >
      <DocumentViewer
        v-if="selectedAssetForPreview"
        :key="selectedAssetForPreview.id"
        :file-path="selectedAssetForPreview.path"
        :file-name="selectedAssetForPreview.name"
        :file-type-hint="selectedAssetForPreview.mimeType"
        :show-engine-switch="true"
      />
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { Loading } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { useAssetManager, assetManagerEngine } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { customMessage } from "@/utils/customMessage";
import type {
  Asset,
  AssetType,
  AssetOriginType,
  DuplicateFilesResult,
  AssetGroupBy,
  AssetSortBy,
} from "@/types/asset-management";
import { useInfiniteScroll } from "@vueuse/core";
import { debounce } from "lodash-es";
import { assetManagerConfigManager, debouncedSaveConfig, createDefaultConfig } from "./config";
import Toolbar from "./components/Toolbar.vue";
import Sidebar from "./components/Sidebar.vue";
import AssetGroup from "./components/AssetGroup.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";

// 使用资产管理器
const {
  assets,
  isLoading,
  isAppending,
  error,
  rebuildProgress,
  assetStats,
  currentPage,
  hasMore,
  loadAssetsPaginated,
  fetchAssetStats,
  rebuildCatalogIndex,
} = useAssetManager();
const imageViewer = useImageViewer();
const videoViewer = useVideoViewer();

// --- 状态管理 ---
const config = ref(createDefaultConfig());
const assetBasePath = ref<string>("");

// UI & 筛选状态
const viewMode = ref(config.value.viewMode);
const gridCardSize = ref(config.value.gridCardSize);
const groupBy = ref<AssetGroupBy>(config.value.groupBy);
const selectedAssetIds = ref<Set<string>>(new Set());
const lastSelectedAssetId = ref<string | null>(null);
const isSidebarCollapsed = ref(config.value.sidebarCollapsed);
const isPreviewDialogVisible = ref(false);
const selectedAssetForPreview = ref<Asset | null>(null);

// 分页与筛选请求载荷
const listPayload = reactive({
  page: 1,
  pageSize: 50,
  sortBy: config.value.sortBy as AssetSortBy,
  sortOrder: "desc" as "asc" | "desc",
  filterType: "all" as AssetType | "all",
  filterSourceModule: "all" as string | "all",
  filterOrigin: "all" as AssetOriginType | "all",
  searchQuery: config.value.searchQuery,
  showDuplicatesOnly: false,
});

// 重复文件相关状态
const duplicateHashes = ref<Set<string>>(new Set());
const duplicateResult = ref<DuplicateFilesResult | null>(null);

// --- 数据加载 ---

const fetchData = async (append = false) => {
  if (!append) {
    listPayload.page = 1;
    // 重置滚动条位置
    const mainView = document.querySelector(".main-view-container");
    if (mainView) mainView.scrollTop = 0;
  }
  await loadAssetsPaginated({ ...listPayload }, append);
};

const handleRefresh = async () => {
  try {
    await Promise.all([fetchData(false), fetchAssetStats()]);
    customMessage.success("已刷新");
  } catch (error) {
    console.error("刷新失败:", error);
    customMessage.error("刷新失败");
  }
};

// 防抖的搜索触发
const debouncedFetchData = debounce(() => fetchData(false), 300);

// 组件挂载时加载初始数据
onMounted(async () => {
  assetBasePath.value = await assetManagerEngine.getAssetBasePath();
  config.value = await assetManagerConfigManager.load();

  // 从加载的配置初始化状态
  viewMode.value = config.value.viewMode;
  gridCardSize.value = config.value.gridCardSize;
  groupBy.value = config.value.groupBy;
  listPayload.sortBy = config.value.sortBy;
  listPayload.searchQuery = config.value.searchQuery;
  isSidebarCollapsed.value = config.value.sidebarCollapsed;

  await fetchAssetStats();
  await fetchData();
});

// 监听筛选和排序条件的变化
watch(
  () => [
    listPayload.sortBy,
    listPayload.sortOrder,
    listPayload.filterType,
    listPayload.filterSourceModule,
    listPayload.filterOrigin,
    listPayload.showDuplicatesOnly,
  ],
  () => {
    fetchData(false);
  }
);
watch(() => listPayload.searchQuery, debouncedFetchData);

// 监听配置项变化并保存
watch(viewMode, (value) => {
  config.value.viewMode = value;
  debouncedSaveConfig(config.value);
});
watch(gridCardSize, (value) => {
  config.value.gridCardSize = value;
  debouncedSaveConfig(config.value);
});
watch(groupBy, (value) => {
  config.value.groupBy = value;
  debouncedSaveConfig(config.value);
});
watch(isSidebarCollapsed, (value) => {
  config.value.sidebarCollapsed = value;
  debouncedSaveConfig(config.value);
});
watch(
  () => listPayload.sortBy,
  (value) => {
    config.value.sortBy = value;
    debouncedSaveConfig(config.value);
  }
);
watch(
  () => listPayload.searchQuery,
  (value) => {
    config.value.searchQuery = value;
    debouncedSaveConfig(config.value);
  }
);

// --- 无限滚动 ---
const mainViewContainerRef = ref<HTMLElement | null>(null);
useInfiniteScroll(
  mainViewContainerRef,
  async () => {
    if (hasMore.value && !isLoading.value && !isAppending.value) {
      listPayload.page = currentPage.value + 1;
      await fetchData(true);
    }
  },
  { distance: 200 }
);

// --- 计算属性 ---

const totalAssets = computed(() => assetStats.value.totalAssets);
const totalSize = computed(() => assetStats.value.totalSize);
const typeCounts = computed(() => assetStats.value.typeCounts);

// 使用后端提供的全局来源模块统计
const sourceModuleCounts = computed(() => assetStats.value.sourceModuleCounts || {});
const originCounts = computed(() => assetStats.value.originCounts || {});

// 事件处理
const handleSelectAsset = async (asset: Asset) => {
  if (asset.type === "image") {
    // 筛选当前列表中的所有图片
    const imageAssets = assets.value.filter((a) => a.type === "image");

    // 批量生成 URL 列表
    // 使用已缓存的 assetBasePath 避免重复 IPC 调用，大幅提升性能
    const urls = imageAssets.map((a) =>
      assetManagerEngine.convertToAssetProtocol(a.path, assetBasePath.value)
    );

    // 找到当前点击图片在列表中的索引
    const index = imageAssets.findIndex((a) => a.id === asset.id);

    // 打开查看器，传入完整列表和当前索引
    imageViewer.show(urls, index >= 0 ? index : 0);
  } else if (asset.type === "video") {
    videoViewer.previewVideo(asset);
  } else if (asset.type === "document") {
    selectedAssetForPreview.value = asset;
    isPreviewDialogVisible.value = true;
  } else {
    customMessage.info("该文件类型暂不支持预览");
  }
};
const handleShowInFolder = async (path: string) => {
  try {
    const absolutePath = await join(assetBasePath.value, path);
    await invoke("open_file_directory", { filePath: absolutePath });
  } catch (err) {
    console.error("打开文件所在目录失败:", err);
    customMessage.error(`打开文件所在目录失败: ${err}`);
  }
};

const handleDeleteAsset = async (assetId: string) => {
  try {
    // 使用新的批量完全删除命令
    await invoke("remove_asset_completely", { assetId });

    // 从本地列表中移除
    const index = assets.value.findIndex((a) => a.id === assetId);
    if (index !== -1) {
      assets.value.splice(index, 1);
    }

    // 从选中项中移除
    if (selectedAssetIds.value.has(assetId)) {
      selectedAssetIds.value.delete(assetId);
    }

    // 从重复文件哈希集合中移除
    duplicateHashes.value.delete(assetId);

    // 如果这是重复文件组的一部分，需要检查是否还有其他重复文件
    if (duplicateResult.value) {
      updateDuplicateHashesAfterDeletion();
    }

    // 刷新统计信息
    await fetchAssetStats();

    customMessage.success("已成功删除资产");
  } catch (err) {
    console.error("删除资产失败:", err);
    customMessage.error(`删除失败: ${err}`);
  }
};

// --- 多选逻辑 ---

// 多选状态
const selectedCount = computed(() => selectedAssetIds.value.size);

const handleAssetSelection = (asset: Asset, event: MouseEvent) => {
  const assetId = asset.id;
  const currentIds = new Set(selectedAssetIds.value);

  if (event.shiftKey && lastSelectedAssetId.value) {
    const lastIndex = assets.value.findIndex((a) => a.id === lastSelectedAssetId.value);
    const currentIndex = assets.value.findIndex((a) => a.id === assetId);

    if (lastIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      for (let i = start; i <= end; i++) {
        currentIds.add(assets.value[i].id);
      }
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (currentIds.has(assetId)) {
      currentIds.delete(assetId);
    } else {
      currentIds.add(assetId);
    }
  } else {
    // 普通点击：切换选中状态
    if (currentIds.size === 1 && currentIds.has(assetId)) {
      // 如果只有当前项被选中，则取消选中
      currentIds.clear();
    } else {
      // 否则清空其他选择，只选中当前项
      currentIds.clear();
      currentIds.add(assetId);
    }
  }

  selectedAssetIds.value = currentIds;
  lastSelectedAssetId.value = assetId;
};

const handleDeleteSelected = async () => {
  if (selectedCount.value === 0) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedCount.value} 个资产吗？文件将被移动到回收站。`,
      "确认删除",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    // 使用新的批量完全删除命令
    const idsToDelete = Array.from(selectedAssetIds.value);
    const failedIds = await invoke<string[]>("remove_assets_completely", {
      assetIds: idsToDelete,
    });

    // 从本地列表中移除成功删除的资产
    const successIds = idsToDelete.filter((id) => !failedIds.includes(id));
    assets.value = assets.value.filter((a) => !successIds.includes(a.id));

    // 从重复文件哈希集合中移除
    successIds.forEach((id) => duplicateHashes.value.delete(id));

    // 更新重复文件状态
    if (duplicateResult.value) {
      updateDuplicateHashesAfterDeletion();
    }

    // 清空选择
    selectedAssetIds.value.clear();
    lastSelectedAssetId.value = null;

    // 刷新统计信息
    await fetchAssetStats();

    if (failedIds.length === 0) {
      customMessage.success(`已成功删除 ${successIds.length} 个资产`);
    } else {
      customMessage.warning(`已删除 ${successIds.length} 个资产，${failedIds.length} 个失败`);
    }
  } catch (err) {
    // 用户取消操作
    if (err !== "cancel") {
      console.error("批量删除失败:", err);
      customMessage.error(`批量删除失败: ${err}`);
    }
  }
};

const clearSelection = () => {
  selectedAssetIds.value.clear();
  lastSelectedAssetId.value = null;
};

const handleSelectAll = (assetIds: string[]) => {
  const currentIds = new Set(selectedAssetIds.value);
  assetIds.forEach((id) => currentIds.add(id));
  selectedAssetIds.value = currentIds;
};

const handleDeselectAll = (assetIds: string[]) => {
  const currentIds = new Set(selectedAssetIds.value);
  assetIds.forEach((id) => currentIds.delete(id));
  selectedAssetIds.value = currentIds;
};

const handleSelectRedundantDuplicates = () => {
  if (!duplicateResult.value || duplicateResult.value.totalGroups === 0) {
    customMessage.info('没有可供选择的重复文件。请先执行"查找重复"操作。');
    return;
  }

  const idsToSelect = new Set<string>();
  const allAssetIds = new Set(assets.value.map((a) => a.id));

  duplicateResult.value.duplicates.forEach((group) => {
    // 提取每个重复文件组中的 UUID
    const groupAssetIds = group.files
      .map((filePath) => {
        const fileName = filePath.split("/").pop() || "";
        return fileName.split(".")[0];
      })
      .filter((id) => allAssetIds.has(id)); // 确保文件仍在当前列表中

    // 找到这些 ID 对应的 Asset 对象
    const groupAssets = assets.value.filter((asset) => groupAssetIds.includes(asset.id));

    // 按创建时间排序，保留最新的一个
    if (groupAssets.length > 1) {
      groupAssets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // 第一个之后的所有文件都视为多余副本
      for (let i = 1; i < groupAssets.length; i++) {
        idsToSelect.add(groupAssets[i].id);
      }
    }
  });

  if (idsToSelect.size === 0) {
    customMessage.success("未发现需要清理的多余重复文件。");
    return;
  }

  selectedAssetIds.value = idsToSelect;
  customMessage.success(`已自动选中 ${idsToSelect.size} 个多余的重复文件，请确认后删除。`);
};

// --- 分组逻辑 ---
const groupedAssets = computed(() => {
  // 分组逻辑现在直接作用于当前页的资产
  const currentAssets = assets.value;

  // 不分组模式
  if (groupBy.value === "none") {
    return [
      {
        month: "all",
        label: "全部资产",
        assets: currentAssets,
      },
    ];
  }

  const groups: { [key: string]: Asset[] } = {};

  // 根据不同的分组方式
  currentAssets.forEach((asset) => {
    let groupKey: string;

    switch (groupBy.value) {
      case "month":
        groupKey = asset.createdAt.substring(0, 7); // YYYY-MM
        break;
      case "type":
        groupKey = asset.type;
        break;
      case "origin":
        // 使用第一个来源作为分组依据
        groupKey = asset.origins[0]?.type || "unknown";
        break;
      case "source-module":
        groupKey = asset.sourceModule || "unknown";
        break;
      default:
        groupKey = "all";
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(asset);
  });

  // 生成分组标签
  return Object.entries(groups)
    .sort(([keyA], [keyB]) => {
      // 按月份分组时降序排列
      if (groupBy.value === "month") {
        return keyB.localeCompare(keyA);
      }
      // 其他分组按字母顺序
      return keyA.localeCompare(keyB);
    })
    .map(([key, assets]) => {
      let label: string;

      switch (groupBy.value) {
        case "month":
          const date = new Date(`${key}-01`);
          label = date.toLocaleString("zh-CN", { month: "long", year: "numeric" });
          break;
        case "type":
          const typeLabels: Record<AssetType, string> = {
            image: "图片",
            video: "视频",
            audio: "音频",
            document: "文档",
            other: "其他",
          };
          label = typeLabels[key as AssetType] || key;
          break;
        case "origin":
          const originLabels: Record<string, string> = {
            local: "本地文件",
            clipboard: "剪贴板",
            network: "网络",
            unknown: "未知来源",
          };
          label = originLabels[key] || key;
          break;
        case "source-module":
          const moduleLabels: Record<string, string> = {
            "llm-chat": "💬 LLM 聊天",
            "smart-ocr": "🔍 智能 OCR",
            "asset-manager": "📦 资产管理器",
            unknown: "❓ 未知模块",
          };
          label = moduleLabels[key] || key;
          break;
        default:
          label = key;
      }

      return { month: key, label, assets };
    });
});

/**
 * 重建哈希索引 (工具特定功能)
 */
const handleRebuildIndex = async () => {
  try {
    await ElMessageBox.confirm(
      "重建查询索引将扫描所有资产元数据，以优化列表性能。是否继续？",
      "确认重建索引",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    const result = await rebuildCatalogIndex();
    customMessage.success(result);
    // 重建后刷新列表
    await fetchData(false);
  } catch (err) {
    if (err !== "cancel") {
      console.error("重建目录索引失败:", err);
    }
  }
};

/**
 * 更新删除后的重复文件哈希集合
 * 检查每个重复文件组，如果组内只剩一个文件，将其从哈希集合中移除
 */
const updateDuplicateHashesAfterDeletion = () => {
  if (!duplicateResult.value) return;

  const currentAssetIds = new Set(assets.value.map((a) => a.id));
  const newHashSet = new Set<string>();

  duplicateResult.value.duplicates.forEach((group) => {
    // 提取当前仍存在的文件
    const existingFiles = group.files
      .map((filePath) => {
        const fileName = filePath.split("/").pop() || "";
        return fileName.split(".")[0];
      })
      .filter((id) => currentAssetIds.has(id));

    // 只有当组内还有多个文件时才标记为重复
    if (existingFiles.length > 1) {
      existingFiles.forEach((id) => newHashSet.add(id));
    }
  });

  duplicateHashes.value = newHashSet;
};
/**
 * 查找重复文件 (工具特定功能)
 */
const handleFindDuplicates = async () => {
  try {
    const result = await invoke<DuplicateFilesResult>("find_duplicate_files");
    duplicateResult.value = result;

    // 构建重复文件哈希集合
    const hashSet = new Set<string>();
    result.duplicates.forEach((group) => {
      group.files.forEach((filePath) => {
        // 从路径中提取文件名（UUID）
        const fileName = filePath.split("/").pop() || "";
        const uuid = fileName.split(".")[0];
        hashSet.add(uuid);
      });
    });
    duplicateHashes.value = hashSet;

    // 显示结果
    if (result.totalGroups === 0) {
      customMessage.success("未发现重复文件");
    } else {
      const wastedSpaceMB = (result.wastedSpace / (1024 * 1024)).toFixed(2);
      await ElMessageBox.alert(
        `发现 ${result.totalGroups} 组重复文件，共 ${result.totalFiles} 个文件，可节省 ${wastedSpaceMB} MB 空间。\n\n重复文件已在列表中标记。`,
        "重复文件检测结果",
        {
          confirmButtonText: "确定",
          type: "info",
        }
      );
    }
  } catch (err) {
    console.error("查找重复文件失败:", err);
  }
};

/**
 * 清除重复文件标记
 */
const handleClearDuplicates = () => {
  duplicateHashes.value.clear();
  duplicateResult.value = null;
  customMessage.success("已清除重复文件标记");
};
</script>

<style scoped>
.progress-container {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
}
.progress-container span {
  font-size: 12px;
}

.asset-manager-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.main-container {
  flex: 1;
  overflow: hidden;
}

.sidebar-container {
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  backdrop-filter: blur(var(--ui-blur));
}

.main-view-container {
  overflow-y: auto;
  padding: 16px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.loading-container .el-icon {
  font-size: 32px;
}

.loading-more {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  gap: 8px;
  color: var(--el-text-color-secondary);
}

.document-preview-content {
  height: 100%;
  display: flex;
}

.document-preview-content .document-viewer {
  flex-grow: 1;
  border: none; /* 移除 DocumentViewer 自身的边框，因为它已经在 Dialog 内部 */
  border-radius: 0;
}
</style>
