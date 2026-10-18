// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { defineAsyncComponent, type Component } from "vue";

export interface SettingsModule {
  id: string;
  title: string;
  component?: Component;
}

export interface SettingsPage {
  id: string;
  title: string;
  description: string;
  groupId: string;
  moduleIds: string[];
  layout?: "workspace";
}

export interface SettingsGroup {
  id: string;
  title: string;
  pageIds: string[];
}

export const settingsModules: SettingsModule[] = [
  {
    id: "general",
    title: "通用设置",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/GeneralSettings.vue")
    ),
  },
  {
    id: "theme-colors",
    title: "主题色配置",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/ThemeColorSettings.vue")
    ),
  },
  {
    id: "theme-appearance",
    title: "主题壁纸外观",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/ThemeAppearanceSettings.vue")
    ),
  },
  {
    id: "css-override",
    title: "CSS 样式覆盖",
    component: defineAsyncComponent(
      () => import("../views/Settings/css/CssOverrideSettings.vue")
    ),
  },
  {
    id: "llm-service",
    title: "AI 服务配置",
    component: defineAsyncComponent(
      () => import("../views/Settings/llm-service/LlmServiceSettings.vue")
    ),
  },
  {
    id: "model-metadata",
    title: "AI 模型元数据配置",
    component: defineAsyncComponent(
      () => import("../views/Settings/model-metadata/ModelMetadataSettings.vue")
    ),
  },
  {
    id: "ocr-service",
    title: "云端 OCR 服务",
    component: defineAsyncComponent(
      () => import("../views/Settings/ocr-service/OcrServiceSettings.vue")
    ),
  },
  {
    id: "asset-management",
    title: "资产管理",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/AssetSettings.vue")
    ),
  },
  {
    id: "startup",
    title: "启动项管理",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/StartupSettings.vue")
    ),
  },
  {
    id: "environment",
    title: "运行环境",
    component: defineAsyncComponent(
      () => import("../views/Settings/environment/EnvironmentSettings.vue")
    ),
  },
  {
    id: "tools",
    title: "工具模块",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/ToolsSettings.vue")
    ),
  },
  {
    id: "log-settings",
    title: "日志配置",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/LogSettings.vue")
    ),
  },
  {
    id: "language",
    title: "语言设置",
    component: defineAsyncComponent(
      () => import("../views/Settings/general/LanguageSettings.vue")
    ),
  },
  {
    id: "about",
    title: "关于",
    component: defineAsyncComponent(
      () => import("../views/Settings/about/AboutSettings.vue")
    ),
  },
];

export const settingsGroups: SettingsGroup[] = [
  { id: "general", title: "通用", pageIds: ["general", "storage"] },
  { id: "appearance", title: "外观", pageIds: ["appearance", "css-override"] },
  {
    id: "ai-service",
    title: "AI 服务",
    pageIds: ["llm-service", "model-metadata", "ocr-service"],
  },
  {
    id: "tools-environment",
    title: "工具与环境",
    pageIds: ["tools", "environment"],
  },
  {
    id: "advanced",
    title: "高级与维护",
    pageIds: ["log-settings", "about"],
  },
];

export const settingsPages: SettingsPage[] = [
  {
    id: "general",
    title: "常用设置",
    description: "配置应用行为、窗口、网络、下载、启动项和语言。",
    groupId: "general",
    moduleIds: ["general", "startup", "language"],
  },
  {
    id: "storage",
    title: "数据与存储",
    description: "管理附件、图片等应用资产的存储位置。",
    groupId: "general",
    moduleIds: ["asset-management"],
  },
  {
    id: "appearance",
    title: "主题与界面",
    description: "调整主题色、壁纸、透明度、模糊和窗口效果。",
    groupId: "appearance",
    moduleIds: ["theme-colors", "theme-appearance"],
  },
  {
    id: "css-override",
    title: "样式覆盖",
    description: "使用 CSS 预设或自定义样式调整应用界面。",
    groupId: "appearance",
    moduleIds: ["css-override"],
    layout: "workspace",
  },
  {
    id: "llm-service",
    title: "AI 渠道",
    description: "管理模型渠道、密钥、端点和请求策略。",
    groupId: "ai-service",
    moduleIds: ["llm-service"],
    layout: "workspace",
  },
  {
    id: "model-metadata",
    title: "模型元数据",
    description: "维护模型能力、匹配规则和媒体生成参数。",
    groupId: "ai-service",
    moduleIds: ["model-metadata"],
    layout: "workspace",
  },
  {
    id: "ocr-service",
    title: "OCR 服务",
    description: "配置云端 OCR 服务和请求参数。",
    groupId: "ai-service",
    moduleIds: ["ocr-service"],
    layout: "workspace",
  },
  {
    id: "tools",
    title: "工具模块",
    description: "管理工具显示状态和工作区中的工具入口。",
    groupId: "tools-environment",
    moduleIds: ["tools"],
  },
  {
    id: "environment",
    title: "运行环境",
    description: "配置外部依赖和工具使用的默认执行路径。",
    groupId: "tools-environment",
    moduleIds: ["environment"],
  },
  {
    id: "log-settings",
    title: "日志",
    description: "配置日志输出、文件保留和日志操作。",
    groupId: "advanced",
    moduleIds: ["log-settings"],
  },
  {
    id: "about",
    title: "关于与更新",
    description: "查看版本信息、更新状态和项目相关信息。",
    groupId: "advanced",
    moduleIds: ["about"],
  },
];

const settingsPageIds = new Set(settingsPages.map((page) => page.id));
const settingsPageById = new Map(settingsPages.map((page) => [page.id, page]));
const settingsModuleToPage = new Map(
  settingsPages.flatMap((page) =>
    page.moduleIds.map((moduleId) => [moduleId, page.id] as const)
  )
);

export function resolveSettingsPageId(sectionId?: string): string {
  if (sectionId && settingsPageIds.has(sectionId)) {
    return sectionId;
  }

  return settingsModuleToPage.get(sectionId || "") || settingsPages[0].id;
}

export function getSettingsPage(pageId: string): SettingsPage {
  return (
    settingsPageById.get(resolveSettingsPageId(pageId)) || settingsPages[0]
  );
}

export function getSettingsModule(
  moduleId: string
): SettingsModule | undefined {
  return settingsModules.find((module) => module.id === moduleId);
}
