<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, computed } from "vue";
import { InfoFilled, Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useDark } from "@vueuse/core";
import {
  loadAppSettingsAsync,
  saveAppSettingsDebounced,
  resetAppSettingsAsync,
  type AppSettings,
} from "../utils/appSettings";
import { toolsConfig } from "../config/tools";
import { getName, getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

const isDark = useDark();

// 预设主题色
const presetColors = [
  { name: "默认蓝", color: "#409eff" },
  { name: "翡翠绿", color: "#00b96b" },
  { name: "日暮橙", color: "#ff8c00" },
  { name: "薰衣紫", color: "#8b7ec8" },
  { name: "樱花粉", color: "#ff69b4" },
  { name: "深海蓝", color: "#1890ff" },
  { name: "森林绿", color: "#52c41a" },
  { name: "火焰红", color: "#ff4d4f" },
  { name: "金属灰", color: "#6b7280" },
  { name: "歌姬绿", color: "#39C5BB" },
  { name: "歌姬黄", color: "#FFE211" },
  { name: "歌姬蓝", color: "#66CCFF" },
];

// 自定义颜色输入
const customColor = ref("#409eff");
const showColorPicker = ref(false);
// 记住上次的自定义颜色
const lastCustomColor = ref("#409eff");

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 应用设置
const settings = ref<AppSettings>({
  sidebarCollapsed: false,
  theme: "auto",
  trayEnabled: false,
  themeColor: "#409eff",
  toolsVisible: {},
  toolsOrder: [],
  version: "1.0.0",
});

// 应用信息
const appInfo = ref({
  name: "",
  version: "",
});

// 左侧导航状态与滚动容器
const activeSection = ref("general");
const contentRef = ref<HTMLElement | null>(null);
const isScrollingProgrammatically = ref(false);

// 节流函数
const throttle = (func: Function, delay: number) => {
  let timeoutId: number | null = null;
  let lastExecTime = 0;

  return (...args: any[]) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(
        () => {
          func(...args);
          lastExecTime = Date.now();
        },
        delay - (currentTime - lastExecTime)
      );
    }
  };
};

// 处理滚动事件，反向匹配导航
const handleScroll = throttle(() => {
  if (isScrollingProgrammatically.value) return;

  const container = contentRef.value;
  if (!container) return;

  const sections = ["general", "tools", "about"];
  const containerHeight = container.clientHeight;

  // 查找当前在视口中最靠近顶部的 section
  let currentSection = sections[0];

  for (const sectionId of sections) {
    const element = container.querySelector<HTMLElement>(`#${sectionId}`);
    if (element) {
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;

      // 如果 section 顶部在视口上半部分，认为它是当前 section
      if (relativeTop <= containerHeight * 0.3) {
        currentSection = sectionId;
      }
    }
  }

  // 更新激活状态
  if (activeSection.value !== currentSection) {
    activeSection.value = currentSection;
  }
}, 200); // 200ms 节流延迟

const scrollToSection = (id: string) => {
  isScrollingProgrammatically.value = true;
  activeSection.value = id;
  const container = contentRef.value;
  if (!container) return;
  const target = container.querySelector<HTMLElement>(`#${id}`);
  if (target) {
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop - 8;
    container.scrollTo({ top: offset, behavior: "smooth" });

    // 滚动完成后重置标记
    setTimeout(() => {
      isScrollingProgrammatically.value = false;
    }, 500);
  }
};

const handleSelect = (key: string) => {
  scrollToSection(key);
};

// 应用主题
const applyTheme = (theme: "auto" | "light" | "dark") => {
  if (theme === "auto") {
    // 检测系统主题
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    isDark.value = systemDark;
  } else if (theme === "dark") {
    isDark.value = true;
  } else {
    isDark.value = false;
  }
};

// 应用主题色
const applyThemeColor = (color: string) => {
  // 验证颜色格式
  if (!/^#[0-9A-F]{6}$/i.test(color)) {
    return;
  }

  // 设置 CSS 变量
  const root = document.documentElement;
  root.style.setProperty("--primary-color", color);
  
  // 计算悬停色（变亮）
  const hoverColor = lightenColor(color, 20);
  root.style.setProperty("--primary-hover-color", hoverColor);
  
  // 计算 RGB 值
  const rgb = hexToRgb(color);
  if (rgb) {
    root.style.setProperty("--primary-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }
  
  // 同步 Element Plus 变量
  root.style.setProperty("--el-color-primary", color);
  root.style.setProperty("--el-color-primary-light-3", hoverColor);
  root.style.setProperty("--el-color-primary-light-5", hoverColor);
  root.style.setProperty("--el-color-primary-light-7", hoverColor);
  root.style.setProperty("--el-color-primary-light-9", hoverColor);
};

// 颜色处理工具函数
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const lightenColor = (hex: string, percent: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * (percent / 100)));
  const g = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * (percent / 100)));
  const b = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * (percent / 100)));
  
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

