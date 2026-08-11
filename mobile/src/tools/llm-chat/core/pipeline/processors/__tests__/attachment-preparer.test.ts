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

vi.mock("../../../../utils/attachmentStatus", () => attachmentStatus);

import {
  appendUnavailableAttachmentText,
  attachmentPreparer,
} from "../attachment-preparer";

function attachment(assetId: string, extractedText?: string) {
  return {
    assetId,
    usagePolicy: "advisory" as const,
    snapshot: {
      displayName: `${assetId}.txt`,
      kind: "document" as const,
      mimeType: "text/plain",
      sizeBytes: 12,
      ...(extractedText ? { extractedText } : {}),
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
    });
    expect(result).toEqual(
      expect.objectContaining({ status: "degraded", details: stats })
    );
  });

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
