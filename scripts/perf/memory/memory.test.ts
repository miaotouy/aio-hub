// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  anonymizeSession,
  createRedactor,
  inspectSession,
  selectCandidates,
  type MemoryCorpus,
} from "./corpus";
import { appearanceMatrix, appearanceSettings } from "./matrix";
import { writeMemoryFixture, EMPTY_SESSION_ID, imagePng } from "./fixture";
import { memoryMarkdown, summarizeMemory } from "./report";
import { isValidSessionPayload } from "../../../src/tools/llm-chat/services/sessionPersistenceRepository";
import type { ResourceSample } from "../resources";

function session() {
  return {
    rootNodeId: "root",
    activeLeafId: "tool",
    history: [{ secret: "private undo" }],
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["user"],
        role: "system",
        content: "",
      },
      user: {
        id: "user",
        parentId: "root",
        childrenIds: ["assistant", "alternate"],
        role: "user",
        content:
          "CustomerSecret: sk-PrivateToken987\n![private](https://private.example/secret.png)",
        attachments: [
          {
            type: "image",
            path: "C:/private.png",
            metadata: { width: 1536, height: 1024 },
          },
        ],
      },
      assistant: {
        id: "assistant",
        parentId: "user",
        childrenIds: ["tool"],
        role: "assistant",
        content:
          "```typescript\nconst privateName = 'confidential';\n```\n\n| a | b |\n| --- | --- |\n| c | d |",
        metadata: {
          reasoningContent: "private reasoning\n".repeat(30),
          toolCallsRequested: [
            {
              requestId: "request",
              toolName: "PrivateTool",
              args: { token: "PrivateToken987" },
              status: "completed",
            },
          ],
          requestParameters: { Authorization: "secret" },
        },
      },
      tool: {
        id: "tool",
        parentId: "assistant",
        childrenIds: [],
        role: "tool",
        content: "private result",
        metadata: {
          toolCall: {
            requestId: "request",
            toolName: "PrivateTool",
            status: "success",
          },
        },
      },
      alternate: {
        id: "alternate",
        parentId: "user",
        childrenIds: [],
        role: "assistant",
        content: "alternate response",
      },
    },
  };
}

