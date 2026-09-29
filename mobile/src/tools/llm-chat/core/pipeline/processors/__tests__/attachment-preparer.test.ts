import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "@/tools/llm-chat/types";
import {
  clearReplacedAssetText,
  rememberReplacedAssetText,
} from "@/tools/asset-manager/services/assetTextReplacementCache";

const attachmentStatus = vi.hoisted(() => ({
  getAttachmentAvailabilityMap: vi.fn(),
  partitionAttachmentsByAvailability: vi.fn(),
}));

const assetService = vi.hoisted(() => ({
  extractAssetText: vi.fn(),
}));

vi.mock("../../../../utils/attachmentStatus", () => attachmentStatus);
vi.mock("../../../../../asset-manager/services/assetService", () => assetService);

import {
  appendUnavailableAttachmentText,
  attachmentPreparer,
  clearInlineTextCache,
  resolveReadyAttachmentText,
} from "../attachment-preparer";

function attachment(
  assetId: string,
  extractedText?: string,
  overrides: Partial<{
    kind: "image" | "audio" | "video" | "document" | "other";
    mimeType: string;
    displayName: string;
    sizeBytes: number;
  }> = {}
) {
  return {
    assetId,
    usagePolicy: "advisory" as const,
    snapshot: {
      displayName: `${assetId}.txt`,
      kind: "document" as const,
      mimeType: "text/plain",
      sizeBytes: 12,
      ...(extractedText ? { extractedText } : {}),
      ...overrides,
    },
  };
}

function context(): PipelineContext {
  return {
    messages: [
      {
        role: "user",
        content: "Please summarize the attachment.",
        sourceType: "session_history",
        sourceId: "message-1",
        _attachments: [
          attachment("asset-ready"),
          attachment("asset-reclaimed", "Recovered document text."),
          attachment("asset-missing"),
        ],
      },
    ],
    session: {} as PipelineContext["session"],
    agentConfig: null,
    settings: {} as PipelineContext["settings"],
    timestamp: 0,
    sharedData: new Map(),
    logs: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearReplacedAssetText();
  clearInlineTextCache();
  attachmentStatus.getAttachmentAvailabilityMap.mockResolvedValue(
    new Map([
      ["asset-ready", "ready"],
      ["asset-reclaimed", "reclaimed"],
      ["asset-missing", "missing"],
    ])
  );
  attachmentStatus.partitionAttachmentsByAvailability.mockImplementation(
    (attachments, availability) => ({
      ready: attachments.filter(
        (item: { assetId: string }) =>
          availability.get(item.assetId) === "ready"
      ),
      unavailable: attachments.filter(
        (item: { assetId: string }) =>
          availability.get(item.assetId) !== "ready"
      ),
    })
  );
});

