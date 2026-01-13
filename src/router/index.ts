import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { watch } from "vue";
import { useToolsStore } from "@/stores/tools";
import type { ToolConfig } from "@/services/types";

/**
 * 将工具路径转换为路由名称
 * 例如：/regex-applier -> RegexApply
 */
function pathToRouteName(path: string): string {
  return path
    .substring(1) // 移除开头的 /
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * 为工具创建路由配置
 */
function createToolRoute(tool: ToolConfig): RouteRecordRaw {
  return {
    path: tool.path,
    name: pathToRouteName(tool.path),
    component: tool.component,
  };
}

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/HomePage.vue"),
  },
  // 工具路由将在 router 创建后动态添加
  {
    path: "/extensions",
    name: "Extensions",
    component: () => import("../views/PluginManager/PluginManager.vue"),
  },
  {
    path: "/settings",
    name: "Settings",
    component: () => import("../views/Settings.vue"),
  },
  {
    // 动态路由：分离的工具窗口 /detached-window/{tool-path}
    path: "/detached-window/:toolPath",
    name: "DetachedWindow",
    component: () => import("../views/DetachedWindowContainer.vue"),
  },
  {
    // 动态路由：分离的组件窗口 /detached-component/{component-id}
    path: "/detached-component/:componentId",
    name: "DetachedComponent",
    component: () => import("../views/DetachedComponentContainer.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 跟踪已添加的路由，避免重复添加
const addedRoutes = new Set<string>();

/**
 * 添加工具路由
 */
function addToolRoute(tool: ToolConfig) {
  if (!addedRoutes.has(tool.path)) {
    const route = createToolRoute(tool);
    router.addRoute(route);
    addedRoutes.add(tool.path);
  }
}

/**
 * 移除工具路由
 */
function removeToolRoute(toolPath: string) {
  if (addedRoutes.has(toolPath)) {
    const routeName = pathToRouteName(toolPath);
    router.removeRoute(routeName);
    addedRoutes.delete(toolPath);
  }
}

/**
 * 初始化动态工具路由
 * 必须在 Pinia 初始化后调用
 */
export function initDynamicRoutes() {
  const toolsStore = useToolsStore();
  
  // 初始化：为所有现有工具添加路由
  toolsStore.tools.forEach(addToolRoute);

  // 监听工具列表变化，动态更新路由
  watch(
    () => toolsStore.tools,
    (newTools, oldTools) => {
      // 找出新增的工具
      const oldPaths = new Set(oldTools?.map(t => t.path) || []);
      const newPaths = new Set(newTools.map(t => t.path));
      
      // 添加新工具的路由
      newTools.forEach(tool => {
        if (!oldPaths.has(tool.path)) {
          addToolRoute(tool);
        }
      });
      
      // 移除已删除工具的路由
      oldTools?.forEach(tool => {
        if (!newPaths.has(tool.path)) {
          removeToolRoute(tool.path);
        }
      });
    },
    { deep: true }
  );
}

export default router;
