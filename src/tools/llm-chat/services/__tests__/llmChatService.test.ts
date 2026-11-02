import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, currentAgentId, input } = vi.hoisted(() => ({
  input: {
    temporaryModel: { value: null },
    virtualAttachments: {
      value:
        [] as import("../../types/virtual-attachment").VirtualTextAttachment[],
    },
    attachmentCount: { value: 0 },
    getContent: vi.fn(() => "原有问题"),
    addContent: vi.fn(),
    addVirtualAttachment: vi.fn(),
  },
  store: {
    currentSessionId: null as string | null,
    sessionIndexMap: new Map<string, { id: string }>(),
    sessions: [{ id: "old", updatedAt: "2026-01-01T00:00:00.000Z" }],
    beginNewSession: vi.fn(),
    switchSession: vi.fn(),
    sendMessage: vi.fn(),
  },
  currentAgentId: { value: "agent-1" as string | null },
}));

vi.mock("../../stores/llmChatStore", () => ({ useLlmChatStore: () => store }));
vi.mock("../../composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId }),
}));
vi.mock("../../composables/input/useChatInputManager", () => ({
  useChatInputManager: () => input,
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: vi.fn(),
}));
vi.mock("../../stores/userProfileStore", () => ({
  useUserProfileStore: vi.fn(),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  ErrorLevel: { ERROR: "error" },
  createModuleErrorHandler: () => ({
    wrapAsync: async (fn: () => Promise<unknown>) => await fn(),
    wrapSync: (fn: () => unknown) => {
      try {
        return fn();
      } catch {
        return null;
      }
    },
  }),
}));

vi.mock("@/utils/customMessage", () => ({
  customMessage: { warning: vi.fn() },
}));

import { LlmChatService } from "../llmChatService";
import { useChatInputSettings } from "../../composables/input/useChatInputSettings";
import { customMessage } from "@/utils/customMessage";
import {
  MAX_TEXT_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENTS,
} from "../../utils/virtualAttachments";

// 验证实际发送目标，保护新会话消息不会追加到历史记录。
describe("LlmChatService 会话选择", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAgentId.value = "agent-1";
    store.currentSessionId = null;
    store.sessionIndexMap = new Map([["old", { id: "old" }]]);
    store.beginNewSession.mockImplementation(async () => {
      store.currentSessionId = "draft";
      store.sessionIndexMap.set("draft", { id: "draft" });
      return "draft";
    });
    store.sendMessage.mockResolvedValue(undefined);
  });

  it("空选择且存在历史时，等待新会话就绪再向新会话发送", async () => {
    let releaseDraft!: () => void;
    store.beginNewSession.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releaseDraft = () => {
            store.currentSessionId = "draft";
            store.sessionIndexMap.set("draft", { id: "draft" });
            resolve("draft");
          };
        })
    );
    let sentTo: string | null = null;
    store.sendMessage.mockImplementation(async () => {
      sentTo = store.currentSessionId;
    });

    const sending = new LlmChatService().sendMessage("新话题");
    expect(store.sendMessage).not.toHaveBeenCalled();
    releaseDraft();
    await sending;

    expect(store.beginNewSession).toHaveBeenCalledWith("agent-1");
    expect(sentTo).toBe("draft");
    expect(store.sendMessage).toHaveBeenCalledWith("新话题", {
      sessionId: "draft",
      temporaryModel: null,
    });
    expect(store.switchSession).not.toHaveBeenCalled();
  });

  it("已选中的历史会话继续使用原会话", async () => {
    store.currentSessionId = "old";
    await new LlmChatService().sendMessage("继续");
    expect(store.currentSessionId).toBe("old");
    expect(store.beginNewSession).not.toHaveBeenCalled();
    expect(store.sendMessage).toHaveBeenCalledWith("继续", {
      sessionId: "old",
      temporaryModel: null,
    });
  });

  it("显式指定有效历史会话时保留目标和当前选择", async () => {
    await new LlmChatService().sendMessage("后台消息", { sessionId: "old" });
    expect(store.currentSessionId).toBeNull();
    expect(store.beginNewSession).not.toHaveBeenCalled();
    expect(store.sendMessage).toHaveBeenCalledWith("后台消息", {
      sessionId: "old",
      temporaryModel: null,
    });
  });

  it("显式指定失效会话时阻止消息发送到其他会话", async () => {
    await expect(
      new LlmChatService().sendMessage("后台消息", {
        sessionId: "missing",
      })
    ).rejects.toThrow();
    expect(store.beginNewSession).not.toHaveBeenCalled();
    expect(store.switchSession).not.toHaveBeenCalled();
    expect(store.sendMessage).not.toHaveBeenCalled();
  });
});

