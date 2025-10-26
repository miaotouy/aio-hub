<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, CopyDocument, Close, House, Setting, Sunny, Moon, User } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import { toolsConfig } from '../config/tools';
import iconImage from '../assets/icon.png';
import { loadAppSettingsAsync, type AppSettings, updateAppSettings } from '@utils/appSettings';
import { createModuleLogger } from '@utils/logger';
import { platform } from '@tauri-apps/plugin-os';
import { useTheme } from '../composables/useTheme';
import SystemThemeIcon from './icons/SystemThemeIcon.vue';
import { useUserProfileStore } from '@/tools/llm-chat/userProfileStore';
import Avatar from '@/components/common/Avatar.vue';

// 接收可选的标题和图标 prop（用于分离窗口）
const props = defineProps<{
  title?: string;
  icon?: any; // Vue 组件类型
}>();

// 创建模块日志记录器
const logger = createModuleLogger('TitleBar');

const router = useRouter();
const { currentTheme, applyTheme } = useTheme();
const userProfileStore = useUserProfileStore();

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
const isMainWindow = ref(false); // 判断是否为主窗口
const isMacOS = ref(false); // 判断是否为 macOS
const route = useRoute();
const settings = ref<AppSettings | null>(null);

// 用于区分手动和自动的最大化状态变更
const isManualMaximizeChange = ref(false);

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
// 优先使用传入的 title prop（用于分离窗口），否则从路由推断
const currentToolName = computed(() => props.title || currentTool.value.name);
// 获取当前页面的图标组件
// 优先使用传入的 icon prop（用于分离窗口），否则从路由推断
const currentIcon = computed(() => props.icon || currentTool.value.icon);

// 判断是否使用默认图标（主页和无匹配时显示默认图标）
// 如果传入了 icon prop，则不使用默认图标
const useDefaultIcon = computed(() => {
  if (props.icon) return false;
  return route.path === '/' || !toolsConfig.find(tool => tool.path === route.path);
});

// 检查窗口是否最大化
const checkMaximized = async () => {
  const previousState = isMaximized.value;
  const currentState = await appWindow.isMaximized();
  
  // 如果状态发生变化，记录日志
  if (previousState !== currentState) {
    const changeType = isManualMaximizeChange.value ? '[手动操作]' : '[自动变更]';
    const windowLabel = appWindow.label;
    
    logger.debug('窗口最大化状态变化', {
      window: windowLabel,
      timestamp: new Date().toISOString(),
      from: previousState,
      to: currentState,
      type: changeType,
      stackTrace: new Error().stack
    });
    
    console.log(
      `[${new Date().toISOString()}] ${changeType} 窗口 ${windowLabel} 最大化状态变化: ${previousState} -> ${currentState}`
    );
  }
  
  isMaximized.value = currentState;
  
  // 重置手动操作标志
  isManualMaximizeChange.value = false;
};

