<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessageBox } from 'element-plus';
import PluginCard from './components/PluginCard.vue';
import { pluginManager } from '@/services/plugin-manager';
import type { PluginProxy } from '@/services/plugin-types';
import { customMessage } from '@/utils/customMessage';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('PluginManager/InstalledPlugins');

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

// 过滤后的插件列表
const filteredPlugins = computed(() => {
  if (!searchText.value.trim()) {
    return plugins.value;
  }

  const search = searchText.value.toLowerCase();
  return plugins.value.filter(plugin =>
    plugin.name?.toLowerCase().includes(search) ||
    plugin.description?.toLowerCase().includes(search) ||
    plugin.manifest.author?.toLowerCase().includes(search)
  );
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
      plugin.disable();
      customMessage.success(`已禁用插件: ${plugin.name}`);
      logger.info('插件已禁用', { pluginId: plugin.id });
    } else {
      await plugin.enable();
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

// 初始化
onMounted(() => {
  loadPlugins();
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
      />
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <el-icon class="is-loading" :size="32">
        <i-ep-loading />
      </el-icon>
      <p>加载中...</p>
    </div>

    <!-- 插件列表 -->
    <div v-else-if="filteredPlugins.length > 0" class="plugins-list">
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
      :description="searchText ? '未找到匹配的插件' : '暂无已安装的插件'"
      :image-size="120"
    >
      <template v-if="!searchText" #default>
        <p class="empty-hint">前往"发现"标签页浏览并安装插件</p>
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.installed-plugins {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-bar {
  flex-shrink: 0;
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
</style>