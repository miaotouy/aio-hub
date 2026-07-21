import type {
  ChatAttachmentInput,
  ChatAttachmentRecord,
  ChatMessageInput,
  ChatMessageRecord,
  ChatSessionInput,
  ChatSessionSnapshot,
  PersistChatChangesRequest,
} from "./chatStorageService";
import type {
  ChatMessageMetadata,
  ChatMessageAttachment,
  ChatMessageNode,
  ChatSession,
  MessageRole,
  MessageStatus,
} from "../types";

function assertTree(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`CHAT_TREE_INVALID: ${message}`);
  }
}

function cloneMetadata(
  metadata: ChatMessageMetadata | undefined
): Record<string, unknown> | undefined {
  if (metadata === undefined) return undefined;
  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
}

function isMessageRole(value: string): value is MessageRole {
  return value === "user" || value === "assistant" || value === "system";
}

function isMessageStatus(value: string): value is MessageStatus {
  return value === "generating" || value === "complete" || value === "error";
}

export function cloneChatSession(session: ChatSession): ChatSession {
  const {
    history: _history,
    historyIndex: _historyIndex,
    ...persistent
  } = session;
  return JSON.parse(JSON.stringify(persistent)) as ChatSession;
}

export function chatSessionToInput(session: ChatSession): ChatSessionInput {
  return {
    id: session.id,
    name: session.name,
    rootNodeId: session.rootNodeId,
    activeLeafId: session.activeLeafId,
    displayAgentId: session.displayAgentId,
    isFavorite: session.isFavorite ?? false,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function chatSessionToMessageInputs(
  session: ChatSession
): ChatMessageInput[] {
  const root = session.nodes[session.rootNodeId];
  assertTree(root, `missing root node ${session.rootNodeId}`);
  assertTree(root.parentId === null, "root node must not have a parent");
  assertTree(
    Boolean(session.nodes[session.activeLeafId]),
    `missing active leaf ${session.activeLeafId}`
  );

  const messages: ChatMessageInput[] = [];
  const visited = new Set<string>();

  const visit = (
    node: ChatMessageNode,
    expectedParentId: string | null,
    siblingOrder: number
  ) => {
    assertTree(!visited.has(node.id), `cycle or duplicate node ${node.id}`);
    assertTree(
      node.parentId === expectedParentId,
      `node ${node.id} has inconsistent parent`
    );
    visited.add(node.id);

    messages.push({
      id: node.id,
      sessionId: session.id,
      parentId: node.parentId,
      siblingOrder,
      lastSelectedChildId: node.lastSelectedChildId,
      role: node.role,
      type: node.type ?? "message",
      content: node.content,
      status: node.status,
      timestamp: node.timestamp,
      metadata: cloneMetadata(node.metadata),
    });

    const childIds = new Set<string>();
    node.childrenIds.forEach((childId, index) => {
      assertTree(!childIds.has(childId), `duplicate child ${childId}`);
      childIds.add(childId);
      const child = session.nodes[childId];
      assertTree(child, `missing child node ${childId}`);
      visit(child, node.id, index);
    });
  };

  visit(root, null, 0);
  assertTree(
    visited.size === Object.keys(session.nodes).length,
    "session contains unreachable nodes"
  );
  return messages;
}

export function chatSessionToAttachmentInputs(
  session: ChatSession
): ChatAttachmentInput[] {
  const inputs: ChatAttachmentInput[] = [];
  const seen = new Set<string>();
  for (const node of Object.values(session.nodes)) {
    (node.attachments ?? []).forEach((attachment, sortOrder) => {
      assertTree(
        !seen.has(attachment.id),
        `duplicate attachment ${attachment.id}`
      );
      seen.add(attachment.id);
      inputs.push({
        id: attachment.id,
        messageId: node.id,
        assetId: attachment.assetId,
        kind: attachment.snapshot.kind,
        displayName: attachment.snapshot.displayName,
        mimeType: attachment.snapshot.mimeType,
        sizeBytes: attachment.snapshot.sizeBytes,
        usagePolicy: attachment.usagePolicy,
        extractedText: attachment.snapshot.extractedText,
        sortOrder,
        createdAt: attachment.createdAt,
      });
    });
  }
  return inputs;
}

function decodeMessage(row: ChatMessageRecord): ChatMessageNode {
  assertTree(isMessageRole(row.role), `unsupported role ${row.role}`);
  assertTree(isMessageStatus(row.status), `unsupported status ${row.status}`);
  assertTree(
    row.metadata !== null &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata),
    `metadata for ${row.id} is not an object`
  );

  const node: ChatMessageNode = {
    id: row.id,
    parentId: row.parentId,
    childrenIds: [],
    content: row.content,
    role: row.role,
    status: row.status,
    type: row.type,
    timestamp: row.timestamp,
    metadata: { ...row.metadata },
  };
  if (row.lastSelectedChildId !== null) {
    node.lastSelectedChildId = row.lastSelectedChildId;
  }
  return node;
}

function decodeAttachment(row: ChatAttachmentRecord): ChatMessageAttachment {
  return {
    id: row.id,
    createdAt: row.createdAt,
    assetId: row.assetId,
    usagePolicy: row.usagePolicy as ChatMessageAttachment["usagePolicy"],
    snapshot: {
      displayName: row.displayName,
      kind: row.kind as ChatMessageAttachment["snapshot"]["kind"],
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      ...(row.extractedText === null
        ? {}
        : { extractedText: row.extractedText }),
    },
  };
}

export function decodeChatSessionSnapshot(
  snapshot: ChatSessionSnapshot
): ChatSession {
  const nodes: Record<string, ChatMessageNode> = {};
  for (const row of snapshot.messages) {
    assertTree(
      row.sessionId === snapshot.session.id,
      "message session mismatch"
    );
    assertTree(!nodes[row.id], `duplicate message ${row.id}`);
    nodes[row.id] = decodeMessage(row);
  }

  for (const row of snapshot.attachments) {
    const node = nodes[row.messageId];
    assertTree(
      node,
      `attachment ${row.id} has missing message ${row.messageId}`
    );
    node.attachments = [...(node.attachments ?? []), decodeAttachment(row)];
  }

  const orderedRows = [...snapshot.messages].sort(
    (left, right) =>
      left.siblingOrder - right.siblingOrder || left.id.localeCompare(right.id)
  );
  for (const row of orderedRows) {
    if (row.parentId === null) continue;
    const parent = nodes[row.parentId];
    assertTree(parent, `missing parent ${row.parentId}`);
    parent.childrenIds.push(row.id);
  }

  const root = nodes[snapshot.session.rootNodeId];
  assertTree(root, `missing root node ${snapshot.session.rootNodeId}`);
  assertTree(root.parentId === null, "root node must not have a parent");
  assertTree(
    Boolean(nodes[snapshot.session.activeLeafId]),
    `missing active leaf ${snapshot.session.activeLeafId}`
  );

  return {
    id: snapshot.session.id,
    name: snapshot.session.name,
    nodes,
    rootNodeId: snapshot.session.rootNodeId,
    activeLeafId: snapshot.session.activeLeafId,
    displayAgentId: snapshot.session.displayAgentId,
    messageCount: snapshot.session.messageCount,
    isFavorite: snapshot.session.isFavorite,
    createdAt: snapshot.session.createdAt,
    updatedAt: snapshot.session.updatedAt,
  };
}

function rowsById(rows: ChatMessageInput[]): Map<string, string> {
  return new Map(rows.map((row) => [row.id, JSON.stringify(row)]));
}

export function buildPersistChatChanges(
  session: ChatSession,
  previous: ChatSession | null = null
): PersistChatChangesRequest {
  if (previous !== null) {
    assertTree(previous.id === session.id, "cannot diff different sessions");
  }

  const currentRows = chatSessionToMessageInputs(session);
  const previousRows = previous ? chatSessionToMessageInputs(previous) : [];
  const currentAttachments = chatSessionToAttachmentInputs(session);
  const previousAttachments = previous
    ? chatSessionToAttachmentInputs(previous)
    : [];
  const previousById = rowsById(previousRows);
  const previousAttachmentsById = new Map(
    previousAttachments.map((attachment) => [
      attachment.id,
      JSON.stringify(attachment),
    ])
  );
  const currentIds = new Set(currentRows.map((row) => row.id));
  const currentAttachmentIds = new Set(
    currentAttachments.map((attachment) => attachment.id)
  );
  const deletedIds = new Set(
    previousRows.filter((row) => !currentIds.has(row.id)).map((row) => row.id)
  );

  const deleteMessageIds = previousRows
    .filter(
      (row) =>
        deletedIds.has(row.id) &&
        (row.parentId === null || !deletedIds.has(row.parentId))
    )
    .map((row) => row.id);

  return {
    session: chatSessionToInput(session),
    upsertMessages: currentRows.filter(
      (row) => previousById.get(row.id) !== JSON.stringify(row)
    ),
    deleteMessageIds,
    upsertAttachments: currentAttachments.filter(
      (attachment) =>
        previousAttachmentsById.get(attachment.id) !==
        JSON.stringify(attachment)
    ),
    deleteAttachmentIds: previousAttachments
      .filter((attachment) => !currentAttachmentIds.has(attachment.id))
      .map((attachment) => attachment.id),
  };
}
