/**
 * AIO Hub Plugin UI Components
 *
 * 这个文件自动汇总所有暴露给插件使用的 UI 组件。
 */

import { defineAsyncComponent, type Component } from "vue";

// --- 1. 自动扫描通用组件 (src/components/common/*.vue) ---
const commonModules = import.meta.glob<Record<string, any>>("../components/common/*.vue", { eager: true });
const commonComponents: Record<string, Component> = {};

for (const path in commonModules) {
  const fileName = path.split("/").pop()?.replace(".vue", "");
  if (fileName) {
    commonComponents[fileName] = commonModules[path].default;
  }
}

// --- 2. 自动扫描工具组件 (通过 registry.ts 注册的组件) ---
const toolRegistryModules = import.meta.glob<Record<string, any>>("../tools/**/*.registry.ts", { eager: true });
const toolComponents: Record<string, Component> = {};

for (const path in toolRegistryModules) {
  const module = toolRegistryModules[path];
  if (module.toolConfig && module.toolConfig.component) {
    const componentLoader = module.toolConfig.component;

    // 从目录名推断组件名称 (例如 rich-text-renderer -> RichTextRenderer)
    const dirName = path.split("/").slice(-2, -1)[0];
    const componentName = dirName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");

    toolComponents[componentName] =
      typeof componentLoader === "function" ? defineAsyncComponent(componentLoader) : componentLoader;
  }
}

// --- 3. 手动补充或重写 ---
const manualComponents: Record<string, Component> = {
  // 如果有特殊的映射需求，可以在这里定义
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
