<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from "vue";
import { Expand, Fold } from "@element-plus/icons-vue";
import { useTheme } from "../composables/useTheme";
import { useThemeAppearance } from "@/composables/useThemeAppearance";
import SidebarMenu from "./SidebarMenu.vue";
import iconBlack from "../assets/aio-icon-black.svg";
import iconWhite from "../assets/aio-icon-white.svg";

// 属性
interface Props {
  collapsed: boolean;
  toolsVisible: Record<string, boolean>;
  isDetached: (id: string) => boolean;
}

const props = defineProps<Props>();

// 事件
const emit = defineEmits<{
  "update:collapsed": [value: boolean];
}>();

const { isDark } = useTheme();
const { appearanceSettings } = useThemeAppearance();
const logoSrc = computed(() => (isDark.value ? iconWhite : iconBlack));

// 内部状态与 props 同步
const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit("update:collapsed", value),
});

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 滚动遮罩相关
const menuContainerRef = ref<HTMLElement | null>(null);

const updateScrollMasks = () => {
  if (!menuContainerRef.value) return;
  const el = menuContainerRef.value;
  const { scrollTop, scrollHeight, clientHeight } = el;

  const showTopMask = scrollTop > 5;
  const showBottomMask = scrollHeight - scrollTop - clientHeight > 5;

  el.style.setProperty("--top-mask-active", showTopMask ? "0" : "1");
  el.style.setProperty("--bottom-mask-active", showBottomMask ? "0" : "1");
};

const setupScrollListener = () => {
  if (menuContainerRef.value) {
    menuContainerRef.value.addEventListener("scroll", updateScrollMasks);
    nextTick(() => updateScrollMasks());
  }
};

const cleanupScrollListener = () => {
  if (menuContainerRef.value) {
    menuContainerRef.value.removeEventListener("scroll", updateScrollMasks);
  }
};

onMounted(() => {
  setupScrollListener();
  window.addEventListener("resize", updateScrollMasks);
});

onUnmounted(() => {
  cleanupScrollListener();
  window.removeEventListener("resize", updateScrollMasks);
});
</script>

<template>
  <el-aside
    :width="isCollapsed ? '64px' : '220px'"
    :class="[
      'main-sidebar',
      {
        'is-collapsed': isCollapsed,
        'glass-sidebar': appearanceSettings?.enableUiEffects && appearanceSettings?.enableUiBlur,
      },
    ]"
  >
    <!-- 上部分：标题和导航 -->
    <div class="sidebar-top">
      <div class="sidebar-header" :class="{ 'is-collapsed': isCollapsed }">
        <img :src="logoSrc" alt="Logo" class="sidebar-logo" />
        <h2 v-if="!isCollapsed" class="sidebar-title">AIO Hub</h2>
      </div>

      <div class="menu-wrapper">
        <div class="menu-container" ref="menuContainerRef">
          <SidebarMenu
            :collapsed="isCollapsed"
            :tools-visible="toolsVisible"
            :is-detached="isDetached"
          />
        </div>
      </div>
    </div>

    <!-- 下部分：收起按钮 -->
    <div class="sidebar-bottom">
      <div class="sidebar-actions">
        <el-tooltip
          effect="dark"
          :content="isCollapsed ? '展开侧边栏' : '收起侧边栏'"
          placement="right"
          :hide-after="0"
        >
          <el-button
            :icon="isCollapsed ? Expand : Fold"
            circle
            @click="toggleSidebar"
            class="action-btn collapse-btn"
          />
        </el-tooltip>
      </div>
    </div>
  </el-aside>
</template>

<style scoped>
.main-sidebar {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-text);
  border-right: 1px solid var(--border-color);
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow-x: hidden;
}

.sidebar-top {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: 20px;
  overflow: hidden;
  position: relative;
}

.sidebar-bottom {
  flex: 0 0 auto;
  padding: 15px 0;
  display: flex;
  justify-content: center;
  overflow-x: hidden;
}

.sidebar-header {
  margin-bottom: 30px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  padding: 0 20px;
  box-sizing: border-box;
  overflow-x: hidden;
}

.sidebar-logo {
  width: 32px;
  height: 32px;
  transition: all 0.3s ease;
}

.sidebar-header:not(.is-collapsed) .sidebar-logo {
  margin-right: 12px;
}

.sidebar-title {
  color: var(--sidebar-text);
  font-size: 24px;
  font-weight: bold;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  transition: opacity 0.3s ease;
}

.sidebar-header.is-collapsed {
  justify-content: center;
}

.menu-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.menu-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  --mask-height: 30px;
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, var(--top-mask-active, 1)) 0%,
    black var(--mask-height),
    black calc(100% - var(--mask-height)),
    rgba(0, 0, 0, var(--bottom-mask-active, 1)) 100%
  );
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, var(--top-mask-active, 1)) 0%,
    black var(--mask-height),
    black calc(100% - var(--mask-height)),
    rgba(0, 0, 0, var(--bottom-mask-active, 1)) 100%
  );
}

.menu-container::-webkit-scrollbar {
  display: none;
}

.menu-container {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.sidebar-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  transition: flex-direction 0.3s ease;
}

.main-sidebar.is-collapsed .sidebar-actions {
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.action-btn {
  border: none;
  background: transparent;
  color: var(--text-color);
  padding: 8px;
}

.action-btn:hover {
  background-color: var(--primary-color-light);
}
</style>
