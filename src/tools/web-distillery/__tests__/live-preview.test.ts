// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick, reactive, ref } from "vue";
import { useLivePreview } from "../composables/useLivePreview";
import { iframeBridge } from "../core/iframe-bridge";
import { transformer } from "../core/transformer";
vi.mock("../core/iframe-bridge", () => ({
  iframeBridge: { extractCurrentDom: vi.fn() },
}));
vi.mock("../core/transformer", () => ({ transformer: { transform: vi.fn() } }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn(), error: vi.fn() }),
}));
let state: any;
vi.mock("../stores/store", () => ({ useWebDistilleryStore: () => state }));
let wrapper: ReturnType<typeof mount>;
let api: ReturnType<typeof useLivePreview>;
const visible = ref(true);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  visible.value = true;
  state = reactive({
    activeTab: "interactive",
    activeToolTab: "preview",
    cachedDomSnapshot: "",
    url: "https://fixture.test",
    recipeDraft: {},
    setLivePreviewLoading: vi.fn(),
    setCachedDomSnapshot: vi.fn(),
    setLivePreview: vi.fn(),
  });
  const Page = defineComponent({
    setup() {
      api = useLivePreview();
      return () => h("div");
    },
  });
  wrapper = mount(
    defineComponent({
      setup() {
        return () => h(KeepAlive, {}, () => (visible.value ? h(Page) : null));
      },
    })
  );
});
afterEach(() => wrapper.unmount());
// Protects cached tool pages: delayed snapshots and errors must not overwrite the inactive preview.
it("ignores a rejected snapshot after deactivation and can preview again after activation", async () => {
  const snapshot = deferred<any>();
  vi.mocked(iframeBridge.extractCurrentDom).mockReturnValueOnce(
    snapshot.promise
  );
  const old = api.triggerLivePreview(true);
  visible.value = false;
  await nextTick();
  snapshot.reject(Error("session closed"));
  await old;
  expect(state.setLivePreview).not.toHaveBeenCalled();
  expect(state.setCachedDomSnapshot).not.toHaveBeenCalled();
  visible.value = true;
  await nextTick();
  vi.mocked(iframeBridge.extractCurrentDom).mockResolvedValueOnce({
    html: "new",
    url: state.url,
    title: "Fixture",
  });
  vi.mocked(transformer.transform).mockResolvedValueOnce({
    content: "fresh preview",
    quality: 90,
  } as any);
  await api.triggerLivePreview(true);
  expect(state.setLivePreview).toHaveBeenLastCalledWith("fresh preview", 90);
});
// Protects latest-request-wins when a slow transform finishes after a newer user refresh.
it("keeps the newer preview when transformations complete in reverse order", async () => {
  state.cachedDomSnapshot = "cached";
  const first = deferred<any>();
  const second = deferred<any>();
  vi.mocked(transformer.transform)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const old = api.triggerLivePreview();
  const current = api.triggerLivePreview();
  second.resolve({ content: "new", quality: 95 });
  await current;
  first.resolve({ content: "old", quality: 80 });
  await old;
  expect(state.setLivePreview).toHaveBeenCalledTimes(1);
  expect(state.setLivePreview).toHaveBeenCalledWith("new", 95);
});
