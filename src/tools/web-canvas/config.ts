import { h } from "vue";
import { Settings2, Monitor, Type, AlertCircle, Scan } from "lucide-vue-next";
import type { SettingsSection } from "@/types/settings-renderer";
import type { CanvasConfig } from "./types/config";

/**
 * 默认 Canvas 配置
 */
export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  maxRuntimeErrors: 10,
  autoIncludeErrors: true,
  autoOpenPreview: true,
  previewRefreshDelay: 500,
  fontSize: 14,
  wordWrap: "on",
  defaultTemplate: "blank-html",
  vscodePath: "",
};

/**
 * Canvas 设置界面配置
 */
export const canvasSettingsConfig: SettingsSection<CanvasConfig>[] = [
  {
    title: "预览与行为",
    icon: Monitor,
    items: [
      {
        id: "autoOpenPreview",
        label: "自动打开预览",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "autoOpenPreview",
        hint: "创建或打开项目后，自动开启独立预览窗口",
        keywords: "auto open preview 自动 预览",
      },
      {
        id: "previewRefreshDelay",
        label: "预览刷新延迟 ({{ localSettings.previewRefreshDelay }}ms)",
        component: "SliderWithInput",
        props: { min: 100, max: 3000, step: 100 },
        modelPath: "previewRefreshDelay",
        hint: "文件保存后，等待多久刷新预览界面",
        keywords: "refresh delay 刷新 延迟",
      },
    ],
  },
  {
    title: "Agent 协作",
    icon: AlertCircle,
    items: [
      {
        id: "autoIncludeErrors",
        label: "自动包含运行时错误",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "autoIncludeErrors",
        hint: "启用后，预览中的运行时错误将自动包含在 Agent 上下文中",
        keywords: "auto include errors 自动 错误 上下文",
      },
      {
        id: "maxRuntimeErrors",
        label: "最大运行时错误数 ({{ localSettings.maxRuntimeErrors }})",
        component: "SliderWithInput",
        props: { min: 0, max: 50, step: 1 },
        modelPath: "maxRuntimeErrors",
        hint: "上下文中包含的最大错误数量（值越大消耗 token 越多）",
        keywords: "max runtime errors 错误 限制",
        visible: (s) => s.autoIncludeErrors,
      },
    ],
  },
  {
    title: "编辑器设置",
    icon: Type,
    items: [
      {
        id: "fontSize",
        label: "字体大小 ({{ localSettings.fontSize }}px)",
        component: "SliderWithInput",
        props: { min: 10, max: 30, step: 1 },
        modelPath: "fontSize",
        hint: "代码编辑器的字体大小",
        keywords: "font size 字体 大小",
      },
      {
        id: "wordWrap",
        label: "自动换行",
        component: "ElSelect",
        props: {
          options: [
            { label: "开启", value: "on" },
            { label: "关闭", value: "off" },
          ],
        },
        modelPath: "wordWrap",
        hint: "编辑器是否自动换行",
        keywords: "word wrap 换行",
      },
    ],
  },
  {
    title: "外部编辑器",
    icon: Settings2,
    items: [
      {
        id: "vscodePath",
        label: "VSCode 路径",
        component: "ElInput",
        modelPath: "vscodePath",
        hint: "用于在外部编辑器中打开项目。通常为 code.exe 或 code.cmd 的完整路径",
        keywords: "vscode path 路径 编辑器",
        props: {
          placeholder: "请输入 VSCode 可执行文件路径",
          clearable: true,
        },
        action: "scan-vscode",
        slots: {
          append: () => h(Scan, { size: 16 }),
        },
      },
    ],
  },
  {
    title: "项目管理",
    icon: Settings2,
    items: [
      {
        id: "defaultTemplate",
        label: "默认项目模板",
        component: "ElInput",
        modelPath: "defaultTemplate",
        hint: "创建新项目时预选的模板 ID",
        keywords: "default template 默认 模板",
      },
    ],
  },
];