describe("attachmentPreparer", () => {
  it("keeps ready managed refs while inserting reclaimed document text before token limiting", async () => {
    const pipelineContext = context();

    const result = await attachmentPreparer.execute(pipelineContext);
    const stats = pipelineContext.sharedData.get("attachmentPreparationStats");

    expect(attachmentStatus.getAttachmentAvailabilityMap).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ assetId: "asset-ready" }),
        expect.objectContaining({ assetId: "asset-reclaimed" }),
      ])
    );
    expect(pipelineContext.messages[0]._attachments).toEqual([
      expect.objectContaining({ assetId: "asset-ready" }),
    ]);
    expect(pipelineContext.messages[0].content).toBe(
      'Please summarize the attachment.\n\n<attachment_text name="asset-reclaimed.txt" mime_type="text/plain">\nRecovered document text.\n</attachment_text>'
    );
    expect(stats).toEqual({
      readyAttachmentCount: 1,
      textFallbackCount: 1,
      skippedAttachmentCount: 1,
      inlinedTextCount: 0,
    });
    expect(result).toEqual(
      expect.objectContaining({ status: "degraded", details: stats })
    );
  });

  it("inlines a ready plain-text attachment instead of sending a managed ref", async () => {
    assetService.extractAssetText.mockResolvedValue({
      assetId: "asset-ready",
      text: "Fresh managed text.",
      mimeType: "text/plain",
      bytesRead: 20,
    });
    const pipelineContext = context();

    const result = await attachmentPreparer.execute(pipelineContext);
    const stats = pipelineContext.sharedData.get("attachmentPreparationStats");

    expect(assetService.extractAssetText).toHaveBeenCalledWith("asset-ready");
    expect(pipelineContext.messages[0]._attachments).toBeUndefined();
    expect(pipelineContext.messages[0].content).toBe(
      'Please summarize the attachment.\n\n<attachment_text name="asset-reclaimed.txt" mime_type="text/plain">\nRecovered document text.\n</attachment_text>\n\n<attachment_text name="asset-ready.txt" mime_type="text/plain">\nFresh managed text.\n</attachment_text>'
    );
    expect(stats).toEqual({
      readyAttachmentCount: 1,
      textFallbackCount: 1,
      skippedAttachmentCount: 1,
      inlinedTextCount: 1,
    });
    expect(result).toEqual(
      expect.objectContaining({ status: "degraded", details: stats })
    );
  });

  it("keeps the managed ref when a ready text attachment has no snapshot and extraction fails", async () => {
    assetService.extractAssetText.mockRejectedValue(
      new Error("ASSET_EXTRACT_UNSUPPORTED")
    );
    const pipelineContext = context();

    await attachmentPreparer.execute(pipelineContext);
    const stats = pipelineContext.sharedData.get("attachmentPreparationStats");

    expect(pipelineContext.messages[0]._attachments).toEqual([
      expect.objectContaining({ assetId: "asset-ready" }),
    ]);
    expect(stats).toEqual({
      readyAttachmentCount: 1,
      textFallbackCount: 1,
      skippedAttachmentCount: 1,
      inlinedTextCount: 0,
    });
  });

  it("reuses the runtime inline cache across requests without re-extracting", async () => {
    assetService.extractAssetText.mockResolvedValue({
      assetId: "asset-ready",
      text: "Cached managed text.",
      mimeType: "text/plain",
      bytesRead: 20,
    });

    const first = context();
    await attachmentPreparer.execute(first);
    expect(assetService.extractAssetText).toHaveBeenCalledTimes(1);

    const second = context();
    await attachmentPreparer.execute(second);
    expect(assetService.extractAssetText).toHaveBeenCalledTimes(1);
    expect(second.messages[0].content).toContain("Cached managed text.");
  });

  it("prefers the persisted snapshot text over controlled extraction", async () => {
    const pipelineContext = context();
    pipelineContext.messages[0]._attachments = [
      attachment("asset-ready", "Persisted snapshot text."),
    ];

    const stats = await import("../attachment-preparer");
    await stats.prepareAttachments(pipelineContext);

    expect(assetService.extractAssetText).not.toHaveBeenCalled();
    expect(pipelineContext.messages[0]._attachments).toBeUndefined();
    expect(pipelineContext.messages[0].content).toBe(
      'Please summarize the attachment.\n\n<attachment_text name="asset-ready.txt" mime_type="text/plain">\nPersisted snapshot text.\n</attachment_text>'
    );
  });
});

describe("resolveReadyAttachmentText", () => {
  it("skips non-textual media attachments", async () => {
    expect(
      await resolveReadyAttachmentText(
        attachment("asset-image", undefined, {
          kind: "image",
          mimeType: "image/png",
          displayName: "photo.png",
        })
      )
    ).toBeNull();
    expect(assetService.extractAssetText).not.toHaveBeenCalled();
  });

  it("skips non-plain documents such as PDF without extraction", async () => {
    expect(
      await resolveReadyAttachmentText(
        attachment("asset-pdf", undefined, {
          kind: "document",
          mimeType: "application/pdf",
          displayName: "manual.pdf",
        })
      )
    ).toBeNull();
    expect(assetService.extractAssetText).not.toHaveBeenCalled();
  });

  it("skips oversized text attachments beyond the native extraction limit", async () => {
    expect(
      await resolveReadyAttachmentText(
        attachment("asset-huge", undefined, { sizeBytes: 3 * 1024 * 1024 })
      )
    ).toBeNull();
    expect(assetService.extractAssetText).not.toHaveBeenCalled();
  });
});

describe("appendUnavailableAttachmentText", () => {
  it("appends fallback text as a normal text part for structured content", () => {
    expect(
      appendUnavailableAttachmentText(
        [{ type: "text", text: "Existing structured text" }],
        [attachment("asset-reclaimed", "Recovered document text.")]
      )
    ).toEqual({
      content: [
        { type: "text", text: "Existing structured text" },
        {
          type: "text",
          text: '<attachment_text name="asset-reclaimed.txt" mime_type="text/plain">\nRecovered document text.\n</attachment_text>',
        },
      ],
      recoveredCount: 1,
    });
  });

  it("uses the in-memory replacement cache until an active chat session reloads its durable snapshot", () => {
    rememberReplacedAssetText(
      "asset-reclaimed",
      "Replacement cached this runtime."
    );

    expect(
      appendUnavailableAttachmentText("Please summarize.", [
        attachment("asset-reclaimed"),
      ])
    ).toEqual({
      content:
        'Please summarize.\n\n<attachment_text name="asset-reclaimed.txt" mime_type="text/plain">\nReplacement cached this runtime.\n</attachment_text>',
      recoveredCount: 1,
    });
  });
});
