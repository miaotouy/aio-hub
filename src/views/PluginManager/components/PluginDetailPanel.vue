<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Delete, Switch, Setting } from '@element-plus/icons-vue';
import type { PluginProxy } from '@/services/plugin-types';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { readTextFile, exists } from '@tauri-apps/plugin-fs';
import { path } from '@tauri-apps/api';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('PluginDetailPanel');

// Markdown 渲染器
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// Props
interface Props {
  plugin: PluginProxy | null;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  'toggle': [];
  'settings': [];
  'uninstall': [];
}>();

// README 内容
const readmeHtml = ref<string>('');
const loadingReadme = ref(false);
const readmeError = ref<string | null>(null);

// 计算属性：插件类型显示文本
const pluginTypeText = computed(() => {
  if (!props.plugin) return '';
  return props.plugin.manifest.type === 'javascript' ? 'JavaScript' : 'Sidecar';
});

// 计算属性：插件状态文本
const pluginStatusText = computed(() => {
  if (!props.plugin) return '';
  return props.plugin.enabled ? '已启用' : '已禁用';
});

// 加载 README 文件
async function loadReadme() {
  if (!props.plugin) {
    readmeHtml.value = '';
    return;
  }

  loadingReadme.value = true;
  readmeError.value = null;
  readmeHtml.value = '';

  try {
    // 构建 README 文件路径
    let readmePath: string;
    
    if (props.plugin.devMode) {
      // 开发模式：直接从项目源码路径读取
      readmePath = props.plugin.installPath + '/README.md';
    } else {
      // 生产模式：从安装目录读取
      readmePath = await path.join(props.plugin.installPath, 'README.md');
    }

    logger.debug('尝试加载 README', { path: readmePath });

    // 检查文件是否存在
    const fileExists = await exists(readmePath);
    if (!fileExists) {
      logger.info('README 文件不存在');
      readmeHtml.value = '<p class="no-readme">此插件暂无 README 文档</p>';
      return;
    }

    // 读取文件内容
    const content = await readTextFile(readmePath);
    
    // 渲染 Markdown
    const rendered = md.render(content);
    
    // 使用 DOMPurify 净化 HTML
    readmeHtml.value = DOMPurify.sanitize(rendered);
    
    logger.info('README 加载成功');
  } catch (error) {
    logger.error('加载 README 失败', error);
    readmeError.value = error instanceof Error ? error.message : '未知错误';
    readmeHtml.value = `<p class="readme-error">加载 README 失败: ${readmeError.value}</p>`;
  } finally {
    loadingReadme.value = false;
  }
}

// 监听插件变化
watch(() => props.plugin, () => {
  loadReadme();
}, { immediate: true });
</script>

<template>
  <div class="plugin-detail-panel">
    <!-- 空状态 -->
    <div v-if="!plugin" class="empty-state">
      <el-empty description="请选择一个插件以查看详情" :image-size="100" />
    </div>

    <!-- 插件详情 -->
    <div v-else class="detail-container">
      <!-- 顶部：插件头部信息 -->
      <div class="header-section">
        <div class="plugin-header">
          <div class="plugin-icon">📦</div>
          <div class="plugin-info">
            <div class="title-row">
              <h1 class="plugin-name">{{ plugin.name }}</h1>
              <div class="badges">
                <el-tag
                  :type="plugin.enabled ? 'success' : 'info'"
                  size="small"
                >
                  {{ pluginStatusText }}
                </el-tag>
                <el-tag
                  :type="plugin.manifest.type === 'javascript' ? 'primary' : 'warning'"
                  size="small"
                  effect="plain"
                >
                  {{ pluginTypeText }}
                </el-tag>
                <el-tag v-if="plugin.devMode" type="info" size="small" effect="plain">
                  开发模式
                </el-tag>
              </div>
            </div>
            <div class="meta-row">
              <span class="author">{{ plugin.manifest.author }}</span>
              <span class="separator">·</span>
              <span class="version">v{{ plugin.manifest.version }}</span>
              <span class="separator">·</span>
              <span class="plugin-id">{{ plugin.id }}</span>
            </div>
            <p class="description">{{ plugin.description }}</p>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-bar">
          <el-button
            :type="plugin.enabled ? 'default' : 'primary'"
            :icon="Switch"
            @click="emit('toggle')"
          >
            {{ plugin.enabled ? '禁用插件' : '启用插件' }}
          </el-button>

          <el-button
            v-if="plugin.manifest.settingsSchema"
            :icon="Setting"
            @click="emit('settings')"
          >
            插件设置
          </el-button>

          <el-tooltip
            v-if="plugin.devMode"
            content="开发模式插件无法卸载，请手动删除源码目录"
            placement="top"
          >
            <el-button
              :icon="Delete"
              type="danger"
              disabled
            >
              卸载插件
            </el-button>
          </el-tooltip>
          <el-button
            v-else
            :icon="Delete"
            type="danger"
            @click="emit('uninstall')"
          >
            卸载插件
          </el-button>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="content-section">
        <div class="main-content">
          <!-- README -->
          <div class="readme-area">
            <div v-if="loadingReadme" class="loading-state">
              <el-icon class="is-loading"><i class="ep-loading" /></el-icon>
              <span>加载 README...</span>
            </div>
            <div
              v-else
              class="readme-content markdown-body"
              v-html="readmeHtml"
            ></div>
          </div>
        </div>

        <!-- 右侧信息栏 -->
        <div class="info-sidebar">
          <div class="info-section">
            <h3 class="section-title">插件信息</h3>
            <div class="info-list">
              <div class="info-item">
                <span class="label">插件 ID</span>
                <span class="value">{{ plugin.id }}</span>
              </div>
              <div class="info-item">
                <span class="label">版本</span>
                <span class="value">{{ plugin.manifest.version }}</span>
              </div>
              <div class="info-item">
                <span class="label">作者</span>
                <span class="value">{{ plugin.manifest.author }}</span>
              </div>
              <div class="info-item">
                <span class="label">类型</span>
                <span class="value">{{ pluginTypeText }}</span>
              </div>
              <div class="info-item">
                <span class="label">主机版本</span>
                <span class="value">{{ plugin.manifest.host.appVersion }}</span>
              </div>
              <div v-if="!plugin.devMode" class="info-item">
                <span class="label">安装路径</span>
                <span class="value path">{{ plugin.installPath }}</span>
              </div>
              <div v-else class="info-item">
                <span class="label">源码路径</span>
                <span class="value path">{{ plugin.installPath }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-detail-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  /* 启用容器查询 */
  container-type: inline-size;
  container-name: detail-panel;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.detail-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ========== 顶部区域 ========== */
.header-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-color);
}

