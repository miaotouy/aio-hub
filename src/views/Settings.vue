<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useDark } from '@vueuse/core';
import {
  loadAppSettingsAsync,
  saveAppSettingsDebounced,
  resetAppSettingsAsync,
  type AppSettings
} from '../utils/appSettings';
import { toolsConfig } from '../config/tools';
import { getName, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

const isDark = useDark();

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 应用设置
const settings = ref<AppSettings>({
  sidebarCollapsed: false,
  theme: 'auto',
  trayEnabled: false,
  toolsVisible: {},
  toolsOrder: [],
  version: '1.0.0'
});


// 应用信息
const appInfo = ref({
  name: '',
  version: ''
});

// 左侧导航状态与滚动容器
const activeSection = ref('general');
const contentRef = ref<HTMLElement | null>(null);

const scrollToSection = (id: string) => {
  activeSection.value = id;
  const container = contentRef.value;
  if (!container) return;
  const target = container.querySelector<HTMLElement>(`#${id}`);
  if (target) {
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop - 8;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  }
};

const handleSelect = (key: string) => {
  scrollToSection(key);
};


// 应用主题
const applyTheme = (theme: 'auto' | 'light' | 'dark') => {
  if (theme === 'auto') {
    // 检测系统主题
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    isDark.value = systemDark;
  } else if (theme === 'dark') {
    isDark.value = true;
  } else {
    isDark.value = false;
  }
};

// 重置设置
const handleReset = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要重置所有设置到默认值吗？此操作不可撤销。',
      '重置设置',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    
    isLoadingFromFile = true; // 防止触发不必要的事件
    const defaultSettings = await resetAppSettingsAsync();
    settings.value = { ...defaultSettings };
    applyTheme(settings.value.theme || 'auto');
    
    // 手动触发同步事件
    setTimeout(() => {
      isLoadingFromFile = false;
      window.dispatchEvent(new CustomEvent('app-settings-changed', {
        detail: settings.value
      }));
    }, 100);
    
    ElMessage.success('设置已重置到默认值');
  } catch (error) {
    // 用户取消了操作
    if (error !== 'cancel') {
      console.error('重置设置失败:', error);
      ElMessage.error('重置设置失败');
    }
  }
};

// 显示关于信息
const showAbout = () => {
  ElMessageBox.alert(
    `<div style="text-align: center;">
      <h3>${appInfo.value.name}</h3>
      <p>版本: ${appInfo.value.version}</p>
      <p style="margin-top: 20px; color: #909399;">一个功能丰富的工具箱应用</p>
    </div>`,
    '关于',
    {
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确定',
    }
  );
};

// 标记是否正在从文件加载设置，避免触发不必要的事件
let isLoadingFromFile = false;

// 监听暗黑模式变化，更新设置中的主题
watch(isDark, (newValue) => {
  // 如果正在加载文件或主题是自动模式，不处理
  if (isLoadingFromFile || settings.value.theme === 'auto') {
    return;
  }
  
  // 根据暗黑模式状态更新主题设置
  const newTheme = newValue ? 'dark' : 'light';
  if (settings.value.theme !== newTheme) {
    settings.value.theme = newTheme;
  }
});

// 监听托盘设置变化
watch(() => settings.value.trayEnabled, async (newValue) => {
  if (isLoadingFromFile) return;
  
  try {
    // 同步到 Rust 后端
    await invoke('update_tray_setting', { enabled: newValue });
  } catch (error) {
    console.error('更新托盘设置失败:', error);
    ElMessage.error('更新托盘设置失败');
  }
});

// 监听设置变化，自动保存并应用
watch(settings, (newSettings) => {
  // 如果是从文件加载的，不触发事件
  if (isLoadingFromFile) {
    return;
  }
  
  // 保存设置到文件系统（使用防抖）
  saveAppSettingsDebounced(newSettings);
  
  // 应用主题设置
  if (newSettings.theme) {
    applyTheme(newSettings.theme);
  }
  
  // 发出事件通知设置已更改（用于实时同步到侧边栏）
  window.dispatchEvent(new CustomEvent('app-settings-changed', {
    detail: newSettings
  }));
}, { deep: true });

