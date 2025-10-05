<template>
  <div class="home-page">
    <span class="title">All In One 工具箱</span>
    <div class="tool-grid">
      <router-link
        v-for="tool in visibleTools"
        :key="tool.path"
        :to="tool.path"
        class="tool-card"
      >
        <el-icon :size="48">
          <component :is="tool.icon" />
        </el-icon>
        <div class="tool-name">{{ tool.name }}</div>
        <div class="tool-description">{{ tool.description }}</div>
      </router-link>
    </div>
    
    <!-- 如果没有可显示的工具，显示提示 -->
    <div v-if="visibleTools.length === 0" class="no-tools-message">
      <el-empty description="没有可显示的工具">
        <el-button type="primary" @click="router.push('/settings')">
          前往设置页面配置工具
        </el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toolsConfig } from "./config/tools";
import { loadAppSettingsAsync, type AppSettings } from './utils/appSettings';

const router = useRouter();

// 从路径提取工具ID（与设置页面保持一致）
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 当前设置
const settings = ref<AppSettings>({
  sidebarCollapsed: false,
  theme: 'auto',
  trayEnabled: false,
  toolsVisible: {},
  toolsOrder: [],
  version: '1.0.0'
});

// 计算可见的工具列表
const visibleTools = computed(() => {
  if (!settings.value.toolsVisible) {
    // 如果没有配置，显示所有工具
    return toolsConfig;
  }
  
  return toolsConfig.filter(tool => {
    const toolId = getToolIdFromPath(tool.path);
    // 默认显示未配置的工具
    return settings.value.toolsVisible![toolId] !== false;
  });
});

// 监听localStorage变化以实时更新（保留以防万一，但主要依赖路由变化）
const handleStorageChange = async () => {
  settings.value = await loadAppSettingsAsync();
};

onMounted(async () => {
  // 初始化时加载设置
  settings.value = await loadAppSettingsAsync();
  // 监听storage事件，以便在设置页面保存后实时更新
  window.addEventListener('storage', handleStorageChange);
});

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange);
});

// 也可以通过路由守卫在从设置页返回时重新加载
watch(() => router.currentRoute.value.path, async (newPath, oldPath) => {
  if (oldPath === '/settings' && newPath === '/') {
    settings.value = await loadAppSettingsAsync();
  }
});
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  /* 顶部对齐 */
  height: 100%;
  text-align: center;
  padding: 40px 20px 20px 20px;
  /* 统一设置内边距：上40px，左右20px，下20px */
  box-sizing: border-box;
  /* 确保 padding 包含在 height 内 */
  overflow-y: auto;
  /* 如果内容超出，允许滚动 */
}

.title {
  font-size: 2.5em;
  font-weight: bold;
  margin-bottom: 20px;
  color: var(--text-color);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  /* 响应式网格布局 */
  gap: 25px;
  /* 间距 */
  padding: 20px;
  max-width: 1200px;
  /* 控制最大宽度 */
  width: 100%;
  box-sizing: border-box;
  /* 确保 padding 包含在 width 内 */
}

.tool-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 25px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  /* 移除 router-link 下划线 */
  color: var(--text-color);
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  /* 轻微阴影 */
  cursor: pointer;
}

.tool-card:hover {
  transform: translateY(-5px);
  /* 悬停上浮效果 */
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.el-icon {
  margin-bottom: 15px;
  color: var(--primary-color);
  /* 图标颜色 */
}

.tool-name {
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 8px;
  color: var(--text-color);
}

.tool-description {
  font-size: 0.9em;
  color: var(--text-color-light);
  text-align: center;
  line-height: 1.5;
}

.no-tools-message {
  margin-top: 50px;
}
</style>
