<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  Minus,
  CopyDocument,
  Close,
  House,
  Setting,
  Sunny,
  Moon,
  User,
} from "@element-plus/icons-vue";
import { useRoute, useRouter } from "vue-router";
import { useToolsStore } from "@/stores/tools";
import iconBlack from "../assets/aio-icon-black.svg";
import iconWhite from "../assets/aio-icon-white.svg";
import { loadAppSettingsAsync, type AppSettings, updateAppSettings } from "@utils/appSettings";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { platform } from "@tauri-apps/plugin-os";
import { useTheme } from "../composables/useTheme";
import { useThemeAppearance } from "@/composables/useThemeAppearance";
import SystemThemeIcon from "./icons/SystemThemeIcon.vue";
import { useUserProfileStore } from "@/tools/llm-chat/userProfileStore";
import Avatar from "@/components/common/Avatar.vue";
import { debounce } from "lodash-es";
import { useResolvedAvatar, resolveAvatarPath } from "@/tools/llm-chat/composables/useResolvedAvatar";
import UserProfileManagerDialog from "@/views/Settings/user-profile/components/UserProfileManagerDialog.vue";

// 接收可选的标题和图标 prop（用于分离窗口）
const props = defineProps<{
  title?: string;
  icon?: any; // Vue 组件类型
}>();

// 创建模块日志记录器
const logger = createModuleLogger("TitleBar");
const errorHandler = createModuleErrorHandler("TitleBar");

const router = useRouter();
const toolsStore = useToolsStore();
const { currentTheme, applyTheme, isDark } = useTheme();
const { appearanceSettings } = useThemeAppearance();
const userProfileStore = useUserProfileStore();

// 解析当前选中的全局用户档案头像
const globalProfileAvatarSrc = useResolvedAvatar(
  computed(() => userProfileStore.globalProfile),
  "user-profile"
);

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
const isMainWindow = ref(false); // 判断是否为主窗口
const isMacOS = ref(false); // 判断是否为 macOS
const route = useRoute();
const settings = ref<AppSettings | null>(null);
const showProfileManagerDialog = ref(false);

// 用于区分手动和自动的最大化状态变更
const isManualMaximizeChange = ref(false);

// 存储清理函数（在 setup 顶层定义，以便在 onUnmounted 中使用）
const cleanupFunctions = ref<(() => void)[]>([]);

