// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { VNode, ComponentInternalInstance } from "vue";
interface Preferences {
  defaultRenderHtml: boolean;
  enableHtmlFreezer: boolean;
  htmlFreezerKeepAliveCount: number;
  smoothingEnabled: boolean;
  enableEnterAnimation: boolean;
}
interface ChatStore {
  currentSessionId: string | null;
  currentActivePath: {
    role: string;
    content: string;
    status: string;
    metadata?: { error?: string };
  }[];
  generatingNodes: Set<string>;
  createSession(agentId: string, name: string): Promise<string>;
  switchSession(id: string): Promise<void>;
  sendMessage(
    content: string,
    options: {
      sessionId: string;
      agentId: string;
      temporaryModel: { profileId: string; modelId: string };
    }
  ): Promise<void>;
  abortSending(id?: string): void;
  deleteSession(id: string): Promise<void>;
}
interface ProfileModule {
  useLlmProfiles(): {
    loadProfiles(): Promise<void>;
    saveProfile(profile: Record<string, unknown>): Promise<void>;
    deleteProfile(id: string): Promise<void>;
  };
}
interface AgentModule {
  useAgentStore(pinia: unknown): {
    createAgent(
      name: string,
      profile: string,
      model: string,
      options: Record<string, unknown>
    ): string;
    deleteAgent(id: string): Promise<void> | void;
  };
}
interface ChatModule {
  useLlmChatStore(pinia: unknown): ChatStore;
}
interface SettingsModule {
  useChatSettings(): {
    settings: { value: { uiPreferences: Preferences } };
    loadSettings(): Promise<void>;
  };
}

export interface ChatPreviewHarness {
  send(id: string): Promise<void>;
  sample(): {
    generating: number;
    sourceChars: number;
    renderedSource: string;
    hasFrame: boolean;
    sameDocument: boolean;
    note?: string;
    count?: string | null;
    gap: number;
    mermaid: number;
    svg: boolean;
    imageReady: boolean;
    pendingChunks: boolean;
    completed: boolean;
    error?: string;
  };
  edit(): void;
  freeze(enabled: boolean): void;
  ticks(): number;
  cleanup(): Promise<void>;
}

declare global {
  interface Window {
    __CHAT_PREVIEW__?: ChatPreviewHarness;
  }
}

