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
    component: defineAsyncComponent(() => import("../views/Settings/general/GeneralSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "theme-colors",
    title: "主题色配置",
    component: defineAsyncComponent(() => import("../views/Settings/general/ThemeColorSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "theme-appearance",
    title: "主题壁纸外观",
    component: defineAsyncComponent(() => import("../views/Settings/general/ThemeAppearanceSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "css-override",
    title: "CSS 样式覆盖",
    component: defineAsyncComponent(() => import("../views/Settings/css/CssOverrideSettings.vue")),
    minHeight: "800px",
  },
  {
    id: "tools",
    title: "工具模块",
    component: defineAsyncComponent(() => import("../views/Settings/general/ToolsSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "asset-management",
    title: "资产管理",
    component: defineAsyncComponent(() => import("../views/Settings/general/AssetSettings.vue")),
    minHeight: "auto",
  },
  {
    id: "log-settings",
    title: "日志配置",
    component: defineAsyncComponent(() => import("../views/Settings/general/LogSettings.vue")),
    minHeight: "600px",
  },
  {
    id: "ocr-service",
    title: "云端 OCR 服务",
    component: defineAsyncComponent(() => import("../views/Settings/ocr-service/OcrServiceSettings.vue")),
    minHeight: "500px",
  },
  {
    id: "llm-service",
    title: "LLM 服务配置",
    component: defineAsyncComponent(() => import("../views/Settings/llm-service/LlmServiceSettings.vue")),
    minHeight: "500px",
  },
  {
    id: "user-profiles",
    title: "用户档案管理",
    component: defineAsyncComponent(() => import("../views/Settings/user-profile/UserProfileSettings.vue")),
    minHeight: "600px",
  },
  {
    id: "model-metadata",
    title: "模型元数据配置",
    component: defineAsyncComponent(() => import("../views/Settings/model-metadata/ModelMetadataSettings.vue")),
    minHeight: "800px",
  },
  {
    id: "about",
    title: "关于",
    component: defineAsyncComponent(() => import("../views/Settings/about/AboutSettings.vue")),
    minHeight: "900px",
  },
];
