import { presentFileOperationResult } from "@/tools/aio-file-operator/utils/agentResult";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  inspectFileForExternalTransfer,
  readFileForExternalTransfer,
  requestApproval,
  cancelExternalRequests,
  distributedConfig,
  toolRegistryManager,
  registry,
} = vi.hoisted(() => ({
  inspectFileForExternalTransfer: vi.fn(),
  readFileForExternalTransfer: vi.fn(),
  requestApproval: vi.fn(),
  cancelExternalRequests: vi.fn(),
  distributedConfig: {
    externalFileTransferEnabled: true,
    autoRegisterTools: true,
    exposedToolIds: [] as string[],
    disabledToolIds: [] as string[],
  },
  toolRegistryManager: {
    hasTool: vi.fn(() => false),
    getRegistry: vi.fn(),
    getAllToolIds: vi.fn(() => [] as string[]),
  },
  registry: {
    getMetadata: vi.fn(() => ({
      methods: [{ name: "read_file", agentCallable: true }],
    })),
    read_file: vi.fn(),
    checkSecurityPolicy: vi.fn(),
  },
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("@/services/registry", () => ({
  toolRegistryManager,
}));
vi.mock("../services/VcpBridgeFactory", () => ({
  vcpBridgeFactory: {
    handleManifestsResponse: vi.fn(),
    handleToolResult: vi.fn(),
    handleToolStatus: vi.fn(),
  },
}));

vi.mock("@/tools/aio-file-operator/actions", () => ({
  inspectFileForExternalTransfer,
  readFileForExternalTransfer,
}));
vi.mock("../stores/vcpDistributedStore", () => ({
  useVcpDistributedStore: () => ({ config: distributedConfig }),
}));
vi.mock("@/tools/llm-chat/stores/toolCallingStore", () => ({
  useToolCallingStore: () => ({ requestApproval, cancelExternalRequests }),
}));

import { VcpNodeProtocol } from "../services/vcpNodeProtocol";

describe("VcpNodeProtocol internal_request_file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    distributedConfig.externalFileTransferEnabled = true;
  });

  it("只接受本机 file URL", () => {
    const protocol = new VcpNodeProtocol(vi.fn(), "wss://vcp.example/ws");
    const parse = (protocol as any).parseLocalFileUrl.bind(protocol);

    expect(() => parse("https://example.com/file.txt")).toThrow("file://");
    expect(() => parse("file://server/share/file.txt")).toThrow("UNC");
    expect(() => parse("C:/Users/test/file.txt")).toThrow("file://");
    expect(parse("file:///C:/Users/test/file.txt")).toBe(
      "C:/Users/test/file.txt"
    );
  });

  it("通过安全文件服务读取并返回大小", async () => {
    inspectFileForExternalTransfer.mockResolvedValue({
      normalizedPath: "C:/Users/test/file.txt",
      size: 2,
      mimeType: "text/plain",
      policy: "allow",
    });
    readFileForExternalTransfer.mockResolvedValue({
      normalizedPath: "C:/Users/test/file.txt",
      size: 2,
      mimeType: "text/plain",
      fileData: "b2s=",
    });
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson, "wss://vcp.example/ws");

    await protocol.handleExecuteTool({
      requestId: "req-1",
      toolName: "internal_request_file",
      toolArgs: { fileUrl: "file:///C:/Users/test/file.txt" },
    });

    expect(readFileForExternalTransfer).toHaveBeenCalledWith({
      path: "C:/Users/test/file.txt",
      source: {
        type: "vcp",
        serverId: "wss://vcp.example/ws",
        requestId: "req-1",
      },
      approvalGranted: true,
    });
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        data: expect.objectContaining({
          status: "success",
          result: expect.objectContaining({ size: 2, fileData: "b2s=" }),
        }),
      })
    );
  });

  it("VCP 断线时清理所有外部审批请求", () => {
    const protocol = new VcpNodeProtocol(vi.fn());

    protocol.abortAllInFlight();

    expect(cancelExternalRequests).toHaveBeenCalledWith("VCP 连接已断开");
  });

  it("关闭能力后默认拒绝", async () => {
    distributedConfig.externalFileTransferEnabled = false;
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);

    await protocol.handleExecuteTool({
      requestId: "req-disabled",
      toolName: "internal_request_file",
      toolArgs: { fileUrl: "file:///C:/Users/test/file.txt" },
    });

    expect(inspectFileForExternalTransfer).not.toHaveBeenCalled();
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "error",
          error: expect.stringContaining("关闭"),
        }),
      })
    );
  });
});