// 保护跨工具输入的分流契约：完整材料、现有正文、即时设置及容量回退。
// 断言公开结果和草稿操作，输入管理器内部重构仍可复用这些用例。
describe("LlmChatService 跨工具长文本", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    input.virtualAttachments.value = [];
    input.addVirtualAttachment.mockReset();
    Object.assign(useChatInputSettings().value, {
      longTextAsAttachment: true,
      textAttachmentThreshold: 3000,
    });
  });

  it("将含格式和原始换行的完整材料转为附件，保留现有正文", () => {
    const text = `\`\`\`json\n${"  材料\r\n".repeat(600)}\n\`\`\``;
    const result = new LlmChatService().addContentToInput(text);
    expect(result).toMatchObject({ success: true, currentContent: "原有问题" });
    expect(input.addContent).not.toHaveBeenCalled();
    expect(input.addVirtualAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "text", text }),
      undefined,
      "append"
    );
  });

  it.each([
    { enabled: true, text: "短文本", threshold: 3000 },
    { enabled: false, text: "长文本".repeat(1000), threshold: 3000 },
    { enabled: true, text: "😀".repeat(2999), threshold: 3000 },
    { enabled: true, text: "内容".repeat(1500), threshold: 4000 },
  ])(
    "短文本、关闭转换或低于自定义阈值时保留插入位置（$enabled / $threshold）",
    ({ enabled, text, threshold }) => {
      Object.assign(useChatInputSettings().value, {
        longTextAsAttachment: enabled,
        textAttachmentThreshold: threshold,
      });
      new LlmChatService().addContentToInput(text, { position: "prepend" });
      expect(input.addContent).toHaveBeenCalledWith(text, "prepend");
      expect(input.addVirtualAttachment).not.toHaveBeenCalled();
    }
  );

  it("达到字符阈值后转换，设置变更对同一服务立即生效", () => {
    const service = new LlmChatService();
    const text = "😀".repeat(3000);
    useChatInputSettings().value.longTextAsAttachment = false;
    service.addContentToInput(text);
    expect(input.addContent).toHaveBeenCalledWith(text, "append");
    useChatInputSettings().value.longTextAsAttachment = true;
    service.addContentToInput(text, { position: "prepend" });
    expect(input.addVirtualAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ text }),
      undefined,
      "prepend"
    );
  });

  it.each(["size", "count"])("达到附件 %s 上限时将全文放回正文", (limit) => {
    const text =
      limit === "size"
        ? "a".repeat(MAX_TEXT_ATTACHMENT_BYTES + 1)
        : "材料".repeat(1500);
    if (limit === "count") {
      input.virtualAttachments.value = Array.from(
        { length: MAX_TEXT_ATTACHMENTS },
        (_, i) => ({
          id: String(i),
          kind: "text",
          title: `材料 ${i}`,
          text: "内容",
        })
      );
    }
    expect(new LlmChatService().addContentToInput(text)?.success).toBe(true);
    expect(input.addContent).toHaveBeenCalledWith(text, "append");
    expect(input.addVirtualAttachment).not.toHaveBeenCalled();
    expect(customMessage.warning).toHaveBeenCalledOnce();
  });

  it("附件添加失败时返回失败结果", () => {
    input.addVirtualAttachment.mockImplementation(() => {
      throw new Error("草稿不可用");
    });
    expect(
      new LlmChatService().addContentToInput("材料".repeat(1500))
    ).toBeNull();
  });
});
