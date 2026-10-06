// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatInput from "../ChatInput.vue";
import type { ChatMessageAttachment } from "../../types";

const settings = vi.hoisted(() => ({
  uiPreferences: { showTokenCount: false },
}));

vi.mock("../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    currentSession: null,
    isSending: false,
    selectedModelValue: "",
  }),
}));
vi.mock("../../composables/useChatExecutor", () => ({
  useChatExecutor: () => ({ execute: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/composables/useKeyboardAvoidance", () => ({
  useKeyboardAvoidance: () => ({ isKeyboardVisible: false }),
}));
vi.mock("../../composables/useChatSettings", () => ({
  useChatSettings: () => ({ settings }),
}));
vi.mock("@/i18n", () => {
  const useScopedT = (prefix: string) => (key: string) => `${prefix}.${key}`;
  return {
    useScopedT,
    useI18n: () => ({
      t: (key: string) => key,
      locale: { value: "zh-CN" },
      useScopedT,
    }),
  };
});
vi.mock("../../composables/useContextTokenUsage", async () => {
  const { ref } = await import("vue");
  return {
    useContextTokenUsage: () => ({
      estimatedTokens: ref(0),
      contextLength: ref(0),
      usageRatio: ref(0),
      riskLevel: ref("normal"),
      isCalculating: ref(false),
      isFallback: ref(false),
      latestActualPromptTokens: ref(undefined),
    }),
  };
});

const assetService = vi.hoisted(() => ({
  getAssetPreviewSource: vi.fn(),
  revokeAssetPreviewSource: vi.fn(),
}));

vi.mock("@/tools/asset-manager/services/assetService", () => assetService);

const AssetPickerSheetStub = defineComponent({
  name: "AssetPickerSheet",
  props: { open: { type: Boolean, default: false } },
  emits: ["close", "select"],
  template: '<div data-testid="asset-picker-sheet-stub" />',
});

function attachment(
  kind: "image" | "video" | "document"
): ChatMessageAttachment {
  return {
    id: `attachment-${kind}`,
    assetId: `asset-${kind}`,
    usagePolicy: "advisory",
    snapshot: {
      displayName: `sample.${kind}`,
      kind,
      mimeType: kind === "image" ? "image/png" : "application/octet-stream",
      sizeBytes: 2048,
    },
  };
}

function descriptor(assetId: string) {
  return {
    id: `preview-${assetId}`,
    kind: "custom-protocol" as const,
    url: `http://aio-asset.localhost/${assetId}`,
    mimeType: "image/png",
    sizeBytes: 2048,
    expiresAtMs: Date.now() + 60_000,
    supportsRange: true,
    maxRangeBytes: 2048,
    maxFullResponseBytes: 2048,
  };
}

function mountInput() {
  return mount(ChatInput, {
    attachTo: document.body,
    global: {
      stubs: {
        LlmModelSelector: true,
        AssetPickerSheet: AssetPickerSheetStub,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  assetService.getAssetPreviewSource.mockImplementation(
    async (assetId: string) => descriptor(assetId)
  );
  assetService.revokeAssetPreviewSource.mockResolvedValue(true);
  document.body.innerHTML = "";
});

describe("ChatInput pending attachments", () => {
  it("renders an image thumbnail and type icons for pending attachments", async () => {
    const wrapper = mountInput();
    wrapper.getComponent(AssetPickerSheetStub).vm.$emit("select", [
      attachment("image"),
      attachment("video"),
      attachment("document"),
    ]);
    await flushPromises();
    await flushPromises();

    expect(
      wrapper.find('[data-testid="chat-pending-attachments"]').exists()
    ).toBe(true);
    expect(
      wrapper.get('[data-testid="attachment-thumbnail-image"] img').attributes(
        "src"
      )
    ).toBe("http://aio-asset.localhost/asset-image");
    expect(
      wrapper
        .get('[data-testid="attachment-thumbnail-video"]')
        .find("img")
        .exists()
    ).toBe(false);
    expect(
      wrapper
        .get('[data-testid="attachment-thumbnail-document"]')
        .find("img")
        .exists()
    ).toBe(false);
    expect(assetService.getAssetPreviewSource).toHaveBeenCalledTimes(1);
    expect(assetService.getAssetPreviewSource).toHaveBeenCalledWith(
      "asset-image"
    );
  });

  it("removes a pending attachment and revokes its descriptor", async () => {
    const wrapper = mountInput();
    wrapper.getComponent(AssetPickerSheetStub).vm.$emit("select", [
      attachment("image"),
    ]);
    await flushPromises();
    await flushPromises();

    await wrapper.get(".pending-attachment button").trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="chat-pending-attachments"]').exists()).toBe(
      false
    );
    expect(assetService.revokeAssetPreviewSource).toHaveBeenCalledWith(
      "preview-asset-image"
    );
  });
});
