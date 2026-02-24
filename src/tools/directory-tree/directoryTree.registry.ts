import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { SettingItem } from "@/types/settings-renderer";
import { markRaw } from "vue";
import DirectoryTreeIcon from "@/components/icons/DirectoryTreeIcon.vue";
import { generateTree, type GenerateTreeOptions, type TreeGenerationResult } from './actions';

/**
 * 目录树工具注册器
 *
 * 仅作为 ToolRegistry 接口的适配器，用于向 LLM 暴露核心功能。
 * 具体的业务逻辑和 UI 交互应直接使用 actions.ts 中的函数。
 */
export default class DirectoryTreeRegistry implements ToolRegistry {
  public readonly id = "directory-tree";
  public readonly name = "目录结构浏览器";
  public readonly description = "生成目录树结构，支持过滤规则和深度限制";
  public readonly settingsSchema: SettingItem[] = [
    {
      id: "dt-show-files",
      label: "显示文件",
      component: "ElSwitch",
      modelPath: "showFiles",
      hint: "是否在树中显示文件",
      keywords: "显示 文件",
      defaultValue: true,
    },
    {
      id: "dt-show-hidden",
      label: "显示隐藏项目",
      component: "ElSwitch",
      modelPath: "showHidden",
      hint: "是否显示隐藏文件和目录",
      keywords: "隐藏 隐藏文件",
      defaultValue: false,
    },
    {
      id: "dt-max-depth",
      label: "最大深度",
      component: "ElInputNumber",
      modelPath: "maxDepth",
      hint: "目录树的最大深度（0 表示无限制）",
      keywords: "深度 层级",
      defaultValue: 5,
      props: {
        min: 0,
        max: 10,
      },
    },
    {
      id: "dt-filter-mode",
      label: "过滤模式",
      component: "ElSelect",
      modelPath: "filterMode",
      hint: "选择过滤规则的应用方式",
      keywords: "过滤 规则 gitignore",
      defaultValue: "none",
      props: {
        options: [
          { label: "不过滤", value: "none" },
          { label: "使用 .gitignore", value: "gitignore" },
          { label: "自定义规则", value: "custom" },
          { label: "两者同时使用", value: "both" },
        ],
      },
    },
    {
      id: "dt-include-metadata",
      label: "包含元数据",
      component: "ElSwitch",
      modelPath: "includeMetadata",
      hint: "是否在输出中包含统计信息",
      keywords: "元数据 统计",
      defaultValue: false,
    },
  ];

  /**
   * 生成目录树（Agent facade）
   *
   * 接收扁平化的 Record<string, string> 参数，内部转换为 GenerateTreeOptions。
   */
  public async generateTree(args: Record<string, unknown>): Promise<TreeGenerationResult> {
    const options: GenerateTreeOptions = {
      path: String(args.path || ""),
      showFiles: args.showFiles !== false && args.showFiles !== "false",
      showHidden: args.showHidden === true || args.showHidden === "true",
      maxDepth: args.maxDepth !== undefined ? Number(args.maxDepth) : 5,
      filterMode: (args.filterMode as GenerateTreeOptions["filterMode"]) || "none",
      customPattern: String(args.customPattern || ""),
      includeMetadata: args.includeMetadata === true || args.includeMetadata === "true",
    };
    return await generateTree(options);
  }

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'generateTree',
          displayName: '生成目录树',
          description: '根据配置选项生成目录树结构',
          agentCallable: true,
          parameters: [
            {
              name: 'path',
              type: 'string',
              uiHint: 'directory',
              description: '要分析的目标目录路径',
              required: true,
            },
            {
              name: 'showFiles',
              type: 'boolean',
              description: '是否在树中显示文件（仅显示目录结构则设为 false）',
              required: false,
              defaultValue: true,
            },
            {
              name: 'showHidden',
              type: 'boolean',
              description: '是否显示隐藏文件和目录',
              required: false,
              defaultValue: false,
            },
            {
              name: 'showSize',
              type: 'boolean',
              description: '是否显示文件大小信息',
              required: false,
              defaultValue: false,
            },
            {
              name: 'showDirSize',
              type: 'boolean',
              description: '是否显示目录大小信息',
              required: false,
              defaultValue: false,
            },
            {
              name: 'maxDepth',
              type: 'number',
              description: '目录树的最大深度（0 表示无限制，10 也表示无限制）',
              required: false,
              defaultValue: 5,
            },
            {
              name: 'filterMode',
              type: "'none' | 'gitignore' | 'custom' | 'both'",
              description: '过滤模式：none-不过滤，gitignore-使用.gitignore规则，custom-自定义规则，both-同时使用两者',
              required: false,
              defaultValue: 'none',
            },
            {
              name: 'customPattern',
              type: 'string',
              description: '自定义过滤规则（当 filterMode 为 custom 或 both 时使用，支持 glob 模式）',
              required: false,
            },
            {
              name: 'includeMetadata',
              type: 'boolean',
              description: '是否在输出中包含统计信息和配置元数据',
              required: false,
              defaultValue: false,
            },
          ],
          returnType: 'Promise<TreeGenerationResult>',
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '目录结构浏览器',
  path: '/directory-tree',
  icon: markRaw(DirectoryTreeIcon),
  component: () => import('./DirectoryTree.vue'),
  description: '生成目录树结构，支持过滤规则和深度限制',
  category: '文件管理'
};