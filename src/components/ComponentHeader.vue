<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { CornerDownLeft, Pin, ExternalLink, Minus, Plus } from "lucide-vue-next";

const logger = createModuleLogger("ComponentHeader");
const errorHandler = createModuleErrorHandler("ComponentHeader");

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
  (e: "mousedown", event: MouseEvent): void;
}

const props = withDefaults(defineProps<Props>(), {
  position: "top",
  collapsible: true,
  dragMode: "window",
  showActions: true,
});

const emit = defineEmits<Emits>();
const isCollapsed = ref(false);
const showMenu = ref(false);
const isPinned = ref(false);
const isMac = ref(false);

onMounted(async () => {
  // 仅在独立窗口模式下检查置顶状态
  if (props.dragMode === "window") {
    try {
      const win = getCurrentWebviewWindow();
      isPinned.value = await win.isAlwaysOnTop();
    } catch (error) {
      errorHandler.error(error, "获取窗口置顶状态失败", { showToUser: false });
    }
  }

  // 检查平台以应用特定逻辑
  try {
    const plat = await platform();
    isMac.value = plat === "macos";
  } catch (error) {
    errorHandler.error(error, "检查操作系统平台失败", { showToUser: false });
  }
});

const positionClasses = computed(() => ({
  [`position-${props.position}`]: true,
  collapsed: isCollapsed.value,
}));

const tooltipPlacement = computed(() => {
  switch (props.position) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
    default:
      return "bottom";
  }
});

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
    const currentWindow = getCurrentWebviewWindow();
    // 使用统一的关闭命令，它会自动处理重新附着事件
    await invoke("close_detached_window", { label: currentWindow.label });
    emit("reattach");
  } catch (error) {
    errorHandler.error(error, "重新附着失败");
  }
};

const togglePin = async () => {
  try {
    const win = getCurrentWebviewWindow();
    const newPinStatus = !isPinned.value;

    logger.info("准备切换窗口置顶状态", {
      currentStatus: isPinned.value,
      targetStatus: newPinStatus,
      windowLabel: win.label,
    });

    await win.setAlwaysOnTop(newPinStatus);
    isPinned.value = newPinStatus;

    logger.info("窗口置顶状态已更新", { newStatus: newPinStatus });
  } catch (error: any) {
    errorHandler.error(error, "切换窗口置顶失败");
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

const handleDragInteraction = (event: MouseEvent) => {
  if (props.dragMode !== "detach") return;

  if (isMac.value) {
    // 在 macOS 上，禁用 rdev 拖拽，将 mousedown 视为直接分离
    logger.info("在 macOS 上检测到拖拽交互，触发直接分离。");
    emit("detach");
  } else {
    // 在其他平台上，启动 rdev 拖拽会话
    emit("mousedown", event);
  }
};
</script>

<template>
  <div class="component-header" :class="positionClasses">
    <!-- Drag and Title Area -->
    <el-tooltip
      :content="dragTooltip"
      :placement="tooltipPlacement"
      :show-arrow="false"
      :offset="10"
      :enterable="false"
    >
      <div
        class="drag-area"
        :class="{ 'window-drag-mode': dragMode === 'window' }"
        :data-tauri-drag-region="dragMode === 'window' ? '' : null"
        @mousedown="handleDragInteraction"
      >
        <slot name="drag-region">
          <div class="drag-handle">
            <i-ep-rank class="drag-icon" />
          </div>
        </slot>
      </div>
    </el-tooltip>

    <!-- Actions -->
    <div v-if="showActions" class="actions">
      <!-- Collapse Button -->
      <template v-if="collapsible">
        <el-tooltip
          :content="isCollapsed ? '展开' : '收起'"
          :placement="tooltipPlacement"
          :show-arrow="false"
          :offset="10"
          :enterable="false"
        >
          <button @click="toggleCollapse" class="action-btn">
            <Minus v-if="!isCollapsed" :size="16" :stroke-width="2.5" />
            <Plus v-else :size="16" :stroke-width="2.5" />
          </button>
        </el-tooltip>
      </template>

      <!-- Menu Button -->
      <div class="menu-container">
        <el-tooltip
          content="菜单"
          :placement="tooltipPlacement"
          :show-arrow="false"
          :offset="10"
          :enterable="false"
        >
          <button @click="toggleMenu" class="action-btn" :class="{ active: showMenu }">
            <i-ep-menu />
          </button>
        </el-tooltip>

        <!-- Expanded Icon Buttons -->
        <transition name="menu-expand">
          <div v-if="showMenu" class="expanded-menu" @click.stop>
            <!-- 分离模式下的按钮 -->
            <template v-if="dragMode === 'window'">
              <el-tooltip
                content="回归主窗口"
                :placement="tooltipPlacement"
                :show-arrow="false"
                :offset="10"
                :enterable="false"
              >
                <button @click="handleMenuReattach" class="action-btn menu-action-btn">
                  <CornerDownLeft :size="16" />
                </button>
              </el-tooltip>
              <el-tooltip
                :content="isPinned ? '取消置顶' : '置顶窗口'"
                :placement="tooltipPlacement"
                :show-arrow="false"
                :offset="10"
                :enterable="false"
              >
                <button @click="togglePin" class="action-btn menu-action-btn" :class="{ 'pinned': isPinned }">
                  <Pin :size="16" :fill="isPinned ? 'currentColor' : 'none'" />
                </button>
              </el-tooltip>
            </template>
            <!-- 内嵌模式下的按钮 -->
            <template v-else>
              <el-tooltip
                content="在独立窗口打开"
                :placement="tooltipPlacement"
                :show-arrow="false"
                :offset="10"
                :enterable="false"
              >
                <button @click="handleMenuDetach" class="action-btn menu-action-btn">
                  <ExternalLink :size="16" />
                </button>
              </el-tooltip>
            </template>
          </div>
        </transition>
        <div v-if="showMenu" class="menu-backdrop" @click="closeMenu"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.component-header {
  display: flex;
  background: var(--sidebar-bg);
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
  gap: 4px;
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

/* 置顶按钮的激活状态 */
.action-btn.pinned {
  background: rgba(var(--primary-color-rgb), 0.15);
  color: var(--primary-color);
}

.action-btn.pinned:hover {
  background: rgba(var(--primary-color-rgb), 0.2);
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

/* --- Menu --- */
.menu-container {
  position: relative;
  display: flex;
  align-items: center;
}

.expanded-menu {
  display: flex;
  align-items: center;
  z-index: 1001;
}

.position-top .expanded-menu,
.position-bottom .expanded-menu {
  flex-direction: row;
  gap: 2px;
}

.position-left .expanded-menu,
.position-right .expanded-menu {
  flex-direction: column;
  gap: 4px;
}

.position-left .menu-container,
.position-right .menu-container {
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.menu-action-btn {
  animation: menu-btn-fade-in 0.2s ease-out backwards;
}

.menu-action-btn:nth-child(1) {
  animation-delay: 0.05s;
}

.menu-action-btn:nth-child(2) {
  animation-delay: 0.1s;
}

@keyframes menu-btn-fade-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.menu-expand-enter-active,
.menu-expand-leave-active {
  transition: all 0.2s ease;
}

.menu-expand-enter-from,
.menu-expand-leave-to {
  opacity: 0;
  transform: scale(0.8);
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
