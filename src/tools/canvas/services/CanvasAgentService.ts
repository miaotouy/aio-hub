import { useCanvasStore } from "../stores/canvasStore";
import { useCanvasStorage } from "../composables/useCanvasStorage";
import { GitInternalService } from "./GitInternalService";
import type { DiffResult } from "../types/diff";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/AgentService");

/**
 * 处理 Canvas 与 Agent 交互的核心逻辑
 * 包括 Prompt 生成、文件操作格式化、审批钩子处理等
 */
export class CanvasAgentService {
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
      const changesStr =
        dirtyFiles.size > 0
          ? Array.from(dirtyFiles.keys())
              .map((f) => `- ${f}`)
              .join("\n")
          : "None";

      let context = `Canvas Project: ${activeCanvas.metadata.name}
Entry File: ${activeCanvas.metadata.entryFile || "index.html"}

Project Files:
${fileListStr}

Uncommitted Changes: ${dirtyFiles.size} files
${changesStr}`;

      // 注入运行时错误信息
      if (canvasStore.config.autoIncludeErrors) {
        const errorContext = canvasStore.getFormattedErrorContext(canvasId, canvasStore.config.maxRuntimeErrors);
        if (errorContext) {
          context += `\n\n--- RUNTIME ERRORS ---\n${errorContext}\n----------------------`;
        }
      }

      context += `\n\n(Agent notice: All changes are immediately written to disk and visible in preview. Use 'commit_changes' to create a Git checkpoint.)`;

      return context;
    } catch (error) {
      logger.error("获取 Agent 上下文失败", error);
      return "";
    }
  }

  /**
   * 读取文件内容并添加行号
   */
  async readFileWithLineNumbers(path: string, canvasId?: string): Promise<string> {
    const canvasStore = useCanvasStore();
    const id = canvasId || canvasStore.activeCanvasId;
    if (!id) throw new Error("No active canvas. Please open or create a canvas first.");

    const content = await canvasStore.readCanvasFileAsync(id, path);
    if (content === null) throw new Error(`File not found: ${path}`);

    return content
      .split(/\r?\n/)
      .map((line: string, index: number) => `${String(index + 1).padStart(4, " ")} | ${line}`)
      .join("\n");
  }

  /**
   * 应用 Diff 并返回格式化反馈
   */
  async applyDiff(args: {
    path: string;
    search: string;
    replace: string;
    start_line?: number;
    canvasId?: string;
  }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = args.canvasId || (await canvasStore.ensureActiveCanvas());

    const result = (await canvasStore.applyDiff(
      canvasId,
      args.path,
      args.search,
      args.replace,
      args.start_line,
    )) as DiffResult;

    return this.formatDiffFeedback(result, args.path);
  }

  /**
   * 格式化 Diff 反馈信息
   */
  private formatDiffFeedback(result: DiffResult, filepath: string): string {
    const parts = [`Applied diff to ${filepath}`];

    if (result.strategy !== "exact") {
      const strategyLabels: Record<string, string> = {
        exact: "exact match",
        trimEnd: "matched after trimming trailing whitespace",
        trim: "matched after trimming all whitespace (indentation-insensitive)",
        fuzzy: `fuzzy matched (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
      };
      parts.push(`[${strategyLabels[result.strategy]}]`);
    }

    parts.push(`at lines ${result.matchRange[0]}-${result.matchRange[1]}`);

    if (result.warnings.length > 0) {
      parts.push(`\nWarnings:\n${result.warnings.map((w) => `- ${w}`).join("\n")}`);
    }

    return parts.join(" ");
  }

  /**
   * 写入文件
   */
  async writeFile(args: { path: string; content: string; canvasId?: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = args.canvasId || (await canvasStore.ensureActiveCanvas());
    await canvasStore.writeFilePhysical(canvasId, args.path, args.content);
    return `Successfully wrote to ${args.path}`;
  }

  /**
   * 提交更改
   */
  async commitChanges(args: { message?: string; canvasId?: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = args.canvasId || canvasStore.activeCanvasId;
    if (!canvasId) throw new Error("No active canvas to commit.");
    await canvasStore.commitChanges(canvasId, args.message);
    return "Changes committed successfully.";
  }

  /**
   * 丢弃更改
   */
  async discardChanges(args: { canvasId?: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = args.canvasId || canvasStore.activeCanvasId;
    if (!canvasId) return "No active canvas.";
    await canvasStore.discardChanges(canvasId);
    return "Changes discarded.";
  }

  /**
   * 列出文件
   */
  async listFiles(args: { canvasId?: string }): Promise<any> {
    const canvasStore = useCanvasStore();
    const canvasId = args.canvasId || canvasStore.activeCanvasId;
    if (!canvasId) return [];
    return await canvasStore.getFileTree(canvasId);
  }

  /**
   * 创建画布
   */
  async createCanvas(args: { title: string; templateId?: string }): Promise<any> {
    const canvasStore = useCanvasStore();
    const metadata = await canvasStore.createCanvas(args.title, args.templateId);
    return { success: !!metadata, canvasId: metadata?.id };
  }

  /**
   * 清空错误
   */
  async clearRuntimeErrors(args: { canvasId?: string }): Promise<string> {
    const canvasStore = useCanvasStore();
    const canvasId = args.canvasId || canvasStore.activeCanvasId;
    if (!canvasId) return "No active canvas.";
    canvasStore.clearRuntimeErrors(canvasId);
    return "Runtime errors cleared.";
  }

  /**
   * 审批预览钩子
   */
  async onToolCallPreview(requestId: string, methodName: string, args: Record<string, any>) {
    const canvasStore = useCanvasStore();

    if (methodName === "apply_canvas_diff" && args.path && args.search !== undefined && args.replace !== undefined) {
      const canvasId = args.canvasId || (await canvasStore.ensureActiveCanvas());
      await canvasStore.applyDiff(canvasId, args.path, args.search, args.replace, args.start_line);
      canvasStore.registerPreviewRequest(requestId, canvasId, [args.path]);
    }

    if (methodName === "write_canvas_file" && args.path && args.content) {
      const canvasId = args.canvasId || (await canvasStore.ensureActiveCanvas());
      await canvasStore.writeFilePhysical(canvasId, args.path, args.content);
      canvasStore.registerPreviewRequest(requestId, canvasId, [args.path]);
    }
  }

  /**
   * 审批拒绝钩子
   */
  async onToolCallDiscarded(requestId: string) {
    const canvasStore = useCanvasStore();
    const storage = useCanvasStorage();
    const request = canvasStore.getPreviewRequest(requestId);
    if (!request) return;

    const basePath = await storage.getCanvasBasePath(request.canvasId);
    const gitService = new GitInternalService(basePath);

    const matrix = await gitService.statusMatrix();

    for (const filepath of request.affectedFiles) {
      const fileStatus = matrix?.find(([f]) => f === filepath);
      if (fileStatus && fileStatus[1] === 0) {
        await storage.deletePhysicalFile(request.canvasId, filepath);
      } else {
        await gitService.checkout([filepath]);
      }
    }

    canvasStore.removePreviewRequest(requestId);
    request.affectedFiles.forEach((f) => canvasStore.emitFileChanged(request.canvasId, f));
    await canvasStore.refreshGitStatus(request.canvasId);
  }
}

export const canvasAgentService = new CanvasAgentService();
