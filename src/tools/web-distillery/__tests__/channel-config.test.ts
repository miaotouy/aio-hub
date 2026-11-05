import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { reactive, ref, type Component, type Ref } from "vue";
import ElementPlus from "element-plus";
import type { LlmProfile } from "@/types/llm-profiles";
import DeepSeekChannelConfig from "../components/settings/DeepSeekChannelConfig.vue";
import SearchWorkbench from "../components/search/SearchWorkbench.vue";

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  store: vi.fn(),
  save: vi.fn(),
  search: vi.fn(),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: mocks.profiles,
}));
vi.mock("../stores/store", () => ({ useWebDistilleryStore: mocks.store }));
vi.mock("../service", () => ({
  searchWeb: mocks.search,
  fetchSearchResult: vi.fn(),
}));
vi.mock("@/llm-apis/common", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@/composables/useLlmKeyManager", () => ({
  useLlmKeyManager: vi.fn(),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn() },
}));
vi.mock("@/platform/native/opener", () => ({ openUrl: vi.fn() }));
vi.mock("@/tools/rich-text-renderer/RichTextRenderer.vue", () => ({
  default: { template: "<div />" },
}));

let profiles: Ref<LlmProfile[]>;
let store: {
  config: { deepseek: { profileId: string } };
  updateConfig: ReturnType<typeof vi.fn>;
};
const wrappers: VueWrapper[] = [];
function render(component: Component = DeepSeekChannelConfig) {
  const wrapper = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [ElementPlus],
      stubs: {
        BaseDialog: {
          props: ["modelValue"],
          template:
            '<div v-if="modelValue" role="dialog"><slot /><slot name="footer" /></div>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function button(text: string) {
  const element = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((el) => el.textContent?.trim() === text);
  if (!element) throw new Error("Missing action: " + text);
  return element;
}
async function click(text: string) {
  button(text).click();
  await flushPromises();
}
async function fill(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="' + label + '"]'
  );
  if (!input) throw new Error("Missing field: " + label);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  profiles = ref<LlmProfile[]>([
    {
      id: "existing",
      type: "deepseek",
      name: "Existing",
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      apiKeys: ["test-original"],
      models: [{ id: "kept-model", name: "Kept" }],
      customHeaders: { "X-Test": "kept" },
      http1Only: false,
    },
  ]);
  store = reactive({
    config: { deepseek: { profileId: "" } },
    updateConfig: vi.fn((partial) => Object.assign(store.config, partial)),
  });
  mocks.store.mockReturnValue(store);
  mocks.save.mockResolvedValue(undefined);
  mocks.search.mockResolvedValue({ results: [] });
  mocks.profiles.mockReturnValue({
    profiles,
    isLoaded: ref(true),
    saveProfile: mocks.save,
    getProfileById: (id: string) => profiles.value.find((p) => p.id === id),
    getEnabledProfileByType: (type: string, id = "") =>
      profiles.value.find(
        (p) => p.type === type && p.enabled && (!id || p.id === id)
      ),
    createFromPreset: () => ({
      id: "new",
      name: "DeepSeek",
      type: "deepseek",
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      apiKeys: [],
      models: [],
      networkStrategy: "auto",
    }),
  });
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = "";
});

describe("distillery channel configuration", () => {
  it("uses the automatic enabled channel for search and retains an invalid explicit binding", async () => {
    render(SearchWorkbench);
    await fill("搜索词", "query");
    expect(button("搜索").disabled).toBe(false);
    await click("搜索");
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "query" })
    );
    store.config.deepseek.profileId = "deleted";
    await flushPromises();
    expect(button("搜索").disabled).toBe(true);
    expect(store.config.deepseek.profileId).toBe("deleted");
  });

  it("cancels edits locally without changing the shared channel", async () => {
    render();
    await click("配置渠道");
    await fill("API 基础地址", "https://changed.example");
    await fill("API Key", "test-changed");
    await click("取消");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(profiles.value[0].baseUrl).toBe("https://api.deepseek.com");
    expect(profiles.value[0].apiKeys).toEqual(["test-original"]);
    await click("配置渠道");
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="API Key"]')
        ?.value
    ).toBe("test-original");
  });

  it("saves connection fields while preserving the latest model and advanced settings", async () => {
    render();
    await click("配置渠道");
    await fill("API 基础地址", "https://proxy.example/service/v1/");
    await fill("API Key", "test-one, test-two");
    profiles.value[0].models.push({
      id: "concurrent-model",
      name: "Added elsewhere",
    });
    await click("保存并使用");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "existing",
        baseUrl: "https://proxy.example/service/v1/",
        apiKeys: ["test-one", "test-two"],
        models: profiles.value[0].models,
        customHeaders: { "X-Test": "kept" },
        http1Only: false,
      })
    );
    expect(store.config.deepseek.profileId).toBe("existing");
  });

  it("creates a channel in place and binds it only after a successful save", async () => {
    profiles.value = [];
    render();
    await click("添加渠道");
    await click("保存并使用");
    expect(mocks.save).not.toHaveBeenCalled();
    await fill("API Key", "test-new");
    mocks.save.mockRejectedValueOnce(new Error("test storage failure"));
    await click("保存并使用");
    expect(store.config.deepseek.profileId).toBe("");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click("保存并使用");
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "new",
        apiKeys: ["test-new"],
        enabled: true,
      })
    );
    expect(store.config.deepseek.profileId).toBe("new");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
