import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { useAgentImporter } from "../useAgentImporter";

// @vitest-environment jsdom

const encoder = new TextEncoder();

const aioExport = {
  version: 1,
  type: "AIO_Agent_Export",
  agents: [
    { name: "AIO Agent", displayName: "AIO Agent", presetMessages: [] },
  ],
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 构造仅含 tEXt chunk 的 PNG，供 ST/AIO 文本元数据解析测试使用 */
function buildPng(chunks: Array<[string, string]>): Uint8Array {
  const payloads = chunks.map(([keyword, text]) => {
    const data = new Uint8Array([
      ...encoder.encode(keyword),
      0,
      ...encoder.encode(text),
    ]);
    const chunk = new Uint8Array(12 + data.length);
    new DataView(chunk.buffer).setUint32(0, data.length);
    chunk.set(encoder.encode("tEXt"), 4);
    chunk.set(data, 8);
    return chunk;
  });
  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const iend = new Uint8Array(12);
  iend.set(encoder.encode("IEND"), 4);
  const total =
    signature.length +
    payloads.reduce((sum, chunk) => sum + chunk.length, 0) +
    iend.length;
  const bytes = new Uint8Array(total);
  let offset = 0;
  bytes.set(signature, offset);
  offset += signature.length;
  for (const chunk of payloads) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  bytes.set(iend, offset);
  return bytes;
}

function buildAioPngBundle(): Uint8Array {
  const zip = zipSync({
    "aio.agent.json": encoder.encode(JSON.stringify(aioExport)),
  });
  const bundle = JSON.stringify({
    version: 1,
    type: "AIO_Agent_Bundle",
    compressed: true,
    data: bytesToBase64(zip),
  });
  return buildPng([["aiob", bundle]]);
}

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

  it("imports an AIO export JSON bundle", async () => {
    const { parseFile } = useAgentImporter();
    const file = new File([JSON.stringify(aioExport)], "aio.agent.json", {
      type: "application/json",
    });

    const result = await parseFile(file);

    expect(result.source).toBe("aio");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("AIO Agent");
  });

  it("preserves assetGroups and AgentAsset.group from an AIO export", async () => {
    const { parseFile } = useAgentImporter();
    const payload = {
      version: 1,
      type: "AIO_Agent_Export",
      agents: [
        {
          name: "Grouped Agent",
          displayName: "Grouped Agent",
          presetMessages: [],
          assetGroups: [
            {
              id: "bgm",
              displayName: "背景音乐",
              sortOrder: 1,
              desktopOnly: true,
            },
            "legacy",
            { displayName: "缺少 id" },
          ],
          assets: [
            {
              id: "bgm_rain",
              filename: "rain.mp3",
              path: "assets/rain.mp3",
              type: "audio",
              group: "bgm",
            },
          ],
        },
      ],
    };
    const result = await parseFile(
      new File([JSON.stringify(payload)], "grouped.agent.json", {
        type: "application/json",
      })
    );

    expect(result.agents[0].assetGroups).toEqual([
      { id: "bgm", displayName: "背景音乐", sortOrder: 1, desktopOnly: true },
    ]);
    expect(result.agents[0].assets?.[0]).toMatchObject({
      id: "bgm_rain",
      group: "bgm",
    });
  });

  it("imports an AIO agent YAML config", async () => {
    const { parseFile } = useAgentImporter();
    const yaml = [
      "version: 1",
      "type: AIO_Agent_Export",
      "agents:",
      "  - name: YAML Agent",
      "    displayName: YAML Agent",
      "    presetMessages: []",
      "",
    ].join("\n");

    const result = await parseFile(
      new File([yaml], "aio.agent.yaml", { type: "application/yaml" })
    );

    expect(result.source).toBe("aio");
    expect(result.agents[0].name).toBe("YAML Agent");
  });

  it("imports an AIO PNG bundle from the aiob text chunk", async () => {
    const { parseFile } = useAgentImporter();
    const bytes = buildAioPngBundle();

    const result = await parseFile(
      new File([bytes], "aio.agent.png", { type: "image/png" })
    );

    expect(result.source).toBe("aio");
    expect(result.agents[0].name).toBe("AIO Agent");
    expect(result.agents[0].avatarDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.warnings.join(" ")).toContain("AIO PNG");
  });

  it("imports an AIO zip package and warns about unconsumed resources", async () => {
    const { parseFile } = useAgentImporter();
    const zip = zipSync({
      "aio.agent.json": encoder.encode(JSON.stringify(aioExport)),
      "extra/icon.png": new Uint8Array([1, 2, 3]),
    });

    const result = await parseFile(
      new File([zip], "aio.agent.zip", { type: "application/zip" })
    );

    expect(result.source).toBe("aio");
    expect(result.agents[0].name).toBe("AIO Agent");
    expect(result.warnings.join(" ")).toContain("资源文件");
  });

  it("prefers the ST character card when a PNG has both chara and aiob chunks", async () => {
    const { parseFile } = useAgentImporter();
    const stCard = btoa(
      JSON.stringify({
        spec: "chara_card_v2",
        name: "ST First",
        first_mes: "Hi",
      })
    );
    const zip = zipSync({
      "aio.agent.json": encoder.encode(JSON.stringify(aioExport)),
    });
    const bundle = JSON.stringify({
      version: 1,
      type: "AIO_Agent_Bundle",
      compressed: true,
      data: bytesToBase64(zip),
    });
    const bytes = buildPng([
      ["chara", stCard],
      ["aiob", bundle],
    ]);

    const result = await parseFile(
      new File([bytes], "both.png", { type: "image/png" })
    );

    expect(result.source).toBe("silly-tavern");
    expect(result.agents[0].name).toBe("ST First");
  });

  it("extracts the embedded character_book and regex_scripts from an ST card", async () => {
    const { parseFile } = useAgentImporter();
    const card = {
      spec: "chara_card_v2",
      name: "Lore Keeper",
      first_mes: "Hello",
      character_book: {
        name: "Lore",
        entries: [
          {
            keys: ["starport"],
            content: "A busy port.",
            position: "before_char",
          },
        ],
      },
      extensions: {
        regex_scripts: [
          { scriptName: "Trim", findRegex: "/foo/g", replaceString: "bar" },
        ],
      },
    };

    const result = await parseFile(
      new File([JSON.stringify(card)], "lore.json", {
        type: "application/json",
      })
    );

    expect(result.importedWorldbooks).toHaveLength(1);
    expect(result.importedWorldbooks?.[0].name).toBe("Lore");
    const draft = result.agents[0];
    expect(draft.regexConfig).toBeTruthy();
    const extensionConfig = draft.extensionConfig as Record<string, unknown>;
    expect(extensionConfig.characterBook).toBeUndefined();
    expect(extensionConfig.regexScripts).toBeUndefined();
  });

  it("converts markdownOnly ST regex scripts into render-stage rules", async () => {
    const { parseFile } = useAgentImporter();
    const card = {
      spec: "chara_card_v2",
      name: "Render Keeper",
      first_mes: "Hello",
      extensions: {
        regex_scripts: [
          {
            scriptName: "RenderOnly",
            findRegex: "/<x>/g",
            replaceString: "y",
            markdownOnly: true,
          },
          {
            scriptName: "PromptOnly",
            findRegex: "/a/g",
            replaceString: "b",
            promptOnly: true,
          },
        ],
      },
    };

    const result = await parseFile(
      new File([JSON.stringify(card)], "render.json", {
        type: "application/json",
      })
    );

    const config = result.agents[0].regexConfig as {
      presets: Array<{
        rules: Array<{
          name: string;
          applyTo: { render: boolean; request: boolean };
        }>;
      }>;
    };
    const rules = config.presets[0].rules;
    expect(rules).toHaveLength(2);
    expect(rules.find((rule) => rule.name === "RenderOnly")?.applyTo).toEqual({
      render: true,
      request: false,
    });
    expect(rules.find((rule) => rule.name === "PromptOnly")?.applyTo).toEqual({
      render: false,
      request: true,
    });
    expect(result.warnings.join(" ")).toContain("渲染阶段 1 条");
    expect(result.warnings.join(" ")).not.toContain("仅渲染");
  });

  it("converts substituteRegex and trimStrings instead of warning", async () => {
    const { parseFile } = useAgentImporter();
    const card = {
      spec: "chara_card_v2",
      name: "Substitute Keeper",
      first_mes: "Hello",
      extensions: {
        regex_scripts: [
          {
            scriptName: "Raw",
            findRegex: "/{{user}}/g",
            replaceString: "x",
            substituteRegex: 1,
            trimStrings: [" ", 7, "\\n"],
          },
          {
            scriptName: "Escaped",
            findRegex: "/a/g",
            replaceString: "b",
            substituteRegex: 2,
          },
          {
            scriptName: "None",
            findRegex: "/c/g",
            replaceString: "d",
            substituteRegex: 0,
          },
          {
            scriptName: "Unknown",
            findRegex: "/e/g",
            replaceString: "f",
            substituteRegex: 9,
          },
        ],
      },
    };

    const result = await parseFile(
      new File([JSON.stringify(card)], "substitute.json", {
        type: "application/json",
      })
    );

    const config = result.agents[0].regexConfig as {
      presets: Array<{
        rules: Array<{
          name: string;
          substitutionMode?: string;
          trimStrings?: string[];
        }>;
      }>;
    };
    const byName = Object.fromEntries(
      config.presets[0].rules.map((rule) => [rule.name, rule])
    );
    expect(byName.Raw.substitutionMode).toBe("RAW");
    expect(byName.Raw.trimStrings).toEqual([" ", "\\n"]);
    expect(byName.Escaped.substitutionMode).toBe("ESCAPED");
    expect(byName.None.substitutionMode).toBeUndefined();
    expect(byName.Unknown.substitutionMode).toBeUndefined();

    const warnings = result.warnings.join(" ");
    expect(warnings).not.toContain("高级选项未迁移");
    expect(warnings).toContain("substituteRegex 存在未识别值（9）");
  });
});