// 存储事件处理函数的引用
let handleSettingsChange: ((event: Event) => void) | null = null;

// 初始化
onMounted(async () => {
  // 标记正在加载
  isLoadingFromFile = true;
  
  // 异步加载设置
  const loadedSettings = await loadAppSettingsAsync();
  
  // 确保 toolsVisible 包含所有工具
  if (!loadedSettings.toolsVisible) {
    loadedSettings.toolsVisible = {};
  }
  
  // 为每个工具设置默认可见状态
  toolsConfig.forEach(tool => {
    const toolId = getToolIdFromPath(tool.path);
    if (loadedSettings.toolsVisible![toolId] === undefined) {
      loadedSettings.toolsVisible![toolId] = true;
    }
  });
  
  settings.value = loadedSettings;
  
  // 应用主题
  applyTheme(settings.value.theme || 'auto');
  
  // 获取应用信息
  try {
    appInfo.value.name = await getName();
    appInfo.value.version = await getVersion();
  } catch (error) {
    console.error('获取应用信息失败:', error);
    appInfo.value.name = 'AIO工具箱';
    appInfo.value.version = '1.0.0';
  }
  
  // 同步托盘设置到后端
  try {
    await invoke('update_tray_setting', { enabled: settings.value.trayEnabled || false });
  } catch (error) {
    console.error('初始化托盘设置失败:', error);
  }
  
  // 监听来自侧边栏的设置变化事件
  handleSettingsChange = (event: Event) => {
    const customEvent = event as CustomEvent<AppSettings>;
    if (customEvent.detail && customEvent.detail.theme) {
      // 更新本地设置但不触发保存（因为侧边栏已经保存了）
      isLoadingFromFile = true;
      settings.value.theme = customEvent.detail.theme;
      applyTheme(customEvent.detail.theme);
      setTimeout(() => {
        isLoadingFromFile = false;
      }, 100);
    }
  };
  
  window.addEventListener('app-settings-changed', handleSettingsChange);
  
  // 加载完成后，允许触发事件
  setTimeout(() => {
    isLoadingFromFile = false;
  }, 100);
});

// 清理事件监听器
onUnmounted(() => {
  if (handleSettingsChange) {
    window.removeEventListener('app-settings-changed', handleSettingsChange);
  }
});

</script>

