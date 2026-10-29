import { afterEach, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, reactive, ref, nextTick } from "vue";

const mock = vi.hoisted(() => ({
  store: null as any,
  downstream: null as any,
  engines: [] as any[],
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: () => {},
  }),
}));
vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => mock.store,
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ agents: [] }),
}));
vi.mock("@/tools/llm-chat/stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ profiles: [], globalProfileId: null }),
}));
vi.mock("@/tools/st-worldbook-manager/stores/worldbookStore", () => ({
  useWorldbookStore: () => ({ initializeSync: () => {} }),
}));
vi.mock("@/composables/useDetachedManager", () => ({
  useDetachedManager: () => ({ detachedComponents: ref([]) }),
}));
vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: ref(null) }),
}));
vi.mock("@/tools/llm-chat/composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: ref({ uiPreferences: { isStreaming: true } }),
  }),
}));
vi.mock("@/tools/llm-chat/stores/toolCallingStore", () => ({
  useToolCallingStore: () => ({ pendingRequests: [] }),
}));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({
    windowType: "main",
    hasDownstreamWindows: mock.downstream,
    onActionRequest: () => {},
  }),
}));
vi.mock("@/composables/useStateSyncEngine", () => ({
  useStateSyncEngine: (_s: any, c: any) => {
    const e = {
      key: c.stateKey,
      cleanup: vi.fn(),
      setDebounce: vi.fn(),
      manualPush: vi.fn(),
    };
    mock.engines.push(e);
    return e;
  },
}));
import { useLlmChatSync } from "../useLlmChatSync";
// Reopening downstream windows must preserve one completion broadcast per send.
// Store and transport are boundaries; the real composable owns watcher lifetimes.
let app: ReturnType<typeof createApp> | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  mock.engines.length = 0;
});
function host(sending = false) {
  mock.store = reactive({
    isSending: sending,
    sessions: [],
    generatingNodes: new Set(),
    favoriteFolders: [],
    currentSessionId: null,
    currentSessionDetail: null,
    newSessionDraft: null,
  });
  mock.downstream = ref(false);
  app = createApp(
    defineComponent({
      setup() {
        useLlmChatSync();
        return () => h("div");
      },
    })
  );
  app.mount(document.createElement("div"));
}
it("keeps one completion broadcast across reopen and cancels watchers after close/unmount", async () => {
  host();
  for (let cycle = 0; cycle < 3; cycle++) {
    mock.downstream.value = true;
    await nextTick();
    const engine = mock.engines
      .filter((e) => e.key === "chat-current-session-data")
      .slice(-1)[0];
    mock.store.isSending = true;
    await nextTick();
    engine.manualPush.mockClear();
    mock.store.isSending = false;
    await nextTick();
    expect(engine.manualPush).toHaveBeenCalledTimes(1);
    mock.downstream.value = false;
    await nextTick();
    expect(engine.cleanup).toHaveBeenCalledTimes(1);
    mock.store.isSending = true;
    await nextTick();
    mock.store.isSending = false;
    await nextTick();
    expect(engine.manualPush).toHaveBeenCalledTimes(1);
  }
  mock.downstream.value = true;
  await nextTick();
  const engine = mock.engines
    .filter((e) => e.key === "chat-current-session-data")
    .slice(-1)[0];
  app!.unmount();
  app = undefined;
  mock.store.isSending = true;
  await nextTick();
  mock.store.isSending = false;
  await nextTick();
  expect(engine.manualPush).not.toHaveBeenCalled();
  expect(engine.cleanup).toHaveBeenCalledTimes(1);
});
it("opens during generation with the streaming sync interval immediately", async () => {
  host(true);
  mock.downstream.value = true;
  await nextTick();
  const engine = mock.engines
    .filter((e) => e.key === "chat-current-session-data")
    .slice(-1)[0];
  expect(engine.setDebounce).toHaveBeenCalledWith(2000);
  expect(engine.manualPush).not.toHaveBeenCalled();
});
