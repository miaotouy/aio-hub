import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { toolsConfig } from "../config/tools";

// 从 toolsConfig 动态生成工具路由
const toolRoutes: RouteRecordRaw[] = toolsConfig.map((tool) => {
  // 将路径转换为驼峰命名作为路由名称
  // 例如：/regex-apply -> RegexApply
  const routeName = tool.path
    .substring(1) // 移除开头的 /
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return {
    path: tool.path,
    name: routeName,
    component: tool.component,
  };
});

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/HomePage.vue"),
  },
  // 动态生成的工具路由
  ...toolRoutes,
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

export default router;
