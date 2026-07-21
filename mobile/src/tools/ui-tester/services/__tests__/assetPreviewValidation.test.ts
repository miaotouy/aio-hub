import { beforeEach, describe, expect, it, vi } from "vitest";

const { listAssetsMock, getPreviewMock, revokeMock, handleMock, loggerMock } =
  vi.hoisted(() => ({
    listAssetsMock: vi.fn(),
    getPreviewMock: vi.fn(),
    revokeMock: vi.fn(),
    handleMock: vi.fn(),
    loggerMock: { warn: vi.fn() },
  }));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: handleMock }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => loggerMock,
}));
vi.mock("@/tools/asset-manager/services/assetService", () => ({
  listAssets: listAssetsMock,
  getAssetPreviewSource: getPreviewMock,
  revokeAssetPreviewSource: revokeMock,
}));

import { runAssetPreviewProtocolValidation } from "../assetPreviewValidation";

describe("asset preview protocol validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    listAssetsMock.mockResolvedValue([
      {
        id: "asset-1",
        kind: "image",
        mimeType: "image/png",
        sizeBytes: 100,
        availability: "ready",
        storageMode: "managed",
      },
    ]);
    getPreviewMock.mockResolvedValue({
      id: "preview-1",
      url: "http://aio-asset.localhost/preview-1",
      sizeBytes: 100,
    });
    revokeMock.mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Uint8Array(32), {
            status: 206,
            headers: {
              "accept-ranges": "bytes",
              "content-range": "bytes 0-31/100",
            },
          })
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: {
              "accept-ranges": "bytes",
              "content-length": "0",
            },
          })
        )
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
    );
  });

  it("checks range, HEAD, and revoked-token responses", async () => {
    const result = await runAssetPreviewProtocolValidation();

    expect(result.status).toBe("passed");
    expect(result.steps.map((step) => step.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(revokeMock).toHaveBeenCalledWith("preview-1");
  });

  it("returns a structured failure when there is no ready asset", async () => {
    listAssetsMock.mockResolvedValueOnce([]);

    const result = await runAssetPreviewProtocolValidation();

    expect(result.status).toBe("failed");
    expect(result.steps[0]?.id).toBe("asset-candidate");
    expect(revokeMock).not.toHaveBeenCalled();
  });
});
