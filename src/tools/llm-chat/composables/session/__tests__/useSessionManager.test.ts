import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
} from "../../../types";
import { useSessionManager } from "../useSessionManager";

const storage = vi.hoisted(() => ({
  persistSession: vi.fn(),
}));

vi.mock("../../storage/useChatStorageSeparated", () => ({
  useChatStorageSeparated: () => storage,
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({}));
vi.mock("../../../stores/userProfileStore", () => ({}));
vi.mock("../../../services/greetingService", () => ({}));
vi.mock("../../features/useExportManager", () => ({
  useExportManager: () => ({}),
}));
vi.mock("../../storage/useNewSessionDraftStorage", () => ({}));

function message(
  id: string,
  parentId: string | null,
  role: ChatMessageNode["role"],
  status: ChatMessageNode["status"] = "complete"
): ChatMessageNode {
  return {
    id,
    parentId,
    childrenIds: [],
    role,
    content: status === "waiting" ? "" : id,
    status,
  };
}

describe("useSessionManager persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the session list count when saving the first message while the reply is still pending", async () => {
    const index = ref<ChatSessionIndex>({
      id: "new-session",
      name: "New session",
      messageCount: 0,
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    });
    const root = message("root", null, "system");
    const user = message("user", root.id, "user");
    const assistant = message("assistant", user.id, "assistant", "waiting");
    const detail: ChatSessionDetail = {
      id: index.value.id,
      updatedAt: index.value.updatedAt,
      rootNodeId: root.id,
      activeLeafId: assistant.id,
      nodes: { root, user, assistant },
      history: [],
      historyIndex: -1,
    };
    let finishSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    storage.persistSession.mockReturnValue(pendingSave);

    useSessionManager().persistSession(index.value, detail, index.value.id);

    // The sidebar reads this index while both generation and disk I/O are pending.
    expect(index.value.messageCount).toBe(2);
    expect(storage.persistSession).toHaveBeenCalledWith(
      expect.objectContaining({ messageCount: 2 }),
      detail,
      index.value.id
    );
    expect(assistant.status).toBe("waiting");
    finishSave();
    await pendingSave;
  });
});
