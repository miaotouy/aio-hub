import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  visible: null as any,
  selection: null as any,
}));
const profile = {
  id: "profile",
  name: "Profile",
  models: [{ id: "model", name: "Model" }],
};
vi.mock("@/composables/useModelSelectDialog", () => ({
  useModelSelectDialog: () => ({
    isDialogVisible: state.visible,
    currentSelection: state.selection,
    initialCapabilities: ref({}),
    select: vi.fn(),
    cancel: vi.fn(),
  }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ enabledProfiles: ref([profile]) }),
}));
vi.mock("@/composables/useModelMetadata", () => ({
  useModelMetadata: () => ({ getModelIcon: () => "", getModelGroup: () => "" }),
}));
vi.mock("@/config/model-capabilities", () => ({ MODEL_CAPABILITIES: [] }));
vi.mock("./BaseDialog.vue", () => ({
  default: { template: '<div><slot name="content" /></div>' },
}));
vi.mock("./DynamicIcon.vue", () => ({ default: { template: "<span />" } }));
const ModelSelectDialog = (await import("./ModelSelectDialog.vue")).default;
let wrapper: VueWrapper;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;

async function openList(offset: number) {
  wrapper = mount(ModelSelectDialog, {
    global: {
      stubs: { ElInput: true, ElSelect: true, ElOption: true, ElIcon: true },
    },
  });
  const list = wrapper.get<HTMLElement>(".model-list-wrapper").element;
  const item = wrapper.get<HTMLElement>("[data-model-key]").element;
  Object.defineProperties(list, {
    clientHeight: { value: 400 },
    scrollHeight: { value: offset + 1000 },
  });
  Object.defineProperties(item, {
    offsetTop: { value: offset },
    offsetHeight: { value: 80 },
  });
  await nextTick();
  await vi.advanceTimersByTimeAsync(60);
  return { list, target: offset - 160 };
}

function frame(time: number) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
}

// 保护固定时长、短距离的可见定位，以及用户滚动/关闭优先于自动定位的契约。
describe("model selection positioning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frames = new Map();
    frameId = 0;
    state.visible = ref(true);
    state.selection = ref({ profile, model: profile.models[0] });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });
  afterEach(() => {
    wrapper?.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([500, 40000])(
    "centers a model at offset %s within a fixed short animation",
    async (offset) => {
      const { list, target } = await openList(offset);
      expect(Math.abs(list.scrollTop - target)).toBeLessThanOrEqual(80);
      frame(0);
      frame(75);
      expect(list.scrollTop).toBeGreaterThan(target - 64);
      expect(list.scrollTop).toBeLessThan(target);
      frame(160);
      expect(list.scrollTop).toBe(target);
      expect(frames.size).toBe(0);
    }
  );

  it("lets user scrolling cancel automatic positioning", async () => {
    const { list } = await openList(40000);
    await wrapper.get(".model-list-wrapper").trigger("wheel");
    list.scrollTop = 200;
    frame(300);
    expect(list.scrollTop).toBe(200);
    expect(frames.size).toBe(0);
  });
});