// 选择预设颜色
const selectPresetColor = (color: string) => {
  settings.value.themeColor = color;
  // 不改变 customColor，保持用户的自定义颜色
};

// 应用自定义颜色
const applyCustomColor = () => {
  if (/^#[0-9A-F]{6}$/i.test(customColor.value)) {
    settings.value.themeColor = customColor.value;
    lastCustomColor.value = customColor.value; // 保存自定义颜色
    showColorPicker.value = false;
  } else {
    ElMessage.error("请输入有效的颜色值（格式：#RRGGBB）");
  }
};

// 打开自定义颜色选择器时的处理
const handleColorPickerOpen = () => {
  // 如果当前是自定义颜色，使用当前颜色
  // 否则使用上次保存的自定义颜色
  if (!selectedPresetColor.value) {
    customColor.value = settings.value.themeColor || lastCustomColor.value;
  } else {
    customColor.value = lastCustomColor.value;
  }
};

// 重置为默认颜色
const resetThemeColor = () => {
  settings.value.themeColor = "#409eff";
  // 不改变 customColor 和 lastCustomColor，保持用户的自定义颜色记忆
};

// 计算当前选中的预设颜色
const selectedPresetColor = computed(() => {
  return presetColors.find((p) => p.color === settings.value.themeColor);
});

