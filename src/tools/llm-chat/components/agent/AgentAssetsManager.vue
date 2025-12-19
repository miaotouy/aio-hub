<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
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
  FolderAdd
} from '@element-plus/icons-vue';
import { customMessage } from '@/utils/customMessage';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { createModuleLogger } from '@/utils/logger';
import { useImageViewer } from '@/composables/useImageViewer';
import type { AgentAsset, AssetType } from '../../types';
import DropZone from '@/components/common/DropZone.vue';
import FileIcon from '@/components/common/FileIcon.vue';
import BaseDialog from '@/components/common/BaseDialog.vue';
import VideoViewer from '@/components/common/VideoViewer.vue';
import { useClipboard } from '@vueuse/core';

const errorHandler = createModuleErrorHandler('AgentAssetsManager');
const logger = createModuleLogger('AgentAssetsManager');
const { copy } = useClipboard();
const imageViewer = useImageViewer();

interface Props {
  modelValue: AgentAsset[];
  agentId: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  disabled: false
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: AgentAsset[]): void;
}>();

const assets = ref<AgentAsset[]>([]);
const isUploading = ref(false);
const searchQuery = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const selectedGroup = ref('all');

// 批量操作状态
const isSelectionMode = ref(false);
const selectedAssetIds = ref(new Set<string>());
const batchMoveDialogVisible = ref(false);
const batchTargetGroup = ref('');
const isNewGroup = ref(false);

// 拖拽状态
const draggingAssetId = ref<string | null>(null);

// 编辑对话框状态
const editDialogVisible = ref(false);
const editingAsset = ref<AgentAsset | null>(null);
const editForm = ref({
  id: '',
  description: '',
  group: ''
});

// 分组列表
const groups = computed(() => {
  const groupSet = new Set<string>();
  assets.value.forEach(asset => {
    if (asset.group && asset.group !== 'default') {
      groupSet.add(asset.group);
    }
  });
  return Array.from(groupSet).sort();
});

// 计算各分组数量
const groupCounts = computed(() => {
  const counts: Record<string, number> = {
    all: assets.value.length,
    default: assets.value.filter(a => !a.group || a.group === 'default').length
  };
  
  groups.value.forEach(group => {
    counts[group] = assets.value.filter(a => a.group === group).length;
  });
  
  return counts;
});

// 预览对话框状态（非图片资源）
const mediaPreviewVisible = ref(false);
const mediaPreviewUrl = ref('');
const mediaPreviewType = ref<AssetType>('file');

// 同步外部数据
watch(() => props.modelValue, (newVal) => {
  assets.value = [...newVal];
}, { immediate: true, deep: true });

// 过滤后的资产列表
const filteredAssets = computed(() => {
  let result = assets.value;

  // 1. 分组过滤
  if (selectedGroup.value === 'default') {
    result = result.filter(a => !a.group || a.group === 'default');
  } else if (selectedGroup.value !== 'all') {
    result = result.filter(a => a.group === selectedGroup.value);
  }

  // 2. 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(asset =>
      asset.id.toLowerCase().includes(query) ||
      asset.filename.toLowerCase().includes(query) ||
      asset.description?.toLowerCase().includes(query)
    );
  }
  
  return result;
});

// 更新数据到父组件
const notifyUpdate = () => {
  emit('update:modelValue', assets.value);
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
    filteredAssets.value.forEach(a => selectedAssetIds.value.add(a.id));
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
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', asset.id);
  }
};

// 拖拽结束
const handleDragEnd = () => {
  draggingAssetId.value = null;
};

// 处理放置到分组
const handleDropOnGroup = (group: string) => {
  const targetGroup = group === 'all' ? 'default' : group;
  
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
  assets.value.forEach(asset => {
    if (idsToMove.includes(asset.id)) {
      if (asset.group !== targetGroup) {
        asset.group = targetGroup;
        movedCount++;
      }
    }
  });

  if (movedCount > 0) {
    notifyUpdate();
    customMessage.success(`已将 ${movedCount} 个资产移动到 "${group === 'default' ? '未分组' : group}"`);
  }
  
  draggingAssetId.value = null;
};

