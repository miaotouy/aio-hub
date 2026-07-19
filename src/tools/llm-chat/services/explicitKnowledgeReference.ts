// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type {
  KnowledgeReference,
  KnowledgeToolSearchResponse,
} from "@/tools/knowledge-base/types";
import type { KnowledgeResearchResult } from "@/tools/knowledge-base/research";
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

function toolName(reference: KnowledgeReference): "knowledge.search" | "knowledge.research" {
  return reference.mode === "research" ? "knowledge.research" : "knowledge.search";
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
          toolName: toolName(reference),
          status: "executing",
          rawArgs: {
            query,
            libraryIds: reference.libraryIds,
            strategy: reference.mode === "research" ? undefined : "auto",
          },
        },
      ],
    },
  });

  userNode.childrenIds = userNode.childrenIds.filter(
    (childId) => childId !== assistantNode.id
  );
  nodeManager.addNodeToSession(session, toolNode);
  // Keep the proxy stored in the reactive session so completion updates repaint
  // the collapsed tool preview as well as the persisted session.
  const sessionToolNode = session.nodes[toolNode.id] ?? toolNode;
  sessionToolNode.childrenIds.push(assistantNode.id);
  assistantNode.parentId = sessionToolNode.id;

  return { requestId, toolNode: sessionToolNode };
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
        toolName: toolName(reference),
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

export function completeExplicitKnowledgeResearchEvent(
  event: ExplicitKnowledgeToolEvent,
  userNode: ChatMessageNode,
  query: string,
  reference: KnowledgeReference,
  result: KnowledgeResearchResult,
  content: string,
  durationMs: number
): void {
  const cancelled = result.terminationReason === "cancelled";
  userNode.knowledgeReference = reference;
  event.toolNode.content = content;
  event.toolNode.status = cancelled ? "error" : "complete";
  event.toolNode.metadata = {
    ...event.toolNode.metadata,
    toolCalls: [
      {
        requestId: event.requestId,
        toolName: "knowledge.research",
        status: cancelled ? "cancelled" : "success",
        durationMs,
        rawArgs: {
          question: query,
          libraryIds: reference.libraryIds,
        },
        resultMetadata: {
          userMessageId: userNode.id,
          terminationReason: result.terminationReason,
          rounds: result.rounds,
          toolCalls: result.toolCalls,
          evidenceChars: result.evidenceChars,
          resultCount: result.citations.length,
          sources: result.citations.map((citation) => ({
            libraryId: citation.libraryId,
            documentId: citation.documentId,
            chunkId: citation.chunkId,
            chunkIndex: citation.chunkIndex,
            sourcePath: citation.sourcePath,
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
        toolName: toolName(reference),
        status: "error",
        durationMs,
        rawArgs: {
          query,
          libraryIds: reference.libraryIds,
          strategy: reference.mode === "research" ? undefined : "auto",
        },
        resultMetadata: {
          userMessageId: userNode.id,
          failureType,
        },
      },
    ],
  };
}
