import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAssetDetailMock } = vi.hoisted(() => ({
  getAssetDetailMock: vi.fn(),
}));

vi.mock("../../../asset-manager/services/assetService", () => ({
  getAssetDetail: getAssetDetailMock,
}));

import {
  getAttachmentAvailability,
  getAttachmentAvailabilityMap,
  invalidateAttachmentAvailability,
  partitionAttachmentsByAvailability,
} from "../attachmentStatus";

beforeEach(() => {
  vi.clearAllMocks();
  invalidateAttachmentAvailability();
});

describe("chat attachment status", () => {
  it("caches detail lookups briefly and distinguishes reclaimed/missing", async () => {
    getAssetDetailMock
      .mockResolvedValueOnce({ availability: "reclaimed" })
      .mockRejectedValueOnce(new Error("ASSET_NOT_FOUND"));

    await expect(getAttachmentAvailability("asset-reclaimed")).resolves.toBe(
      "reclaimed"
    );
    await expect(getAttachmentAvailability("asset-reclaimed")).resolves.toBe(
      "reclaimed"
    );
    await expect(getAttachmentAvailability("asset-missing")).resolves.toBe(
      "missing_record"
    );
    expect(getAssetDetailMock).toHaveBeenCalledTimes(2);
  });

  it("keeps transient detail failures distinct from missing records", async () => {
    getAssetDetailMock.mockRejectedValue(new Error("IPC disconnected"));
    await expect(getAttachmentAvailability("asset-error")).resolves.toBe(
      "error"
    );
  });

  it("deduplicates ids while resolving a batch", async () => {
    getAssetDetailMock.mockResolvedValue({ availability: "ready" });
    const result = await getAttachmentAvailabilityMap([
      { assetId: "asset-1", usagePolicy: "advisory", snapshot: {} as never },
      { assetId: "asset-1", usagePolicy: "advisory", snapshot: {} as never },
    ]);
    expect(result).toEqual(new Map([["asset-1", "ready"]]));
    expect(getAssetDetailMock).toHaveBeenCalledOnce();
  });

  it("partitions ready attachments from unavailable history", () => {
    const attachments = [
      { assetId: "ready", usagePolicy: "advisory", snapshot: {} as never },
      { assetId: "reclaimed", usagePolicy: "advisory", snapshot: {} as never },
      { assetId: "unknown", usagePolicy: "advisory", snapshot: {} as never },
    ] as const;
    const result = partitionAttachmentsByAvailability(
      [...attachments],
      new Map([
        ["ready", "ready"],
        ["reclaimed", "reclaimed"],
      ])
    );

    expect(result.ready.map((attachment) => attachment.assetId)).toEqual([
      "ready",
    ]);
    expect(result.unavailable.map((attachment) => attachment.assetId)).toEqual([
      "reclaimed",
      "unknown",
    ]);
  });
});
