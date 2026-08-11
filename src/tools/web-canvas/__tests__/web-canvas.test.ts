import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasAgentService } from "../services/CanvasAgentService";
import { normalizeCanvasRelativePath } from "../composables/useCanvasStorage";
import { toolRegistryManager } from "@/services/registry";
import { executeToolRequests } from "@/tools/tool-calling/core/executor";

const mocks = vi.hoisted(() => ({
  activeCanvasId: "cp_20260811_abc123",
  registerPreviewRequest: vi.fn(),
  removePreviewRequest: vi.fn(),
  writeFilePhysical: vi.fn(),
  applyDiff: vi.fn(),
}));

vi.mock("../stores/canvasStore", () => ({
  useCanvasStore: () => mocks,
}));

describe("web-canvas 安全边界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "../outside.txt",
    "nested/../../outside.txt",
    "C:/outside.txt",
    "\\\\server\\share\\outside.txt",
    "/outside.txt",
    "nested//file.txt",
  ])("拒绝越出画布根目录的路径: %s", (filepath) => {
    expect(() => normalizeCanvasRelativePath(filepath)).toThrow();
  });

  it("保留合法的相对文件路径并统一分隔符", () => {
    expect(normalizeCanvasRelativePath("src\\components\\App.vue")).toBe(
      "src/components/App.vue"
    );
  });

  it("审批预览只登记请求，不提前写入工作区", async () => {
    const service = new CanvasAgentService();

    await service.onToolCallPreview("request-1", "apply_canvas_diff", {
      path: "index.html",
      search: "old",
      replace: "new",
    });
    await service.onToolCallPreview("request-2", "write_canvas_file", {
      path: "style.css",
      content: "body {}",
    });

    expect(mocks.writeFilePhysical).not.toHaveBeenCalled();
    expect(mocks.applyDiff).not.toHaveBeenCalled();
    expect(mocks.registerPreviewRequest).toHaveBeenCalledTimes(2);
  });

  it("拒绝审批只清理内存记录，不回退 Git HEAD", async () => {
    const service = new CanvasAgentService();

    await service.onToolCallDiscarded("request-1");

    expect(mocks.removePreviewRequest).toHaveBeenCalledWith("request-1");
    expect(mocks.writeFilePhysical).not.toHaveBeenCalled();
    expect(mocks.applyDiff).not.toHaveBeenCalled();
  });
});

describe("web-canvas 审批执行链路", () => {
  const toolId = "web-canvas-approval-test";
  const preview = vi.fn();
  const execute = vi.fn().mockResolvedValue("executed");
  const discard = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    if (!toolRegistryManager.hasTool(toolId)) {
      await toolRegistryManager.register({
        id: toolId,
        name: "web-canvas approval test",
        getMetadata: () => ({
          methods: [
            {
              name: "mutate",
              agentCallable: true,
              parameters: [],
            },
          ],
        }),
        onToolCallPreview: preview,
        onToolCallDiscarded: discard,
        mutate: execute,
      } as any);
    }
  });

  afterAll(async () => {
    await toolRegistryManager.unregister(toolId);
  });

  it("批量审批时 preview hook 只分发一次，批准后正式方法只执行一次", async () => {
    const result = await executeToolRequests(
      [
        {
          requestId: "approval-1",
          toolId,
          methodName: "mutate",
          toolName: `${toolId}.mutate`,
          rawBlock: "",
          args: {},
        },
      ],
      {
        config: {
          enabled: true,
          mode: "manual",
          toolToggles: {},
          autoApproveTools: {},
          defaultToolEnabled: true,
          defaultAutoApprove: false,
          maxIterations: 4,
          timeout: 10_000,
          parallelExecution: false,
        },
        onBeforeExecute: async () => "approved",
      }
    );

    expect(result[0].status).toBe("success");
    expect(preview).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
  });

  it("拒绝审批不会执行正式方法", async () => {
    const result = await executeToolRequests(
      [
        {
          requestId: "approval-2",
          toolId,
          methodName: "mutate",
          toolName: `${toolId}.mutate`,
          rawBlock: "",
          args: {},
        },
      ],
      {
        config: {
          enabled: true,
          mode: "manual",
          toolToggles: {},
          autoApproveTools: {},
          defaultToolEnabled: true,
          defaultAutoApprove: false,
          maxIterations: 4,
          timeout: 10_000,
          parallelExecution: false,
        },
        onBeforeExecute: async () => "rejected",
      }
    );

    expect(result[0].status).toBe("denied");
    expect(preview).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });
});