// 批量删除
const handleBatchDelete = async () => {
  if (selectedAssetIds.value.size === 0) return;
  
  if (!confirm(`确定要删除选中的 ${selectedAssetIds.value.size} 个资产吗？此操作不可恢复。`)) {
    return;
  }

  const ids = Array.from(selectedAssetIds.value);
  let successCount = 0;

  for (const id of ids) {
    const asset = assets.value.find(a => a.id === id);
    if (asset) {
      try {
        await invoke('delete_agent_asset', {
          agentId: props.agentId,
          assetPath: asset.path
        });
        const index = assets.value.indexOf(asset);
        if (index > -1) {
          assets.value.splice(index, 1);
          successCount++;
        }
      } catch (error) {
        console.error(`Failed to delete asset ${id}:`, error);
      }
    }
  }

  selectedAssetIds.value.clear();
  notifyUpdate();
  customMessage.success(`成功删除 ${successCount} 个资产`);
};

// 打开批量移动弹窗
const openBatchMoveDialog = () => {
  if (selectedAssetIds.value.size === 0) return;
  batchTargetGroup.value = '';
  isNewGroup.value = false;
  batchMoveDialogVisible.value = true;
};

// 执行批量移动
const handleBatchMove = () => {
  if (!batchTargetGroup.value) {
    customMessage.warning('请输入或选择目标分组');
    return;
  }

  const target = batchTargetGroup.value;
  let count = 0;
  
  assets.value.forEach(asset => {
    if (selectedAssetIds.value.has(asset.id)) {
      if (asset.group !== target) {
        asset.group = target;
        count++;
      }
    }
  });

  notifyUpdate();
  customMessage.success(`已移动 ${count} 个资产到 "${target}"`);
  batchMoveDialogVisible.value = false;
  selectedAssetIds.value.clear();
  isSelectionMode.value = false;
};

/**
 * 获取资产的真实 URL
 */
const getAssetUrl = async (asset: AgentAsset) => {
  try {
    const fullPath = await invoke<string>('get_agent_asset_path', {
      agentId: props.agentId,
      assetPath: asset.path
    });
    return convertFileSrc(fullPath);
  } catch (error) {
    logger.error('获取资产路径失败', error);
    return '';
  }
};

/**
 * 处理文件上传
 */
const handleFileUpload = async (paths: string[]) => {
  if (props.disabled || !props.agentId) return;
  
  isUploading.value = true;
  try {
    for (const path of paths) {
      const data = await invoke<number[]>('read_file_binary', { path });
      const fileName = path.split(/[/\\]/).pop() || 'file';
      
      const info = await invoke<any>('save_agent_asset', {
        agentId: props.agentId,
        fileName,
        data: Array.from(new Uint8Array(data))
      });
      
      const newAsset: AgentAsset = {
        id: info.filename.split('.')[0],
        path: info.path,
        filename: fileName,
        type: inferAssetType(info.mimeType),
        size: info.size,
        mimeType: info.mimeType,
        usage: 'inline',
        group: selectedGroup.value === 'all' ? 'default' : selectedGroup.value
      };
      
      assets.value.push(newAsset);
    }
    
    notifyUpdate();
    customMessage.success(`成功上传 ${paths.length} 个资产`);
  } catch (error) {
    errorHandler.error(error, '上传资产失败');
  } finally {
    isUploading.value = false;
    // 重置 input 防止重复选择同一文件不触发 change
    if (fileInput.value) fileInput.value.value = '';
  }
};

const inferAssetType = (mimeType: string): AssetType => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
};

/**
 * 删除资产
 */
const handleDeleteAsset = async (asset: AgentAsset) => {
  try {
    await invoke('delete_agent_asset', {
      agentId: props.agentId,
      assetPath: asset.path
    });
    
    const index = assets.value.indexOf(asset);
    if (index > -1) {
      assets.value.splice(index, 1);
      notifyUpdate();
      customMessage.success('资产已删除');
    }
  } catch (error) {
    errorHandler.error(error, '删除资产失败');
  }
};

/**
 * 预览资产
 */
const handlePreview = async (asset: AgentAsset) => {
  const url = await getAssetUrl(asset);
  if (!url) return;

  if (asset.type === 'image') {
    imageViewer.show(url);
  } else {
    mediaPreviewType.value = asset.type;
    mediaPreviewUrl.value = url;
    mediaPreviewVisible.value = true;
  }
};

/**
 * 复制资产 ID
 */
const handleCopyId = (id: string) => {
  const refText = `asset://${id}`;
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
    description: asset.description || '',
    group: asset.group || 'default'
  };
  editDialogVisible.value = true;
};

