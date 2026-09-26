// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { useAgentImporter } from "../useAgentImporter";

const encoder = new TextEncoder();

function aioConfig(agents: unknown[]): string {
  return JSON.stringify({ version: 1, type: "AIO_Agent_Export", agents });
}

describe("useAgentImporter 私有资产提取", () => {
  it("提取包根头像、assets 与 worldbooks，且不再对已消费资源告警", async () => {
    const { parseFile } = useAgentImporter();
    const zip = zipSync({
      "Hero.agent.json": encoder.encode(
        aioConfig([
          {
            name: "Hero",
            displayName: "Hero",
            icon: "avatar.png",
            assets: [
              {
                id: "bg",
                filename: "portrait.png",
                path: "assets/portrait.png",
                type: "image",
              },
            ],
            presetMessages: [],
          },
        ])
      ),
      "avatar.png": new Uint8Array([1, 2, 3, 4]),
      "assets/portrait.png": new Uint8Array([5, 6, 7]),
      "assets/extra.bin": new Uint8Array([8, 9]),
      "worldbooks/Lore.json": encoder.encode(
        JSON.stringify({
          name: "Lore",
          entries: [{ keys: ["a"], content: "A" }],
        })
      ),
    });

    const result = await parseFile(
      new File([zip], "hero.agent.zip", { type: "application/zip" })
    );

    expect(result.source).toBe("aio");
    expect(result.agentAvatars).toEqual([
      expect.objectContaining({ agentIndex: 0, filename: "avatar.png", size: 4 }),
    ]);
    expect(result.agentAvatars?.[0].bytes).toEqual(new Uint8Array([1, 2, 3, 4]));

    expect(result.privateAssets?.[0].agentIndex).toBe(0);
    expect(
      result.privateAssets?.[0].assets.map((asset) => asset.path).sort()
    ).toEqual(["assets/extra.bin", "assets/portrait.png"]);
    const portrait = result.privateAssets?.[0].assets.find(
      (asset) => asset.path === "assets/portrait.png"
    );
    expect(portrait?.mimeType).toBe("image/png");
    expect(portrait?.bytes).toEqual(new Uint8Array([5, 6, 7]));

    expect(result.importedWorldbooks?.[0]).toMatchObject({
      name: "Lore",
      agentIndexes: [0],
    });
    expect(result.warnings.join(" ")).not.toContain("暂未迁移");
  });

  it("批量多 Agent 子文件夹包按 agentIndex 关联头像/资产/世界书，并只告警未消费项", async () => {
    const { parseFile } = useAgentImporter();
    const zip = zipSync({
      "alpha/A.agent.json": encoder.encode(
        aioConfig([
          {
            name: "A",
            displayName: "A",
            icon: "a.png",
            assets: [
              {
                id: "x",
                filename: "a.bin",
                path: "assets/a.bin",
                type: "file",
              },
            ],
            presetMessages: [],
          },
        ])
      ),
      "alpha/a.png": new Uint8Array([10]),
      "alpha/assets/a.bin": new Uint8Array([11, 12]),
      "alpha/worldbooks/WB.yml": encoder.encode(
        "name: WB\nentries:\n  - keys:\n      - star\n    content: sky\n"
      ),
      "beta/B.agent.json": encoder.encode(
        aioConfig([
          {
            name: "B",
            displayName: "B",
            icon: "missing.png",
            assets: [
              {
                id: "y",
                filename: "b.bin",
                path: "assets/b.bin",
                type: "file",
              },
            ],
            presetMessages: [],
          },
        ])
      ),
      "beta/assets/b.bin": new Uint8Array([13, 14, 15]),
      "readme.txt": encoder.encode("unused"),
    });

    const result = await parseFile(
      new File([zip], "batch.agent.zip", { type: "application/zip" })
    );

    expect(result.agents.map((agent) => agent.name)).toEqual(["A", "B"]);
    expect(result.agentAvatars).toHaveLength(1);
    expect(result.agentAvatars?.[0]).toMatchObject({
      agentIndex: 0,
      filename: "a.png",
    });
    expect(result.privateAssets).toEqual([
      {
        agentIndex: 0,
        assets: [expect.objectContaining({ path: "assets/a.bin" })],
      },
      {
        agentIndex: 1,
        assets: [expect.objectContaining({ path: "assets/b.bin" })],
      },
    ]);
    expect(result.importedWorldbooks).toHaveLength(1);
    expect(result.importedWorldbooks?.[0]).toMatchObject({
      name: "WB",
      agentIndexes: [0],
    });
    expect(result.warnings.join(" ")).toContain("1 个资源文件暂未迁移");
  });
});