// 获取当前页面的工具配置
const currentTool = computed(() => {
  // 优先从 toolsStore 中查找（包括动态加载的插件）
  const tool = toolsStore.tools.find((tool) => tool.path === route.path);
  if (tool) {
    return {
      name: tool.name,
      icon: tool.icon,
    };
  }

  // 特殊页面处理
  if (route.path === "/") {
    return {
      name: "AIO Hub",
      icon: House,
    };
  } else if (route.path === "/regex-manage") {
    return {
      name: "正则预设管理",
      icon: Setting,
    };
  } else if (route.path === "/settings") {
    return {
      name: "设置",
      icon: Setting,
    };
  }

  return {
    name: "AIO Hub",
    icon: House,
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
  return route.path === "/" || !toolsStore.tools.find((tool) => tool.path === route.path);
});

const logoSrc = computed(() => (isDark.value ? iconWhite : iconBlack));

// 检查窗口是否最大化
const checkMaximized = async () => {
  const previousState = isMaximized.value;
  const currentState = await appWindow.isMaximized();

  // 如果状态发生变化，记录日志
  if (previousState !== currentState) {
    const changeType = isManualMaximizeChange.value ? "[手动操作]" : "[自动变更]";
    const windowLabel = appWindow.label;

    logger.debug("窗口最大化状态变化", {
      window: windowLabel,
      timestamp: new Date().toLocaleString(),
      from: previousState,
      to: currentState,
      type: changeType,
      stackTrace: new Error().stack,
    });

    console.log(
      `[${new Date().toLocaleString()}] ${changeType} 窗口 ${windowLabel} 最大化状态变化: ${previousState} -> ${currentState}`
    );
  }

  isMaximized.value = currentState;

  // 重置手动操作标志
  isManualMaximizeChange.value = false;
};

// 保存窗口配置（带防抖）
const saveWindowConfig = debounce(async () => {
  const windowLabel = appWindow.label;

  try {
    await invoke("save_window_config", { label: windowLabel });
    logger.debug(`窗口配置已保存: ${windowLabel}`);
  } catch (error) {
    errorHandler.error(error, "保存窗口配置失败", { showToUser: false });
  }
}, 500); // 500ms 防抖

// 监听窗口大小变化
onMounted(async () => {
  // 判断是否为主窗口
  isMainWindow.value = appWindow.label === "main";

  // 检测操作系统
  const currentPlatform = platform();
  isMacOS.value = currentPlatform === "macos";

  checkMaximized();

  // 监听窗口移动事件
  const unlistenMoved = await appWindow.onMoved(() => {
    saveWindowConfig();
  });

  // 监听窗口resize事件
  const unlistenResized = await appWindow.onResized(() => {
    checkMaximized();
    saveWindowConfig();
  });

  // 将清理函数存储到 ref 中
  cleanupFunctions.value.push(unlistenMoved, unlistenResized);

  // 加载应用设置
  try {
    settings.value = await loadAppSettingsAsync();
  } catch (error) {
    errorHandler.error(error, "加载应用设置失败");
  }

  // 监听设置变化事件
  window.addEventListener("app-settings-changed", (event: any) => {
    settings.value = event.detail;
  });
});

// 在 setup 顶层注册 onUnmounted（必须在同步执行期间调用）
onUnmounted(() => {
  // 清理所有监听器
  cleanupFunctions.value.forEach((cleanup) => cleanup());
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
  // 如果是主窗口且启用了最小化到托盘，隐藏窗口而不是关闭
  if (isMainWindow.value && settings.value?.minimizeToTray) {
    await appWindow.hide();
  } else {
    // 子窗口或未启用最小化到托盘时直接关闭
    await appWindow.close();
  }
};

// 导航到设置页面
const goToSettings = () => {
  router.push("/settings");
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
const handleThemeChange = (theme: "auto" | "light" | "dark") => {
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

// 打开档案管理弹窗
const openProfileManager = () => {
  showProfileManagerDialog.value = true;
};

// 获取档案头像路径（用于列表）
const getProfileAvatarSrc = (profile: any) => {
  return resolveAvatarPath(profile, "user-profile");
};
</script>

<template>
  <Teleport to="body">
    <!-- 用户档案管理弹窗 -->
    <UserProfileManagerDialog v-model:visible="showProfileManagerDialog" />

    <div
      class="title-bar"
      :class="{
        macos: isMacOS,
        'glass-sidebar': appearanceSettings?.enableUiEffects && appearanceSettings?.enableUiBlur
      }"
      data-tauri-drag-region
    >
    <div class="title-bar-content">
      <!-- 左侧占位区域（macOS 需要为原生控件留出空间） -->
      <div class="left-controls" :class="{ macos: isMacOS }"></div>

      <!-- 中间标题区域 -->
      <div class="title-area">
        <!-- 默认图标用于主页，其他页面显示对应工具图标 -->
        <img v-if="useDefaultIcon" :src="logoSrc" alt="Logo" class="app-logo" />
        <!-- 统一的图标容器 -->
        <span v-else class="icon-wrapper">
          <component :is="currentIcon" />
        </span>
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
            :title="
              userProfileStore.globalProfile
                ? `用户档案: ${userProfileStore.globalProfile.displayName || userProfileStore.globalProfile.name}`
                : '选择用户档案'
            "
          >
            <!-- 如果有选中档案，使用 Avatar（有头像显示头像，无头像显示首字母） -->
            <Avatar
              v-if="userProfileStore.globalProfile"
              :src="globalProfileAvatarSrc || ''"
              :alt="userProfileStore.globalProfile.displayName || userProfileStore.globalProfile.name"
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
                  :src="getProfileAvatarSrc(profile) || ''"
                  :alt="profile.displayName || profile.name"
                  :size="20"
                  shape="square"
                  :radius="4"
                  style="margin-right: 8px"
                />
                <span>{{ profile.displayName || profile.name }}</span>
              </el-dropdown-item>
              <el-dropdown-item divided @click="openProfileManager">
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
          <button class="control-btn theme-btn" :title="getThemeTooltip">
            <el-icon><component :is="getThemeIcon" /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="auto" :class="{ 'is-active': currentTheme === 'auto' }">
                <el-icon><SystemThemeIcon /></el-icon>
                <span>跟随系统</span>
              </el-dropdown-item>
              <el-dropdown-item command="light" :class="{ 'is-active': currentTheme === 'light' }">
                <el-icon><Sunny /></el-icon>
                <span>浅色</span>
              </el-dropdown-item>
              <el-dropdown-item command="dark" :class="{ 'is-active': currentTheme === 'dark' }">
                <el-icon><Moon /></el-icon>
                <span>深色</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- 设置按钮（仅主窗口显示） -->
        <template v-if="isMainWindow">
          <el-tooltip content="设置" placement="bottom">
            <button class="control-btn settings-btn" @click="goToSettings">
              <el-icon><Setting /></el-icon>
            </button>
          </el-tooltip>
        </template>

        <!-- 窗口控制按钮（macOS 上隐藏，因为系统提供原生控件） -->
        <template v-if="!isMacOS">
          <el-tooltip content="最小化" placement="bottom">
            <button class="control-btn minimize-btn" @click="minimizeWindow">
              <el-icon><Minus /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip :content="isMaximized ? '还原' : '最大化'" placement="bottom">
            <button class="control-btn maximize-btn" @click="toggleMaximize">
              <el-icon>
                <CopyDocument :style="{ transform: isMaximized ? 'rotate(180deg)' : 'none' }" />
              </el-icon>
            </button>
          </el-tooltip>

          <el-tooltip
            :content="isMainWindow && settings?.minimizeToTray ? '隐藏到托盘' : '关闭'"
            placement="bottom"
          >
            <button class="control-btn close-btn" @click="closeWindow">
              <el-icon><Close /></el-icon>
            </button>
          </el-tooltip>
        </template>
      </div>
    </div>
    </div>
  </Teleport>
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
  z-index: var(--z-index-title-bar);
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

/* 统一的图标容器样式 */
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 20px;
  color: var(--sidebar-text);
  flex-shrink: 0;
  vertical-align: middle;
}

.icon-wrapper svg,
.icon-wrapper img {
  width: 1em;
  height: 1em;
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
