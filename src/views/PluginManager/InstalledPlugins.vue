<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Delete, Switch, Setting } from '@element-plus/icons-vue';
import { pluginManager } from '@/services/plugin-manager';
import type { PluginProxy } from '@/services/plugin-types';
import { customMessage } from '@/utils/customMessage';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('PluginManager/InstalledPlugins');

// Emits
const emit = defineEmits<{
  'select-plugin': [plugin: PluginProxy];
}>();

// 搜索关键词
const searchText = ref('');

// 所有已安装的插件
const plugins = ref<PluginProxy[]>([]);

// 加载状态
const loading = ref(false);

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
 * 选择插件以查看设置
 */
function selectPluginForSettings(plugin: PluginProxy) {
  emit('select-plugin', plugin);
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
      <el-card
        v-for="plugin in filteredPlugins"
        :key="plugin.id"
        class="plugin-card"
        shadow="hover"
      >
        <div class="plugin-header">
          <div class="plugin-icon">📦</div>
          <div class="plugin-info">
            <h3 class="plugin-name">{{ plugin.name }}</h3>
            <div class="plugin-meta">
              <span class="plugin-version">v{{ plugin.manifest.version }}</span>
              <span class="plugin-separator">·</span>
              <span class="plugin-author">{{ plugin.manifest.author }}</span>
              <template v-if="plugin.devMode">
                <span class="plugin-separator">·</span>
                <el-tag type="info" size="small" effect="plain">开发模式</el-tag>
              </template>
            </div>
          </div>
          <div class="plugin-actions">
            <el-tooltip
              :content="plugin.enabled ? '禁用插件' : '启用插件'"
              placement="top"
            >
              <el-switch
                :model-value="plugin.enabled"
                @change="togglePlugin(plugin)"
                :active-icon="Switch"
              />
            </el-tooltip>
          </div>
        </div>

        <p class="plugin-description">{{ plugin.description }}</p>

        <div class="plugin-footer">
          <div class="plugin-type">
            <el-tag :type="plugin.manifest.type === 'javascript' ? 'success' : 'warning'" size="small">
              {{ plugin.manifest.type === 'javascript' ? 'JS 插件' : 'Sidecar 插件' }}
            </el-tag>
          </div>
          <div class="plugin-footer-actions">
            <!-- 设置按钮：仅对有配置的插件显示 -->
            <el-button
              v-if="plugin.manifest.settingsSchema"
              :icon="Setting"
              size="small"
              text
              @click="selectPluginForSettings(plugin)"
            >
              设置
            </el-button>
            <!-- 卸载按钮 -->
            <el-tooltip
              v-if="plugin.devMode"
              content="开发模式插件无法卸载，请手动删除源码目录"
              placement="top"
            >
              <el-button
                :icon="Delete"
                size="small"
                type="danger"
                text
                disabled
              >
                卸载
              </el-button>
            </el-tooltip>
            <el-button
              v-else
              :icon="Delete"
              size="small"
              type="danger"
              text
              @click="uninstallPlugin(plugin)"
            >
              卸载
            </el-button>
          </div>
        </div>
      </el-card>
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
  gap: 16px;
  padding-right: 4px;
}

.plugin-card {
  transition: all 0.3s ease;
}

.plugin-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.plugin-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.plugin-icon {
  font-size: 40px;
  flex-shrink: 0;
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.plugin-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 4px 0;
}

.plugin-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.plugin-version {
  font-weight: 500;
}

.plugin-separator {
  color: var(--border-color);
}

.plugin-actions {
  flex-shrink: 0;
}

.plugin-description {
  font-size: 14px;
  color: var(--text-color);
  line-height: 1.6;
  margin: 0 0 16px 0;
}

.plugin-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--border-color-light);
}

.plugin-type {
  display: flex;
  gap: 8px;
}

.plugin-footer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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