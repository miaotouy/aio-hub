import { shallowMount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { OcrProfile } from "@/tools/smart-ocr/platform/cloud/types";

vi.mock("element-plus", async (original) => ({
  ...(await original<typeof import("element-plus")>()),
  ElMessageBox: { confirm: vi.fn(async () => {}) },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), error: vi.fn() },
}));
import OcrServiceSettings from "../OcrServiceSettings.vue";
import { useOcrProfiles } from "@/tools/smart-ocr/platform/cloud/profiles";
import { createConfigManager } from "@/utils/configManager";
import { logger } from "@/utils/logger";

const manager = createConfigManager<{ profiles: OcrProfile[] }>({
  moduleName: "ocr-service",
  fileName: "profiles.json",
  version: "1.0.0",
  createDefault: () => ({ profiles: [] }),
});
logger.setLogToFile(false);
logger.setLogToConsole(false);
const store = useOcrProfiles();
const wrappers: ReturnType<typeof shallowMount>[] = [];
beforeAll(async () => {
  logger.setLogToFile(false);
  logger.setLogToConsole(false);
  await store.loadProfiles();
});
beforeEach(async () => {
  store.profiles.value = [];
  for (const id of ["first", "second"])
    await store.saveProfile({
      id,
      name: id,
      provider: "baidu",
      endpoint: "https://example.test/ocr",
      credentials: { apiKey: "", apiSecret: "" },
      enabled: true,
      concurrency: 3,
      delay: 0,
    });
  vi.useFakeTimers();
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
});
async function openEditor() {
  const wrapper = shallowMount(OcrServiceSettings, {
    global: {
      renderStubDefaultSlot: true,
      config: {
        warnHandler: (message: string) => {
          if (!message.startsWith("Failed to resolve component: el-"))
            throw new Error(message);
        },
      },
      stubs: {
        ProfileEditor: {
          name: "ProfileEditor",
          props: ["title"],
          template: '<section><slot name="extra-actions" /><slot /></section>',
        },
        ElForm: { template: "<form><slot /></form>" },
        ElFormItem: { template: "<div><slot /></div>" },
        ElInput: {
          name: "TestTextInput",
          props: ["modelValue"],
          template: '<input :value="modelValue" />',
        },
      },
    },
  });
  wrappers.push(wrapper);
  const sidebar = wrapper.findComponent({ name: "ProfileSidebar" });
  sidebar.vm.$emit("select", "first");
  await nextTick();
  const name = wrapper.findAllComponents({ name: "TestTextInput" })[0];
  return { wrapper, sidebar, name };
}

describe("OCR settings persistence flow", () => {
  it("saves edits to the previous service when selecting another service", async () => {
    const { sidebar, name } = await openEditor();
    name.vm.$emit("update:modelValue", "Edited before switching");
    await nextTick();
    sidebar.vm.$emit("select", "second");
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      (await manager.load()).profiles.find((p) => p.id === "first")?.name
    ).toBe("Edited before switching");
  });

  it("flushes pending edits when leaving the settings view", async () => {
    const { wrapper, name } = await openEditor();
    name.vm.$emit("update:modelValue", "Edited before leaving");
    await nextTick();
    wrapper.unmount();
    await flushPromises();
    expect(
      (await manager.load()).profiles.find((p) => p.id === "first")?.name
    ).toBe("Edited before leaving");
  });

  it("does not resurrect a deleted service through a pending autosave", async () => {
    await store.deleteProfile("second");
    const { wrapper, name } = await openEditor();
    name.vm.$emit("update:modelValue", "Pending deleted edit");
    await nextTick();
    wrapper.findComponent({ name: "ProfileEditor" }).vm.$emit("delete");
    await vi.advanceTimersByTimeAsync(2000);
    expect((await manager.load()).profiles.map((p) => p.id)).toEqual([]);
  });
});

it("retains a failed form as a retryable draft while consumers continue to see the saved service", async () => {
  const { wrapper, name } = await openEditor();
  const failed = vi
    .spyOn(Object.getPrototypeOf(manager), "save")
    .mockRejectedValueOnce(new Error("disk full"));
  name.vm.$emit("update:modelValue", "Retry OCR save");
  await nextTick();
  await vi.advanceTimersByTimeAsync(1000);
  await flushPromises();
  expect(store.getProfileById("first")?.name).toBe("first");
  expect(name.props("modelValue")).toBe("Retry OCR save");
  await wrapper
    .findAll("el-button")
    .find((button) => button.text() === "重试保存")!
    .trigger("click");
  await flushPromises();
  expect(store.getProfileById("first")?.name).toBe("Retry OCR save");
  failed.mockRestore();
});
