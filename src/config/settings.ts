import { defineAsyncComponent, type Component } from "vue";

export interface SettingsModule {
  id: string;
  title: string;
  component?: Component;
  minHeight?: string; // 动态组件的最小高度，例如 "800px" 或 "auto"
}

export const settingsModules: SettingsModule[] = [
  {
    id: "general",
    title: "通用设置",
  },
  {
    id: "theme-colors",
    title: "主题色配置",
    component: defineAsyncComponent(() => import("../views/components/ThemeColorSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "css-override",
    title: "CSS 样式覆盖",
    component: defineAsyncComponent(() => import("../views/components/CssOverrideSettings.vue")),
    minHeight: "800px",
  },
  {
    id: "tools",
    title: "工具模块",
    component: defineAsyncComponent(() => import("../views/components/ToolsSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "asset-management",
    title: "资产管理",
    component: defineAsyncComponent(() => import("../views/components/AssetSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "log-settings",
    title: "日志配置",
    component: defineAsyncComponent(() => import("../views/components/LogSettings.vue")),
    minHeight: "600px",
  },
  {
    id: "ocr-service",
    title: "云端 OCR 服务",
    component: defineAsyncComponent(() => import("../views/components/OcrServiceSettings.vue")),
    minHeight: "500px",
  },
  {
    id: "llm-service",
    title: "LLM 服务配置",
    component: defineAsyncComponent(() => import("../views/components/LlmServiceSettings.vue")),
    minHeight: "500px",
  },
  {
    id: "user-profiles",
    title: "用户档案管理",
    component: defineAsyncComponent(() => import("../views/components/UserProfileSettings.vue")),
    minHeight: "600px",
  },
  {
    id: "model-icons",
    title: "模型图标配置",
    component: defineAsyncComponent(() => import("../views/components/ModelIconSettings.vue")),
    minHeight: "800px",
  },
  {
    id: "about",
    title: "关于",
    component: defineAsyncComponent(() => import("../views/components/AboutSettings.vue")),
    minHeight: "900px",
  },
];