// 重置设置
const handleReset = async () => {
  try {
    await ElMessageBox.confirm("确定要重置所有设置到默认值吗？此操作不可撤销。", "重置设置", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    isLoadingFromFile = true; // 防止触发不必要的事件
    const defaultSettings = await resetAppSettingsAsync();
    settings.value = { ...defaultSettings };
    applyTheme(settings.value.theme || "auto");

    // 手动触发同步事件
    setTimeout(() => {
      isLoadingFromFile = false;
      window.dispatchEvent(
        new CustomEvent("app-settings-changed", {
          detail: settings.value,
        })
      );
    }, 100);

    ElMessage.success("设置已重置到默认值");
  } catch (error) {
    // 用户取消了操作
    if (error !== "cancel") {
      console.error("重置设置失败:", error);
      ElMessage.error("重置设置失败");
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
    "关于",
    {
      dangerouslyUseHTMLString: true,
      confirmButtonText: "确定",
    }
  );
};

// 标记是否正在从文件加载设置，避免触发不必要的事件
let isLoadingFromFile = false;

// 监听暗黑模式变化，更新设置中的主题
watch(isDark, (newValue) => {
  // 如果正在加载文件或主题是自动模式，不处理
  if (isLoadingFromFile || settings.value.theme === "auto") {
    return;
  }

  // 根据暗黑模式状态更新主题设置
  const newTheme = newValue ? "dark" : "light";
  if (settings.value.theme !== newTheme) {
    settings.value.theme = newTheme;
  }
});

// 监听托盘设置变化
watch(
  () => settings.value.trayEnabled,
  async (newValue) => {
    if (isLoadingFromFile) return;

    try {
      // 同步到 Rust 后端
      await invoke("update_tray_setting", { enabled: newValue });
    } catch (error) {
      console.error("更新托盘设置失败:", error);
      ElMessage.error("更新托盘设置失败");
    }
  }
);

// 监听主题色变化
watch(
  () => settings.value.themeColor,
  (newColor) => {
    if (newColor) {
      applyThemeColor(newColor);
    }
  }
);

// 监听设置变化，自动保存并应用
watch(
  settings,
  (newSettings) => {
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

    // 应用主题色
    if (newSettings.themeColor) {
      applyThemeColor(newSettings.themeColor);
    }

    // 发出事件通知设置已更改（用于实时同步到侧边栏）
    window.dispatchEvent(
      new CustomEvent("app-settings-changed", {
        detail: newSettings,
      })
    );
  },
  { deep: true }
);

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
  toolsConfig.forEach((tool) => {
    const toolId = getToolIdFromPath(tool.path);
    if (loadedSettings.toolsVisible![toolId] === undefined) {
      loadedSettings.toolsVisible![toolId] = true;
    }
  });

  settings.value = loadedSettings;

  // 应用主题
  applyTheme(settings.value.theme || "auto");
  
  // 应用主题色
  if (settings.value.themeColor) {
    applyThemeColor(settings.value.themeColor);
    // 如果是自定义颜色，更新记忆
    if (!presetColors.find(p => p.color === settings.value.themeColor)) {
      customColor.value = settings.value.themeColor;
      lastCustomColor.value = settings.value.themeColor;
    }
  }

  // 获取应用信息
  try {
    appInfo.value.name = await getName();
    appInfo.value.version = await getVersion();
  } catch (error) {
    console.error("获取应用信息失败:", error);
    appInfo.value.name = "AIO工具箱";
    appInfo.value.version = "1.0.0";
  }

  // 同步托盘设置到后端
  try {
    await invoke("update_tray_setting", { enabled: settings.value.trayEnabled || false });
  } catch (error) {
    console.error("初始化托盘设置失败:", error);
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

  window.addEventListener("app-settings-changed", handleSettingsChange);

  // 加载完成后，允许触发事件
  setTimeout(() => {
    isLoadingFromFile = false;
  }, 100);
});

// 清理事件监听器
onUnmounted(() => {
  if (handleSettingsChange) {
    window.removeEventListener("app-settings-changed", handleSettingsChange);
  }
});
</script>

<template>
  <div class="settings-page">
    <div class="settings-wrapper">
      <!-- 左侧导航 -->
      <aside class="settings-nav">
        <h1 class="nav-title">设置</h1>

        <div class="nav-menu">
          <button
            class="nav-menu-item"
            :class="{ active: activeSection === 'general' }"
            @click="handleSelect('general')"
          >
            通用设置
          </button>
          <button
            class="nav-menu-item"
            :class="{ active: activeSection === 'tools' }"
            @click="handleSelect('tools')"
          >
            工具模块
          </button>
          <button
            class="nav-menu-item"
            :class="{ active: activeSection === 'about' }"
            @click="handleSelect('about')"
          >
            关于
          </button>
        </div>

        <div class="nav-actions">
          <el-button @click="handleReset" type="danger" plain> 重置所有设置 </el-button>
        </div>
      </aside>

      <!-- 右侧内容 -->
      <div class="settings-content" ref="contentRef" @scroll="handleScroll">
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

          <div class="setting-item">
            <div class="setting-label">
              <span>主题色</span>
              <el-tooltip content="选择应用的主题色调" placement="top">
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
            <div class="theme-color-selector">
              <div class="preset-colors">
                <el-tooltip
                  v-for="preset in presetColors"
                  :key="preset.color"
                  :content="preset.name"
                  placement="top"
                >
                  <button
                    class="color-item"
                    :class="{ active: settings.themeColor === preset.color }"
                    :style="{ backgroundColor: preset.color }"
                    @click="selectPresetColor(preset.color)"
                  >
                    <span v-if="settings.themeColor === preset.color" class="check-mark">✓</span>
                  </button>
                </el-tooltip>
                
                <!-- 自定义颜色按钮 -->
                <el-popover
                  v-model:visible="showColorPicker"
                  placement="bottom"
                  :width="260"
                  trigger="click"
                  @before-enter="handleColorPickerOpen"
                >
                  <template #reference>
                    <button
                      class="color-item custom-color-btn"
                      :class="{ active: !selectedPresetColor }"
                      :style="{
                        backgroundColor: !selectedPresetColor ? settings.themeColor : lastCustomColor,
                        border: !selectedPresetColor ? 'none' : '2px dashed var(--border-color)'
                      }"
                      :title="!selectedPresetColor ? '当前自定义颜色' : '自定义颜色'"
                    >
                      <span v-if="!selectedPresetColor" class="check-mark">✓</span>
                      <span v-else class="custom-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="13.5" cy="6.5" r="3.5"/>
                          <circle cx="8.5" cy="11.5" r="3.5"/>
                          <circle cx="15.5" cy="11.5" r="3.5"/>
                        </svg>
                      </span>
                    </button>
                  </template>
                  
                  <div class="custom-color-picker">
                    <h4>自定义颜色</h4>
                    <div class="color-input-group">
                      <el-input
                        v-model="customColor"
                        placeholder="#409eff"
                        :prefix-icon="null"
                        maxlength="7"
                      >
                        <template #prepend>
                          <input
                            type="color"
                            v-model="customColor"
                            class="native-color-picker"
                          />
                        </template>
                      </el-input>
                    </div>
                    <div class="color-preview" :style="{ backgroundColor: customColor }"></div>
                    <div class="picker-actions">
                      <el-button size="small" @click="showColorPicker = false">取消</el-button>
                      <el-button type="primary" size="small" @click="applyCustomColor">
                        应用
                      </el-button>
                    </div>
                  </div>
                </el-popover>
                
                <!-- 重置按钮 -->
                <el-tooltip content="重置为默认颜色" placement="top">
                  <button
                    class="color-item reset-btn"
                    @click="resetThemeColor"
                  >
                    <el-icon><Refresh /></el-icon>
                  </button>
                </el-tooltip>
              </div>
              
              <!-- 当前颜色显示 -->
              <div class="current-color-info">
                <span class="color-label">当前：</span>
                <span class="color-value">{{ settings.themeColor }}</span>
              </div>
            </div>
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
                    <span v-if="tool.description" class="tool-description">{{
                      tool.description
                    }}</span>
                  </div>
                </div>
              </el-checkbox>
            </div>
          </div>

          <el-divider />

          <div class="batch-actions">
            <el-button
              size="small"
              @click="
                Object.keys(settings.toolsVisible || {}).forEach(
                  (k) => (settings.toolsVisible![k] = true)
                )
              "
            >
              全选
            </el-button>
            <el-button
              size="small"
              @click="
                Object.keys(settings.toolsVisible || {}).forEach(
                  (k) => (settings.toolsVisible![k] = false)
                )
              "
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
  grid-template-columns: 220px 1fr;
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

