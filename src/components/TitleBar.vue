<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, CopyDocument, Close, House, Setting } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import { toolsConfig } from '../config/tools';
import iconImage from '../assets/icon.png';
import { loadAppSettingsAsync, type AppSettings } from '../utils/appSettings';

const router = useRouter();

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
const route = useRoute();
const settings = ref<AppSettings | null>(null);

// 获取当前页面的工具配置
const currentTool = computed(() => {
  // 根据当前路由路径匹配工具配置
  const tool = toolsConfig.find(tool => tool.path === route.path);
  if (tool) {
    return {
      name: tool.name,
      icon: tool.icon
    };
  }
  
  // 特殊页面处理
  if (route.path === '/') {
    return {
      name: 'AIO工具箱',
      icon: House
    };
  } else if (route.path === '/regex-manage') {
    return {
      name: '正则预设管理',
      icon: Setting
    };
  } else if (route.path === '/settings') {
    return {
      name: '设置',
      icon: Setting
    };
  }
  
  return {
    name: 'AIO工具箱',
    icon: House
  };
});

// 获取当前页面的工具名称
const currentToolName = computed(() => currentTool.value.name);

// 获取当前页面的图标组件
const currentIcon = computed(() => currentTool.value.icon);

// 判断是否使用默认图标（主页和无匹配时显示默认图标）
const useDefaultIcon = computed(() => {
  return route.path === '/' || !toolsConfig.find(tool => tool.path === route.path);
});

// 检查窗口是否最大化
const checkMaximized = async () => {
  isMaximized.value = await appWindow.isMaximized();
};

// 监听窗口大小变化
onMounted(async () => {
  checkMaximized();
  
  // 监听窗口resize事件
  appWindow.onResized(() => {
    checkMaximized();
  });
  
  // 加载应用设置
  try {
    settings.value = await loadAppSettingsAsync();
  } catch (error) {
    console.error('加载应用设置失败:', error);
  }
  
  // 监听设置变化事件
  window.addEventListener('app-settings-changed', (event: any) => {
    settings.value = event.detail;
  });
});

// 窗口控制函数
const minimizeWindow = () => {
  appWindow.minimize();
};

const toggleMaximize = async () => {
  await appWindow.toggleMaximize();
  isMaximized.value = !isMaximized.value;
};

const closeWindow = async () => {
  // 如果启用了托盘，隐藏窗口而不是关闭
  if (settings.value?.trayEnabled) {
    await appWindow.hide();
  } else {
    await appWindow.close();
  }
};

// 导航到设置页面
const goToSettings = () => {
  router.push('/settings');
};
</script>

<template>
  <div class="title-bar" data-tauri-drag-region>
    <div class="title-bar-content">
      <!-- 左侧设置按钮 -->
      <div class="left-controls">
        <button
          class="settings-btn"
          @click="goToSettings"
          title="设置"
        >
          <el-icon><Setting /></el-icon>
        </button>
      </div>
      
      <!-- 中间标题区域 -->
      <div class="title-area">
        <!-- 默认图标用于主页，其他页面显示对应工具图标 -->
        <img v-if="useDefaultIcon" :src="iconImage" alt="Logo" class="app-logo" />
        <el-icon v-else class="tool-icon" :size="20">
          <component :is="currentIcon" />
        </el-icon>
        <span class="app-title">{{ currentToolName }}</span>
      </div>
      
      <!-- 右侧窗口控制按钮 -->
      <div class="window-controls">
        <button
          class="control-btn minimize-btn"
          @click="minimizeWindow"
          title="最小化"
        >
          <el-icon><Minus /></el-icon>
        </button>
        <button
          class="control-btn maximize-btn"
          @click="toggleMaximize"
          :title="isMaximized ? '还原' : '最大化'"
        >
          <el-icon>
            <CopyDocument :style="{ transform: isMaximized ? 'rotate(180deg)' : 'none' }" />
          </el-icon>
        </button>
        <button
          class="control-btn close-btn"
          @click="closeWindow"
          :title="settings?.trayEnabled ? '隐藏到托盘' : '关闭'"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  height: 32px;
  background: var(--sidebar-bg);
  user-select: none;
  display: flex;
  align-items: center;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  border-bottom: 1px solid var(--border-color);
  /* 允许拖动窗口 */
  -webkit-app-region: drag;
}

.title-bar-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
  position: relative;
}

/* 左侧控制区域 */
.left-controls {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  /* 禁止拖动，以便点击按钮 */
  -webkit-app-region: no-drag;
}

.settings-btn {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  font-size: 16px;
}

.settings-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.title-area {
  display: flex;
  align-items: center;
  gap: 8px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  /* 禁止拖动，以便点击logo或标题 */
  -webkit-app-region: no-drag;
}

.app-logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.tool-icon {
  color: var(--sidebar-text);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-title {
  font-size: 16px;
  color: var(--sidebar-text);
  font-weight: 500;
  white-space: nowrap;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 20px;
  display: flex;
  align-items: center;
  padding-top: 2px;
}

.window-controls {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  /* 禁止拖动，以便点击按钮 */
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  font-size: 16px;
}

.control-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.close-btn:hover {
  background-color: #e81123;
  color: white;
}

/* 暗色主题适配 */
:root.dark .title-bar {
  background: #1f1f1f;
  border-bottom-color: #333;
}

:root.dark .control-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

:root.dark .close-btn:hover {
  background-color: #e81123;
}

/* Windows风格的圆角（仅在非最大化时） */
@media (prefers-color-scheme: light) {
  .title-bar {
    background: linear-gradient(180deg, #f0f0f0 0%, #e8e8e8 100%);
  }
  
  .control-btn {
    color: #333;
  }
  
  .control-btn:hover {
    background-color: rgba(0, 0, 0, 0.08);
  }
}

/* 为了更好的视觉效果，可以添加毛玻璃效果 */
.title-bar {
  backdrop-filter: blur(10px);
  background: rgba(var(--sidebar-bg-rgb), 0.9);
}
</style>