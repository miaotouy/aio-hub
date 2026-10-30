import { beforeAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  projectSnapshot,
  freezeSnapshotSources,
  snapshotHash,
} from "../requestSnapshotProjection";
import {
  compareRequestSnapshots,
  defaultSnapshot,
  defaultSnapshotBaseline,
  usageReadRatio,
} from "../requestSnapshotComparison";
import {
  RequestSnapshotRepository,
  boundAttempt,
  SNAPSHOT_LIMITS,
  snapshotBytes,
} from "../requestSnapshotRepository";
import type {
  ChatRequestAttemptSnapshot,
  SessionRequestSnapshotFile,
} from "../../types/requestSnapshot";
import type { ChatSessionDetail } from "../../types/session";
import type { WireRequest } from "@aiohub/llm-core";
beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
});
function snapshot(
  id = "a",
  patch: Partial<ChatRequestAttemptSnapshot> = {}
): ChatRequestAttemptSnapshot {
  return {
    attemptId: id,
    requestId: "request",
    attemptIndex: 1,
    sessionId: "session",
    assistantNodeIds: ["assistant"],
    triggerNodeId: "user",
    startedAt: 1,
    status: "completed",
    route: {
      logicalProfileId: "logical",
      logicalModelId: "model",
      actualProfileId: "physical",
      actualModelId: "model",
      providerType: "openai",
    },
    captureQuality: "complete",
    inputHash: "same",
    messages: [],
    sources: [],
    providerUsageStatus: "missing",
    ...patch,
  };
}
function wire(value: unknown): WireRequest {
  return {
    method: "POST",
    url: "https://secret:credential@example.test?api_key=hidden",
    headers: { authorization: "secret" },
    body: { kind: "json", value: value as any },
    streaming: false,
  };
}
function memoryIO() {
  const files = new Map<string, string>();
  return {
    files,
    read: vi.fn(async (id: string) =>
      files.has(id)
        ? (JSON.parse(files.get(id)!) as SessionRequestSnapshotFile)
        : null
    ),
    write: vi.fn(async (file: SessionRequestSnapshotFile) => {
      files.set(file.sessionId, JSON.stringify(file));
    }),
  };
}
describe("request projections and comparison", () => {
  it("hashes semantic object key order consistently and keeps ordered protocol fields", async () => {
    expect(await snapshotHash({ b: 2, a: 1 })).toBe(
      await snapshotHash({ a: 1, b: 2 })
    );
    const body = {
      model: "m",
      messages: [
        {
          role: "assistant",
          content: "same",
          reasoning_content: "old",
          tool_calls: [
            { id: "one", function: { name: "lookup", arguments: "{}" } },
          ],
        },
      ],
    };
    const before = await projectSnapshot(wire(body), false);
    for (const message of [
      { ...body.messages[0], reasoning_content: "new" },
      {
        ...body.messages[0],
        tool_calls: [
          { id: "two", function: { name: "lookup", arguments: "{}" } },
        ],
      },
    ]) {
      const after = await projectSnapshot(
        wire({ ...body, messages: [message] }),
        false
      );
      expect(after.inputHash).not.toBe(before.inputHash);
      expect(after.messages[0].wireHash).not.toBe(before.messages[0].wireHash);
    }
  });
  it("keeps body hashes when text previews are disabled and covers media source changes", async () => {
    const make = (url: string) =>
      wire({
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url } },
              { type: "text", text: "private text" },
            ],
          },
        ],
      });
    const before = await projectSnapshot(
      make("data:image/png;base64,AAAA"),
      false
    );
    const after = await projectSnapshot(
      make("data:image/png;base64,BBBB"),
      false
    );
    expect(after.inputHash).not.toBe(before.inputHash);
    expect(before.messages[0].parts[1]).toMatchObject({
      textState: "omitted",
      charLength: 12,
    });
    expect(JSON.stringify(before)).not.toContain("private text");
    expect(JSON.stringify(before)).not.toContain("AAAA");
  });
  it("redacts recognised private content before applying UTF-8 preview limits", async () => {
    const text =
      "Bearer test.secret abc@example.com C:\\Users\\Owner\\secret.txt https://name:password@example.com?api_key=private&keep=yes";
    const projected = await projectSnapshot(
      wire({ messages: [{ role: "user", content: text }] }),
      true
    );
    const part = projected.messages[0].parts[0];
    expect(part.textState).toBe("redacted");
    expect(part.textPreview).toContain("[邮箱]");
    expect(part.textPreview).toContain("[本机路径]");
    expect(part.textPreview).not.toContain("test.secret");
    expect(part.textPreview).not.toContain("name:password");
    expect(part.textPreview).not.toContain("api_key=private");
    const long = await projectSnapshot(
      wire({ messages: [{ role: "user", content: "汉".repeat(40000) }] }),
      true
    );
    expect(long.messages[0].parts[0].textState).toBe("truncated");
    expect(
      new TextEncoder().encode(long.messages[0].parts[0].textPreview).length
    ).toBeLessThanOrEqual(16 * 1024);
  });
  it("redacts nested tool credentials and binary replay fields before saving readable protocol previews", async () => {
    const projected = await projectSnapshot(
      wire({
        messages: [
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call",
                function: {
                  name: "lookup",
                  arguments: JSON.stringify({
                    api_key: "private-value",
                    image: { data: "binary-value" },
                    query: "normal",
                  }),
                },
              },
            ],
          },
        ],
      }),
      true
    );
    const preview = projected.messages[0].parts.find(
      (part) => part.kind === "tool_use"
    )?.textPreview;
    expect(preview).toContain("normal");
    expect(preview).toContain("[凭据]");
    expect(preview).not.toContain("private-value");
    expect(preview).not.toContain("binary-value");
  });
  it("preserves recursive merged and Recall sources plus macro occurrence identities", async () => {
    const frozen = freezeSnapshotSources(
      [
        {
          role: "user",
          content: "joined",
          sourceType: "merged",
          _mergedSources: [
            {
              role: "user",
              content: "preset",
              sourceId: "preset",
              sourceType: "agent_preset",
            },
            {
              role: "user",
              content: "history",
              sourceId: "user",
              sourceType: "session_history",
              _snapshotFragments: [
                {
                  sourceType: "recall",
                  sourceId: "collection",
                  content: "retrieved",
                },
              ],
            },
          ],
        },
      ],
      new Map([
        [
          "preset",
          [
            { name: "time", args: ["secret"], output: "one" },
            { name: "time", args: [], output: "two" },
          ],
        ],
      ]),
      false
    );
    const sources = await frozen.sources;
    expect(sources[0].parentSourceKeys).toHaveLength(2);
    expect(
      sources.find((source) => source.sourceType === "recall")?.contentHash
    ).toHaveLength(64);
    expect(sources[1].executedMacros?.map((macro) => macro.occurrence)).toEqual(
      [0, 1]
    );
    expect(sources[1].executedMacros?.[0].argsHash).toHaveLength(64);
    expect(JSON.stringify(sources)).not.toContain("secret");
  });
  it("distinguishes pure append, truncation, and an earlier instruction change", async () => {
    const body = (messages: unknown[], system = "fixed") =>
      wire({ messages, system });
    const first = [{ role: "user", content: "one" }];
    const a = snapshot("a", await projectSnapshot(body(first), true));
    const b = snapshot(
      "b",
      await projectSnapshot(
        body([...first, { role: "assistant", content: "two" }]),
        true
      )
    );
    expect(compareRequestSnapshots(a, b)).toMatchObject({
      kind: "append",
      firstDiffIndex: 1,
    });
    expect(compareRequestSnapshots(b, a).kind).toBe("shorten");
    const c = snapshot(
      "c",
      await projectSnapshot(
        body([...first, { role: "assistant", content: "two" }], "changed"),
        true
      )
    );
    expect(compareRequestSnapshots(a, c)).toMatchObject({
      kind: "changed",
      systemChanged: true,
    });
  });
  it("reports a message-internal prefix with explicit preview coverage", async () => {
    const a = snapshot(
      "a",
      await projectSnapshot(
        wire({ messages: [{ role: "user", content: "prefix-old" }] }),
        true
      )
    );
    const b = snapshot(
      "b",
      await projectSnapshot(
        wire({ messages: [{ role: "user", content: "prefix-new" }] }),
        true
      )
    );
    expect(compareRequestSnapshots(a, b)).toMatchObject({
      firstDiffIndex: 0,
      partDiff: { firstPart: 0, commonCharacters: 7, prefixQuality: "exact" },
    });
    const hidden = snapshot(
      "c",
      await projectSnapshot(
        wire({ messages: [{ role: "user", content: "prefix-new" }] }),
        false
      )
    );
    expect(compareRequestSnapshots(a, hidden).partDiff.prefixQuality).toBe(
      "unavailable"
    );
    expect(
      compareRequestSnapshots(
        a,
        snapshot("d", { ...b, captureQuality: "summaryOnly", messages: [] })
      ).kind
    ).toBe("summary");
  });
  it("selects completed attempts, ancestor requests and same-call retries without folding siblings", () => {
    const first = snapshot("one", {
      requestId: "earlier",
      assistantNodeIds: ["a1"],
    });
    const sibling = snapshot("sibling", {
      requestId: "sibling",
      assistantNodeIds: ["other"],
    });
    const current = snapshot("two", { startedAt: 2 });
    const retry = snapshot("retry", {
      startedAt: 3,
      attemptIndex: 2,
      status: "error",
    });
    const detail = {
      nodes: {
        user: { id: "user", parentId: "a1" },
        a1: { id: "a1", parentId: null },
      },
    } as unknown as ChatSessionDetail;
    expect(
      defaultSnapshot([first, sibling, current, retry], "assistant")?.attemptId
    ).toBe("two");
    expect(
      defaultSnapshotBaseline([first, sibling, current, retry], retry, detail)
        ?.attemptId
    ).toBe("one");
    expect(defaultSnapshot([retry], "assistant")?.attemptId).toBe("retry");
  });
  it("computes service read ratio from reported input only, retaining zero and unknown", () => {
    const usage = {
      promptTokens: 1200,
      completionTokens: 20,
      totalTokens: 1220,
      reportedUsageFields: { input_tokens: 100 },
      promptTokensDetails: { cachedTokens: 900 },
    };
    expect(usageReadRatio(usage)).toBe(0.75);
    expect(usageReadRatio({ ...usage, promptTokens: 0 })).toBeUndefined();
    expect(
      usageReadRatio({ ...usage, isLocalEstimated: true })
    ).toBeUndefined();
    expect(
      usageReadRatio({ ...usage, promptTokensDetails: {} })
    ).toBeUndefined();
    expect(
      usageReadRatio({ ...usage, promptTokensDetails: { cachedTokens: 0 } })
    ).toBe(0);
  });
});
describe("bounded serial snapshot persistence", () => {
  it("preserves concurrent completion order by actual send order and retains ten latest sends", async () => {
    const io = memoryIO();
    const repository = new RequestSnapshotRepository(io);
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repository.save(
          snapshot(String(11 - index), {
            startedAt: 11 - index,
            attemptIndex: 12 - index,
          }),
          0
        )
      )
    );
    expect(
      (await repository.list("session")).map((attempt) => attempt.startedAt)
    ).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(io.write).toHaveBeenCalledTimes(12);
  });
  it("bounds final UTF-8 JSON across previews, sources and all messages", async () => {
    const io = memoryIO();
    const repository = new RequestSnapshotRepository(io);
    const huge = snapshot("huge", {
      messages: [
        {
          role: "user",
          wireHash: "wire",
          sourceKeys: [],
          parts: [
            {
              kind: "text",
              contentHash: "hash",
              sourceKeys: [],
              textState: "full",
              textPreview: "汉".repeat(500000),
            },
          ],
        },
      ],
    });
    expect(boundAttempt(huge).messages[0].parts[0]).toMatchObject({
      textState: "omitted",
    });
    const large = snapshot("summary", {
      sources: Array.from({ length: 20000 }, (_, index) => ({
        sourceKey: String(index),
        occurrence: index,
        contentHash: "x".repeat(64),
        charLength: 0,
      })),
      messages: Array.from({ length: 20000 }, () => ({
        role: "user",
        wireHash: "x".repeat(64),
        sourceKeys: [],
        parts: [],
      })),
    });
    const bounded = boundAttempt(large);
    expect(bounded.captureQuality).toBe("summaryOnly");
    expect(bounded.inputHash).toBe("same");
    expect(snapshotBytes(bounded)).toBeLessThanOrEqual(
      SNAPSHOT_LIMITS.attemptBytes
    );
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        repository.save(
          snapshot(String(index), {
            startedAt: index,
            messages: [
              {
                role: "user",
                wireHash: "wire",
                sourceKeys: [],
                parts: [
                  {
                    kind: "text",
                    contentHash: "hash",
                    sourceKeys: [],
                    textPreview: "汉".repeat(200000),
                  },
                ],
              },
            ],
          }),
          0
        )
      )
    );
    expect(
      new TextEncoder().encode(io.files.get("session")!).byteLength
    ).toBeLessThanOrEqual(SNAPSHOT_LIMITS.sessionBytes);
    expect((await repository.list("session")).length).toBeLessThan(10);
  });
  it("rejects late writes after clear and deletion while permitting new post-clear attempts", async () => {
    const repository = new RequestSnapshotRepository(memoryIO());
    const oldEpoch = await repository.prepare("session");
    await repository.save(snapshot(), oldEpoch);
    await repository.clear("session");
    await repository.save(snapshot("late"), oldEpoch);
    expect(await repository.list("session")).toEqual([]);
    await repository.save(snapshot("new"), repository.epoch("session"));
    expect(await repository.list("session")).toHaveLength(1);
    repository.invalidateDeleted("session");
    await repository.save(snapshot("deleted"), repository.epoch("session"));
    expect(
      (await repository.list("session")).map((attempt) => attempt.attemptId)
    ).toEqual(["new"]);
  });
  it("allows clear to recover unreadable JSON", async () => {
    const io = memoryIO();
    io.files.set("session", "invalid json");
    const repository = new RequestSnapshotRepository(io);
    await repository.clear("session");
    expect(await repository.list("session")).toEqual([]);
  });
});
