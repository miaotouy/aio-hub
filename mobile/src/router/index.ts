import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import { toolManager } from "@/utils/toolManager";

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
  ...toolManager.getToolRoutes(),
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

/**
 * 获取所有已注册的工具元数据
 * @deprecated 请直接使用 toolManager.getRegisteredTools()
 */
export function getRegisteredTools() {
  return toolManager.getRegisteredTools();
}
