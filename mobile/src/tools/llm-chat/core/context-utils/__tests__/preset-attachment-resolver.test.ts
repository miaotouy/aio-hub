import { describe, expect, it } from "vitest";
import type { AgentAsset } from "@/tools/agent-manager/types/agent";
import {
  bytesToBase64,
  normalizeAgentAttachmentRefs,
  resolveAgentAttachmentParts,
  resolveAgentAttachmentRef,
} from "../preset-attachment-resolver";

function asset(overrides: Partial<AgentAsset> = {}): AgentAsset {
  return {
    id: "asset-1",
    filename: "file.bin",
    path: "assets/file.bin",
    type: "file",
    ...overrides,
  };
}

describe("normalizeAgentAttachmentRefs", () => {
  it("keeps preset attachment handles and descriptions", () => {
    expect(
      normalizeAgentAttachmentRefs([
        { assetId: "sticker_ok", description: "确认贴纸" },
      ])
    ).toEqual([{ assetId: "sticker_ok", description: "确认贴纸" }]);
  });

  it("normalizes greeting assets to path-based private references", () => {
    const [ref] = normalizeAgentAttachmentRefs([
      {
        id: "global-uuid",
        name: "hero.png",
        path: "assets\\scene\\hero.png",
        type: "image",
        mimeType: "image/png",
        size: 1024,
      },
    ]);

    expect(ref).toMatchObject({
      path: "assets/scene/hero.png",
      filename: "hero.png",
      type: "image",
      mimeType: "image/png",
    });
    // 桌面 Asset.id 是全局 UUID，不能当作 Agent Handle 使用
    expect(ref.assetId).toBeUndefined();
  });

  it("accepts string shorthand and drops unusable entries", () => {
    expect(
      normalizeAgentAttachmentRefs(["assets/a.txt", null, {}, 3])
    ).toEqual([{ path: "assets/a.txt", filename: "a.txt" }]);
  });
});

describe("resolveAgentAttachmentRef", () => {
  it("matches by agent asset handle first", () => {
    const resolved = resolveAgentAttachmentRef(
      { assetId: "sticker_ok" },
      [asset({ id: "sticker_ok", path: "assets/ok.png", filename: "ok.png" })]
    );

    expect(resolved).toMatchObject({
      path: "assets/ok.png",
      filename: "ok.png",
    });
  });

  it("matches by path with a batch sub-folder prefix", () => {
    const resolved = resolveAgentAttachmentRef(
      { path: "my-agent/assets/scene/hero.png" },
      [asset({ path: "assets/scene/hero.png", filename: "hero.png" })]
    );

    expect(resolved).toMatchObject({
      path: "assets/scene/hero.png",
      filename: "hero.png",
    });
  });

  it("falls back to the raw relative path when the asset index misses", () => {
    const resolved = resolveAgentAttachmentRef(
      { path: "assets/loose.txt", mimeType: "text/plain" },
      []
    );

    expect(resolved).toMatchObject({
      path: "assets/loose.txt",
      filename: "loose.txt",
      kind: "document",
    });
  });

  it("returns null when no path can be derived", () => {
    expect(resolveAgentAttachmentRef({ assetId: "missing" }, [])).toBeNull();
  });
});

describe("resolveAgentAttachmentParts", () => {
  it("inlines image bytes into vision content", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10]);
    const base64 = bytesToBase64(bytes);

    const result = await resolveAgentAttachmentParts(
      [{ assetId: "pic" }],
      "agent-1",
      [
        asset({
          id: "pic",
          filename: "pic.png",
          path: "assets/pic.png",
          type: "image",
          mimeType: "image/png",
        }),
      ],
      async () => bytes
    );

    expect(result.parts).toEqual([
      {
        type: "image",
        imageBase64: base64,
        mimeType: "image/png",
        source: { type: "base64", media_type: "image/png", data: base64 },
      },
    ]);
    expect(result.stats).toEqual({
      totalCount: 1,
      imageCount: 1,
      textFallbackCount: 0,
      degradedCount: 0,
      missingCount: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  it("inlines text documents as deterministic fallback blocks", async () => {
    const bytes = new TextEncoder().encode("角色设定文本");

    const result = await resolveAgentAttachmentParts(
      [{ assetId: "doc" }],
      "agent-1",
      [
        asset({
          id: "doc",
          filename: "notes.txt",
          path: "assets/notes.txt",
          type: "file",
          mimeType: "text/plain",
        }),
      ],
      async () => bytes
    );

    expect(result.parts).toEqual([
      {
        type: "text",
        text: '<attachment_text name="notes.txt" mime_type="text/plain">\n角色设定文本\n</attachment_text>',
      },
    ]);
    expect(result.stats.textFallbackCount).toBe(1);
  });

  it("degrades binary media to a text description with a warning", async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

    const result = await resolveAgentAttachmentParts(
      [{ assetId: "bgm" }],
      "agent-1",
      [
        asset({
          id: "bgm",
          filename: "theme.mp3",
          path: "assets/theme.mp3",
          type: "audio",
          mimeType: "audio/mpeg",
        }),
      ],
      async () => bytes
    );

    expect(result.parts[0]).toMatchObject({ type: "text" });
    expect((result.parts[0] as { text: string }).text).toContain(
      'name="theme.mp3"'
    );
    expect((result.parts[0] as { text: string }).text).toContain("音频附件");
    expect(result.stats.degradedCount).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  it("warns instead of silently dropping unresolved or unreadable assets", async () => {
    const result = await resolveAgentAttachmentParts(
      [{ assetId: "ghost" }, { path: "assets/gone.png" }],
      "agent-1",
      [],
      async () => null
    );

    expect(result.parts).toEqual([]);
    expect(result.stats.missingCount).toBe(2);
    expect(result.warnings).toHaveLength(2);
  });
});
