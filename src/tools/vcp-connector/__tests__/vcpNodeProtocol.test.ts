import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  inspectFileForExternalTransfer,
  readFileForExternalTransfer,
  requestApproval,
  distributedConfig,
} = vi.hoisted(() => ({
  inspectFileForExternalTransfer: vi.fn(),
  readFileForExternalTransfer: vi.fn(),
  requestApproval: vi.fn(),
  distributedConfig: {
    externalFileTransferEnabled: true,
    autoRegisterTools: true,
    exposedToolIds: [] as string[],
    disabledToolIds: [] as string[],
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
  toolRegistryManager: {
    hasTool: vi.fn(() => false),
    getRegistry: vi.fn(),
    getAllToolIds: vi.fn(() => []),
  },
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
  useToolCallingStore: () => ({ requestApproval }),
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
