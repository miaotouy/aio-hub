// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  registry: null as unknown as AioFileOperatorRegistry,
  invoke: vi.fn(),
  approve: vi.fn(),
}));
vi.mock("@/platform/native/core", () => ({ invoke: state.invoke }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/services/registry", () => ({
  toolRegistryManager: {
    hasTool: () => true,
    getRegistry: () => state.registry,
  },
}));
vi.mock("@/tools/vcp-connector/stores/vcpDistributedStore", () => ({
  useVcpDistributedStore: () => ({ config: { autoRegisterTools: true } }),
}));
vi.mock("@/tools/vcp-connector/services/VcpBridgeFactory", () => ({
  vcpBridgeFactory: {},
}));
vi.mock("@/tools/llm-chat/stores/toolCallingStore", () => ({
  useToolCallingStore: () => ({ requestApproval: state.approve }),
}));

import * as actions from "../actions";
import { AioFileOperatorRegistry } from "../aio-file-operator.registry";
import { withFileOperationLocks } from "../utils/fileOperationQueue";
import { VcpNodeProtocol } from "../../vcp-connector/services/vcpNodeProtocol";
import { executeToolRequests } from "../../tool-calling/core/executor";
import type { ToolCallConfig } from "../../tool-calling/types";

const toolConfig: ToolCallConfig = {
  enabled: true,
  mode: "auto",
  toolToggles: {},
  autoApproveTools: {},
  defaultToolEnabled: true,
  defaultAutoApprove: true,
  maxIterations: 5,
  timeout: 30000,
  parallelExecution: false,
  protocol: "vcp",
};

async function appendThrough(source: "vcp" | "local") {
  // LLM 参数中的同名标记必须保持无效，实际授权来自执行上下文。
  const args = {
    path: "C:/safe/file.md",
    content: "new",
    securityApprovalGranted: "true",
  };
  if (source === "vcp") {
    const send = vi.fn();
    await new VcpNodeProtocol(send).handleExecuteTool({
      requestId: "queued-write",
      toolName: "aio-file-operator",
      toolArgs: { command: "append_file", ...args },
    });
    return send.mock.calls[0][0].data.result;
  }
  const [result] = await executeToolRequests(
    [
      {
        requestId: "queued-write",
        toolId: state.registry.id,
        methodName: "append_file",
        toolName: state.registry.name,
        rawBlock: "",
        args,
      },
    ],
    { config: toolConfig, onBeforeExecute: state.approve }
  );
  return { success: result.status === "success", message: result.result };
}

describe("文件工具的执行授权与 VCP 参数适配", () => {
  beforeEach(async () => {
    state.invoke.mockReset();
    state.approve.mockReset().mockResolvedValue("approved");
    state.registry = new AioFileOperatorRegistry();
    state.invoke.mockImplementation(async (command: string, args: any) => {
      if (command === "resolve_path_for_security") return args.path;
      if (command === "get_file_metadata") return { size: 8, isFile: true };
      if (command === "read_text_file_force") return "one\ntwo\n";
      return null;
    });
    await actions.setConfig({
      sandboxMode: "blacklist",
      blackListRules: [],
      enableAuditLog: false,
    });
  });

  // 保护磁盘修改的授权边界；覆盖两个真实执行入口，重构队列内部实现仍保持稳定。
  it.each(["vcp", "local"] as const)(
    "%s 排队期间新增审批要求后停止写入，重新审批后可执行",
    async (source) => {
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = withFileOperationLocks(["C:/safe/file.md"], async () => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      await started;
      let called!: () => void;
      const calledMethod = new Promise<void>((resolve) => {
        called = resolve;
      });
      const append = state.registry.append_file.bind(state.registry);
      vi.spyOn(state.registry, "append_file").mockImplementation((...args) => {
        const pending = append(...args);
        called();
        return pending;
      });
      const execution = appendThrough(source);
      try {
        await calledMethod;
        await actions.setConfig({
          blackListRules: [{ id: "review", path: "C:/safe", type: "approve" }],
        });
      } finally {
        release();
        await held;
      }
      expect((await execution).success).toBe(false);
      expect(state.approve).not.toHaveBeenCalled();
      expect(
        state.invoke.mock.calls.filter(
          ([command]) => command === "append_file_force"
        )
      ).toHaveLength(0);

      expect((await appendThrough(source)).success).toBe(true);
      expect(state.approve).toHaveBeenCalledOnce();
      const writes = state.invoke.mock.calls.filter(
        ([command]) => command === "append_file_force"
      );
      expect(writes).toHaveLength(1);
      expect(writes[0][1].security.approvalGranted).toBe(true);
    }
  );

  // 保护 VCP 文本协议到真实读取结果的契约，包含字符串行号与返回范围元数据。
  it("VCP 字符串行号按数值声明转换后读取指定行", async () => {
    const send = vi.fn();
    await new VcpNodeProtocol(send).handleExecuteTool({
      requestId: "range",
      toolName: "aio-file-operator",
      toolArgs: {
        command: "read_file",
        path: "C:/safe/file.md",
        startLine: "2",
        endLine: "2",
      },
    });
    const result = send.mock.calls[0][0].data.result;
    expect(result.success).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("2–2 / 共 2 行");
    expect(result.content[0].text.endsWith("\n\ntwo\n")).toBe(true);
  });
});
