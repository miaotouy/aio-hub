// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { DEFAULT_TOOL_CALL_CONFIG } from "@/tools/agent-manager/types/agent";
import type {
  ChatAgent,
  ChatMessageNode,
  ChatSessionDetail,
} from "../../types";
import {
  runChatOrchestration,
  type ChatOrchestrationPorts,
} from "./chatOrchestrator";

it.each([undefined, 2])(
  "uses the shared default for missing iteration limits and preserves explicit limits (%s)",
  async (limit) => {
    const node = {
      id: "assistant",
      role: "assistant",
      content: "",
      childrenIds: [],
      metadata: {},
    } as unknown as ChatMessageNode;
    const session = {
      id: "session",
      nodes: { assistant: node },
    } as unknown as ChatSessionDetail;
    const request = {
      requestId: "request",
      toolId: "fixture",
      methodName: "run",
      toolName: "fixture_run",
      args: {},
      rawBlock: "",
    };
    const execute = vi.fn(async () => ({
      response: { content: "call" },
      messagesForRequest: [],
    }));
    const agent = {
      id: "agent",
      toolCallConfig: {
        ...structuredClone(DEFAULT_TOOL_CALL_CONFIG),
        enabled: true,
      },
    } as ChatAgent;
    if (limit === undefined)
      delete (agent.toolCallConfig as Partial<typeof DEFAULT_TOOL_CALL_CONFIG>)
        .maxIterations;
    else agent.toolCallConfig!.maxIterations = limit;
    const ports: ChatOrchestrationPorts = {
      executeSingleNode: execute,
      parseRequests: () => [request],
      processCycle: async () =>
        ({
          hasToolRequests: true,
          parsedRequests: [request],
          executionResults: [
            {
              requestId: "request",
              toolName: "fixture_run",
              status: "success",
              result: "done",
            },
          ],
        }) as any,
      formatCycleResults: () => "done",
      requestApproval: vi.fn(),
      waitForContextCompression: async () => false,
      getNodePath: () => [],
      updateActiveLeaf: vi.fn(),
      persistSession: vi.fn(),
      generateSessionTopic: vi.fn(),
      handleNodeError: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn() },
    };
    const result = await runChatOrchestration(
      {
        session,
        assistantNode: node,
        pathToUserNode: [],
        executionAgent: agent,
        agentConfig: { profileId: "profile", modelId: "model", parameters: {} },
        effectiveUserProfile: null,
        abortControllers: new Map(),
        generatingNodes: new Set(),
        consumeTextCallsLocally: true,
      },
      ports
    );
    expect(result).toMatchObject({
      status: "complete",
      stopReason: "iteration-limit",
      iterations: limit ?? DEFAULT_TOOL_CALL_CONFIG.maxIterations,
    });
    expect(execute).toHaveBeenCalledTimes(
      limit ?? DEFAULT_TOOL_CALL_CONFIG.maxIterations
    );
  }
);
