// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import CompanionSessionHost from "../CompanionSessionHost.vue";

const mocks = vi.hoisted(() => ({
  windowType: "main",
  load: vi.fn(async () => {}),
  subscribe: vi.fn(),
  offRegistry: vi.fn(),
  initial: vi.fn(),
  offInitial: vi.fn(),
  action: vi.fn(),
  offAction: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@/services/background-tasks", () => ({
  backgroundTaskRegistry: {
    listTasks: () => [],
    loadFromPersistence: mocks.load,
    subscribe: mocks.subscribe.mockImplementation(() => mocks.offRegistry),
  },
}));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({
    windowType: mocks.windowType,
    onInitialStateRequest: mocks.initial.mockImplementation(
      () => mocks.offInitial
    ),
    onActionRequest: mocks.action.mockImplementation(() => mocks.offAction),
  }),
}));
vi.mock("@/composables/useStateSyncEngine", () => ({
  useStateSyncEngine: mocks.sync,
}));
vi.mock("../CompanionSessionSheet.vue", () => ({
  default: defineComponent({
    setup: () => () => h("article", { "data-companion": "" }),
  }),
}));
vi.mock("@/components/common/BaseDialog.vue", () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
const open = ref(false);
vi.mock("../../composables/useCompanionSession", () => ({
  useCompanionSession: () => ({
    isOpen: open,
    closeCompanion: () => {
      open.value = false;
    },
  }),
}));
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  open.value = false;
  vi.clearAllMocks();
});

// Keep restoration/forwarding active before first open and preserve the observer-only role.
it.each(["main", "detached-component"])(
  "keeps %s synchronization independent of the companion view",
  async (windowType) => {
    mocks.windowType = windowType;
    const wrapper = mount(CompanionSessionHost);
    wrappers.push(wrapper);
    await flushPromises();
    const observer = windowType === "detached-component";
    expect(mocks.sync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        stateKey: "sub-agent:background-tasks",
        autoPush: !observer,
        autoReceive: observer,
        requestOnMount: observer,
      })
    );
    expect(mocks.load).toHaveBeenCalledTimes(observer ? 0 : 1);
    expect(mocks.action).toHaveBeenCalledTimes(observer ? 0 : 1);
    expect(wrapper.find("[data-companion]").exists()).toBe(false);
    open.value = true;
    await flushPromises();
    expect(wrapper.find("[data-companion]").exists()).toBe(true);
    open.value = false;
    await flushPromises();
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.offRegistry).not.toHaveBeenCalled();
    expect(mocks.offAction).not.toHaveBeenCalled();
    wrapper.unmount();
    wrappers.pop();
    expect(mocks.offRegistry).toHaveBeenCalledTimes(observer ? 0 : 1);
    expect(mocks.offInitial).toHaveBeenCalledTimes(observer ? 0 : 1);
    expect(mocks.offAction).toHaveBeenCalledTimes(observer ? 0 : 1);
  }
);
