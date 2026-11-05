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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runChatOrchestration,
  type ChatOrchestrationPorts,
} from "../src/tools/llm-chat/core/execution/chatOrchestrator";
import type {
  OrchestrateParams,
  SingleNodeExecuteParams,
} from "../src/tools/llm-chat/core/execution/types";
import type {
  ChatSessionDetail,
  ChatMessageNode,
  ChatAgent,
} from "../src/tools/llm-chat/types";
import type {
  ParsedToolRequest,
  ToolExecutionResult,
} from "../src/tools/tool-calling/types";

const request: ParsedToolRequest = {
  requestId: "req-1",
  toolId: "clock",
  methodName: "read",
  toolName: "clock_read",
  args: { zone: "UTC" },
  rawBlock: "tool:clock",
};
function node(
  id: string,
  role: ChatMessageNode["role"],
  parentId: string | null
): ChatMessageNode {
  return {
    id,
    role,
    parentId,
    childrenIds: [],
    content: "",
    status: "complete",
    timestamp: new Date().toISOString(),
  };
}
function fixture(
  options: {
    maxIterations?: number;
    denied?: boolean;
    silent?: boolean;
    responses?: string[];
  } = {}
) {
  const user = node("user", "user", null),
    assistant = node("assistant", "assistant", user.id);
  user.childrenIds.push(assistant.id);
  assistant.status = "waiting";
  assistant.metadata = {
    reasoningContent: "old reasoning",
    usage: { totalTokens: 7 } as any,
    contentTokens: 3,
    firstTokenTime: 10,
  };
  const session = {
    id: "session",
    rootNodeId: user.id,
    activeLeafId: assistant.id,
    nodes: { user, assistant },
  } as unknown as ChatSessionDetail;
  const params: OrchestrateParams = {
    session,
    assistantNode: assistant,
    pathToUserNode: [user],
    agentConfig: { profileId: "profile", modelId: "model", parameters: {} },
    executionAgent: {
      id: "agent",
      displayName: "Agent",
      knowledgeAccess: { enabled: true },
      toolCallConfig: {
        enabled: true,
        protocol: "vcp",
        maxIterations: options.maxIterations ?? 5,
      },
    } as ChatAgent,
    effectiveUserProfile: null,
    abortControllers: new Map(),
    generatingNodes: new Set(),
    consumeTextCallsLocally: true,
    delegationDepth: 2,
    isContinuation: true,
  };
  let count = 0;
  const paths: string[][] = [];
  const continuations: (boolean | undefined)[] = [];
  const snapshots: ChatSessionDetail[] = [];
  const result: ToolExecutionResult = {
    requestId: request.requestId,
    toolName: request.toolName,
    status: options.denied ? "denied" : "success",
    result: "12:00",
    durationMs: 5,
    localMedia: [{ kind: "image", path: "clock.png" }] as any,
  };
  const ports: ChatOrchestrationPorts = {
    executeSingleNode: vi.fn(async (input: SingleNodeExecuteParams) => {
      paths.push(input.currentPathToUserNode.map((n) => n.role));
      continuations.push(input.isContinuation);
      const content =
        options.responses?.[count] ??
        (count === 0 ? "tool:clock" : "Final answer");
      count++;
      input.assistantNode.content = content;
      input.assistantNode.status = "complete";
      return { response: { content }, messagesForRequest: [] };
    }),
    parseRequests: (text) => (text.startsWith("tool:") ? [request] : []),
    processCycle: vi.fn(async (text, _config, approve, status) => {
      if (!text.startsWith("tool:"))
        return {
          hasToolRequests: false,
          parsedRequests: [],
          executionResults: [],
        };
      const decision = await approve(request, {
        forceApproval: true,
        effectiveArgs: { zone: "UTC", fixed: true },
        toolDescription: "Read clock",
      });
      if (options.silent) {
        const tool = Object.values(session.nodes!).find(
          (n) => n.role === "tool"
        )!;
        tool.metadata!.isSilent = true;
      }
      status(request.requestId, "executing");
      status(request.requestId, "completed");
      return {
        hasToolRequests: true,
        parsedRequests: [request],
        executionResults: [
          {
            ...result,
            status: decision === "rejected" ? "denied" : result.status,
          },
        ],
      };
    }),
    formatCycleResults: () => "Clock result: 12:00",
    requestApproval: vi.fn(async () =>
      options.denied ? "rejected" : "approved"
    ),
    waitForContextCompression: vi.fn(async () => false),
    getNodePath: vi.fn(() => [user]),
    updateActiveLeaf: (current, id) => {
      current.activeLeafId = id;
    },
    persistSession: vi.fn((current) => {
      snapshots.push(structuredClone(current));
    }),
    generateSessionTopic: vi.fn(),
    handleNodeError: vi.fn((current, id, error) => {
      const currentNode = current.nodes![id]!;
      currentNode.status = "error";
      currentNode.metadata = { ...currentNode.metadata, error: String(error) };
    }),
    logger: { info: vi.fn(), warn: vi.fn() },
  };
  return { params, ports, session, assistant, paths, continuations, snapshots };
}
afterEach(() => vi.useRealTimers());