// 监听窗口大小变化
onMounted(async () => {
  // 判断是否为主窗口
  isMainWindow.value = appWindow.label === 'main';
  
  // 检测操作系统
  const currentPlatform = platform();
  isMacOS.value = currentPlatform === 'macos';
  
  checkMaximized();
  
  // 监听窗口resize事件
  appWindow.onResized(() => {
    checkMaximized();
  });
  
  // 加载应用设置
  try {
    settings.value = await loadAppSettingsAsync();
  } catch (error) {
    logger.error('加载应用设置失败', error);
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
  // 标记为手动操作
  isManualMaximizeChange.value = true;
  
  await appWindow.toggleMaximize();
  
  // toggleMaximize 会触发 onResized 事件，进而调用 checkMaximized
  // 所以这里不需要再次设置 isMaximized.value
};

const closeWindow = async () => {
  // 如果是主窗口且启用了托盘，隐藏窗口而不是关闭
  if (isMainWindow.value && settings.value?.trayEnabled) {
    await appWindow.hide();
  } else {
    // 子窗口或未启用托盘时直接关闭
    await appWindow.close();
  }
};

// 导航到设置页面
const goToSettings = () => {
  router.push('/settings');
};

// 获取当前主题图标
const getThemeIcon = computed(() => {
  if (currentTheme.value === "auto") {
    return SystemThemeIcon;
  } else if (currentTheme.value === "light") {
    return Sunny;
  } else {
    return Moon;
  }
});

// 获取主题提示文本
const getThemeTooltip = computed(() => {
  if (currentTheme.value === "auto") {
    return "主题：跟随系统";
  } else if (currentTheme.value === "light") {
    return "主题：浅色";
  } else {
    return "主题：深色";
  }
});

// 主题切换处理
const handleThemeChange = (theme: 'auto' | 'light' | 'dark') => {
  applyTheme(theme);
  updateAppSettings({ theme });
};

// 用户档案选择处理
const handleProfileSelect = (profileId: string | null) => {
  userProfileStore.selectGlobalProfile(profileId);
  if (profileId) {
    userProfileStore.updateLastUsed(profileId);
  }
};

// 导航到档案管理页面
const goToProfileSettings = () => {
  router.push('/settings?section=user-profiles');
};
</script>

<template>
  <div class="title-bar" :class="{ 'macos': isMacOS }" data-tauri-drag-region>
    <div class="title-bar-content">
      <!-- 左侧占位区域（macOS 需要为原生控件留出空间） -->
      <div class="left-controls" :class="{ 'macos': isMacOS }"></div>
      
      <!-- 中间标题区域 -->
      <div class="title-area">
        <!-- 默认图标用于主页，其他页面显示对应工具图标 -->
        <img v-if="useDefaultIcon" :src="iconImage" alt="Logo" class="app-logo" />
        <el-icon v-else class="tool-icon" :size="20">
          <component :is="currentIcon" />
        </el-icon>
        <span class="app-title">{{ currentToolName }}</span>
      </div>
      
      <!-- 右侧控制区域 -->
      <div class="right-controls">
        <!-- 用户档案选择下拉菜单（仅主窗口显示） -->
        <el-dropdown
          v-if="isMainWindow"
          trigger="hover"
          @command="handleProfileSelect"
          placement="bottom"
        >
          <button
            class="control-btn profile-btn"
            :title="userProfileStore.globalProfile ? `用户档案: ${userProfileStore.globalProfile.name}` : '选择用户档案'"
          >
            <!-- 如果有选中档案，使用 Avatar（有头像显示头像，无头像显示首字母） -->
            <Avatar
              v-if="userProfileStore.globalProfile"
              :src="userProfileStore.globalProfile.icon || ''"
              :alt="userProfileStore.globalProfile.name"
              :size="20"
              shape="square"
              :radius="4"
            />
            <!-- 完全没有档案时显示 User 图标 -->
            <el-icon v-else><User /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                :command="null"
                :class="{ 'is-active': !userProfileStore.globalProfileId }"
              >
                <span>无（不使用）</span>
              </el-dropdown-item>
              <el-dropdown-item
                v-for="profile in userProfileStore.enabledProfiles"
                :key="profile.id"
                :command="profile.id"
                :class="{ 'is-active': userProfileStore.globalProfileId === profile.id }"
              >
                <!-- 始终使用 Avatar，有头像显示头像，无头像显示首字母 -->
                <Avatar
                  :src="profile.icon || ''"
                  :alt="profile.name"
                  :size="20"
                  shape="square"
                  :radius="4"
                  style="margin-right: 8px;"
                />
                <span>{{ profile.name }}</span>
              </el-dropdown-item>
              <el-dropdown-item divided @click="goToProfileSettings">
                <el-icon><Setting /></el-icon>
                <span>管理用户档案</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- 主题切换下拉菜单（仅主窗口显示） -->
        <el-dropdown
          v-if="isMainWindow"
          trigger="hover"
          @command="handleThemeChange"
          placement="bottom"
        >
          <button
            class="control-btn theme-btn"
            :title="getThemeTooltip"
          >
            <el-icon><component :is="getThemeIcon" /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                command="auto"
                :class="{ 'is-active': currentTheme === 'auto' }"
              >
                <el-icon><SystemThemeIcon /></el-icon>
                <span>跟随系统</span>
              </el-dropdown-item>
              <el-dropdown-item
                command="light"
                :class="{ 'is-active': currentTheme === 'light' }"
              >
                <el-icon><Sunny /></el-icon>
                <span>浅色</span>
              </el-dropdown-item>
              <el-dropdown-item
                command="dark"
                :class="{ 'is-active': currentTheme === 'dark' }"
              >
                <el-icon><Moon /></el-icon>
                <span>深色</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        
        <!-- 设置按钮（仅主窗口显示） -->
        <template v-if="isMainWindow">
          <el-tooltip content="设置" placement="bottom">
            <button
              class="control-btn settings-btn"
              @click="goToSettings"
            >
              <el-icon><Setting /></el-icon>
            </button>
          </el-tooltip>
        </template>
        
        <!-- 窗口控制按钮（macOS 上隐藏，因为系统提供原生控件） -->
        <template v-if="!isMacOS">
          <el-tooltip content="最小化" placement="bottom">
            <button
              class="control-btn minimize-btn"
              @click="minimizeWindow"
            >
              <el-icon><Minus /></el-icon>
            </button>
          </el-tooltip>
          
          <el-tooltip :content="isMaximized ? '还原' : '最大化'" placement="bottom">
            <button
              class="control-btn maximize-btn"
              @click="toggleMaximize"
            >
              <el-icon>
                <CopyDocument :style="{ transform: isMaximized ? 'rotate(180deg)' : 'none' }" />
              </el-icon>
            </button>
          </el-tooltip>
          
          <el-tooltip :content="isMainWindow && settings?.trayEnabled ? '隐藏到托盘' : '关闭'" placement="bottom">
            <button
              class="control-btn close-btn"
              @click="closeWindow"
            >
              <el-icon><Close /></el-icon>
            </button>
          </el-tooltip>
        </template>
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

/* 左侧占位区域 */
.left-controls {
  display: flex;
  width: 0;
  flex-shrink: 0;
}

/* macOS 上为左侧控制区域添加额外的 padding，避免与原生红绿灯按钮冲突 */
.left-controls.macos {
  padding-left: 70px;
  width: 70px;
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

.right-controls {
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

/* 下拉菜单项样式 */
:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 4px;
}

:deep(.el-dropdown-menu__item.is-active) {
  color: var(--el-color-primary);
  font-weight: 500;
}

:deep(.el-dropdown-menu__item .el-icon) {
  font-size: 16px;
}

/* 移除主题切换按钮和用户档案按钮在悬停和聚焦时的背景和轮廓 */
.control-btn.theme-btn:hover,
.control-btn.theme-btn:focus,
.control-btn.theme-btn:focus-visible,
.control-btn.profile-btn:hover,
.control-btn.profile-btn:focus,
.control-btn.profile-btn:focus-visible {
  background-color: transparent;
  outline: none;
}
</style>