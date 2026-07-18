// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type {
  KnowledgeReference,
  KnowledgeToolSearchResponse,
} from "@/tools/knowledge-base/types";
import type { ChatMessageNode, ChatSessionDetail } from "../types";
import type { useNodeManager } from "../composables/session/useNodeManager";

type NodeManager = Pick<
  ReturnType<typeof useNodeManager>,
  "createNode" | "addNodeToSession"
>;

export interface ExplicitKnowledgeToolEvent {
  requestId: string;
  toolNode: ChatMessageNode;
}

export function createExplicitKnowledgeToolEvent(
  nodeManager: NodeManager,
  session: ChatSessionDetail,
  userNode: ChatMessageNode,
  assistantNode: ChatMessageNode,
  agentId: string,
  query: string,
  reference: KnowledgeReference
): ExplicitKnowledgeToolEvent {
  const requestId = "knowledge-reference-" + userNode.id;
  userNode.knowledgeReference = reference;
  userNode.metadata = {
    ...userNode.metadata,
    knowledgeReferenceRequestId: requestId,
  };

  const toolNode = nodeManager.createNode({
    role: "tool",
    content: "",
    parentId: userNode.id,
    status: "generating",
    metadata: {
      agentId,
      knowledgeReferenceUserMessageId: userNode.id,
      toolCalls: [
        {
          requestId,
          toolName: "knowledge.search",
          status: "executing",
          rawArgs: {
            query,
            libraryIds: reference.libraryIds,
            strategy: "auto",
          },
        },
      ],
    },
  });

  userNode.childrenIds = userNode.childrenIds.filter(
    (childId) => childId !== assistantNode.id
  );
  nodeManager.addNodeToSession(session, toolNode);
  toolNode.childrenIds.push(assistantNode.id);
  assistantNode.parentId = toolNode.id;

  return { requestId, toolNode };
}

export function completeExplicitKnowledgeToolEvent(
  event: ExplicitKnowledgeToolEvent,
  userNode: ChatMessageNode,
  query: string,
  reference: KnowledgeReference,
  result: KnowledgeToolSearchResponse,
  content: string,
  durationMs: number
): void {
  userNode.knowledgeReference = reference;
  event.toolNode.content = content;
  event.toolNode.status = "complete";
  event.toolNode.metadata = {
    ...event.toolNode.metadata,
    toolCalls: [
      {
        requestId: event.requestId,
        toolName: "knowledge.search",
        status: "success",
        durationMs,
        rawArgs: {
          query,
          libraryIds: reference.libraryIds,
          strategy: "auto",
        },
        resultMetadata: {
          userMessageId: userNode.id,
          requestedStrategy: result.requestedStrategy,
          actualStrategies: result.traces,
          resultCount: result.hits.length,
          sources: result.hits.map((hit) => ({
            libraryId: hit.libraryId,
            documentId: hit.documentId,
            chunkId: hit.chunkId,
            chunkIndex: hit.chunkIndex,
            sourcePath: hit.sourcePath,
          })),
        },
      },
    ],
  };
}

export function failExplicitKnowledgeToolEvent(
  event: ExplicitKnowledgeToolEvent,
  userNode: ChatMessageNode,
  query: string,
  reference: KnowledgeReference,
  message: string,
  failureType: string,
  durationMs: number
): void {
  event.toolNode.content = "Knowledge 查询失败：" + message;
  event.toolNode.status = "complete";
  event.toolNode.metadata = {
    ...event.toolNode.metadata,
    error: message,
    toolCalls: [
      {
        requestId: event.requestId,
        toolName: "knowledge.search",
        status: "error",
        durationMs,
        rawArgs: {
          query,
          libraryIds: reference.libraryIds,
          strategy: "auto",
        },
        resultMetadata: {
          userMessageId: userNode.id,
          failureType,
        },
      },
    ],
  };
}
