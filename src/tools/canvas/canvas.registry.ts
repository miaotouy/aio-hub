import type { ToolConfig, ToolRegistry, ServiceMetadata } from "@/services/types";
import { markRaw } from "vue";
import { useCanvasStore } from "./stores/canvasStore";
import { Brush } from "@element-plus/icons-vue";

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

  /**
   * 为 Agent 提供额外的上下文信息（当前画布的文件树和待定更改）
   */
  async getExtraPromptContext(): Promise<string> {
    let canvasStore;
    try {
      canvasStore = useCanvasStore();
    } catch {
      return "";
    }

    const canvasId = canvasStore.activeCanvasId;
    if (!canvasId) return "";

    const activeCanvas = canvasStore.activeCanvas;
    if (!activeCanvas) return "";

    try {
      const fileTree = await canvasStore.getFileTree(canvasId);
      const pendingFiles = Object.keys(canvasStore.activePendingUpdates);

      const buildFileList = (nodes: any[], indent = ""): string => {
        return nodes
          .map((node) => {
            const statusTag =
              node.status === "modified"
                ? " (modified)"
                : node.status === "new"
                  ? " (new)"
                  : node.status === "deleted"
                    ? " (deleted)"
                    : "";
            if (node.isDirectory) {
              const children = node.children ? buildFileList(node.children, indent + "  ") : "";
              return `${indent}- ${node.name}/${children ? "\n" + children : ""}`;
            }
            return `${indent}- ${node.name}${statusTag}`;
          })
          .join("\n");
      };

      const fileListStr = buildFileList(fileTree);
      const changesStr = pendingFiles.length > 0 ? pendingFiles.map((f) => `- ${f}`).join("\n") : "None";

      return `Canvas Project: ${activeCanvas.metadata.name}
Entry File: ${activeCanvas.metadata.entryFile || "index.html"}

Project Files:
${fileListStr}

Uncommitted Changes: ${pendingFiles.length} files
${changesStr}

(Agent notice: These changes are only in memory. Use 'commit_changes' to save them to disk.)`;
    } catch (error) {
      return "";
    }
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
            { name: "diff", type: "string", required: true, description: "Diff 内容" },
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
          name: "undo_canvas_diff",
          displayName: "撤销 Diff",
          description: "撤回上一次内存修改",
          parameters: [],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  }

  // ==================== Agent Callable Methods ====================

  async read_canvas_file(args: { path: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = canvasStore.activeCanvasId;
    if (!canvasId) throw new Error("No active canvas. Please open or create a canvas first.");

    const content = await canvasStore.readCanvasFileAsync(canvasId, args.path);
    if (content === null) throw new Error(`File not found: ${args.path}`);

    // 为内容添加行号
    return content
      .split(/\r?\n/)
      .map((line: string, index: number) => `${String(index + 1).padStart(4, " ")} | ${line}`)
      .join("\n");
  }

  async apply_canvas_diff(args: { path: string; diff: string }, requestId?: string): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = await canvasStore.ensureActiveCanvas();

    // 如果 preview 阶段已经写入了，直接确认即可
    if (requestId && canvasStore.previewSnapshots[requestId]) {
      delete canvasStore.previewSnapshots[requestId];
      return `Successfully applied diff to ${args.path} (confirmed from preview)`;
    }

    await canvasStore.applyDiff(canvasId, args.path, args.diff);
    return `Successfully applied diff to ${args.path}`;
  }

  async write_canvas_file(args: { path: string; content: string }, requestId?: string): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = await canvasStore.ensureActiveCanvas();

    // 如果 preview 阶段已经写入了，直接确认即可
    if (requestId && canvasStore.previewSnapshots[requestId]) {
      delete canvasStore.previewSnapshots[requestId];
      return `Successfully wrote to ${args.path} (confirmed from preview)`;
    }

    canvasStore.writeFile(canvasId, args.path, args.content);
    return `Successfully wrote to ${args.path}`;
  }

  async commit_changes(args: { message?: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = canvasStore.activeCanvasId;
    if (!canvasId) throw new Error("No active canvas to commit.");
    await canvasStore.commitChanges(canvasId, args.message);
    return "Changes committed successfully.";
  }

  async discard_changes(): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = canvasStore.activeCanvasId;
    if (!canvasId) return "No active canvas.";
    canvasStore.discardChanges(canvasId);
    return "Changes discarded.";
  }

  async undo_canvas_diff(): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = canvasStore.activeCanvasId;
    if (!canvasId) return "No active canvas.";
    canvasStore.undoDiff(canvasId);
    return "Last change undone.";
  }

  async list_canvas_files(): Promise<any> {
    const canvasStore = useCanvasStore();
    const canvasId = canvasStore.activeCanvasId;
    if (!canvasId) return [];
    return await canvasStore.getFileTree(canvasId);
  }

  // ==================== Approval System Hooks ====================

  /**
   * 工具调用进入审批挂起前的预览钩子
   * 将修改临时写入影子文件，用户可在画布窗口即时预览效果
   */
  async onToolCallPreview(requestId: string, methodName: string, args: Record<string, any>) {
    const canvasStore = useCanvasStore();

    if (methodName === "apply_canvas_diff" && args.path && args.diff) {
      const canvasId = await canvasStore.ensureActiveCanvas();
      await canvasStore.applyDiffAsPreview(canvasId, args.path, args.diff, requestId);
    }

    if (methodName === "write_canvas_file" && args.path && args.content) {
      const canvasId = await canvasStore.ensureActiveCanvas();
      await canvasStore.writeFileAsPreview(canvasId, args.path, args.content, requestId);
    }
  }

  /**
   * 用户拒绝工具调用后的清理钩子
   * 从影子文件中撤回预览数据
   */
  async onToolCallDiscarded(requestId: string, _methodName: string, _args: Record<string, any>) {
    const canvasStore = useCanvasStore();
    canvasStore.revertPreview(requestId);
  }
}

export default CanvasRegistry;