/** Actual chat store, message list and default smoothing; only the provider is local. */
export async function setupChatPreview(input: {
  baseUrl: string;
  profileId: string;
}) {
  const [
    { useLlmProfiles },
    { useAgentStore },
    { useLlmChatStore },
    { useChatSettings },
  ] = await Promise.all([
    import("/src/" + "composables/useLlmProfiles.ts") as Promise<ProfileModule>,
    import(
      "/src/" + "tools/agent-manager/stores/agentStore.ts"
    ) as Promise<AgentModule>,
    import(
      "/src/" + "tools/llm-chat/stores/llmChatStore.ts"
    ) as Promise<ChatModule>,
    import(
      "/src/" + "tools/llm-chat/composables/settings/useChatSettings.ts"
    ) as Promise<SettingsModule>,
  ]);
  const root = (
    document.querySelector("#app") as unknown as {
      __vue_app__: import("vue").App;
    }
  ).__vue_app__;
  const pinia = root.config.globalProperties.$pinia;
  const profiles = useLlmProfiles();
  await profiles.loadProfiles();
  await profiles.saveProfile({
    id: input.profileId,
    name: "内嵌预览本地复核",
    type: "openai-compatible",
    baseUrl: input.baseUrl + "/v1",
    apiKeys: ["local-preview-fixture"],
    enabled: true,
    networkStrategy: "native",
    models: [
      { id: "preview-chat", name: "Preview fixture", provider: "openai" },
    ],
    customHeaders: {},
    customEndpoints: {},
  });
  const agents = useAgentStore(pinia);
  const agentId = agents.createAgent(
    "内嵌预览复核",
    input.profileId,
    "preview-chat",
    { presetMessages: [] }
  );
  const store: ChatStore = useLlmChatStore(pinia);
  const chatSettings: ReturnType<SettingsModule["useChatSettings"]> =
    useChatSettings();
  await chatSettings.loadSettings();
  const preferences = chatSettings.settings.value.uiPreferences;
  const original = {
    defaultRenderHtml: preferences.defaultRenderHtml,
    enableHtmlFreezer: preferences.enableHtmlFreezer,
    htmlFreezerKeepAliveCount: preferences.htmlFreezerKeepAliveCount,
  };
  preferences.defaultRenderHtml = true;
  preferences.enableHtmlFreezer = false;
  const sessions: string[] = [];
  let pending: Promise<void> | undefined,
    completed = false,
    error: string | undefined;
  let editedDocument: Document | null = null;
  let ticks = 0;
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === "preview-fixture-tick") ticks++;
  };
  window.addEventListener("message", onMessage);
  const walk = (
    v: VNode | null,
    name: string
  ): ComponentInternalInstance | undefined => {
    if (!v) return;
    if (v.component) {
      if ((v.component.type as { __name?: string }).__name === name)
        return v.component;
      const found = walk(v.component.subTree, name);
      if (found) return found;
    }
    if (v.suspense) {
      const found = walk(v.suspense.activeBranch, name);
      if (found) return found;
    }
    for (const child of Array.isArray(v.children) ? v.children : []) {
      if (child && typeof child === "object") {
        const found = walk(child as VNode, name);
        if (found) return found;
      }
    }
  };
  const frame = () =>
    document.querySelector<HTMLIFrameElement>(".message-list iframe");
  window.__CHAT_PREVIEW__ = {
    async send(id) {
      const sessionId = await store.createSession(agentId, `预览复核 ${id}`);
      sessions.push(sessionId);
      await store.switchSession(sessionId);
      editedDocument = null;
      completed = false;
      error = undefined;
      pending = store
        .sendMessage(`[preview:${id}]`, {
          sessionId,
          agentId,
          temporaryModel: {
            profileId: input.profileId,
            modelId: "preview-chat",
          },
        })
        .catch((e: unknown) => {
          error = String(e);
        })
        .finally(() => {
          completed = true;
        });
    },
    sample() {
      const node = [...store.currentActivePath]
        .reverse()
        .find((n) => n.role === "assistant");
      const list = document.querySelector<HTMLElement>(".message-list");
      const f = frame(),
        doc = f?.contentDocument;
      const container = (root as unknown as { _container: { _vnode: VNode } })
        ._container;
      const viewer = walk(container._vnode, "HtmlInteractiveViewer");
      return {
        generating: store.generatingNodes.size,
        sourceChars: node?.content.length ?? 0,
        renderedSource: String(viewer?.props.content ?? ""),
        hasFrame: !!f,
        sameDocument: !!doc && doc === editedDocument,
        note: doc?.querySelector<HTMLInputElement>("#note")?.value,
        count: doc?.querySelector("#count")?.textContent,
        gap: list ? list.scrollHeight - list.clientHeight - list.scrollTop : 0,
        mermaid: document.querySelectorAll(".message-list .mermaid-svg > svg")
          .length,
        svg: !!doc?.querySelector("svg"),
        imageReady: !!document.querySelector<HTMLImageElement>(
          ".message-list .markdown-image"
        )?.naturalWidth,
        pendingChunks: node?.status === "generating",
        completed,
        error: error ?? node?.metadata?.error,
      };
    },
    edit() {
      editedDocument = frame()!.contentDocument;
      editedDocument!.querySelector<HTMLInputElement>("#note")!.value =
        "保留的输入 🌿";
      (editedDocument!.querySelector("#increment") as HTMLElement).click();
    },
    freeze(enabled) {
      preferences.enableHtmlFreezer = enabled;
      preferences.htmlFreezerKeepAliveCount = 0;
    },
    ticks: () => ticks,
    async cleanup() {
      store.abortSending(store.currentSessionId ?? undefined);
      await pending;
      Object.assign(preferences, original);
      for (const id of sessions) await store.deleteSession(id);
      await agents.deleteAgent(agentId);
      await profiles.deleteProfile(input.profileId);
      window.removeEventListener("message", onMessage);
      delete window.__CHAT_PREVIEW__;
    },
  };
  return {
    smoothing: preferences.smoothingEnabled,
    animation: preferences.enableEnterAnimation,
  };
}
