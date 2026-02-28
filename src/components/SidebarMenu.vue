<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Promotion, Close } from "@element-plus/icons-vue";
import { Puzzle } from "lucide-vue-next";
import { VueDraggableNext as draggable } from "vue-draggable-next";
import type { ToolConfig } from "@/services/types";
import { useToolsStore } from "@/stores/tools";
import { useDetachable } from "../composables/useDetachable";

interface Props {
  collapsed?: boolean;
  toolsVisible: Record<string, boolean>;
  isDetached: (id: string) => boolean;
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
});

const emit = defineEmits<{
  (e: "select", key: string): void;
}>();

const router = useRouter();
const route = useRoute();
const toolsStore = useToolsStore();
const { startDetaching, detachByClick } = useDetachable();

// 从路径提取工具 ID
const getToolIdFromPath = (path: string): string => {
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 计算可见的工具列表（标签页模式：只显示已打开的且未分离的工具）
// 使用可写计算属性以支持拖拽排序
const displayTools = computed({
  get: () => {
    return toolsStore.openedToolPaths
      .map((path) => toolsStore.tools.find((t) => t.path === path))
      .filter((tool): tool is ToolConfig => !!tool && !props.isDetached(getToolIdFromPath(tool.path)));
  },
  set: (newTools: ToolConfig[]) => {
    // 拖拽排序后，更新 openedToolPaths 的顺序
    const newPaths = newTools.map((t) => t.path);
    toolsStore.setOpenedToolPaths(newPaths);
  },
});

const handleSelect = (key: string) => {
  router.push(key);
  emit("select", key);
};

const isDragging = ref(false);

const onDragStart = () => {
  isDragging.value = true;
};

const onDragEnd = () => {
  isDragging.value = false;
};

const handleDragStart = (event: MouseEvent, tool: ToolConfig) => {
  // 这里保留原有的分离逻辑
  const startX = event.screenX;
  const startY = event.screenY;

  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.screenX - startX;
    const deltaY = moveEvent.screenY - startY;

    // 如果水平位移超过阈值且大于垂直位移，触发分离
    if (deltaX > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      startDetaching({
        id: getToolIdFromPath(tool.path),
        displayName: tool.name,
        type: "tool",
        width: 900,
        height: 700,
        mouseX: moveEvent.screenX,
        mouseY: moveEvent.screenY,
        metadata: { tool },
        onClickInstead: () => {
          router.push(tool.path);
          emit("select", tool.path);
        },
      });
    }
  };

  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const handleDetachByClick = async (tool: ToolConfig) => {
  const success = await detachByClick({
    id: getToolIdFromPath(tool.path),
    displayName: tool.name,
    type: "tool",
    width: 900,
    height: 700,
    metadata: { tool },
  });

  if (success) {
    // 分离后，从已打开列表中移除
    toolsStore.closeTool(tool.path);

    if (route.path === tool.path) {
      router.push("/");
      emit("select", "/");
    }
  }
};

const handleCloseTool = async (event: MouseEvent, toolPath: string) => {
  event.preventDefault();
  event.stopPropagation();

  // 如果关闭的是当前正在查看的工具，先跳转回主页，再关闭标签
  // 这样可以避免 App.vue 的路由监听器在跳转过程中又把标签加回来
  if (route.path === toolPath) {
    await router.push("/");
    emit("select", "/");
  }

  toolsStore.closeTool(toolPath);
};
</script>

<template>
  <el-menu :default-active="route.path" class="sidebar-menu-component" :collapse="collapsed" @select="handleSelect">
    <el-menu-item index="/">
      <span class="icon-wrapper">
        <i-ep-home-filled />
      </span>
      <template #title>
        <span class="menu-item-title-text">主页</span>
      </template>
    </el-menu-item>
    <el-menu-item index="/extensions">
      <span class="icon-wrapper">
        <Puzzle />
      </span>
      <template #title>
        <span class="menu-item-title-text">扩展</span>
      </template>
    </el-menu-item>

    <draggable
      v-model="displayTools"
      :animation="200"
      :force-fallback="true"
      ghost-class="ghost-item"
      chosen-class="chosen-item"
      drag-class="drag-item"
      @start="onDragStart"
      @end="onDragEnd"
      class="draggable-container"
    >
      <div v-for="tool in displayTools" :key="tool.path">
        <el-tooltip
          :key="tool.path"
          effect="dark"
          :content="tool.name"
          placement="right"
          :disabled="!collapsed"
          :hide-after="0"
        >
          <el-menu-item
            :index="tool.path"
            class="draggable-menu-item"
            style="padding: 0"
            @mousedown.left="handleDragStart($event, tool)"
          >
            <el-dropdown trigger="contextmenu" placement="bottom-start" style="width: 100%; height: 100%">
              <span class="menu-item-trigger">
                <span class="icon-wrapper">
                  <component :is="tool.icon" />
                </span>
                <template v-if="!collapsed">
                  <span class="menu-item-title-text">{{ tool.name }}</span>
                  <el-icon class="close-tab-btn" @click.stop="handleCloseTool($event, tool.path)" @mousedown.stop>
                    <Close />
                  </el-icon>
                </template>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleDetachByClick(tool)">
                    <el-icon><Promotion /></el-icon>
                    <span>在新窗口中打开</span>
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="handleCloseTool($event, tool.path)">
                    <el-icon><Close /></el-icon>
                    <span>关闭标签页</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-menu-item>
        </el-tooltip>
      </div>
    </draggable>
  </el-menu>
</template>

<style scoped>
.sidebar-menu-component {
  border-right: none;
  background-color: transparent;
}

.draggable-menu-item {
  cursor: move;
  user-select: none;
}

.draggable-menu-item:active {
  opacity: 0.7;
}

.menu-item-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0 20px;
  box-sizing: border-box;
}

.el-menu--collapse .menu-item-trigger {
  justify-content: center;
  padding: 0;
}

.menu-item-title-text {
  flex: 1;
  margin-left: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
}

.close-tab-btn {
  opacity: 0;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  transition: all 0.2s;
  color: var(--text-color-light);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.draggable-menu-item:hover .close-tab-btn {
  opacity: 1;
}

.close-tab-btn:hover {
  color: var(--el-color-danger);
}

.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 18px;
  vertical-align: middle;
}

/* 拖拽排序样式 */
.ghost-item {
  opacity: 0.5;
  background-color: var(--primary-color-light);
}

.chosen-item {
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.15);
}

.drag-item {
  opacity: 0.8;
  cursor: grabbing;
}
</style>

<style>
/* 继承 MainSidebar 的全局菜单样式 */
.sidebar-menu-component.el-menu {
  background-color: transparent !important;
}

.sidebar-menu-component .el-menu-item {
  color: var(--sidebar-text) !important;
}

.sidebar-menu-component .el-menu-item:hover {
  background-color: var(--primary-color-light) !important;
}

.sidebar-menu-component .el-menu-item.is-active {
  background-color: rgba(var(--primary-color-rgb), 0.08) !important;
  color: var(--primary-color) !important;
  font-weight: 500;
  position: relative;
}

.sidebar-menu-component .el-menu-item.is-active::before {
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

/* 修复收起时菜单图标不居中的问题 */
.el-menu--collapse.sidebar-menu-component .el-menu-item > div {
  justify-content: center;
}
</style>
