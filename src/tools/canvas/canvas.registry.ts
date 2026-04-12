import type { ToolConfig, ToolRegistry } from "@/services/types";
import { markRaw, ref } from "vue";
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

  public getMetadata() {
    return {
      methods: [
        {
          name: "create_canvas",
          description: "初始化新画布",
          parameters: [
            { name: "title", type: "string", required: true, description: "画布标题" }
          ],
          returnType: "Promise<string>",
        },
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
            { name: "canvas_id", type: "string", required: true },
            { name: "path", type: "string", required: true },
            { name: "content", type: "string", required: true }
          ],
          returnType: "Promise<void>",
        },
        {
          name: "commit_changes",
          description: "提交所有待定更改到物理磁盘并创建 Git 提交",
          parameters: [
            { name: "canvas_id", type: "string", required: true },
            { name: "message", type: "string", required: false }
          ],
          returnType: "Promise<void>",
        },
        {
          name: "discard_changes",
          description: "丢弃所有未提交的更改",
          parameters: [
            { name: "canvas_id", type: "string", required: true }
          ],
          returnType: "Promise<void>",
        },
        {
          name: "list_canvas_files",
          description: "获取画布的文件树",
          parameters: [
            { name: "canvas_id", type: "string", required: true }
          ],
          returnType: "Promise<CanvasFileNode[]>",
        },
        {
          name: "undo_canvas_diff",
          description: "撤回上一次内存修改",
          parameters: [
            { name: "canvas_id", type: "string", required: true }
          ],
          returnType: "void",
        }
      ],
    };
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