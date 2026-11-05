// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { WorldbookProcessor } from "../worldbook-processor";
import type { PipelineContext } from "../../../types/pipeline";
import {
  STWorldbookLogic,
  STWorldbookPosition,
  type STWorldbookEntry,
  type MatchedWorldbookEntry,
} from "@/tools/st-worldbook-manager/types/worldbook";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug() {} }),
}));
const entry = (
  uid: number,
  overrides: Partial<STWorldbookEntry> = {}
): STWorldbookEntry => ({
  uid,
  key: ["latest"],
  keysecondary: [],
  content: `entry-${uid}`,
  constant: false,
  selective: false,
  order: uid,
  position: STWorldbookPosition.Outlet,
  disable: false,
  probability: 100,
  depth: 0,
  preventRecursion: true,
  ...overrides,
});
async function scan(
  entries: STWorldbookEntry[],
  history = ["ancient", "latest"],
  agent = {}
) {
  const context = {
    messages: history.map((content) => ({
      role: "user",
      content,
      sourceType: "session_history",
    })),
    agentConfig: agent,
    settings: { worldbook: { defaultScanDepth: 1 } },
    sharedData: new Map([
      [
        "loadedWorldbooks",
        [
          {
            metadata: { name: "test" },
            entries: Object.fromEntries(entries.map((e) => [e.uid, e])),
          },
        ],
      ],
    ]),
    logs: [],
  } as unknown as PipelineContext;
  await new WorldbookProcessor().execute(context);
  const matched = (context.sharedData.get("activatedWorldbookEntries") ??
    []) as MatchedWorldbookEntry[];
  return matched.map((e) => ({ uid: e.raw.uid, keys: e.matchedKeys }));
}
describe("worldbook scan behavior", () => {
  it("扫描深度、大小写、全词和选择性关键词相互独立", async () => {
    const actual = await scan(
      [
        entry(1, { key: ["ANCIENT"], scanDepth: 2 }),
        entry(2, { key: ["ancient"], scanDepth: 1 }),
        entry(3, { key: ["LATEST"], caseSensitive: true }),
        entry(4, { key: ["LATEST", "late"], matchWholeWords: true }),
        entry(5, {
          keysecondary: ["second"],
          selective: true,
          selectiveLogic: STWorldbookLogic.AND_ALL,
        }),
        entry(6, {
          keysecondary: ["missing"],
          selective: true,
          selectiveLogic: STWorldbookLogic.NOT_ANY,
        }),
      ],
      ["ancient", "latest second"]
    );
    expect(actual).toEqual([
      { uid: 1, keys: ["ANCIENT"] },
      { uid: 4, keys: ["LATEST"] },
      { uid: 5, keys: ["latest"] },
      { uid: 6, keys: ["latest"] },
    ]);
  });
  it("同深度条目的各全局字段扫描开关独立", async () => {
    const fields = [
      "matchPersonaDescription",
      "matchCharacterDescription",
      "matchCharacterPersonality",
      "matchCharacterDepthPrompt",
      "matchScenario",
      "matchCreatorNotes",
    ] as const;
    const keys = [
      "persona",
      "description",
      "personality",
      "depthprompt",
      "scenario",
      "notes",
    ];
    const entries = fields.flatMap((field, i) => [
      entry(i * 2, { key: [keys[i]], [field]: true }),
      entry(i * 2 + 1, { key: [keys[i]] }),
    ]);
    const actual = await scan(entries, ["latest"], {
      description: "persona",
      presetMessages: [{ role: "system", content: "description" }],
      personality: "personality",
      depthPrompt: "depthprompt",
      scenario: "scenario",
      creatorNotes: "notes",
    });
    expect(actual.map((e) => e.uid)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it("递归激活内容立即参与后续扫描", async () => {
    const actual = await scan([
      entry(1, { content: "unlock", preventRecursion: false }),
      entry(2, { key: ["unlock"], content: "next", preventRecursion: false }),
      entry(3, { key: ["next"] }),
    ]);
    expect(actual.map((e) => e.uid)).toEqual([1, 2, 3]);
  });
  it("正则状态互不污染，sticky 和 cooldown 保持逐条历史匹配", async () => {
    const actual = await scan([
      entry(1, { key: ["/ancient/gi"], sticky: 2 }),
      entry(2, { key: ["/ancient/gi"], sticky: 2 }),
      entry(3, { key: ["/latest/g"], cooldown: 1 }),
      entry(4, { key: ["/ancient\\nlatest/"], sticky: 2 }),
      entry(5, { key: ["/[invalid/", "/LATEST/i"] }),
    ]);
    expect(actual).toEqual([
      { uid: 1, keys: [] },
      { uid: 2, keys: [] },
      { uid: 5, keys: ["/LATEST/i"] },
    ]);
  });
});