/* 自定义导航菜单样式 */
.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.nav-menu-item {
  width: 100%;
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
  outline: none;
}

/* 默认 hover 效果 */
.nav-menu-item:hover:not(.active) {
  background-color: rgba(var(--primary-color-rgb), 0.05);
  color: var(--primary-color);
}

/* 激活状态 - 左侧边缘高亮 */
.nav-menu-item.active {
  color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.08);
  font-weight: 500;
}

/* 左侧高亮条 */
.nav-menu-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 60%;
  width: 3px;
  background-color: var(--primary-color);
  border-radius: 0 2px 2px 0;
  box-shadow: 0 0 8px rgba(var(--primary-color-rgb), 0.4);
}

/* 点击效果 */
.nav-menu-item:active {
  transform: scale(0.98);
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

/* 添加 CSS 变量支持 */
:root {
  --primary-color-rgb: 64, 158, 255; /* 默认蓝色 */
}

/* 暗色模式下的主色调 RGB */
.dark {
  --primary-color-rgb: 64, 158, 255;
}

/* 滚动条样式优化 */
.settings-content::-webkit-scrollbar {
  width: 8px;
}

.settings-content::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 4px;
}

.settings-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.settings-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-secondary);
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

/* 主题色选择器样式 */
.theme-color-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.color-item {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background-color: var(--card-bg);
}

.color-item:hover {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
}

.color-item.active {
  border-color: var(--text-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
}

.check-mark {
  color: white;
  font-weight: bold;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

.custom-color-btn .custom-icon {
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-color-btn:not(.active) {
  position: relative;
  overflow: hidden;
}

.custom-color-btn:not(.active)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, transparent 48%, var(--border-color) 49%, var(--border-color) 51%, transparent 52%);
  pointer-events: none;
}

.reset-btn {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
}

.reset-btn:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

/* 自定义颜色选择器弹窗 */
.custom-color-picker {
  padding: 8px;
}

.custom-color-picker h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-color);
}

.color-input-group {
  margin-bottom: 12px;
}

.native-color-picker {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  background: transparent;
}

.native-color-picker::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.native-color-picker::-webkit-color-swatch {
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.color-preview {
  width: 100%;
  height: 60px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  margin-bottom: 12px;
  transition: background-color 0.3s ease;
}

.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.current-color-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 6px 12px;
  background: var(--bg-color);
  border-radius: 4px;
  border: 1px solid var(--border-color-light);
}

.color-label {
  color: var(--text-color-secondary);
}

.color-value {
  font-family: monospace;
  color: var(--text-color);
  font-weight: 500;
}
</style>