/**
 * 保存编辑
 */
const saveEdit = () => {
  if (!editingAsset.value) return;
  
  // 检查 ID 是否冲突（排除自己）
  const idExists = assets.value.some(a => a.id === editForm.value.id && a !== editingAsset.value);
  if (idExists) {
    customMessage.warning('该 ID 已存在，请使用唯一的 ID');
    return;
  }

  editingAsset.value.id = editForm.value.id;
  editingAsset.value.description = editForm.value.description;
  editingAsset.value.group = editForm.value.group;
  
  notifyUpdate();
  editDialogVisible.value = false;
  customMessage.success('资产信息已更新');
};

// 格式化文件大小
const formatSize = (bytes?: number) => {
  if (bytes === undefined) return '--';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// 异步加载图片 URL 的组件逻辑
const AssetThumbnail = {
  props: ['asset', 'agentId'],
  setup(props: any) {
    const src = ref('');
    
    // 立即获取 URL
    invoke<string>('get_agent_asset_path', {
      agentId: props.agentId,
      assetPath: props.asset.path
    }).then(path => {
      src.value = convertFileSrc(path);
    });

    return { src };
  },
  template: `<img v-if="src" :src="src" class="w-full h-full object-cover" loading="lazy" />`
};
</script>

<template>
  <div class="agent-assets-manager" :class="{ 'is-disabled': disabled }">
    <!-- 侧边栏：分组 -->
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="title">资产分组</span>
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

        <div class="divider" v-if="groups.length > 0"></div>
        <div class="group-label" v-if="groups.length > 0">自定义分组</div>

        <div
          v-for="group in groups"
          :key="group"
          class="group-item"
          :class="{ active: selectedGroup === group }"
          @click="selectedGroup = group"
          @dragover.prevent
          @drop="handleDropOnGroup(group)"
        >
          <el-icon><Folder /></el-icon>
          <span class="name">{{ group }}</span>
          <span class="count">{{ groupCounts[group] }}</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部工具栏 -->
      <div class="toolbar">
        <div class="left-tools" v-if="isSelectionMode">
          <el-button :icon="Close" circle size="small" @click="toggleSelectionMode" />
          <span class="selection-count">已选 {{ selectedAssetIds.size }} 项</span>
          <el-divider direction="vertical" />
          <el-button size="small" @click="toggleSelectAll">
            {{ selectedAssetIds.size === filteredAssets.length ? '取消全选' : '全选' }}
          </el-button>
        </div>
        <div class="search-box" v-else>
          <el-input
            v-model="searchQuery"
            placeholder="搜索资产 (ID、文件名)..."
            :prefix-icon="Search"
            clearable
          />
        </div>

        <div class="actions">
          <template v-if="isSelectionMode">
            <el-button-group>
              <el-button :icon="FolderAdd" @click="openBatchMoveDialog" :disabled="selectedAssetIds.size === 0">
                移动到...
              </el-button>
              <el-button type="danger" :icon="Delete" @click="handleBatchDelete" :disabled="selectedAssetIds.size === 0">
                删除
              </el-button>
            </el-button-group>
          </template>
          <template v-else>
            <el-button 
              :type="isSelectionMode ? 'primary' : 'default'"
              :icon="Operation" 
              @click="toggleSelectionMode"
              title="批量管理"
            >
              批量
            </el-button>
            <el-button
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
            @change="(e) => handleFileUpload(Array.from((e.target as HTMLInputElement).files || []).map(f => (f as any).path || f.name))"
          >
        </div>
      </div>

      <!-- 主体区域：DropZone 包裹 -->
      <DropZone
        class="main-drop-zone"
        placeholder="拖拽文件到此处上传"
        :hint="`支持图片、音频、视频等多种格式${selectedGroup !== 'all' && selectedGroup !== 'default' ? ' (将自动添加到 ' + selectedGroup + ' 分组)' : ''}`"
        :icon="Plus"
        :compact="assets.length > 0"
        :disabled="disabled || !agentId"
        :hide-content="assets.length > 0"
        variant="border"
        @drop="handleFileUpload"
      >
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
                'is-selection-mode': isSelectionMode
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
                
                <!-- 其他类型 -->
                <div v-else class="generic-preview" :class="asset.type">
                  <el-icon v-if="asset.type === 'video'" :size="48"><VideoPlay /></el-icon>
                  <el-icon v-else-if="asset.type === 'audio'" :size="48"><Headset /></el-icon>
                  <FileIcon v-else :filename="asset.filename" :size="48" />
                </div>

                <!-- 悬停遮罩 (非选择模式下显示) -->
                <div class="asset-overlay" @click.stop v-if="!isSelectionMode">
                  <div class="overlay-actions">
                    <el-tooltip content="预览" :show-after="500">
                      <el-button circle size="small" :icon="ZoomIn" @click="handlePreview(asset)" />
                    </el-tooltip>
                    <el-tooltip content="复制引用 ID" :show-after="500">
                      <el-button circle size="small" :icon="CopyDocument" @click="handleCopyId(asset.id)" />
                    </el-tooltip>
                    <el-tooltip content="编辑信息" :show-after="50">
                      <el-button circle size="small" :icon="Edit" type="primary" plain @click="openEditDialog(asset)" />
                    </el-tooltip>
                    <el-tooltip content="删除" :show-after="500">
                      <el-button circle size="small" :icon="Delete" type="danger" plain @click="handleDeleteAsset(asset)" />
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
      </DropZone>
    </div>

    <!-- 批量移动弹窗 -->
    <BaseDialog
      v-model="batchMoveDialogVisible"
      title="批量移动到分组"
      width="400px"
    >
      <el-form label-width="80px">
        <el-form-item label="目标分组">
          <el-select
            v-if="!isNewGroup"
            v-model="batchTargetGroup"
            placeholder="选择现有分组"
            style="width: 100%"
            allow-create
            filterable
            default-first-option
          >
            <el-option label="未分组 (default)" value="default" />
            <el-option
              v-for="group in groups"
              :key="group"
              :label="group"
              :value="group"
            />
          </el-select>
          <el-input v-else v-model="batchTargetGroup" placeholder="输入新分组名称" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="isNewGroup">输入新分组名称</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchMoveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBatchMove">确定移动</el-button>
      </template>
    </BaseDialog>

    <!-- 编辑对话框 -->
    <BaseDialog
      v-model="editDialogVisible"
      title="编辑资产信息"
      width="400px"
    >
      <el-form :model="editForm" label-width="60px" @submit.prevent="saveEdit">
        <el-form-item label="ID" required>
          <el-input v-model="editForm.id" placeholder="唯一标识符，用于引用" />
          <div class="form-tip">在对话中使用 <code>asset://{{ editForm.id || 'ID' }}</code> 引用此资产</div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" placeholder="资产描述（可选）" />
        </el-form-item>
        <el-form-item label="分组">
          <el-input v-model="editForm.group" placeholder="例如: default" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </BaseDialog>

    <!-- 视频预览 -->
    <VideoViewer
      v-if="mediaPreviewType === 'video'"
      v-model:visible="mediaPreviewVisible"
      :src="mediaPreviewUrl"
      :title="editingAsset?.filename || '视频预览'"
    />

    <!-- 音频/文件预览对话框 -->
    <BaseDialog
      v-else
      v-model="mediaPreviewVisible"
      :title="editingAsset?.filename || '预览'"
      width="400px"
      :show-footer="false"
    >
      <div class="media-container">
        <audio
          v-if="mediaPreviewType === 'audio'"
          :src="mediaPreviewUrl"
          controls
          autoplay
          class="preview-player audio"
        />
        <div v-else class="file-preview-placeholder">
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
  background-color: var(--el-color-primary-light-9);
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
  background-color: var(--el-color-primary-light-8);
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
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  height: 64px;
  box-sizing: border-box;
}

.left-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selection-count {
  font-size: 13px;
  color: var(--el-text-color-regular);
  font-weight: 500;
}

.search-box {
  flex: 1;
  max-width: 300px;
}

.main-drop-zone {
  flex: 1;
  min-height: 0; /* Fix flex overflow */
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.assets-grid-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
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
  width: 100%;
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
  background-color: var(--el-color-primary-light-9);
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
  height: 120px;
  position: relative;
  background-color: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.generic-preview {
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.generic-preview.video { background-color: #f0f9eb; color: var(--el-color-success); }
.generic-preview.audio { background-color: #fdf6ec; color: var(--el-color-warning); }

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

.preview-player {
  max-width: 100%;
  max-height: 60vh;
}

.preview-player.audio {
  width: 100%;
  height: 50px;
  margin: 20px;
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