.plugin-header {
  display: flex;
  gap: 20px;
  padding: 24px 32px 20px;
}

.plugin-icon {
  font-size: 64px;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.plugin-name {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
  line-height: 1.2;
}

.badges {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.author {
  font-weight: 500;
}

.separator {
  color: var(--border-color);
}

.version,
.plugin-id {
  font-family: 'Consolas', 'Monaco', monospace;
}

.description {
  font-size: 14px;
  color: var(--text-color);
  line-height: 1.5;
  margin: 0;
}

.action-bar {
  display: flex;
  gap: 8px;
  padding: 0 32px 20px;
  flex-wrap: wrap;
}

/* ========== 主内容区域 ========== */
.content-section {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

.readme-area {
  padding: 32px;
  max-width: 900px;
  margin: 0 auto;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--text-color-secondary);
}

/* ========== README 样式 ========== */
.readme-content.markdown-body {
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.6;
}

.readme-content :deep(h1) {
  font-size: 2em;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
  margin-top: 24px;
  margin-bottom: 16px;
}

.readme-content :deep(h2) {
  font-size: 1.5em;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
  margin-top: 24px;
  margin-bottom: 16px;
}

.readme-content :deep(h3) {
  font-size: 1.25em;
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 16px;
}

.readme-content :deep(h4),
.readme-content :deep(h5),
.readme-content :deep(h6) {
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 16px;
}

.readme-content :deep(p) {
  margin-top: 0;
  margin-bottom: 16px;
}

.readme-content :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}

.readme-content :deep(a:hover) {
  text-decoration: underline;
}

.readme-content :deep(code) {
  background-color: var(--bg-color);
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 0.9em;
  font-family: 'Consolas', 'Monaco', monospace;
}

.readme-content :deep(pre) {
  background-color: var(--bg-color);
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin-bottom: 16px;
}

.readme-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.readme-content :deep(ul),
.readme-content :deep(ol) {
  padding-left: 2em;
  margin-top: 0;
  margin-bottom: 16px;
}

.readme-content :deep(li) {
  margin-bottom: 4px;
}

.readme-content :deep(blockquote) {
  border-left: 4px solid var(--border-color);
  padding-left: 16px;
  color: var(--text-color-secondary);
  margin: 0 0 16px 0;
}

.readme-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 16px;
}

.readme-content :deep(table th),
.readme-content :deep(table td) {
  border: 1px solid var(--border-color);
  padding: 6px 13px;
}

.readme-content :deep(table th) {
  font-weight: 600;
  background-color: var(--bg-color);
}

.readme-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.readme-content :deep(.no-readme),
.readme-content :deep(.readme-error) {
  color: var(--text-color-secondary);
  font-style: italic;
  text-align: center;
  padding: 40px 20px;
}

/* ========== 右侧信息栏 ========== */
.info-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  background-color: var(--bg-color);
  overflow-y: auto;
  padding: 24px 20px;
}

.info-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin: 0 0 16px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.info-item .value {
  font-size: 13px;
  color: var(--text-color);
  word-break: break-word;
}

.info-item .value.path {
  font-size: 11px;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--text-color-secondary);
  word-break: break-all;
}

/* ========== 滚动条样式 ========== */
.main-content::-webkit-scrollbar,
.info-sidebar::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track,
.info-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb,
.info-sidebar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb:hover,
.info-sidebar::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-secondary);
}

/* ========== 响应式设计 - 使用容器查询 ========== */
/* 中等宽度：缩小侧边栏 */
@container detail-panel (max-width: 1200px) {
  .info-sidebar {
    width: 220px;
  }
  
  .readme-area {
    padding: 24px;
    max-width: 800px;
  }
}

/* 较小宽度：切换为垂直布局 */
@container detail-panel (max-width: 700px) {
  .content-section {
    flex-direction: column;
  }
  
  .info-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--border-color);
    max-height: 400px;
    order: 1; /* 插件信息在上面 */
  }
  
  .main-content {
    order: 2; /* README 在下面 */
  }
  
  .readme-area {
    padding: 24px;
    max-width: 100%;
  }
  
  .plugin-header {
    padding: 20px 24px 16px;
  }
  
  .action-bar {
    padding: 0 24px 16px;
  }
}

/* 更小宽度：进一步优化间距 */
@container detail-panel (max-width: 700px) {
  .readme-area {
    padding: 20px;
  }
}

/* 极小宽度：简化头部布局 */
@container detail-panel (max-width: 500px) {
  .plugin-header {
    flex-direction: column;
    gap: 16px;
  }
  
  .plugin-icon {
    font-size: 48px;
    width: 48px;
    height: 48px;
  }
  
  .plugin-name {
    font-size: 20px;
  }
  
  .action-bar {
    flex-direction: column;
  }
  
  .action-bar .el-button {
    width: 100%;
  }
}
</style>