describe("VcpNodeProtocol distributed tool execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    distributedConfig.externalFileTransferEnabled = true;
    distributedConfig.autoRegisterTools = true;
    distributedConfig.exposedToolIds = [];
    distributedConfig.disabledToolIds = [];
    toolRegistryManager.hasTool.mockReturnValue(true);
    toolRegistryManager.getRegistry.mockReturnValue(registry);
    toolRegistryManager.getAllToolIds.mockReturnValue(["aio-file-operator"]);
    registry.getMetadata.mockReturnValue({
      methods: [{ name: "read_file", agentCallable: true }],
    });
    registry.checkSecurityPolicy
      .mockReset()
      .mockResolvedValue({ status: "allow" });
    registry.read_file.mockImplementation(async (args: any, context: any) => ({
      path: args.path,
      requestId: context.requestId,
    }));
  });

  it("支持 command1/path1 形式的批量调用并聚合结果", async () => {
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);

    await protocol.handleExecuteTool({
      requestId: "req-batch",
      toolName: "aio-file-operator",
      toolArgs: {
        command1: "read_file",
        path1: "G:/work/one.md",
        command2: "read_file",
        path2: "G:/work/two.md",
      },
    });

    expect(registry.read_file).toHaveBeenCalledTimes(2);
    expect(registry.read_file).toHaveBeenNthCalledWith(
      1,
      { path: "G:/work/one.md" },
      expect.objectContaining({ requestId: "req-batch_1" })
    );
    expect(registry.read_file).toHaveBeenNthCalledWith(
      2,
      { path: "G:/work/two.md" },
      expect.objectContaining({ requestId: "req-batch_2" })
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        data: expect.objectContaining({
          request_id: "req-batch",
          status: "success",
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  path: "G:/work/one.md",
                  requestId: "req-batch_1",
                }),
              },
              {
                type: "text",
                text: JSON.stringify({
                  path: "G:/work/two.md",
                  requestId: "req-batch_2",
                }),
              },
            ],
          },
        }),
      })
    );
  });

  // Protect the consumer contract: VCP must receive typed text blocks for pure text and mixed batches.
  it("文件目录与读取批次按顺序回传可读文本块", async () => {
    registry.getMetadata.mockReturnValue({
      methods: [
        { name: "list_directory", agentCallable: true },
        { name: "read_file", agentCallable: true },
      ],
    });
    const directoryResult = presentFileOperationResult({
      success: true,
      message: "目录 G:/work（1 项）",
      data: {
        entries: [
          {
            name: "notes.md",
            path: "G:/work/notes.md",
            size: 2048,
            isDirectory: false,
            modified: null,
            created: null,
          },
        ],
      },
    });
    const body = '  # 内容\r\npath="G:\\work"\r\n';
    const readResult = presentFileOperationResult({
      success: true,
      message: "读取 G:/work/notes.md",
      data: { content: body, size: 2048 },
    });
    Object.assign(registry, {
      list_directory: vi.fn().mockResolvedValue(directoryResult),
    });
    registry.read_file.mockResolvedValue(readResult);
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "readable-batch",
      toolName: "aio-file-operator",
      toolArgs: {
        command1: "list_directory",
        path1: "G:/work",
        command2: "read_file",
        path2: "G:/work/notes.md",
      },
    });
    expect(sendJson.mock.calls[0][0].data.result.content).toEqual([
      ...directoryResult.content!,
      ...readResult.content!,
    ]);
    const [directory, file] = sendJson.mock.calls[0][0].data.result.content;
    expect(directory.text).toContain("| notes.md | 文件 | 2 KB |");
    expect(file.text.endsWith(body)).toBe(true);
  });

  it("单次文件读取避免 data.content 遮蔽顶层文本内容块", async () => {
    const body = "  第一行\r\nC:\\work\r\n";
    const result = presentFileOperationResult({
      success: true,
      message: "已读取",
      data: { content: body, size: 32 },
    });
    registry.read_file.mockResolvedValue(result);
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "single-text",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: "G:/work/a.md" },
    });
    const wire = sendJson.mock.calls[0][0].data.result;
    // Mirror the VCP consumer's documented content selection, not internal DTO fields.
    const selected = wire.data?.content || wire.content;
    expect(selected).toEqual(result.content);
    expect(selected[0].text.endsWith(body)).toBe(true);
  });

  it("纯文本信封解包后回传正文，业务失败保留到批次状态", async () => {
    registry.read_file.mockResolvedValueOnce({
      result: "第一行\n第二行",
      executionMetadata: { auditId: "local-only" },
    });
    registry.read_file.mockResolvedValueOnce(
      presentFileOperationResult({
        success: false,
        message: "文件不存在：G:/work/missing.md",
      })
    );
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "wrapped-text",
      toolName: "aio-file-operator",
      toolArgs: {
        command1: "read_file",
        path1: "G:/work/notes.md",
        command2: "read_file",
        path2: "G:/work/missing.md",
      },
    });
    expect(sendJson.mock.calls[0][0].data.result).toEqual({
      success: false,
      content: [
        { type: "text", text: "第一行\n第二行" },
        { type: "text", text: "操作失败：文件不存在：G:/work/missing.md" },
      ],
    });
  });

  it("可读媒体结果复用文本块并保留一次安全传输", async () => {
    const media = mockMedia();
    const result = presentFileOperationResult({
      success: true,
      message: "已读取图片",
      data: { mimeType: "image/png", size: 2 },
      localMedia: [media],
    });
    registry.read_file.mockResolvedValue(result);
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "readable-media",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: media.path },
    });
    expect(readFileForExternalTransfer).toHaveBeenCalledTimes(1);
    expect(sendJson.mock.calls[0][0].data.result.content).toEqual([
      ...result.content!,
      { type: "image_url", image_url: { url: "data:image/png;base64,b2s=" } },
    ]);
  });

  // 保护分布式入口的公开权限契约：被拦截/未授权的调用不得执行工具方法。
  it.each(["block", "invalid"])("安全策略 %s 时停止调用", async (status) => {
    registry.checkSecurityPolicy.mockResolvedValue({ status });
    const send = vi.fn();
    await new VcpNodeProtocol(send).handleExecuteTool({
      requestId: "blocked",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: "G:/work/file.md" },
    });
    expect(registry.read_file).not.toHaveBeenCalled();
    expect(send.mock.calls[0][0].data.status).toBe("error");
  });

  it.each(["approved", "rejected"])(
    "审批区等待明确结果 %s 后决定是否执行",
    async (decision) => {
      registry.checkSecurityPolicy.mockResolvedValue({ status: "approve" });
      let finish!: (value: string) => void;
      requestApproval.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const send = vi.fn();
      const execution = new VcpNodeProtocol(send, "server-1").handleExecuteTool(
        {
          requestId: "approval",
          toolName: "aio-file-operator",
          toolArgs: { command: "read_file", path: "G:/work/file.md" },
        }
      );
      await vi.waitFor(() => expect(requestApproval).toHaveBeenCalled());
      expect(registry.read_file).not.toHaveBeenCalled();
      expect(requestApproval.mock.calls[0][3]).toMatchObject({
        forceApproval: true,
        skipArbitration: true,
        source: "vcp-node",
        timeoutMs: 115000,
      });
      finish(decision);
      await execution;
      expect(registry.read_file).toHaveBeenCalledTimes(
        decision === "approved" ? 1 : 0
      );
      expect(send.mock.calls[0][0].data.status).toBe(
        decision === "approved" ? "success" : "error"
      );
    }
  );

  it("审批超时后即使迟到批准也不执行", async () => {
    vi.useFakeTimers();
    try {
      registry.checkSecurityPolicy.mockResolvedValue({ status: "approve" });
      let finish!: (value: string) => void;
      requestApproval.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const send = vi.fn();
      const execution = new VcpNodeProtocol(send).handleExecuteTool({
        requestId: "timeout",
        toolName: "aio-file-operator",
        toolArgs: { command: "read_file", path: "G:/work/file.md" },
      });
      await vi.advanceTimersByTimeAsync(115001);
      await execution;
      finish("approved");
      await vi.advanceTimersByTimeAsync(0);
      expect(registry.read_file).not.toHaveBeenCalled();
      expect(send.mock.calls[0][0].data.status).toBe("error");
    } finally {
      vi.useRealTimers();
    }
  });

  it("等待审批期间取消请求或新增死区均停止执行", async () => {
    for (const cancel of [true, false]) {
      registry.read_file.mockClear();
      registry.checkSecurityPolicy
        .mockReset()
        .mockResolvedValueOnce({ status: "approve" })
        .mockResolvedValue({ status: "block" });
      requestApproval.mockImplementation(async () => {
        if (cancel) protocol.handleCancelTool("cancel");
        return "approved";
      });
      const protocol = new VcpNodeProtocol(vi.fn());
      await protocol.handleExecuteTool({
        requestId: "cancel",
        toolName: "aio-file-operator",
        toolArgs: { command: "read_file", path: "G:/work/file.md" },
      });
      expect(registry.read_file).not.toHaveBeenCalled();
    }
  });

  function mockMedia(
    type: "image" | "audio" | "video" = "image",
    mimeType = "image/png"
  ) {
    const media = {
      id: "media-1",
      type,
      name: "sample",
      path: "G:/work/sample",
      mimeType,
      size: 2,
      approvalGranted: true,
    };
    registry.read_file.mockResolvedValue({
      success: true,
      message: "media ready",
      localMedia: [media],
    });
    inspectFileForExternalTransfer.mockResolvedValue({
      normalizedPath: media.path,
      size: 2,
      mimeType,
      policy: "allow",
    });
    readFileForExternalTransfer.mockResolvedValue({
      normalizedPath: media.path,
      size: 2,
      mimeType,
      fileData: "b2s=",
    });
    return media;
  }

  it.each([
    ["image", "image/png"],
    ["audio", "audio/wav"],
    ["video", "video/mp4"],
  ] as const)(
    "一次分布式读取返回 %s 媒体字节供 VCP 模型消费",
    async (type, mimeType) => {
      const media = mockMedia(type, mimeType);
      const sendJson = vi.fn();
      const protocol = new VcpNodeProtocol(sendJson, "vcp-server");
      await protocol.handleExecuteTool({
        requestId: "req-media",
        toolName: "aio-file-operator",
        toolArgs: { command: "read_file", path: media.path },
      });
      expect(readFileForExternalTransfer).toHaveBeenCalledWith({
        path: media.path,
        source: { type: "vcp", serverId: "vcp-server", requestId: "req-media" },
        approvalGranted: true,
      });
      expect(sendJson).toHaveBeenCalledTimes(1);
      const { data } = sendJson.mock.calls[0][0];
      expect(data.status).toBe("success");
      expect(data.result.content).toEqual([
        {
          type: "text",
          text: JSON.stringify({ success: true, message: "media ready" }),
        },
        {
          type: "image_url",
          image_url: { url: "data:" + mimeType + ";base64,b2s=" },
        },
      ]);
      expect(data.result.localMedia).toBeUndefined();
    }
  );

  it("混合批量读取在顶层 content 合并文本和图片", async () => {
    const media = mockMedia();
    registry.read_file.mockResolvedValueOnce({
      success: true,
      data: { content: "notes" },
    });
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "req-mixed",
      toolName: "aio-file-operator",
      toolArgs: {
        command1: "read_file",
        path1: "G:/work/notes.txt",
        command2: "read_file",
        path2: media.path,
      },
    });
    expect(sendJson.mock.calls[0][0].data.result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ success: true, data: { content: "notes" } }),
      },
      {
        type: "text",
        text: JSON.stringify({ success: true, message: "media ready" }),
      },
      { type: "image_url", image_url: { url: "data:image/png;base64,b2s=" } },
    ]);
  });

  it("媒体引用的审批标记不能代替分布式外传审批", async () => {
    const media = mockMedia();
    inspectFileForExternalTransfer.mockResolvedValue({
      normalizedPath: media.path,
      size: 2,
      mimeType: "image/png",
      policy: "approve",
    });
    requestApproval.mockResolvedValue("rejected");
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "req-denied",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: media.path },
    });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(readFileForExternalTransfer).not.toHaveBeenCalled();
    expect(sendJson.mock.calls[0][0].data).toMatchObject({
      status: "error",
      error: expect.stringContaining("拒绝"),
    });
  });

  it("关闭外部传输时媒体读取返回明确错误", async () => {
    const media = mockMedia();
    distributedConfig.externalFileTransferEnabled = false;
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "req-media-disabled",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: media.path },
    });
    expect(readFileForExternalTransfer).not.toHaveBeenCalled();
    expect(sendJson.mock.calls[0][0].data).toMatchObject({
      status: "error",
      error: expect.stringContaining("关闭"),
    });
  });

  it("结构化返回信封中的媒体与文本一起传给 VCP", async () => {
    const media = mockMedia();
    registry.read_file.mockResolvedValue({
      result: { success: true, message: "wrapped" },
      localMedia: [media],
      executionMetadata: { auditId: "audit-1" },
    });
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "req-wrapped",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: media.path },
    });
    expect(sendJson.mock.calls[0][0].data.result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ success: true, message: "wrapped" }),
      },
      { type: "image_url", image_url: { url: "data:image/png;base64,b2s=" } },
    ]);
  });

  it("原文件读取失败时返回错误而非只有元数据的成功结果", async () => {
    const media = mockMedia();
    readFileForExternalTransfer.mockRejectedValue(new Error("文件已删除"));
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    await protocol.handleExecuteTool({
      requestId: "req-missing",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: media.path },
    });
    expect(sendJson).toHaveBeenCalledTimes(1);
    expect(sendJson.mock.calls[0][0].data).toMatchObject({
      status: "error",
      error: "文件已删除",
    });
  });

  it("媒体安全检查期间取消请求后停止读取", async () => {
    const media = mockMedia();
    let finishInspection!: (value: unknown) => void;
    let inspectionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      inspectionStarted = resolve;
    });
    inspectFileForExternalTransfer.mockImplementation(() => {
      inspectionStarted();
      return new Promise((resolve) => {
        finishInspection = resolve;
      });
    });
    const sendJson = vi.fn();
    const protocol = new VcpNodeProtocol(sendJson);
    const execution = protocol.handleExecuteTool({
      requestId: "req-cancel",
      toolName: "aio-file-operator",
      toolArgs: { command: "read_file", path: media.path },
    });
    await started;
    expect(protocol.handleCancelTool("req-cancel")).toBe(true);
    finishInspection({
      normalizedPath: media.path,
      size: 2,
      mimeType: "image/png",
      policy: "allow",
    });
    await execution;
    expect(readFileForExternalTransfer).not.toHaveBeenCalled();
    expect(sendJson).toHaveBeenCalledTimes(1);
    expect(sendJson.mock.calls[0][0].data.status).toBe("error");
  });
});
