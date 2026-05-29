<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Expand, Fold } from "@element-plus/icons-vue";
import { Trash2 } from "lucide-vue-next";
import { useThemeAppearance } from "@/composables/useThemeAppearance";
import { useToolsStore } from "@/stores/tools";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import SidebarMenu from "./SidebarMenu.vue";

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

const { appearanceSettings } = useThemeAppearance();
const toolsStore = useToolsStore();
const router = useRouter();
const route = useRoute();

// 内部状态与 props 同步
const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit("update:collapsed", value),
});

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 清空打开的标签页
const clearOpenedTabs = async () => {
  try {
    await ElMessageBox.confirm("确定要关闭所有已打开的工具标签页吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    });

    toolsStore.setOpenedToolPaths([]);
    customMessage.success("已清空所有标签页");

    // 如果当前在工具页面，导航回主页
    if (
      route.path !== "/" &&
      route.path !== "/settings" &&
      route.path !== "/extensions"
    ) {
      router.push("/");
    }
  } catch (e) {
    // 用户取消
  }
};

// 滚动遮罩相关
const menuWrapperRef = ref<HTMLElement | null>(null);
const menuContainerRef = ref<HTMLElement | null>(null);

const updateScrollMasks = () => {
  if (!menuContainerRef.value) return;
  const el = menuContainerRef.value;
  const maskHost = menuWrapperRef.value;
  const { scrollTop, scrollHeight, clientHeight } = el;

  const showTopMask = scrollTop > 5;
  const showBottomMask = scrollHeight - scrollTop - clientHeight > 5;

  maskHost?.style.setProperty("--top-fade-opacity", showTopMask ? "1" : "0");
  maskHost?.style.setProperty(
    "--bottom-fade-opacity",
    showBottomMask ? "1" : "0"
  );
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
        'has-glass-effect':
          appearanceSettings?.enableUiEffects &&
          appearanceSettings?.enableUiBlur,
      },
    ]"
  >
    <!-- 上部分：标题和导航 -->
    <div class="sidebar-top">
      <div class="menu-wrapper" ref="menuWrapperRef">
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
      <div class="sidebar-actions" :class="{ 'is-collapsed': isCollapsed }">
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

        <!-- 展开状态下显示的其他按钮 -->
        <template v-if="!isCollapsed">
          <el-tooltip
            effect="dark"
            content="清空打开的标签页"
            placement="top"
            :hide-after="0"
          >
            <el-button
              circle
              @click="clearOpenedTabs"
              class="action-btn clear-btn"
            >
              <el-icon :size="14"><Trash2 /></el-icon>
            </el-button>
          </el-tooltip>
        </template>
      </div>
    </div>
  </el-aside>
</template>

<style scoped>
.main-sidebar {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-text);
  border-right: var(--border-width) solid var(--border-color);
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow-x: hidden;
}

.main-sidebar.has-glass-effect {
  backdrop-filter: blur(var(--ui-blur));
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
  padding: 15px 16px;
  display: flex;
  align-items: center;
  overflow-x: hidden;
  border-top: var(--border-width) solid var(--border-color);
}

.main-sidebar.is-collapsed .sidebar-bottom {
  padding: 15px 0;
  justify-content: center;
}

.menu-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  --mask-height: 30px;
  --top-fade-opacity: 0;
  --bottom-fade-opacity: 0;
}

.menu-wrapper::before,
.menu-wrapper::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: var(--mask-height);
  pointer-events: none;
  z-index: 1;
  transition: opacity 0.2s ease;
}

.menu-wrapper::before {
  top: 0;
  background: linear-gradient(to bottom, var(--sidebar-bg), transparent);
  opacity: var(--top-fade-opacity);
}

.menu-wrapper::after {
  bottom: 0;
  background: linear-gradient(to top, var(--sidebar-bg), transparent);
  opacity: var(--bottom-fade-opacity);
}

.menu-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
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
  align-items: center;
  width: 100%;
  justify-content: flex-start;
  gap: 10px;
}

.sidebar-actions.is-collapsed {
  justify-content: center;
}

.action-btn {
  border: none;
  background: transparent;
  color: var(--text-color);
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background-color: var(--primary-color-light);
  color: var(--el-color-primary);
}

.clear-btn {
  margin-left: auto;
}
</style>
