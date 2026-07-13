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

/**
 * AIO Hub Plugin UI Components
 *
 * 这个文件自动汇总所有暴露给插件使用的 UI 组件。
 */

import { defineAsyncComponent, type Component } from "vue";

type ComponentModule = { default: Component };
type ToolRegistryModule = {
  toolConfig?: {
    component?: () => Promise<ComponentModule | Component>;
  };
};

const unwrapComponent = (moduleOrComponent: ComponentModule | Component) =>
  "default" in moduleOrComponent
    ? moduleOrComponent.default
    : moduleOrComponent;

// --- 1. 自动扫描通用组件 (src/components/common/*.vue) ---
const commonModules = import.meta.glob<ComponentModule>(
  "../components/common/*.vue"
);
const commonComponents: Record<string, Component> = {};

for (const path in commonModules) {
  const fileName = path.split("/").pop()?.replace(".vue", "");
  if (fileName) {
    commonComponents[fileName] = defineAsyncComponent(async () =>
      unwrapComponent(await commonModules[path]())
    );
  }
}

// --- 2. 自动扫描工具组件 (通过 registry.ts 注册的组件) ---
const toolRegistryModules = import.meta.glob<ToolRegistryModule>(
  "../tools/**/*.registry.ts"
);
const toolComponents: Record<string, Component> = {};

for (const path in toolRegistryModules) {
  // 从目录名推断组件名称 (例如 rich-text-renderer -> RichTextRenderer)
  const dirName = path.split("/").slice(-2, -1)[0];
  const componentName = dirName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  toolComponents[componentName] = defineAsyncComponent(async () => {
    const module = await toolRegistryModules[path]();
    const componentLoader = module.toolConfig?.component;
    if (!componentLoader) {
      throw new Error(`Tool registry has no component export: ${path}`);
    }

    return unwrapComponent(await componentLoader());
  });
}

// --- 3. 手动补充或重写 ---
const manualComponents: Record<string, Component> = {
  // 修正 RichTextRenderer 的指向，registry 中注册的是测试器，插件需要的是渲染器本体
  RichTextRenderer: defineAsyncComponent(
    () => import("../tools/rich-text-renderer/RichTextRenderer.vue")
  ),
};

// 汇总所有组件 Map，供插件 SDK 动态查询
export const components: Record<string, any> = {
  ...commonComponents,
  ...toolComponents,
  ...manualComponents,
};

/**
 * 命名导出常用的 UI 组件，以支持插件中的解构导入：
 * import { Avatar, BaseDialog } from "aiohub-ui";
 *
 * 注意：这里的导出名称必须与 components 对象中的 Key 一致。
 */
export const Avatar = components.Avatar;
export const BaseDialog = components.BaseDialog;
export const InfoCard = components.InfoCard;
export const FileIcon = components.FileIcon;
export const RichTextRenderer = components.RichTextRenderer;
export const AudioPlayer = components.AudioPlayer;
export const VideoPlayer = components.VideoPlayer;
export const RichCodeEditor = components.RichCodeEditor;
export const DraggablePanel = components.DraggablePanel;
export const DropZone = components.DropZone;
export const DynamicIcon = components.DynamicIcon;
