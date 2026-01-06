import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";

// 扫描所有 tools 目录下的 registry.ts
const toolModules = import.meta.glob("../tools/*/registry.ts", { eager: true });
const toolRoutes = Object.values(toolModules).map((mod: any) => mod.default.route);

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/Home.vue"),
    meta: { title: "首页" },
  },
  {
    path: "/settings",
    name: "Settings",
    component: () => import("../views/Settings.vue"),
    meta: { title: "设置" },
  },
  ...toolRoutes,
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

/**
 * 获取所有已注册的工具元数据
 */
export function getRegisteredTools() {
  return Object.values(toolModules).map((mod: any) => mod.default);
}
