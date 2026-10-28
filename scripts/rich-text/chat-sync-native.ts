// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import type { Page } from "playwright-core";
import type { DevConnection } from "../dev-control/connection";
/** Use the real producer, native component windows and consumer; fixtures remain in isolated memory. */
export async function runChatSyncNative(connection: DevConnection, main: Page) {
  const rows = [];
  let child: Page | undefined;
  const originalRoute = new URL(main.url()).pathname;
  try {
    await connection.verify(main, "main");
    await main.evaluate(() =>
      window.__AIO_DEV_CONTROL__!.navigate("/llm-chat", 20000)
    );
    await main.waitForSelector(".message-list", { timeout: 60000 });
    await main.evaluate(async () => {
      const { useLlmChatStore } = await import(
        "/src/" + "tools/llm-chat/stores/llmChatStore.ts"
      );
      const { useChatSettings } = await import(
        "/src/" + "tools/llm-chat/composables/settings/useChatSettings.ts"
      );
      const { useChatResponseHandler } = await import(
        "/src/" + "tools/llm-chat/composables/chat/useChatResponseHandler.ts"
      );
      const { useNodeManager } = await import(
        "/src/" + "tools/llm-chat/composables/session/useNodeManager.ts"
      );
      const app = (document.querySelector("#app") as any).__vue_app__;
      const store = useLlmChatStore(app.config.globalProperties.$pinia);
      const settings = useChatSettings().settings;
      const save = settings.value.requestSettings.enableIncrementalSave;
      settings.value.requestSettings.enableIncrementalSave = false;
      const previous = store.currentSessionId;
      const handler = useChatResponseHandler();
      let current: any;
      const fixtures: any[] = [];
      (window as any).__SYNC_PROBE__ = {
        setup(cycle: number) {
          const id = `native-sync-${Date.now()}-${cycle}`;
          const create = useNodeManager().createNode;
          const root = create({
            role: "system",
            content: "",
            parentId: null,
            status: "complete",
          });
          const user = create({
            role: "user",
            content: "Local sync fixture",
            parentId: root.id,
            status: "complete",
          });
          const assistant = create({
            role: "assistant",
            content: "",
            parentId: user.id,
            status: "waiting",
            metadata: { requestStartTime: Date.now() },
          });
          const tool = create({
            role: "tool",
            content: "",
            parentId: assistant.id,
            status: "waiting",
            metadata: {
              requestStartTime: Date.now(),
              toolCalls: [
                {
                  requestId: "fixture",
                  toolName: "Fixture",
                  status: "success",
                },
              ],
            },
          });
          root.childrenIds = [user.id];
          user.childrenIds = [assistant.id];
          assistant.childrenIds = [tool.id];
          const detail = {
            id,
            nodes: {
              [root.id]: root,
              [user.id]: user,
              [assistant.id]: assistant,
              [tool.id]: tool,
            },
            rootNodeId: root.id,
            activeLeafId: tool.id,
            updatedAt: new Date().toISOString(),
            history: [],
            historyIndex: -1,
          };
          store.sessionIndexMap.set(id, {
            id,
            name: "Native sync fixture",
            messageCount: 3,
            createdAt: detail.updatedAt,
            updatedAt: detail.updatedAt,
          });
          store.sessionDetailMap.set(id, detail);
          store.currentSessionId = id;
          store.generatingNodes.add(assistant.id);
          store.generatingNodes.add(tool.id);
          current = { id, assistant: assistant.id, tool: tool.id };
          fixtures.push(current);
          return current;
        },
        reasoning() {
          handler.handleStreamUpdate(
            store.sessionDetailMap.get(current.id),
            current.assistant,
            "thinking",
            true
          );
        },
        chunks() {
          const detail = store.sessionDetailMap.get(current.id);
          handler.handleStreamUpdate(detail, current.assistant, "first");
          handler.handleStreamUpdate(detail, current.tool, "tool-first");
        },
        more() {
          const detail = store.sessionDetailMap.get(current.id);
          handler.handleStreamUpdate(detail, current.assistant, " second");
          handler.handleStreamUpdate(detail, current.tool, " tool-second");
        },
        finish() {
          const detail = store.sessionDetailMap.get(current.id);
          for (const id of [current.assistant, current.tool]) {
            handler.completeStreamSegment(detail, id);
            store.generatingNodes.delete(id);
          }
        },
        cleanup() {
          for (const fixture of fixtures) {
            for (const id of [fixture.assistant, fixture.tool])
              store.generatingNodes.delete(id);
            store.sessionDetailMap.delete(fixture.id);
            store.sessionIndexMap.delete(fixture.id);
          }
          store.currentSessionId = previous;
          settings.value.requestSettings.enableIncrementalSave = save;
          delete (window as any).__SYNC_PROBE__;
        },
      };
    });
    for (let cycle = 1; cycle <= 3; cycle++) {
      const ids = await main.evaluate(
        (cycle) => (window as any).__SYNC_PROBE__.setup(cycle),
        cycle
      );
      await main.evaluate(async () => {
        const invoke = (window as any).__TAURI_INTERNALS__.invoke;
        const sessionId = await invoke("begin_detach_session", {
          config: {
            id: "llm-chat:chat-area",
            displayName: "Native sync fixture",
            type: "component",
            width: 900,
            height: 750,
            mouseX: 800,
            mouseY: 450,
            handleOffsetX: 400,
            handleOffsetY: 20,
            disableNativeResize: false,
            disableDragDropHandler: false,
          },
        });
        await invoke("finalize_detach_session", {
          sessionId,
          shouldDetach: true,
        });
      });
      let found;
      for (let i = 0; i < 120; i++) {
        found = (await connection.windows()).find(
          (x) => x.description.windowLabel === "detached-llm-chat:chat-area"
        );
        if (found?.description.ready) break;
        await Bun.sleep(500);
      }
      if (!found?.description.ready)
        throw new Error("Detached component not ready");
      child = found.page;
      await child.evaluate(async () => {
        const { useLlmChatStore } = await import(
          "/src/" + "tools/llm-chat/stores/llmChatStore.ts"
        );
        const app = (document.querySelector("#app") as any).__vue_app__;
        (window as any).__SYNC_STORE__ = useLlmChatStore(
          app.config.globalProperties.$pinia
        );
      });
      await child.waitForFunction(
        ({ id, tool }) =>
          !!(window as any).__SYNC_STORE__.sessionDetailMap.get(id)?.nodes[
            tool
          ],
        ids,
        { timeout: 30000 }
      );
      await main.evaluate(() => (window as any).__SYNC_PROBE__.reasoning());
      await Bun.sleep(100);
      const start = performance.now();
      await main.evaluate(() => (window as any).__SYNC_PROBE__.chunks());
      await child.waitForFunction(
        ({ id, assistant, tool }) => {
          const d = (window as any).__SYNC_STORE__.sessionDetailMap.get(id);
          return (
            d?.nodes[assistant]?.content === "first" &&
            d?.nodes[tool]?.content === "tool-first"
          );
        },
        ids,
        { timeout: 1300 }
      );
      const deltaMs = performance.now() - start;
      await main.evaluate(() => (window as any).__SYNC_PROBE__.more());
      await Bun.sleep(2400);
      const sample = await child.evaluate(({ id, assistant, tool }) => {
        const d = (window as any).__SYNC_STORE__.sessionDetailMap.get(id);
        return {
          body: d.nodes[assistant].content,
          reasoning: d.nodes[assistant].metadata.reasoningContent,
          tool: d.nodes[tool].content,
          toolSummary: document
            .querySelector(".tool-preview-line .preview-text")
            ?.textContent?.trim(),
        };
      }, ids);
      await main.evaluate(() => (window as any).__SYNC_PROBE__.finish());
      await child.waitForFunction(
        ({ id, assistant, tool }) => {
          const d = (window as any).__SYNC_STORE__.sessionDetailMap.get(id);
          return (
            d?.nodes[assistant]?.status === "complete" &&
            d?.nodes[tool]?.status === "complete"
          );
        },
        ids,
        { timeout: 5000 }
      );
      rows.push({
        id: `detached-sync-${cycle}`,
        deltaMs,
        sample,
        passed:
          sample.body === "first second" &&
          sample.reasoning === "thinking" &&
          sample.tool === "tool-first tool-second" &&
          sample.toolSummary?.includes("tool-first tool-second"),
      });
      await main.evaluate(async () => {
        const { useDetachedManager } = await import(
          "/src/" + "composables/useDetachedManager.ts"
        );
        await useDetachedManager().closeWindow("llm-chat:chat-area");
      });
      child = undefined;
      await Bun.sleep(700);
    }
  } finally {
    if (main) {
      await main
        .evaluate(async () => {
          const { useDetachedManager } = await import(
            "/src/" + "composables/useDetachedManager.ts"
          );
          if (useDetachedManager().isDetached("llm-chat:chat-area"))
            await useDetachedManager().closeWindow("llm-chat:chat-area");
          (window as any).__SYNC_PROBE__?.cleanup();
        })
        .catch(() => {});
    }
    await main.evaluate(
      (route) => window.__AIO_DEV_CONTROL__!.navigate(route, 20000),
      originalRoute
    );
    child = undefined;
  }

  return rows;
}
