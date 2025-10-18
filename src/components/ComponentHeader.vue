<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("ComponentHeader");

interface Props {
  position?: "top" | "bottom" | "left" | "right";
  collapsible?: boolean;
  title?: string;
  dragMode?: "window" | "detach";
  showActions?: boolean;
}

interface Emits {
  (e: "reattach"): void;
  (e: "detach"): void;
}

const props = withDefaults(defineProps<Props>(), {
  position: "top",
  collapsible: true,
  title: "独立组件",
  dragMode: "window",
  showActions: true,
});

const emit = defineEmits<Emits>();

const isCollapsed = ref(false);
const showMenu = ref(false);
const isPinned = ref(false);

onMounted(async () => {
  // 仅在独立窗口模式下检查置顶状态
  if (props.dragMode === "window") {
    try {
      const win = getCurrentWindow();
      isPinned.value = await win.isAlwaysOnTop();
    } catch (error) {
      logger.error("获取窗口置顶状态失败", { error });
    }
  }
});

const positionClasses = computed(() => ({
  [`position-${props.position}`]: true,
  collapsed: isCollapsed.value,
}));

const dragTooltip = computed(() => {
  return props.dragMode === "window" ? "拖拽以移动窗口" : "拖拽以分离，可在独立窗口打开";
});

const toggleCollapse = () => {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value;
  }
};

const handleReattach = async () => {
  try {
    logger.info("请求重新附着到主窗口");
    const currentWindow = getCurrentWindow();
    await invoke("reattach_component", { label: currentWindow.label });
    // 关闭当前独立窗口
    await currentWindow.close();
    emit("reattach");
  } catch (error) {
    logger.error("重新附着失败", { error });
  }
};

const togglePin = async () => {
  try {
    const win = getCurrentWindow();
    const newPinStatus = !isPinned.value;
    await win.setAlwaysOnTop(newPinStatus);
    isPinned.value = newPinStatus;
    logger.info(`窗口置顶状态设置为: ${isPinned.value}`);
  } catch (error) {
    logger.error("切换窗口置顶失败", { error });
  } finally {
    closeMenu();
  }
};

const handleMenuDetach = () => {
  closeMenu();
  emit("detach");
};

const toggleMenu = () => {
  showMenu.value = !showMenu.value;
};

const closeMenu = () => {
  showMenu.value = false;
};

const handleMenuReattach = async () => {
  closeMenu();
  await handleReattach();
};
</script>

<template>
  <div class="component-header" :class="positionClasses">
    <!-- Drag and Title Area -->
    <div
      class="drag-area"
      :class="{ 'window-drag-mode': dragMode === 'window' }"
      :data-tauri-drag-region="dragMode === 'window' ? '' : null"
      :title="dragTooltip"
    >
      <slot name="drag-region">
        <div class="drag-handle">
          <i-ep-rank class="drag-icon" />
          <span v-if="!isCollapsed && position !== 'left' && position !== 'right'" class="title">{{
            title
          }}</span>
        </div>
      </slot>
    </div>

    <!-- Actions -->
    <div v-if="showActions" class="actions">
      <!-- Collapse Button -->
      <button
        v-if="collapsible"
        @click="toggleCollapse"
        class="action-btn"
        :title="isCollapsed ? '展开' : '收起'"
      >
        <svg
          v-if="!isCollapsed"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12h14" />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </button>

      <!-- Menu Button -->
      <div class="menu-container">
        <button @click="toggleMenu" class="action-btn" :class="{ active: showMenu }" title="菜单">
          <i-ep-menu />
        </button>

        <!-- Dropdown Menu -->
        <div v-if="showMenu" class="dropdown-menu" @click.stop>
          <!-- 分离模式下的菜单 -->
          <template v-if="dragMode === 'window'">
            <div class="menu-item" @click="handleMenuReattach">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18 16l-4-4 4-4" />
                <path d="M6 8h8a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4H6" />
              </svg>
              <span>回归主窗口</span>
            </div>
            <div class="menu-item" @click="togglePin">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 22V8" />
                <path d="M5 8h14" />
                <path d="m12 8-4 4h8l-4-4z" />
              </svg>
              <span>{{ isPinned ? "取消置顶" : "置顶窗口" }}</span>
            </div>
          </template>
          <!-- 内嵌模式下的菜单 -->
          <template v-else>
            <div class="menu-item" @click="handleMenuDetach">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>在独立窗口打开</span>
            </div>
          </template>
        </div>
        <div v-if="showMenu" class="menu-backdrop" @click="closeMenu"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.component-header {
  display: flex;
  background: rgba(var(--sidebar-bg-rgb), 0.8);
  backdrop-filter: blur(8px);
  color: var(--text-color);
  user-select: none;
  transition: background 0.2s ease;
  z-index: 1000;
  -webkit-app-region: no-drag;
}


