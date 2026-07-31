// @vitest-environment jsdom

import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const store = vi.hoisted(() => ({
  isLoaded: true,
  sessionMetas: [] as Array<{
    id: string;
    name: string;
    updatedAt: string;
  }>,
  init: vi.fn(),
  switchSession: vi.fn(),
  deleteSession: vi.fn(),
  clearAllSessions: vi.fn(),
}));

const settings = vi.hoisted(() => ({
  value: {
    messageManagement: {
      confirmBeforeDeleteSession: true,
      confirmBeforeClearAll: true,
    },
  },
}));

const feedback = vi.hoisted(() => ({
  customDialog: vi.fn(),
  customMessage: vi.fn(),
}));

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("../../stores/llmChatStore", () => ({
  useLlmChatStore: () => store,
}));
vi.mock("../../composables/useChatSettings", () => ({
  useChatSettings: () => ({ settings, loadSettings: vi.fn() }),
}));
vi.mock("../../services/chatStorageService", () => ({
  searchChatMessages: vi.fn(),
}));
vi.mock("@/utils/feedback", () => feedback);
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({ tRaw: (key: string) => key }),
}));
vi.mock("vue-router", () => ({ useRouter: () => router }));

import SessionList from "../SessionList.vue";

const session = {
  id: "session-1",
  name: "Example chat",
  updatedAt: "2026-07-26T00:00:00.000Z",
  createdAt: "2026-07-22T00:00:00.000Z",
  messageCount: 1,
};

const appBarStub = {
  template: '<header><slot name="left" /><slot name="right" /><slot /></header>',
};
const buttonStub = {
  template: '<button type="button"><slot /></button>',
};

async function settle(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}

function mountSessionList() {
  return mount(SessionList, {
    global: {
      stubs: {
        "var-app-bar": appBarStub,
        "var-button": buttonStub,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.isLoaded = true;
  store.sessionMetas = [session];
  store.deleteSession.mockResolvedValue(undefined);
  store.clearAllSessions.mockResolvedValue(1);
  settings.value.messageManagement.confirmBeforeDeleteSession = true;
  settings.value.messageManagement.confirmBeforeClearAll = true;
  feedback.customDialog.mockResolvedValue(true);
});

describe("SessionList confirmation settings", () => {
  it("does not delete a session when the configured confirmation is cancelled", async () => {
    feedback.customDialog.mockResolvedValueOnce(false);
    const wrapper = mountSessionList();
    await settle();

    await wrapper.get('[data-testid="chat-session-delete"]').trigger("click");
    await settle();

    expect(feedback.customDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "tools.llm-chat.SessionList.删除会话" })
    );
    expect(store.deleteSession).not.toHaveBeenCalled();
  });

  it("deletes directly when delete confirmation is disabled", async () => {
    settings.value.messageManagement.confirmBeforeDeleteSession = false;
    const wrapper = mountSessionList();
    await settle();

    await wrapper.get('[data-testid="chat-session-delete"]').trigger("click");
    await settle();

    expect(feedback.customDialog).not.toHaveBeenCalled();
    expect(store.deleteSession).toHaveBeenCalledWith(session.id);
    expect(feedback.customMessage).toHaveBeenCalledWith(
      "tools.llm-chat.SessionList.会话已删除",
      "success"
    );
  });

  it("reorders visible session rows when the user changes the sort control", async () => {
    store.sessionMetas = [
      session,
      {
        id: "session-2",
        name: "Alpha chat",
        updatedAt: "2026-07-24T00:00:00.000Z",
        createdAt: "2026-07-21T00:00:00.000Z",
        messageCount: 4,
      },
    ];
    const wrapper = mountSessionList();
    await settle();

    await wrapper.get('[data-testid="chat-session-sort"]').setValue("name:asc");

    expect(
      wrapper
        .findAll('[data-testid="chat-session-row"]')
        .map((row) => row.attributes("data-session-id"))
    ).toEqual(["session-2", "session-1"]);
  });

  it("confirms before clearing all sessions and reports the cleared count", async () => {
    const wrapper = mountSessionList();
    await settle();

    await wrapper.get('[data-testid="chat-sessions-clear-all"]').trigger("click");
    await settle();

    expect(feedback.customDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "tools.llm-chat.SessionList.清空所有会话" })
    );
    expect(store.clearAllSessions).toHaveBeenCalledOnce();
    expect(feedback.customMessage).toHaveBeenCalledWith(
      "tools.llm-chat.SessionList.已清空会话",
      "success"
    );
  });
});