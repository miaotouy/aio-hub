import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("llm-chat/storage-service");

export interface ChatSessionRecord {
  id: string;
  name: string;
  rootNodeId: string;
  activeLeafId: string;
  displayAgentId: string | null;
  messageCount: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  parentId: string | null;
  siblingOrder: number;
  lastSelectedChildId: string | null;
  role: string;
  type: string;
  content: string;
  status: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ChatAttachmentRecord {
  id: string;
  messageId: string;
  assetId: string;
  kind: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  usagePolicy: string;
  extractedText: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ChatSessionSnapshot {
  session: ChatSessionRecord;
  messages: ChatMessageRecord[];
  attachments: ChatAttachmentRecord[];
}

export interface ChatSessionInput {
  id: string;
  name: string;
  rootNodeId: string;
  activeLeafId: string;
  displayAgentId?: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageInput {
  id: string;
  sessionId: string;
  parentId: string | null;
  siblingOrder: number;
  lastSelectedChildId?: string | null;
  role: string;
  type: string;
  content: string;
  status: string;
  timestamp?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChatAttachmentInput {
  id: string;
  messageId: string;
  assetId: string;
  kind: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  usagePolicy: string;
  extractedText?: string | null;
  sortOrder: number;
  createdAt?: string | null;
}

export interface PersistChatChangesRequest {
  session: ChatSessionInput;
  upsertMessages: ChatMessageInput[];
  deleteMessageIds: string[];
  upsertAttachments: ChatAttachmentInput[];
  deleteAttachmentIds: string[];
}

export interface PersistChatChangesResult {
  messageCount: number;
  outboxEvents: number;
}

export interface ChatSessionListQuery {
  limit?: number;
  beforeUpdatedAt?: string;
  beforeId?: string;
}

export interface DeleteChatBranchRequest {
  sessionId: string;
  rootMessageId: string;
  fallbackActiveLeafId: string;
}

export interface DeleteChatResult {
  deletedMessages: number;
  queuedReleaseEvents: number;
}

export interface ChatSearchQuery {
  query: string;
  limit?: number;
}

export interface ChatSearchResult {
  messageId: string;
  sessionId: string;
  sessionName: string;
  content: string;
  snippet: string;
  timestamp: string;
  rank: number;
}

export interface DrainAssetUsageOutboxResult {
  inspected: number;
  delivered: number;
  failed: number;
  deadLettered: number;
}

async function invokeStorage<T>(
  command: string,
  args: Record<string, unknown>,
  userMessage: string
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    errorHandler.handle(error, { userMessage, showToUser: false });
    throw error;
  }
}

export function listChatSessions(
  query: ChatSessionListQuery = {}
): Promise<ChatSessionRecord[]> {
  return invokeStorage("list_chat_sessions", { query }, "无法读取聊天会话列表");
}

export function loadChatSession(
  sessionId: string
): Promise<ChatSessionSnapshot | null> {
  return invokeStorage("load_chat_session", { sessionId }, "无法读取聊天会话");
}

export function persistChatChanges(
  request: PersistChatChangesRequest
): Promise<PersistChatChangesResult> {
  return invokeStorage("persist_chat_changes", { request }, "无法保存聊天会话");
}

export function deleteChatBranch(
  request: DeleteChatBranchRequest
): Promise<DeleteChatResult> {
  return invokeStorage("delete_chat_branch", { request }, "无法删除聊天分支");
}

export function deleteChatSession(
  sessionId: string
): Promise<DeleteChatResult> {
  return invokeStorage(
    "delete_chat_session",
    { sessionId },
    "无法删除聊天会话"
  );
}

export function searchChatMessages(
  query: ChatSearchQuery
): Promise<ChatSearchResult[]> {
  return invokeStorage("search_chat_messages", { query }, "无法搜索聊天消息");
}

export function drainAssetUsageOutbox(
  limit = 50
): Promise<DrainAssetUsageOutboxResult> {
  return invokeStorage(
    "drain_asset_usage_outbox",
    { limit },
    "无法同步聊天附件引用"
  );
}

export function retryAssetUsageOutbox(eventId: string): Promise<boolean> {
  return invokeStorage(
    "retry_asset_usage_outbox",
    { eventId },
    "无法重试聊天附件引用同步"
  );
}
