// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assetService = vi.hoisted(() => ({
  listAssets: vi.fn(),
  importAssetSources: vi.fn(),
}));
const importEntry = vi.hoisted(() => ({
  resolveAssetImportSources: vi.fn(),
}));
const textSnapshot = vi.hoisted(() => ({
  resolveAttachmentTextSnapshot: vi.fn(),
}));
const feedback = vi.hoisted(() => ({ customMessage: vi.fn() }));

vi.mock("@/tools/asset-manager/services/assetService", () => assetService);
vi.mock("@/tools/asset-manager/services/assetImportEntry", () => importEntry);
vi.mock(
  "@/tools/asset-manager/services/assetTextSnapshotService",
  () => textSnapshot
);
vi.mock("@/utils/feedback", () => feedback);
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/i18n", () => {
  const useScopedT = (prefix: string) => (key: string) => `${prefix}.${key}`;
  return {
    useScopedT,
    useI18n: () => ({ t: (key: string) => key, useScopedT }),
  };
});

import AssetPickerSheet from "../AssetPickerSheet.vue";

const records = [
  {
    id: "asset-a",
    contentHash: "hash-a",
    kind: "document" as const,
    mimeType: "text/plain",
    displayName: "notes.txt",
    sizeBytes: 128,
    storageMode: "managed" as const,
    availability: "ready" as const,
    libraryState: "visible" as const,
    retentionPolicy: "reclaimable" as const,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  },
  {
    id: "asset-b",
    contentHash: "hash-b",
    kind: "image" as const,
    mimeType: "image/png",
    displayName: "photo.png",
    sizeBytes: 2048,
    storageMode: "managed" as const,
    availability: "ready" as const,
    libraryState: "visible" as const,
    retentionPolicy: "reclaimable" as const,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  },
];

function mountPicker() {
  return mount(AssetPickerSheet, {
    props: { open: false },
    global: { stubs: { teleport: true, Teleport: true } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  assetService.listAssets.mockResolvedValue(records);
  assetService.importAssetSources.mockResolvedValue([
    { sourceIndex: 0, status: "imported", asset: records[0] },
  ]);
  importEntry.resolveAssetImportSources.mockResolvedValue([
    {
      reference: "content://picker/notes.txt",
      originKind: "file_picker",
      sourceModule: "llm-chat",
      originalName: "notes.txt",
    },
  ]);
  textSnapshot.resolveAttachmentTextSnapshot.mockResolvedValue({
    truncated: false,
  });
});

describe("AssetPickerSheet", () => {
  it("loads selectable assets when opened", async () => {
    const wrapper = mountPicker();

    await wrapper.setProps({ open: true });
    await flushPromises();

    expect(assetService.listAssets).toHaveBeenCalledOnce();
    expect(wrapper.findAll('[data-testid="chat-asset-row"]')).toHaveLength(2);
  });

  it("imports through the asset-manager entry and refreshes the list", async () => {
    const sources = [
      {
        reference: "content://picker/notes.txt",
        originKind: "file_picker" as const,
        sourceModule: "llm-chat",
        originalName: "notes.txt",
      },
    ];
    importEntry.resolveAssetImportSources.mockResolvedValue(sources);
    const wrapper = mountPicker();
    await wrapper.setProps({ open: true });
    await flushPromises();

    await wrapper.get('[data-testid="chat-asset-import"]').trigger("click");
    await wrapper.get('[data-testid="asset-import-file"]').trigger("click");
    await flushPromises();

    expect(importEntry.resolveAssetImportSources).toHaveBeenCalledWith("file", {
      sourceModule: "llm-chat",
    });
    expect(assetService.importAssetSources).toHaveBeenCalledWith(sources);
    expect(assetService.listAssets).toHaveBeenCalledTimes(2);
    expect(feedback.customMessage).toHaveBeenCalled();
  });

  it("persists readable text snapshots when confirming a selection", async () => {
    textSnapshot.resolveAttachmentTextSnapshot.mockResolvedValue({
      text: "snapshot text",
      truncated: false,
    });
    const wrapper = mountPicker();
    await wrapper.setProps({ open: true });
    await flushPromises();

    await wrapper.get('[data-testid="chat-asset-row"]').trigger("click");
    await wrapper.get('[data-testid="chat-asset-confirm"]').trigger("click");
    await flushPromises();

    expect(textSnapshot.resolveAttachmentTextSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-a" })
    );
    const emitted = wrapper.emitted("select");
    expect(emitted?.[0]?.[0]).toEqual([
      expect.objectContaining({
        assetId: "asset-a",
        snapshot: expect.objectContaining({ extractedText: "snapshot text" }),
      }),
    ]);
  });
});
