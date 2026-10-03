import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  E2E_AGENT_CHARACTER_NAME,
  E2E_AGENT_CREATOR_NOTES,
  E2E_AGENT_MARKER,
  buildAgentCardPayload,
  buildAgentCardPng,
} from "./fixtures";

function readTextChunk(png: Buffer, keyword: string): string | null {
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("latin1");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) break;
    if (type === "tEXt") {
      const data = png.subarray(dataStart, dataEnd);
      const separator = data.indexOf(0);
      if (
        separator >= 0 &&
        data.subarray(0, separator).toString("latin1") === keyword
      ) {
        return data.subarray(separator + 1).toString("latin1");
      }
    }
    if (type === "IEND") break;
    offset = dataEnd + 4;
  }
  return null;
}

describe("agent card fixture", () => {
  it("builds a PNG character card with the chara text chunk", () => {
    const png = buildAgentCardPng();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const encoded = readTextChunk(png, "chara");
    expect(encoded).toBeTruthy();
    const payload = JSON.parse(
      Buffer.from(encoded as string, "base64").toString("utf8")
    );
    expect(payload.spec).toBe("chara_card_v2");
    expect(payload.data.name).toBe(E2E_AGENT_CHARACTER_NAME);
    expect(payload.data.creator_notes).toBe(E2E_AGENT_CREATOR_NOTES);
    expect(payload.data.system_prompt).toContain(E2E_AGENT_MARKER);
    expect(payload.data.description).toContain(E2E_AGENT_MARKER);
    expect(payload.data.first_mes).toContain("{{char}}");
    expect(payload.data.first_mes).toContain("{{user}}");
  });

  it("keeps bytes and sha256 self-consistent", () => {
    const png = buildAgentCardPng();
    const sha256 = createHash("sha256").update(png).digest("hex");
    const rebuilt = buildAgentCardPng();
    expect(rebuilt.byteLength).toBe(png.byteLength);
    expect(createHash("sha256").update(rebuilt).digest("hex")).toBe(sha256);
    expect(buildAgentCardPayload().data.name).toBe(E2E_AGENT_CHARACTER_NAME);
  });
});
