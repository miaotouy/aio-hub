import { beforeEach, describe, expect, it, vi } from "vitest";

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
const assetService = vi.hoisted(() => ({ capturePhoto: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => dialog);
vi.mock("../assetService", () => assetService);

import {
  fileNameFromReference,
  resolveAssetImportSources,
} from "../assetImportEntry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fileNameFromReference", () => {
  it("uses the last path segment and decodes the reference", () => {
    expect(fileNameFromReference("content://picker/a%20b/report.txt")).toBe(
      "report.txt"
    );
    expect(fileNameFromReference("file:///tmp/photo.png")).toBe("photo.png");
  });
});

describe("resolveAssetImportSources", () => {
  it("maps a file picker selection into import sources", async () => {
    dialog.open.mockResolvedValue([
      "content://picker/1/notes.txt",
      "content://picker/2/data.json",
    ]);

    const sources = await resolveAssetImportSources("file", {
      sourceModule: "llm-chat",
    });

    expect(dialog.open).toHaveBeenCalledWith(
      expect.objectContaining({ pickerMode: "document", multiple: true })
    );
    expect(sources).toEqual([
      {
        reference: "content://picker/1/notes.txt",
        originKind: "file_picker",
        sourceModule: "llm-chat",
        originalName: "notes.txt",
      },
      {
        reference: "content://picker/2/data.json",
        originKind: "file_picker",
        sourceModule: "llm-chat",
        originalName: "data.json",
      },
    ]);
  });

  it("uses the media picker for photos", async () => {
    dialog.open.mockResolvedValue("content://media/photo.png");

    const sources = await resolveAssetImportSources("photo");

    expect(dialog.open).toHaveBeenCalledWith(
      expect.objectContaining({ pickerMode: "media" })
    );
    expect(sources?.[0]).toMatchObject({
      originKind: "photo_picker",
      sourceModule: "asset-manager",
    });
  });

  it("returns the captured camera source without exposing bytes", async () => {
    const cameraSource = {
      reference: "content://camera/photo.jpg",
      originKind: "camera",
      sourceModule: "asset-manager",
      originalName: "photo.jpg",
    };
    assetService.capturePhoto.mockResolvedValue(cameraSource);

    await expect(resolveAssetImportSources("camera")).resolves.toEqual([
      cameraSource,
    ]);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it("returns null when the user cancels the picker", async () => {
    dialog.open.mockResolvedValue(null);

    await expect(resolveAssetImportSources("file")).resolves.toBeNull();
  });
});
