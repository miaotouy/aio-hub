<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Refresh, Upload } from '@element-plus/icons-vue';
import PluginCard from './components/PluginCard.vue';
import PluginInstallDialog, { type PreflightResult, type InstallType } from './components/PluginInstallDialog.vue';
import { pluginManager } from '@/services/plugin-manager';
import type { PluginProxy, PluginManifest } from '@/services/plugin-types';
import { customMessage } from '@/utils/customMessage';
import { createModuleLogger } from '@/utils/logger';
import { pluginStateService } from '@/services/plugin-state.service';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useFileDrop } from '@/composables/useFileDrop';
import { compareVersions } from 'compare-versions';

const logger = createModuleLogger('PluginManager/InstalledPlugins');

// 安装进度相关状态
interface InstallProgress {
  currentFile: string;
  processedFiles: number;
  totalFiles: number;
  progressPercentage: number;
  currentBytes: number;
  totalBytes: number;
}

const installProgress = ref<InstallProgress | null>(null);
const isInstalling = ref(false);
let progressUnlisten: UnlistenFn | null = null;

// Emits
const emit = defineEmits<{
  'select-plugin': [plugin: PluginProxy | null, initialTab?: string];
}>();

// 搜索关键词
const searchText = ref('');

// 所有已安装的插件
const plugins = ref<PluginProxy[]>([]);

// 加载状态
const loading = ref(false);

// 当前选中的插件 ID
const selectedPluginId = ref<string | null>(null);

// 预检对话框状态
const showPreflightDialog = ref(false);
const preflightResult = ref<PreflightResult | null>(null);
const preflightLoading = ref(false);

// 当前主应用的插件 API 版本
const HOST_PLUGIN_API_VERSION = 1;

// 插件列表容器 ref（用于拖放）
const pluginsListRef = ref<HTMLElement>();

// 过滤后的插件列表
const filteredPlugins = computed(() => {
  if (!searchText.value.trim()) {
    return plugins.value;
  }

  const search = searchText.value.toLowerCase();
  return plugins.value.filter(plugin => {
    // 搜索名称、描述、作者
    const matchesBasic =
      plugin.name?.toLowerCase().includes(search) ||
      plugin.description?.toLowerCase().includes(search) ||
      plugin.manifest.author?.toLowerCase().includes(search);
    
    // 搜索标签
    const matchesTags = plugin.manifest.tags?.some(tag =>
      tag.toLowerCase().includes(search)
    );
    
    return matchesBasic || matchesTags;
  });
});

/**
 * 加载已安装的插件列表
 */
async function loadPlugins() {
  loading.value = true;
  try {
    plugins.value = pluginManager.getInstalledPlugins();
    logger.info('已加载插件列表', { count: plugins.value.length });
  } catch (error) {
    logger.error('加载插件列表失败', error);
    customMessage.error('加载插件列表失败');
  } finally {
    loading.value = false;
  }
}
/**
 * 切换插件启用/禁用状态
 */
