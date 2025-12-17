<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Promotion } from "@element-plus/icons-vue";
import { Puzzle } from "lucide-vue-next";
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

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 计算可见的工具列表
const visibleTools = computed(() => {
  const baseTools = props.toolsVisible
    ? toolsStore.orderedTools.filter((tool) => {
        const toolId = getToolIdFromPath(tool.path);
        const isVisible = props.toolsVisible[toolId];
        return isVisible !== false;
      })
    : toolsStore.orderedTools;

  return baseTools.filter((tool) => !props.isDetached(getToolIdFromPath(tool.path)));
});

const handleSelect = (key: string) => {
  router.push(key);
  emit("select", key);
};

const handleDragStart = (event: MouseEvent, tool: ToolConfig) => {
  event.preventDefault();
  event.stopPropagation();

  startDetaching({
    id: getToolIdFromPath(tool.path),
    displayName: tool.name,
    type: "tool",
    width: 900,
    height: 700,
    mouseX: event.screenX,
    mouseY: event.screenY,
    metadata: { tool },
    onClickInstead: () => {
      router.push(tool.path);
      emit("select", tool.path);
    },
  });
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

  if (success && route.path === tool.path) {
    router.push("/");
    emit("select", "/");
  }
};
</script>

<template>
  <el-menu
    :default-active="route.path"
    class="sidebar-menu-component"
    :collapse="collapsed"
    @select="handleSelect"
  >
    <el-menu-item index="/">
      <span class="icon-wrapper">
        <i-ep-home-filled />
      </span>
      <template #title>主页</template>
    </el-menu-item>
    <el-menu-item index="/extensions">
      <span class="icon-wrapper">
        <Puzzle />
      </span>
      <template #title>扩展</template>
    </el-menu-item>

    <el-tooltip
      v-for="tool in visibleTools"
      :key="tool.path"
      effect="dark"
      :content="tool.name"
      placement="right"
      :disabled="!collapsed"
      :hide-after="0"
    >
      <el-menu-item
        :index="tool.path"
        @mousedown.left="handleDragStart($event, tool)"
        class="draggable-menu-item"
        style="padding: 0"
      >
        <el-dropdown
          trigger="contextmenu"
          placement="bottom-start"
          style="width: 100%; height: 100%"
        >
          <span class="menu-item-trigger">
            <span class="icon-wrapper">
              <component :is="tool.icon" />
            </span>
            <template v-if="!collapsed">
              <span class="menu-item-title-text">{{ tool.name }}</span>
            </template>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleDetachByClick(tool)">
                <el-icon><Promotion /></el-icon>
                <span>在新窗口中打开</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-menu-item>
    </el-tooltip>
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
  margin-left: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
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
