import type { ToolConfig, ToolRegistry } from "@/services/types";
import { markRaw, ref } from "vue";
import { useCanvasStore } from "./stores/canvasStore";
import { Brush } from "@element-plus/icons-vue";
import type { DetachableComponentRegistration } from "@/types/detachable";
import { useCanvasStateConsumer } from "./composables/useCanvasStateConsumer";

export default class CanvasRegistry implements ToolRegistry {
  public readonly id = "canvas";
  public readonly name = "画布";
  public readonly description = "多文件协作与预览空间";

  public readonly detachableComponents: Record<string, DetachableComponentRegistration> = {
    "canvas:preview": {
      component: () => import("./components/window/CanvasWindow.vue"),
      logicHook: () => {
        return {
          props: ref({}),
          listeners: {},
        };
      },
      initializeEnvironment: () => {
        const consumer = useCanvasStateConsumer();
        return consumer;
      },
    },
  };

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
              node.status === "modified" ? " (modified)" :
              node.status === "new" ? " (new)" :
              node.status === "deleted" ? " (deleted)" : "";
            if (node.isDirectory) {
              const children = node.children ? buildFileList(node.children, indent + "  ") : "";
              return `${indent}- ${node.name}/${children ? "\n" + children : ""}`;
            }
            return `${indent}- ${node.name}${statusTag}`;
          })
          .join("\n");
      };

      const fileListStr = buildFileList(fileTree);
      const changesStr = pendingFiles.length > 0
        ? pendingFiles.map((f) => `- ${f}`).join("\n")
        : "None";

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

  public getMetadata() {
    return {
      methods: [
        {
          name: "read_canvas_file",
          description: "读取画布文件内容（带行号）",
          parameters: [
            { name: "path", type: "string", required: true, description: "文件路径" }
          ],
          returnType: "Promise<string>",
        },
        {
          name: "apply_canvas_diff",
          description: "使用 Search/Replace 块模式修改画布文件",
          parameters: [
            { name: "path", type: "string", required: true, description: "文件路径" },
            { name: "diff", type: "string", required: true, description: "Diff 内容" }
          ],
          returnType: "Promise<void>",
        },
        {
          name: "write_canvas_file",
          description: "全量覆盖画布文件内容",
          parameters: [
            { name: "path", type: "string", required: true, description: "文件路径" },
            { name: "content", type: "string", required: true, description: "文件内容" }
          ],
          returnType: "Promise<void>",
        },
        {
          name: "commit_changes",
          description: "提交所有待定更改到物理磁盘并创建 Git 提交",
          parameters: [
            { name: "message", type: "string", required: false, description: "提交说明" }
          ],
          returnType: "Promise<void>",
        },
        {
          name: "discard_changes",
          description: "丢弃所有未提交的更改",
          parameters: [],
          returnType: "Promise<void>",
        },
        {
          name: "list_canvas_files",
          description: "获取画布的文件树",
          parameters: [],
          returnType: "Promise<CanvasFileNode[]>",
        },
        {
          name: "undo_canvas_diff",
          description: "撤回上一次内存修改",
          parameters: [],
          returnType: "void",
        }
      ],
    };
  }

  /**
   * 执行工具调用
   */
  async execute(command: string, args: any): Promise<any> {
    const canvasStore = useCanvasStore();

    switch (command) {
      case "read_canvas_file": {
        const canvasId = canvasStore.activeCanvasId;
        if (!canvasId) throw new Error("No active canvas. Please open or create a canvas first.");
        const content = await canvasStore.readCanvasFileAsync(canvasId, args.path);
        if (content === null) throw new Error(`File not found: ${args.path}`);

        // 为内容添加行号
        return content
          .split(/\r?\n/)
          .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
          .join("\n");
      }

      case "apply_canvas_diff": {
        const canvasId = await canvasStore.ensureActiveCanvas();
        await canvasStore.applyDiff(canvasId, args.path, args.diff);
        return `Successfully applied diff to ${args.path}`;
      }

      case "write_canvas_file": {
        const canvasId = await canvasStore.ensureActiveCanvas();
        canvasStore.writeFile(canvasId, args.path, args.content);
        return `Successfully wrote to ${args.path}`;
      }

      case "commit_changes": {
        const canvasId = canvasStore.activeCanvasId;
        if (!canvasId) throw new Error("No active canvas to commit.");
        await canvasStore.commitChanges(canvasId, args.message);
        return "Changes committed successfully.";
      }

      case "discard_changes": {
        const canvasId = canvasStore.activeCanvasId;
        if (!canvasId) return "No active canvas.";
        canvasStore.discardChanges(canvasId);
        return "Changes discarded.";
      }

      case "undo_canvas_diff": {
        const canvasId = canvasStore.activeCanvasId;
        if (!canvasId) return;
        canvasStore.undoDiff(canvasId);
        return "Last change undone.";
      }

      case "list_canvas_files": {
        const canvasId = canvasStore.activeCanvasId;
        if (!canvasId) return [];
        return await canvasStore.getFileTree(canvasId);
      }

      default:
        throw new Error(`Unknown canvas command: ${command}`);
    }
  }
}

export const toolConfig: ToolConfig = {
  name: "画布",
  path: "/canvas",
  icon: markRaw(Brush),
  component: () => import("./CanvasWorkbench.vue"),
  description: "Agent 协作画布，支持多文件编辑与实时预览",
  category: "AI 工具",
};