<template>
  <div class="settings-page">
    <div class="settings-wrapper">
      <!-- 左侧导航 -->
      <aside class="settings-nav">
        <h1 class="nav-title">设置</h1>

        <el-menu class="nav-menu" :default-active="activeSection" @select="handleSelect">
          <el-menu-item index="general">通用设置</el-menu-item>
          <el-menu-item index="tools">工具模块</el-menu-item>
          <el-menu-item index="about">关于</el-menu-item>
        </el-menu>

        <div class="nav-actions">
          <el-button @click="handleReset" type="danger" plain>
            重置所有设置
          </el-button>
        </div>
      </aside>

      <!-- 右侧内容 -->
      <div class="settings-content" ref="contentRef">
        <!-- 通用设置 -->
        <section id="general" class="settings-section">
          <h2 class="section-title">通用设置</h2>

          <div class="setting-item">
            <div class="setting-label">
              <span>最小化到托盘</span>
              <el-tooltip content="关闭窗口时最小化到系统托盘而不是退出程序" placement="top">
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
            <el-switch v-model="settings.trayEnabled" />
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>主题设置</span>
              <el-tooltip content="选择应用的主题模式" placement="top">
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
            <el-radio-group v-model="settings.theme">
              <el-radio-button value="auto">跟随系统</el-radio-button>
              <el-radio-button value="light">浅色</el-radio-button>
              <el-radio-button value="dark">深色</el-radio-button>
            </el-radio-group>
          </div>
        </section>

        <!-- 工具模块设置 -->
        <section id="tools" class="settings-section">
          <h2 class="section-title">工具模块</h2>

          <div class="setting-item">
            <div class="setting-label">
              <span>工具模块显示</span>
              <el-tooltip content="选择要在主页显示的工具模块" placement="top">
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
          </div>

          <div class="tools-list">
            <div v-for="tool in toolsConfig" :key="tool.path" class="tool-item">
              <el-checkbox
                v-if="settings.toolsVisible"
                v-model="settings.toolsVisible[getToolIdFromPath(tool.path)]"
              >
                <div class="tool-checkbox-content">
                  <el-icon class="tool-icon"><component :is="tool.icon" /></el-icon>
                  <div class="tool-info">
                    <span class="tool-name">{{ tool.name }}</span>
                    <span v-if="tool.description" class="tool-description">{{ tool.description }}</span>
                  </div>
                </div>
              </el-checkbox>
            </div>
          </div>

          <el-divider />
          
          <div class="batch-actions">
            <el-button
              size="small"
              @click="Object.keys(settings.toolsVisible || {}).forEach(k => settings.toolsVisible![k] = true)"
            >
              全选
            </el-button>
            <el-button
              size="small"
              @click="Object.keys(settings.toolsVisible || {}).forEach(k => settings.toolsVisible![k] = false)"
            >
              全不选
            </el-button>
          </div>
        </section>

        <!-- 关于 -->
        <section id="about" class="settings-section">
          <h2 class="section-title">关于</h2>

          <div class="setting-item">
            <div class="setting-label">
              <span>应用信息</span>
            </div>
            <el-button @click="showAbout" size="small">查看详情</el-button>
          </div>

          <div class="about-info">
            <p>{{ appInfo.name }}</p>
            <p class="version">版本：{{ appInfo.version }}</p>
          </div>
        </section>

      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  overflow: hidden; /* 由右侧内容滚动 */
  padding: 20px;
  background: var(--bg-color);
  box-sizing: border-box;
}

/* 新布局：左侧导航 + 右侧内容 */
.settings-wrapper {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 20px;
  height: 100%;
  align-items: start;
  box-sizing: border-box;
}

/* 左侧导航 */
.settings-nav {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  position: sticky;
  top: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.nav-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px 0;
}

/* 覆盖 el-menu 样式（scoped 环境下使用深度选择器） */
.settings-nav :deep(.el-menu) {
  background-color: transparent;
  border-right: none;
}

.settings-nav :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  border-radius: 6px;
  margin: 2px 0;
}

.settings-nav :deep(.el-menu-item.is-active) {
  background-color: var(--bg-color);
}

.nav-actions {
  margin-top: auto; /* 底部对齐 */
  padding-top: 16px;
}

.nav-actions .el-button {
  width: 100%;
}

/* 右侧内容区域滚动 */
.settings-content {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 8px;
  box-sizing: border-box;
  padding-right: 10px;
  padding-bottom: 40px;
}

/* 旧容器保留但未使用 */
.settings-container {
  max-width: 800px;
  margin: 0 auto;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 30px;
}

/* 卡片与条目 */
.settings-section {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.setting-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color-light);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

.tools-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.tool-item {
  padding: 8px;
  overflow: hidden;
}

/* 覆盖 element-plus checkbox 样式 */
.tool-item :deep(.el-checkbox) {
  height: auto;
  align-items: flex-start;
}

.tool-item :deep(.el-checkbox__label) {
  white-space: normal;
  padding-left: 8px;
  width: 100%;
}

.tool-checkbox-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
}

.tool-icon {
  font-size: 20px;
  color: var(--primary-color);
  margin-top: 2px;
  flex-shrink: 0;
}

.tool-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.tool-name {
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-description {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}

.about-info {
  margin-top: 6px;
  border-radius: 6px;
}

.about-info p {
  margin: 4px 0;
  color: var(--text-color);
}

.about-info .version {
  font-size: 13px;
  color: var(--text-color-secondary);
}

/* 批量操作按钮 */
.batch-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

</style>