/* --- Layout Variants --- */
.position-top,
.position-bottom {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 2px 8px;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
}
.position-top {
  border-radius: 8px 8px 0 0;
}
.position-bottom {
  order: 999;
  border-top: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 0 0 8px 8px;
}

.position-left,
.position-right {
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  padding: 8px 4px;
  border-right: 1px solid var(--border-color);
}
.position-left {
  border-radius: 8px 0 0 8px;
}
.position-right {
  order: 999;
  border-left: 1px solid var(--border-color);
  border-right: none;
  border-radius: 0 8px 8px 0;
}

/* --- Drag Area --- */
.drag-area {
  flex-shrink: 0;
  cursor: move;
}

/* 只在窗口拖动模式下启用 webkit-app-region */
.drag-area.window-drag-mode {
  -webkit-app-region: drag;
}
.position-top .drag-area,
.position-bottom .drag-area {
  flex-grow: 1;
  min-width: 0;
}
.position-left .drag-area,
.position-right .drag-area {
  width: 100%;
}

.drag-handle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}
.drag-area:hover .drag-handle {
  background: rgba(var(--primary-color-rgb), 0.05);
}
.position-left .drag-handle,
.position-right .drag-handle {
  justify-content: center;
}

.drag-icon {
  font-size: 16px;
  line-height: 1;
  color: var(--text-color-light);
  opacity: 0.6;
}
.drag-area:hover .drag-icon {
  opacity: 0.9;
}

.title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- Actions --- */
.actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
.position-top .actions,
.position-bottom .actions {
  flex-direction: row;
  gap: 2px;
}
.position-left .actions,
.position-right .actions {
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-color-light);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--text-color);
}
.action-btn.active {
  background: rgba(var(--primary-color-rgb), 0.15);
  color: var(--primary-color);
}

.close-btn:hover {
  background: rgba(var(--error-color-rgb), 0.1);
  color: var(--error-color);
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

/* --- Menu --- */
.menu-container {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  min-width: 180px;
  background: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 1001;
  padding: 4px;
  animation: menu-fade-in 0.15s ease-out;
}
.position-top .dropdown-menu,
.position-bottom .dropdown-menu {
  top: calc(100% + 4px);
  right: 0;
}
.position-left .dropdown-menu {
  top: 0;
  left: calc(100% + 4px);
}
.position-right .dropdown-menu {
  top: 0;
  right: calc(100% + 4px);
}

@keyframes menu-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-5px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: transparent;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.2s;
  color: var(--text-color);
  font-size: 13px;
  border-radius: 4px;
}

.menu-item:hover {
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.menu-item svg {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}
.menu-item:hover svg {
  opacity: 1;
}

/* --- Collapsed State --- */
.collapsed .drag-handle {
  justify-content: center;
}
.position-left.collapsed,
.position-right.collapsed {
  gap: 4px;
}
.position-left.collapsed .drag-area,
.position-right.collapsed .drag-area {
  padding-bottom: 4px;
}
.collapsed .title {
  display: none;
}
</style>
