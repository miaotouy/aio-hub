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
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
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
  {
    // 捕获所有未匹配路由，防止初始导航报错
    // 同时也作为动态路由加载前的占位
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("../views/HomePage.vue"), // 初始指向首页或空白
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
  // 注意：Vue 3 监听数组变更时，newTools 和 oldTools 可能指向同一个引用
  // 我们通过跟踪已添加的路径集合来确保路由同步
  watch(
    () => [...toolsStore.tools],
    (newTools) => {
      const newPaths = new Set(newTools.map((t) => t.path));

      // 1. 移除不再需要的路由
      for (const path of Array.from(addedRoutes)) {
        if (!newPaths.has(path)) {
          removeToolRoute(path);
        }
      }

      // 2. 添加新增的路由
      newTools.forEach((tool) => {
        if (!addedRoutes.has(tool.path)) {
          addToolRoute(tool);
        }
      });
    },
    { immediate: true },
  );
}

/**
 * 强制重新评估当前路由匹配情况
 * 用于在动态路由添加后，让 Router 重新匹配当前路径
 */
export function refreshCurrentRoute() {
  const { fullPath, matched } = router.currentRoute.value;
  // 如果当前没有匹配到路由，或者匹配到了 fallback，则尝试重新导航到当前路径
  if (matched.length === 0 || matched.some((m) => m.name === "NotFound" || !m.components?.default)) {
    router.replace(fullPath);
  }
}

export default router;
