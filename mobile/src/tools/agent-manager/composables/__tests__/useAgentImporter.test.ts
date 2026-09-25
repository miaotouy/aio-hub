import { describe, expect, it } from "vitest";
import { useAgentImporter } from "../useAgentImporter";

// @vitest-environment jsdom

describe("useAgentImporter", () => {
  it("converts a SillyTavern JSON card into usable presets and greetings", async () => {
    const { parseFile } = useAgentImporter();
    const file = new File(
      [
        JSON.stringify({
          spec: "chara_card_v2",
          name: "Mira",
          description: "A careful guide.",
          personality: "Patient",
          scenario: "A quiet observatory",
          first_mes: "Welcome, {{user}}.",
          alternate_greetings: ["The telescope is ready."],
          tags: ["guide"],
        }),
      ],
      "mira.json",
      { type: "application/json" }
    );

    const result = await parseFile(file);

    expect(result.source).toBe("silly-tavern");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toMatchObject({
      name: "Mira",
      category: "character",
      tags: ["guide"],
    });
    expect(result.agents[0].presetMessages?.map((message) => message.content)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("A careful guide."),
        expect.stringContaining("Patient"),
      ])
    );
    expect(result.agents[0].greetings).toHaveLength(2);
    expect(result.agents[0].greetings?.[0].content).toContain("{{user}}");
  });

  it("reads a PNG V2 chara text chunk and keeps the card preview", async () => {
    const { parseFile } = useAgentImporter();
    const payload = btoa(
      JSON.stringify({
        spec: "chara_card_v2",
        name: "PNG Character",
        first_mes: "Hello from PNG",
      })
    );
    const encoder = new TextEncoder();
    const chunkData = new Uint8Array([
      ...encoder.encode("chara"),
      0,
      ...encoder.encode(payload),
    ]);
    const bytes = new Uint8Array(8 + 12 + chunkData.length + 12);
    const view = new DataView(bytes.buffer);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    view.setUint32(8, chunkData.length);
    bytes.set(encoder.encode("tEXt"), 12);
    bytes.set(chunkData, 16);
    bytes.set(encoder.encode("IEND"), 16 + chunkData.length + 4);

    const result = await parseFile(
      new File([bytes], "character.png", { type: "image/png" })
    );

    expect(result.source).toBe("silly-tavern");
    expect(result.agents[0].name).toBe("PNG Character");
    expect(result.agents[0].avatarDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
