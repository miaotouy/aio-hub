import type { ToolConfig, ToolRegistry, ServiceMetadata } from "@/services/types";
import { markRaw } from "vue";
import { useCanvasStore } from "./stores/canvasStore";
import { Brush } from "@element-plus/icons-vue";
import { useCanvasStorage } from "./composables/useCanvasStorage";
import { GitInternalService } from "./services/GitInternalService";

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
   * 为 Agent 提供额外的上下文信息
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
      const dirtyFiles = canvasStore.dirtyFiles;

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
      const changesStr = dirtyFiles.size > 0 ? Array.from(dirtyFiles.keys()).map((f) => `- ${f}`).join("\n") : "None";

      return `Canvas Project: ${activeCanvas.metadata.name}
Entry File: ${activeCanvas.metadata.entryFile || "index.html"}

Project Files:
${fileListStr}

Uncommitted Changes: ${dirtyFiles.size} files
${changesStr}

(Agent notice: All changes are immediately written to disk and visible in preview. Use 'commit_changes' to create a Git checkpoint.)`;
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

    return content
      .split(/\r?\n/)
      .map((line: string, index: number) => `${String(index + 1).padStart(4, " ")} | ${line}`)
      .join("\n");
  }

  async apply_canvas_diff(args: { path: string; diff: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = await canvasStore.ensureActiveCanvas();

    await canvasStore.applyDiff(canvasId, args.path, args.diff);
    return `Successfully applied diff to ${args.path}`;
  }

  async write_canvas_file(args: { path: string; content: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = await canvasStore.ensureActiveCanvas();

    await canvasStore.writeFilePhysical(canvasId, args.path, args.content);
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
    await canvasStore.discardChanges(canvasId);
    return "Changes discarded.";
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
   * 重构后：直接写入物理文件，预览窗口自动刷新
   */
  async onToolCallPreview(requestId: string, methodName: string, args: Record<string, any>) {
    const canvasStore = useCanvasStore();

    if (methodName === "apply_canvas_diff" && args.path && args.diff) {
      const canvasId = await canvasStore.ensureActiveCanvas();
      await canvasStore.applyDiff(canvasId, args.path, args.diff);
      canvasStore.registerPreviewRequest(requestId, canvasId, [args.path]);
    }

    if (methodName === "write_canvas_file" && args.path && args.content) {
      const canvasId = await canvasStore.ensureActiveCanvas();
      await canvasStore.writeFilePhysical(canvasId, args.path, args.content);
      canvasStore.registerPreviewRequest(requestId, canvasId, [args.path]);
    }
  }

  /**
   * 用户拒绝工具调用后的清理钩子
   * 通过 git checkout 回退被拒绝的文件
   */
  async onToolCallDiscarded(requestId: string, _methodName: string, _args: Record<string, any>) {
    const canvasStore = useCanvasStore();
    const storage = useCanvasStorage();
    const request = canvasStore.getPreviewRequest(requestId);
    if (!request) return;

    const basePath = await storage.getCanvasBasePath(request.canvasId);
    const gitService = new GitInternalService(basePath);

    // 获取当前状态矩阵，判断是否是新文件
    const matrix = await gitService.statusMatrix();
    
    for (const filepath of request.affectedFiles) {
      const fileStatus = matrix?.find(([f]) => f === filepath);
      if (fileStatus && fileStatus[1] === 0) {
        // HEAD=0 表示新文件 (untracked)，checkout 不会删除，需要手动删除
        await storage.deletePhysicalFile(request.canvasId, filepath);
      } else {
        // 已存在的文件，回退到 HEAD
        await gitService.checkout([filepath]);
      }
    }

    canvasStore.removePreviewRequest(requestId);
    // 通知预览窗口刷新
    request.affectedFiles.forEach(f => canvasStore.emitFileChanged(request.canvasId, f));
    // 刷新 Git 状态
    await canvasStore.refreshGitStatus(request.canvasId);
  }
}

export default CanvasRegistry;
