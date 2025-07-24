import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Home",
    component: () => import("../components/HomePage.vue"),
  },
  {
    path: "/regex-applier",
    name: "RegexApplier",
    component: () => import("../components/RegexApplier.vue"),
  },
  {
    path: "/media-info-reader",
    name: "MediaInfoReader",
    component: () => import("../components/MediaInfoReader.vue"),
  },
  {
    path: "/text-diff",
    name: "TextDiff",
    component: () => import("../components/TextDiff.vue"),
  },
  {
    path: "/json-formatter",
    name: "JsonFormatter",
    component: () => import("../components/JsonFormatter.vue"),
  },
  {
    path: "/code-formatter", // 通用代码格式化，内部再区分语言
    name: "CodeFormatter",
    component: () => import("../components/CodeFormatter.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
