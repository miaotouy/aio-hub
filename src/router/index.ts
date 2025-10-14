import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/HomePage.vue"),
  },
  {
    path: "/regex-apply",
    name: "RegexApply",
    component: () => import("../tools/regex-applier/RegexApplier.vue"),
  },
  {
    path: "/regex-manage",
    name: "RegexManage",
    component: () => import("../tools/regex-applier/PresetManager.vue"),
  },
  {
    path: "/media-info-reader",
    name: "MediaInfoReader",
    component: () => import("../tools/MediaInfoReader.vue"),
  },
  {
    path: "/text-diff",
    name: "TextDiff",
    component: () => import("../tools/TextDiff.vue"),
  },
  {
    path: "/json-formatter",
    name: "JsonFormatter",
    component: () => import("../tools/JsonFormatter.vue"),
  },
  {
    path: "/code-formatter", // 通用代码格式化，内部再区分语言
    name: "CodeFormatter",
    component: () => import("../tools/CodeFormatter.vue"),
  },
  {
    path: "/symlink-mover",
    name: "SymlinkMover",
    component: () => import("../tools/SymlinkMover.vue"),
  },
  {
    path: "/directory-tree",
    name: "DirectoryTree",
    component: () => import("../tools/directory-tree/DirectoryTree.vue"),
  },
  {
    path: "/api-tester",
    name: "ApiTester",
    component: () => import("../tools/api-tester/ApiTester.vue"),
  },
  {
    path: "/llm-proxy",
    name: "LlmProxy",
    component: () => import("../tools/llm-proxy/LlmProxy.vue"),
  },
  {
    path: "/git-analyzer",
    name: "GitAnalyzer",
    component: () => import("../tools/git-analyzer/GitAnalyzer.vue"),
  },
  {
    path: "/smart-ocr",
    name: "SmartOcr",
    component: () => import("../tools/smart-ocr/SmartOcr.vue"),
  },
  {
    path: "/settings",
    name: "Settings",
    component: () => import("../views/Settings.vue"),
  },
  {
    path: "/detached-window",
    name: "DetachedWindow",
    component: () => import("../views/DetachedWindowContainer.vue"),
  },
  {
    path: "/drag-indicator",
    name: "DragIndicator",
    component: () => import("../views/DragIndicator.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