async function togglePlugin(plugin: PluginProxy) {
  try {
    if (plugin.enabled) {
      // 对不可重载的原生插件进行特殊处理
      if (plugin.manifest.type === 'native' && !plugin.manifest.native?.reloadable) {
        try {
          await ElMessageBox.confirm(
            '此原生插件不支持运行时卸载。禁用后可能不会完全释放资源，建议重启应用以确保稳定性。',
            '需要重启',
            {
              confirmButtonText: '仍然禁用',
              cancelButtonText: '取消',
              type: 'warning',
            }
          );
        } catch {
          return; // 用户取消操作
        }
      }

      // 禁用插件
      plugin.disable();
      // 保存禁用状态
      await pluginStateService.setEnabled(plugin.manifest.id, false);
      // 移除插件 UI（如果有）
      if (plugin.manifest.ui) {
        const { useToolsStore } = await import('@/stores/tools');
        const toolsStore = useToolsStore();
        const toolPath = `/plugin-${plugin.manifest.id}`;
        toolsStore.removeTool(toolPath);
        logger.info('已移除插件 UI', { pluginId: plugin.id, toolPath });
      }
      customMessage.success(`已禁用插件: ${plugin.name}`);
      logger.info('插件已禁用', { pluginId: plugin.id });
    } else {
      // 启用插件
      await plugin.enable();
      // 保存启用状态
      await pluginStateService.setEnabled(plugin.manifest.id, true);
      // 重新注册插件 UI（如果有）
      if (plugin.manifest.ui) {
        try {
          // 调用插件管理器重新加载所有插件（会自动注册启用的插件 UI）
          await pluginManager.loadAllPlugins();
          logger.info('已重新注册插件 UI', { pluginId: plugin.id });
        } catch (error) {
          logger.error('重新注册插件 UI 失败', error, { pluginId: plugin.id });
        }
      }
      customMessage.success(`已启用插件: ${plugin.name}`);
      logger.info('插件已启用', { pluginId: plugin.id });
    }
  } catch (error) {
    logger.error('切换插件状态失败', error, { pluginId: plugin.id });
    customMessage.error(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 选择插件（支持点击已选中项取消选中）
 */
function selectPlugin(plugin: PluginProxy) {
  // 如果点击的是当前已选中的插件，则取消选中
  if (selectedPluginId.value === plugin.id) {
    selectedPluginId.value = null;
    emit('select-plugin', null);
    logger.debug('取消选择插件', { pluginId: plugin.id, pluginName: plugin.name });
  } else {
    selectedPluginId.value = plugin.id;
    emit('select-plugin', plugin, 'detail');
    logger.debug('选择插件', { pluginId: plugin.id, pluginName: plugin.name });
  }
}

/**
 * 选择插件以查看设置
 */
function selectPluginForSettings(plugin: PluginProxy) {
  selectedPluginId.value = plugin.id;
  emit('select-plugin', plugin, 'settings');
  logger.debug('选择插件查看设置', { pluginId: plugin.id, pluginName: plugin.name });
}

/**
 * 卸载插件
 */
async function uninstallPlugin(plugin: PluginProxy) {
  try {
    await ElMessageBox.confirm(
      `确定要卸载插件"${plugin.name}"吗？插件文件将被移入回收站。`,
      '卸载插件',
      {
        confirmButtonText: '确定卸载',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    // 显示加载状态
    loading.value = true;
    
    try {
      // 调用插件管理器执行卸载
      await pluginManager.uninstallPlugin(plugin.id);
      
      customMessage.success(`插件"${plugin.name}"已成功卸载，文件已移入回收站`);
      logger.info('插件卸载成功', { pluginId: plugin.id, pluginName: plugin.name });
      
      // 刷新插件列表
      await loadPlugins();
    } catch (error) {
      logger.error('卸载插件失败', error, { pluginId: plugin.id });
      customMessage.error(`卸载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      loading.value = false;
    }
  } catch (error) {
    // 用户取消操作
    if (error !== 'cancel') {
      logger.error('卸载确认失败', error);
    }
  }
}

/**
 * 执行插件预检
 */
async function preflightPlugin(zipPath: string): Promise<PreflightResult> {
  try {
    // 调用后端预检命令（这个命令需要在 Rust 端实现）
    const manifest = await invoke<PluginManifest>('preflight_plugin_zip', { zipPath });
    
    logger.info('插件预检成功', { pluginId: manifest.id, version: manifest.version });
    
    // 检查与现有插件的关系
    const existingPlugin = pluginManager.getPlugin(manifest.id);
    
    let installType: InstallType;
    let existingVersion: string | undefined;
    const conflicts: string[] = [];

    // 1. 检查 API 版本兼容性
    const requiredApiVersion = manifest.host.apiVersion;
    if (requiredApiVersion && requiredApiVersion > HOST_PLUGIN_API_VERSION) {
      conflicts.push(`插件需要的 API 版本 (v${requiredApiVersion}) 高于当前应用支持的版本 (v${HOST_PLUGIN_API_VERSION})。请先升级主应用。`);
    }
    
    if (existingPlugin) {
      existingVersion = existingPlugin.manifest.version;
      
      try {
        const comparison = compareVersions(manifest.version, existingVersion);
        if (comparison > 0) {
          installType = 'upgrade';
        } else if (comparison < 0) {
          installType = 'downgrade';
        } else {
          installType = 'reinstall';
        }
      } catch (error) {
        // 版本比较失败，可能是非标准版本号
        logger.warn('版本比较失败', { error, newVersion: manifest.version, oldVersion: existingVersion });
        if (manifest.version === existingVersion) {
          installType = 'reinstall';
        } else {
          // 无法确定升级还是降级，标记为冲突
          installType = 'conflict';
          conflicts.push(`无法比较版本号: ${manifest.version} vs ${existingVersion}`);
        }
      }
    } else {
      installType = 'new';
    }
    
    // 如果存在任何冲突，则将安装类型强制设置为 'conflict'
    if (conflicts.length > 0) {
      installType = 'conflict';
    }
    
    return {
      zipPath,
      manifest,
      installType,
      existingVersion,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  } catch (error) {
    logger.error('插件预检失败', error, { zipPath });
    throw error;
  }
}

/**
 * 开始预检流程
 */
async function startPreflightFlow(zipPath: string) {
  try {
    preflightLoading.value = true;
    showPreflightDialog.value = true;
    
    const result = await preflightPlugin(zipPath);
    preflightResult.value = result;
  } catch (error) {
    logger.error('预检失败', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    customMessage.error(`预检失败: ${errorMsg}`);
    showPreflightDialog.value = false;
  } finally {
    preflightLoading.value = false;
  }
}

/**
 * 处理预检确认
 */
async function handlePreflightConfirm(result: PreflightResult) {
  logger.info('用户确认安装', { pluginId: result.manifest.id });
  
  // 关闭预检对话框
  showPreflightDialog.value = false;
  
  // 设置安装状态
  loading.value = true;
  isInstalling.value = true;
  installProgress.value = null;
  
  // 监听安装进度事件
  progressUnlisten = await listen<InstallProgress>('plugin-install-progress', (event) => {
    installProgress.value = event.payload;
    logger.debug('安装进度', event.payload);
  });
  
  try {
    // 如果是升级/降级/重新安装，先卸载旧版本
    if (result.installType !== 'new') {
      logger.info('卸载旧版本插件', { pluginId: result.manifest.id });
      // 传入 true 以进行静默卸载，不显示确认弹窗
      await pluginManager.uninstallPlugin(result.manifest.id, true);
    }
    
    // 调用插件管理器安装插件
    const installResult = await pluginManager.installPluginFromZip(result.zipPath);
    
    customMessage.success(`插件"${installResult.pluginName}"安装成功！`);
    logger.info('插件安装成功', installResult);
    
    // 刷新插件列表
    await loadPlugins();
  } catch (error) {
    logger.error('安装插件失败', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    customMessage.error(`安装失败: ${errorMsg}`);
  } finally {
    // 清理进度监听器
    if (progressUnlisten) {
      progressUnlisten();
      progressUnlisten = null;
    }
    
    loading.value = false;
    isInstalling.value = false;
    installProgress.value = null;
    preflightResult.value = null;
  }
}

/**
 * 处理预检取消
 */
function handlePreflightCancel() {
  logger.info('用户取消安装');
  preflightResult.value = null;
}

/**
 * 导入插件
 */
async function importPlugin() {
  try {
    // 打开文件选择对话框
    const selected = await open({
      multiple: false,
      filters: [{
        name: '插件包',
        extensions: ['zip']
      }],
      title: '选择插件 ZIP 文件'
    });

    if (!selected || typeof selected !== 'string') {
      return;
    }

    logger.info('选择的插件文件', { path: selected });
    
    // 使用预检流程
    await startPreflightFlow(selected);
  } catch (error) {
    logger.error('打开文件对话框失败', error);
    customMessage.error('无法打开文件选择对话框');
  }
}

/**
 * 处理拖放的插件文件
 */
async function handleDroppedPlugin(paths: string[]) {
  if (paths.length === 0) return;
  
  const zipPath = paths[0];
  logger.info('拖放插件文件', { path: zipPath });
  
  // 使用预检流程
  await startPreflightFlow(zipPath);
}

// 设置拖放功能
const { isDraggingOver } = useFileDrop({
  element: pluginsListRef,
  accept: ['.zip'],
  fileOnly: true,
  multiple: false,
  onDrop: handleDroppedPlugin,
  disabled: computed(() => loading.value || isInstalling.value),
});

// 暴露方法供父组件调用
defineExpose({
  loadPlugins,
});

// 初始化
onMounted(() => {
  loadPlugins();
});

// 清理
onUnmounted(() => {
  if (progressUnlisten) {
    progressUnlisten();
  }
});
</script>

<template>
  <div class="installed-plugins">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="searchText"
        placeholder="搜索插件..."
        clearable
        :prefix-icon="'Search'"
        class="search-input"
      />
      <el-button
        :icon="Upload"
        @click="importPlugin"
        title="从 ZIP 文件导入插件"
        :loading="loading"
        class="import-btn"
      >
        导入
      </el-button>
      <el-button
        :icon="Refresh"
        circle
        @click="loadPlugins"
        title="刷新插件列表"
        :loading="loading"
        class="refresh-btn"
      />
    </div>

    <!-- 安装进度 -->
    <div v-if="isInstalling && installProgress" class="install-progress-container">
      <div class="progress-header">
        <el-icon class="is-loading" :size="24">
          <i-ep-loading />
        </el-icon>
        <span class="progress-title">正在安装插件...</span>
      </div>
      <div class="progress-info">
        <div class="progress-file">
          当前文件: {{ installProgress.currentFile }}
        </div>
        <div class="progress-stats">
          {{ installProgress.processedFiles }} / {{ installProgress.totalFiles }} 个文件
          ({{ (installProgress.currentBytes / 1024 / 1024).toFixed(2) }} MB /
          {{ (installProgress.totalBytes / 1024 / 1024).toFixed(2) }} MB)
        </div>
      </div>
      <el-progress
        :percentage="Math.round(installProgress.progressPercentage)"
        :stroke-width="8"
        :show-text="true"
      />
    </div>

    <!-- 加载状态 -->
    <div v-else-if="loading" class="loading-container">
      <el-icon class="is-loading" :size="32">
        <i-ep-loading />
      </el-icon>
      <p>加载中...</p>
    </div>

    <!-- 插件列表 -->
    <div
      v-else-if="filteredPlugins.length > 0"
      ref="pluginsListRef"
      class="plugins-list"
      :class="{ 'drop-zone-active': isDraggingOver }"
    >
      <div v-if="isDraggingOver" class="drop-hint">
        <el-icon :size="48" class="drop-icon">
          <i-ep-upload />
        </el-icon>
        <p class="drop-text">释放以安装插件</p>
      </div>
      <PluginCard
        v-for="plugin in filteredPlugins"
        :key="plugin.id"
        :plugin="plugin"
        :selected="selectedPluginId === plugin.id"
        @select="selectPlugin(plugin)"
        @toggle="togglePlugin(plugin)"
        @settings="selectPluginForSettings(plugin)"
        @uninstall="uninstallPlugin(plugin)"
      />
    </div>

    <!-- 空状态 -->
    <el-empty
      v-else
      ref="pluginsListRef"
      :description="searchText ? '未找到匹配的插件' : '暂无已安装的插件'"
      :image-size="120"
      :class="{ 'drop-zone-active': isDraggingOver }"
      class="empty-drop-zone"
    >
      <template v-if="!searchText" #default>
        <div v-if="isDraggingOver" class="drop-hint">
          <el-icon :size="48" class="drop-icon">
            <i-ep-upload />
          </el-icon>
          <p class="drop-text">释放以安装插件</p>
        </div>
        <div v-else>
          <p class="empty-hint">前往"发现"标签页浏览并安装插件</p>
          <p class="empty-hint-secondary">或将插件 ZIP 文件拖放到此处</p>
        </div>
      </template>
    </el-empty>

    <!-- 预检对话框 -->
    <PluginInstallDialog
      v-model:visible="showPreflightDialog"
      :preflight-result="preflightResult"
      :loading="preflightLoading"
      @confirm="handlePreflightConfirm"
      @cancel="handlePreflightCancel"
    />
  </div>
</template>

<style scoped>
.installed-plugins {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-x: hidden;
}

.search-bar {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
}

.import-btn {
  flex-shrink: 0;
}

.refresh-btn {
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

.refresh-btn:not(.is-loading):hover {
  transform: rotate(180deg);
}

.loading-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-color-secondary);
}

.plugins-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.empty-hint {
  margin-top: 12px;
  font-size: 14px;
  color: var(--text-color-secondary);
}

/* 滚动条样式 */
.plugins-list::-webkit-scrollbar {
  width: 6px;
}

.plugins-list::-webkit-scrollbar-track {
  background: transparent;
}

.plugins-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.plugins-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-secondary);
}

/* 安装进度样式 */
.install-progress-container {
  padding: 24px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 20px;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.progress-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-color);
}

.progress-info {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.progress-file {
  margin-bottom: 4px;
  word-break: break-all;
}

.progress-stats {
  font-size: 12px;
  opacity: 0.8;
}

/* 拖放区域样式 */
.plugins-list,
.empty-drop-zone {
  position: relative;
  transition: all 0.3s ease;
}

.drop-zone-active {
  background: var(--el-fill-color-light);
  border: 2px dashed var(--el-color-primary);
  border-radius: 8px;
}

.drop-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  text-align: center;
  pointer-events: none;
  background: var(--el-bg-color);
  padding: 32px 48px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.drop-icon {
  color: var(--el-color-primary);
  margin-bottom: 12px;
}

.drop-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin: 0;
}

.empty-hint-secondary {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.empty-drop-zone {
  min-height: 200px;
}
</style>