import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, handleMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  handleMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: handleMock }),
}));

import {
  deleteChatBranch,
  deleteChatSession,
  listChatSessions,
  loadChatSession,
  persistChatChanges,
  replaceChatAssetWithText,
  searchChatMessages,
  drainAssetUsageOutbox,
  retryAssetUsageOutbox,
} from "../chatStorageService";

beforeEach(() => {
  invokeMock.mockReset();
  handleMock.mockReset();
});

describe("chat storage command client", () => {
  it("forwards structured session queries", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const query = {
      limit: 20,
      beforeUpdatedAt: "2026-07-21T00:00:00.000Z",
      beforeId: "s-1",
    };
    await expect(listChatSessions(query)).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("list_chat_sessions", { query });
  });

  it("wraps load and persist commands without exposing SQL", async () => {
    const snapshot = { session: {}, messages: [], attachments: [] };
    const request = {
      session: { id: "s-1" },
      upsertMessages: [],
      deleteMessageIds: [],
      upsertAttachments: [],
      deleteAttachmentIds: [],
    };
    invokeMock
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ messageCount: 0, outboxEvents: 0 });

    await expect(loadChatSession("s-1")).resolves.toEqual(snapshot);
    await expect(persistChatChanges(request as never)).resolves.toEqual({
      messageCount: 0,
      outboxEvents: 0,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_chat_session", {
      sessionId: "s-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "persist_chat_changes", {
      request,
    });
  });

  it("uses domain commands for branch deletion, session deletion and search", async () => {
    invokeMock
      .mockResolvedValueOnce({ deletedMessages: 1, queuedReleaseEvents: 1 })
      .mockResolvedValueOnce({ deletedMessages: 2, queuedReleaseEvents: 2 })
      .mockResolvedValueOnce([]);
    const branch = {
      sessionId: "s-1",
      rootMessageId: "m-1",
      fallbackActiveLeafId: "root",
    };

    await deleteChatBranch(branch);
    await deleteChatSession("s-1");
    await searchChatMessages({ query: "hello", limit: 5 });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "delete_chat_branch", {
      request: branch,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "delete_chat_session", {
      sessionId: "s-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "search_chat_messages", {
      query: { query: "hello", limit: 5 },
    });
  });

  it("persists extracted asset text through a chat domain command", async () => {
    invokeMock.mockResolvedValueOnce({
      updatedAttachments: 2,
      affectedMessages: 2,
      outboxEvents: 2,
    });

    await expect(
      replaceChatAssetWithText("asset-text", "extracted text")
    ).resolves.toEqual({
      updatedAttachments: 2,
      affectedMessages: 2,
      outboxEvents: 2,
    });
    expect(invokeMock).toHaveBeenCalledWith("replace_chat_asset_with_text", {
      assetId: "asset-text",
      extractedText: "extracted text",
    });
  });

  it("drains and retries usage outbox through explicit commands", async () => {
    invokeMock.mockResolvedValueOnce({
      inspected: 2,
      delivered: 2,
      failed: 0,
      deadLettered: 0,
    });
    invokeMock.mockResolvedValueOnce(true);

    await expect(drainAssetUsageOutbox(10)).resolves.toEqual({
      inspected: 2,
      delivered: 2,
      failed: 0,
      deadLettered: 0,
    });
    await expect(retryAssetUsageOutbox("event-1")).resolves.toBe(true);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "drain_asset_usage_outbox", {
      limit: 10,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "retry_asset_usage_outbox", {
      eventId: "event-1",
    });
  });

  it("reports command failures through the module handler and rethrows", async () => {
    const error = new Error("storage unavailable");
    invokeMock.mockRejectedValueOnce(error);

    await expect(loadChatSession("s-1")).rejects.toBe(error);
    expect(handleMock).toHaveBeenCalledWith(error, {
      userMessage: "无法读取聊天会话",
      showToUser: false,
    });
  });
});
