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
        'has-glass-effect':
          appearanceSettings?.enableUiEffects &&
          appearanceSettings?.enableUiBlur,
      },
    ]"
  >
    <!-- 上部分：标题和导航 -->
    <div class="sidebar-top">
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