describe("shared Agent orchestration in a Node-only host", () => {
  it("continues through approved tools with the same conversation and security context", async () => {
    const f = fixture();
    const unrelated = new AbortController();
    f.params.abortControllers.set("other-run", unrelated);
    f.params.generatingNodes.add("other-run");
    const result = await runChatOrchestration(f.params, f.ports);
    expect(result).toMatchObject({ status: "complete", iterations: 2 });
    const tool = Object.values(f.session.nodes!).find(
      (n) => n.role === "tool"
    )!;
    const final = f.session.nodes![tool.childrenIds[0]!]!;
    expect(tool).toMatchObject({
      parentId: f.assistant.id,
      content: "Clock result: 12:00",
      status: "complete",
      localMedia: [{ kind: "image", path: "clock.png" }],
    });
    expect(final).toMatchObject({
      role: "assistant",
      parentId: tool.id,
      content: "Final answer",
      status: "complete",
    });
    expect(final.metadata?.reasoningContent).toBeUndefined();
    expect(final.metadata?.usage).toBeUndefined();
    expect(f.paths).toEqual([["user"], ["user", "assistant", "tool"]]);
    expect(f.continuations).toEqual([true, false]);
    expect(f.ports.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session",
        agent: f.params.executionAgent,
        signal: expect.any(AbortSignal),
        security: {
          forceApproval: true,
          effectiveArgs: { zone: "UTC", fixed: true },
          toolDescription: "Read clock",
        },
      })
    );
    expect(f.ports.processCycle).toHaveBeenCalledWith(
      "tool:clock",
      f.params.executionAgent.toolCallConfig,
      expect.any(Function),
      expect.any(Function),
      { id: "agent", knowledgeAccess: { enabled: true } },
      2,
      { profileId: "profile", modelId: "model" }
    );
    expect(f.session.activeLeafId).toBe(final.id);
    expect(
      f.snapshots.some((s) =>
        Object.values(s.nodes!).some(
          (n) =>
            n.role === "tool" &&
            n.metadata?.toolCalls?.[0]?.status === "awaiting_approval"
        )
      )
    ).toBe(true);
    expect([...f.params.generatingNodes]).toEqual(["other-run"]);
    expect([...f.params.abortControllers]).toEqual([["other-run", unrelated]]);
  });
  it.each(["denied", "silent"] as const)(
    "stops after %s tool results without requesting another turn",
    async (reason) => {
      const f = fixture({
        denied: reason === "denied",
        silent: reason === "silent",
      });
      expect(await runChatOrchestration(f.params, f.ports)).toMatchObject({
        status: "complete",
        stopReason: reason,
      });
      expect(f.ports.executeSingleNode).toHaveBeenCalledOnce();
      expect(f.session.nodes![f.session.activeLeafId!]!.role).toBe("tool");
      expect(f.params.generatingNodes.size).toBe(0);
      expect(f.params.abortControllers.size).toBe(0);
    }
  );
  it("ends at the final tool result when the iteration budget is exhausted", async () => {
    const f = fixture({ maxIterations: 1 });
    expect(await runChatOrchestration(f.params, f.ports)).toMatchObject({
      status: "complete",
      stopReason: "iteration-limit",
      iterations: 1,
    });
    const leaf = f.session.nodes![f.session.activeLeafId!]!;
    expect(leaf).toMatchObject({
      role: "tool",
      status: "complete",
      childrenIds: [],
    });
    expect(
      Object.values(f.session.nodes!).filter((n) => n.role === "assistant")
    ).toHaveLength(1);
    expect(f.params.generatingNodes.size).toBe(0);
    expect(f.params.abortControllers.size).toBe(0);
  });
  it("cancels rate-limit waits immediately using the owner's lifetime signal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const f = fixture();
    f.params.abortController = new AbortController();
    f.params.executionAgent.toolCallConfig!.rateLimitInterval = 60;
    const run = runChatOrchestration(f.params, f.ports);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.ports.executeSingleNode).toHaveBeenCalledOnce();
    f.params.abortController.abort(new DOMException("Cancelled", "AbortError"));
    expect(await run).toMatchObject({ status: "cancelled" });
    expect(vi.getTimerCount()).toBe(0);
    expect(f.ports.executeSingleNode).toHaveBeenCalledOnce();
    expect(f.params.generatingNodes.size).toBe(0);
    expect(f.params.abortControllers.size).toBe(0);
  });
  it("prevents late projection work from creating or executing tools after cancellation", async () => {
    const f = fixture();
    f.params.abortController = new AbortController();
    let finish!: () => void;
    f.ports.beforeToolNode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const run = runChatOrchestration(f.params, f.ports);
    await vi.waitFor(() =>
      expect(f.ports.beforeToolNode).toHaveBeenCalledOnce()
    );
    f.params.abortController.abort(new DOMException("Cancelled", "AbortError"));
    finish();
    expect(await run).toMatchObject({ status: "cancelled" });
    expect(f.assistant.childrenIds).toEqual([]);
    expect(f.ports.processCycle).not.toHaveBeenCalled();
    expect(f.params.generatingNodes.size).toBe(0);
  });
  it("reparses existing content and resumes through the same approved tool loop", async () => {
    const f = fixture({ responses: ["Final from reparse"] });
    f.params.isReparse = true;
    f.assistant.content = "tool:clock";
    f.assistant.status = "complete";
    expect(await runChatOrchestration(f.params, f.ports)).toMatchObject({
      status: "complete",
      iterations: 2,
    });
    expect(f.ports.executeSingleNode).toHaveBeenCalledOnce();
    expect(f.paths).toEqual([["user", "assistant", "tool"]]);
    const tool = Object.values(f.session.nodes!).find(
      (n) => n.role === "tool"
    )!;
    expect(tool.metadata?.isReparse).toBe(true);
    expect(f.session.nodes![tool.childrenIds[0]!]!.content).toBe(
      "Final from reparse"
    );
  });
  it("persists cancelled approval state and releases both tool and assistant ownership", async () => {
    const f = fixture();
    f.params.abortController = new AbortController();
    f.ports.requestApproval = vi.fn(
      ({ signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        )
    );
    const run = runChatOrchestration(f.params, f.ports);
    await vi.waitFor(() =>
      expect(f.ports.requestApproval).toHaveBeenCalledOnce()
    );
    f.params.abortController.abort(new DOMException("Cancelled", "AbortError"));
    expect(await run).toMatchObject({ status: "cancelled" });
    const tool = Object.values(f.session.nodes!).find(
      (n) => n.role === "tool"
    )!;
    expect(tool).toMatchObject({
      status: "error",
      metadata: { error: "已取消" },
    });
    expect(f.snapshots.at(-1)?.nodes![tool.id]?.status).toBe("error");
    expect(f.params.generatingNodes.size).toBe(0);
    expect(f.params.abortControllers.size).toBe(0);
  });
  it("stops tool dispatch when its pre-execution checkpoint fails", async () => {
    const f = fixture();
    vi.mocked(f.ports.persistSession).mockImplementationOnce(async () => {
      throw Error("disk unavailable");
    });
    expect(await runChatOrchestration(f.params, f.ports)).toMatchObject({
      status: "error",
      error: expect.objectContaining({ message: "disk unavailable" }),
    });
    expect(f.ports.processCycle).not.toHaveBeenCalled();
    expect(f.params.generatingNodes.size).toBe(0);
    expect(f.params.abortControllers.size).toBe(0);
  });
  it("drains asynchronous status checkpoints before scheduling another model turn", async () => {
    const f = fixture();
    vi.mocked(f.ports.persistSession)
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(async () => {
        throw Error("status checkpoint failed");
      });
    expect(await runChatOrchestration(f.params, f.ports)).toMatchObject({
      status: "error",
      error: expect.objectContaining({ message: "status checkpoint failed" }),
    });
    expect(f.ports.executeSingleNode).toHaveBeenCalledOnce();
    expect(f.params.generatingNodes.size).toBe(0);
    expect(f.params.abortControllers.size).toBe(0);
  });
  it("classifies cancelled approvals that settle as rejected without losing their tool audit", async () => {
    const f = fixture();
    f.params.abortController = new AbortController();
    f.ports.requestApproval = vi.fn(
      ({ signal }) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve("rejected"), {
            once: true,
          })
        )
    );
    const run = runChatOrchestration(f.params, f.ports);
    await vi.waitFor(() =>
      expect(f.ports.requestApproval).toHaveBeenCalledOnce()
    );
    f.params.abortController.abort(new DOMException("Cancelled", "AbortError"));
    expect(await run).toMatchObject({ status: "cancelled" });
    const tool = Object.values(f.session.nodes!).find(
      (n) => n.role === "tool"
    )!;
    expect(tool).toMatchObject({
      status: "complete",
      childrenIds: [],
      metadata: { toolCalls: [expect.objectContaining({ status: "denied" })] },
    });
    expect(f.ports.executeSingleNode).toHaveBeenCalledOnce();
    expect(f.params.generatingNodes.size).toBe(0);
    expect(f.params.abortControllers.size).toBe(0);
  });
  it("serializes asynchronous status writes so older checkpoints cannot overtake newer state", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let active = 0,
      peak = 0;
    f.ports.persistSession = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
    };
    const run = runChatOrchestration(f.params, f.ports);
    await vi.runAllTimersAsync();
    expect(await run).toMatchObject({ status: "complete", iterations: 2 });
    expect(peak).toBe(1);
    expect(active).toBe(0);
  });
  it.each(["compression", "pre-tool checkpoint"] as const)(
    "honors cancellation settled during %s before dispatching the next operation",
    async (phase) => {
      const f = fixture();
      const owner = new AbortController();
      f.params.abortController = owner;
      const cancel = () =>
        owner.abort(new DOMException("Cancelled", "AbortError"));
      if (phase === "compression")
        f.ports.waitForContextCompression = async () => {
          cancel();
          return false;
        };
      else
        vi.mocked(f.ports.persistSession).mockImplementationOnce(async () => {
          cancel();
        });
      expect(await runChatOrchestration(f.params, f.ports)).toMatchObject({
        status: "cancelled",
      });
      expect(f.ports.executeSingleNode).toHaveBeenCalledTimes(
        phase === "compression" ? 0 : 1
      );
      expect(f.ports.processCycle).not.toHaveBeenCalled();
      expect(f.params.generatingNodes.size).toBe(0);
      expect(f.params.abortControllers.size).toBe(0);
    }
  );
});
