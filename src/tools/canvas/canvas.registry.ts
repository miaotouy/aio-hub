import type { ToolConfig, ToolRegistry, ServiceMetadata } from "@/services/types";
import type { SettingItem } from "@/types/settings-renderer";
import { markRaw } from "vue";
import { Brush } from "@element-plus/icons-vue";
import { canvasAgentService } from "./services/CanvasAgentService";

export const toolConfig: ToolConfig = {
  name: "画布",
  path: "/canvas",
  icon: markRaw(Brush),
  component: () => import("./CanvasWorkbench.vue"),
  description: "Agent 协作画布，支持多文件编辑与实时预览",
  category: "AI 工具",
};

export class CanvasRegistry implements ToolRegistry {
  public readonly id = "canvas";
  public readonly name = "画布";
  public readonly description = "多文件协作与预览空间";

  public readonly settingsSchema: SettingItem[] = [
    {
      id: "canvas-bound-id",
      label: "绑定画布 ID",
      component: "ElInput",
      modelPath: "canvasId",
      hint: "输入要与此智能体绑定的画布 ID (在画布工具中查看)",
      keywords: "画布 绑定 协作 ID canvas",
      defaultValue: "",
      props: {
        clearable: true,
        placeholder: "输入画布 ID",
      },
    },
    {
      id: "canvas-max-runtime-errors",
      label: "最大运行时错误数",
      component: "ElInputNumber",
      modelPath: "config.maxRuntimeErrors",
      hint: "上下文中包含的最大错误数量（值越大消耗 token 越多）",
      keywords: "画布 错误 限制 runtime errors",
      defaultValue: 10,
      props: { min: 0, max: 50, step: 1 },
    },
    {
      id: "canvas-auto-include-errors",
      label: "自动包含运行时错误",
      component: "ElSwitch",
      modelPath: "config.autoIncludeErrors",
      hint: "启用后，预览中的运行时错误将自动包含在 Agent 上下文中",
      keywords: "画布 错误 上下文 runtime errors context",
      defaultValue: true,
    },
  ];

  /**
   * 为 Agent 提供额外的上下文信息
   */
  async getExtraPromptContext(): Promise<string> {
    return await canvasAgentService.getExtraPromptContext();
  }
  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "read_canvas_file",
          displayName: "读取画布文件",
          description: "读取画布文件内容（带行号）",
          parameters: [{ name: "path", type: "string", required: true, description: "文件路径" }],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "apply_canvas_diff",
          displayName: "应用 Diff",
          description: "使用 Search/Replace 块模式修改画布文件",
          parameters: [
            { name: "path", type: "string", required: true, description: "文件路径" },
            {
              name: "search",
              type: "string",
              required: true,
              description: "要查找的代码块（必须与原文件内容逻辑一致）",
            },
            { name: "replace", type: "string", required: true, description: "要替换成的代码块" },
            {
              name: "start_line",
              type: "number",
              required: false,
              description: "搜索起始行号提示（1-based），用于缩小搜索范围和重复消歧义",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "write_canvas_file",
          displayName: "写入文件",
          description: "全量覆盖画布文件内容",
          parameters: [
            { name: "path", type: "string", required: true, description: "文件路径" },
            { name: "content", type: "string", required: true, description: "文件内容" },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "commit_changes",
          displayName: "提交更改",
          description: "提交所有待定更改到物理磁盘并创建 Git 提交",
          parameters: [{ name: "message", type: "string", required: false, description: "提交说明" }],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "discard_changes",
          displayName: "丢弃更改",
          description: "丢弃所有未提交的更改",
          parameters: [],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "list_canvas_files",
          displayName: "列出文件",
          description: "获取画布的文件树",
          parameters: [],
          returnType: "Promise<any>",
          agentCallable: true,
        },
        {
          name: "create_canvas",
          displayName: "创建画布",
          description: "创建一个新的画布项目",
          parameters: [
            { name: "title", type: "string", required: true, description: "画布标题" },
            { name: "templateId", type: "string", required: false, description: "模板 ID (如 blank-html, blank)" },
          ],
          returnType: "Promise<any>",
          agentCallable: true,
        },
        {
          name: "open_window",
          displayName: "打开预览窗",
          description: "打开或聚焦画布的独立预览窗口",
          parameters: [{ name: "canvasId", type: "string", required: true, description: "画布 ID" }],
          returnType: "Promise<void>",
          agentCallable: false,
        },
        {
          name: "clear_runtime_errors",
          displayName: "清空运行时错误",
          description: "清空当前预览中的运行时错误列表",
          parameters: [{ name: "canvasId", type: "string", required: false, description: "画布 ID" }],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  }

  // ==================== Agent Callable Methods ====================

  async read_canvas_file(args: { path: string; canvasId?: string }): Promise<string> {
    return await canvasAgentService.readFileWithLineNumbers(args.path, args.canvasId);
  }

  async apply_canvas_diff(args: {
    path: string;
    search: string;
    replace: string;
    start_line?: number;
    canvasId?: string;
  }): Promise<string> {
    return await canvasAgentService.applyDiff(args);
  }

  async write_canvas_file(args: { path: string; content: string; canvasId?: string }): Promise<string> {
    return await canvasAgentService.writeFile(args);
  }

  async commit_changes(args: { message?: string; canvasId?: string }): Promise<string> {
    return await canvasAgentService.commitChanges(args);
  }

  async discard_changes(args: { canvasId?: string }): Promise<string> {
    return await canvasAgentService.discardChanges(args);
  }

  async list_canvas_files(args: { canvasId?: string }): Promise<any> {
    return await canvasAgentService.listFiles(args);
  }

  async create_canvas(args: { title: string; templateId?: string }): Promise<any> {
    return await canvasAgentService.createCanvas(args);
  }

  async open_window(args: { canvasId: string }): Promise<void> {
    // open_window 是非 Agent Callable 的内部方法，直接调用 store 即可
    // 但为了保持一致性，我们也可以通过 Service 暴露，或者保留简单的 store 调用
    const { useCanvasStore } = await import("./stores/canvasStore");
    const canvasStore = useCanvasStore();
    await canvasStore.openPreviewWindow(args.canvasId);
  }

  async clear_runtime_errors(args: { canvasId?: string }): Promise<string> {
    return await canvasAgentService.clearRuntimeErrors(args);
  }

  // ==================== Approval System Hooks ====================

  /**
   * 工具调用进入审批挂起前的预览钩子
   */
  async onToolCallPreview(requestId: string, methodName: string, args: Record<string, any>) {
    return await canvasAgentService.onToolCallPreview(requestId, methodName, args);
  }

  /**
   * 用户拒绝工具调用后的清理钩子
   */
  async onToolCallDiscarded(requestId: string, _methodName: string, _args: Record<string, any>) {
    return await canvasAgentService.onToolCallDiscarded(requestId);
  }
}

export default CanvasRegistry;