describe("memory workload contracts", () => {
  // Protects replay fidelity + private-data boundary; stable across implementation refactors.
  it("replays a real-shaped branched tool session with linked identities and scrubbed private payloads", () => {
    const original = session();
    const replay = anonymizeSession(
      original,
      "sample",
      createRedactor(Buffer.alloc(32, 7))
    );
    const stats = inspectSession(replay);
    expect(stats).toMatchObject({
      nodes: 5,
      activePath: 4,
      branches: 1,
      codeBlocks: 1,
      tables: 1,
      toolNodes: 1,
      toolCalls: 2,
      attachments: 1,
    });
    expect(stats.reasoningChars).toBe(inspectSession(original).reasoningChars);
    const nodes = Object.values(replay.nodes) as any[];
    const assistant = nodes.find(
      (n) => n.role === "assistant" && n.childrenIds.length
    );
    const tool = nodes.find((n) => n.role === "tool");
    expect(assistant.metadata.toolCallsRequested[0].requestId).toBe(
      tool.metadata.toolCall.requestId
    );
    expect(replay.activeLeafId).toBe(tool.id);
    expect(tool.parentId).toBe(assistant.id);
    expect(JSON.stringify(replay)).not.toMatch(
      /CustomerSecret|PrivateToken987|private\.example|C:\/private|Authorization|private undo/
    );
    expect(replay.history).toEqual([]);
  });

  // Distinct/repeated image resources have very different decode-cache footprints.
  it("preserves image identity reuse and safe structural HTML during redaction", () => {
    const redact = createRedactor(Buffer.alloc(32, 3));
    const body = redact(
      '<details open onclick="steal()"><summary>PrivateTitle</summary><table><tr><td colspan="2">Secret</td></tr></table></details>\n![a](https://p.example/a.png) ![b](https://p.example/a.png) ![c](https://p.example/b.png)'
    );
    const markers = [...body.matchAll(/memory-image-\d+/g)].map((m) => m[0]);
    expect(markers).toHaveLength(3);
    expect(markers[0]).toBe(markers[1]);
    expect(markers[2]).not.toBe(markers[0]);
    expect(body).toContain('<td colspan="2">');
    expect(body).not.toMatch(/onclick|steal|PrivateTitle|p\.example/);
    const embedded = redact(
      `![image](data:image/png;base64,${imagePng(16, 9, 1).toString("base64")})`
    );
    const marker = embedded.match(/memory-image-\d+/)![0];
    expect(redact.images[marker]).toEqual({
      width: 16,
      height: 9,
      source: "embedded",
    });
  });

  // Prevents embedded base64 from being mislabeled as a giant prose workload.
  it("ranks long answers by text length while retaining original storage size statistics", () => {
    const encoded = session();
    encoded.nodes.assistant.content = `![image](data:image/png;base64,${"A".repeat(20000)})`;
    const prose = session();
    prose.nodes.assistant.content = "long paragraph\n".repeat(200);
    const small = session();
    const items = [
      { file: "typical", stats: inspectSession(small) },
      { file: "data", stats: inspectSession(encoded) },
      { file: "prose", stats: inspectSession(prose) },
    ];
    expect(items[1].stats.longestMessage).toBeGreaterThan(
      items[2].stats.longestMessage
    );
    expect(items[1].stats.longestTextMessage).toBeLessThan(
      items[2].stats.longestTextMessage
    );
    // Avoid earlier profile selection consuming the same sample in this focused ranking check.
    items[0].stats.activePath = 100;
    const chosen = selectCandidates(items);
    expect(chosen.find((s) => s.profile === "long-answer")?.file).toBe("prose");
  });

  // Public matrix contract: exhaustive dimensions, separate OS lane, effects-off baseline.
  it("enumerates the full appearance product with independently controllable opacity and blur", () => {
    const full = appearanceMatrix("full");
    expect(full).toHaveLength(38);
    expect(new Set(full.map((s) => s.id)).size).toBe(full.length);
    expect(full.filter((s) => s.effects)).toHaveLength(2 * 2 * 3 * 3);
    for (const theme of ["light", "dark"])
      for (const wallpaper of [false, true])
        for (const opacity of [1, 0.75, 0.3])
          for (const blur of [0, 15, 40]) {
            const item = full.find(
              (s) =>
                s.theme === theme &&
                s.wallpaper === wallpaper &&
                s.opacity === opacity &&
                s.blur === blur &&
                s.effects
            )!;
            expect(appearanceSettings(item)).toMatchObject({
              enableWallpaper: wallpaper,
              uiBaseOpacity: opacity,
              enableUiBlur: blur > 0,
              enableWindowEffects: false,
            });
          }
    expect(appearanceMatrix("quick")).toHaveLength(8);
    expect(appearanceMatrix("native")).toHaveLength(12);
  });

  // Isolated fixtures must keep selected identities, empty-state contract and real index scale.
  it("seeds a complete isolated library and materializes unique image files rather than broken references", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aio-memory-test-"));
    try {
      const detail = anonymizeSession(session(), "sample");
      const stats = inspectSession(detail);
      const corpus: MemoryCorpus = {
        version: 1,
        createdAt: "fixed",
        libraryCount: 30,
        inventory: { indexed: 30, readable: 30, skipped: 0, quantiles: {} },
        limitations: [],
        sessions: [
          {
            id: "sample",
            profile: "tools",
            source: stats,
            replay: stats,
            detail,
          },
        ],
      };
      const manifest = writeMemoryFixture(
        root,
        corpus,
        appearanceMatrix("quick")[0]
      );
      const index = JSON.parse(
        fs.readFileSync(path.join(root, "llm-chat/sessions-index.json"), "utf8")
      );
      expect(index.sessions).toHaveLength(30);
      expect(index.currentSessionId).toBe(EMPTY_SESSION_ID);
      const copy = JSON.parse(
        fs.readFileSync(
          path.join(root, "llm-chat/sessions/sample.json"),
          "utf8"
        )
      );
      expect(isValidSessionPayload(copy, "sample")).toBe(true);
      const empty = JSON.parse(
        fs.readFileSync(
          path.join(root, `llm-chat/sessions/${EMPTY_SESSION_ID}.json`),
          "utf8"
        )
      );
      expect(isValidSessionPayload(empty, EMPTY_SESSION_ID)).toBe(true);
      const user = Object.values(copy.nodes).find(
        (n: any) => n.role === "user"
      ) as any;
      expect(user.content).toContain("http://asset.localhost/");
      const image = fs.readFileSync(
        path.join(root, "assets", user.attachments[0].path)
      );
      expect([...image.subarray(0, 8)]).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);
      expect(image.readUInt32BE(16)).toBe(1536);
      expect(image.readUInt32BE(20)).toBe(1024);
      expect(manifest.libraryCount).toBe(30);
      expect(detail.nodes["sample-n1"].attachments[0].path).toBe(
        "memory-placeholder"
      );
    } finally {
      // root is the exact fresh temporary directory returned by mkdtempSync above.
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Missing counters and shared working sets must not turn into false low-memory results.
  it("reports tail medians, per-process classes and missing GPU data without fabricating zero usage", () => {
    const samples = [1000, 2000, 3000, 4000, 5000, 6000].map(
      (at, i): ResourceSample => ({
        at,
        privateBytes: [999, 10, 30, 20, 50, 40][i],
        workingSetBytes: 200,
        cpuSeconds: 0,
        gpu3dPercent: 0,
        gpuDedicatedBytes: 0,
        gpuSharedBytes: 0,
        processCount: 2,
        hasWebView2Process: true,
        hasGpuProcess: false,
        processes: [
          { pid: 2, kind: "renderer", privateBytes: 40, workingSetBytes: 100 },
        ],
      })
    );
    const summary = summarizeMemory(samples, 6500);
    expect(summary).toMatchObject({
      valid: true,
      privatePeakBytes: 999,
      privateTailBytes: 30,
      gpuDedicatedPeakBytes: null,
      byKind: { renderer: { privateTailBytes: 40 } },
    });
    expect(summarizeMemory(samples.slice(0, 1), 20000).valid).toBe(false);
    expect(summarizeMemory([], 20000).privatePeakBytes).toBeNull();
    expect(memoryMarkdown([])).toContain("MiB");
  });
});
