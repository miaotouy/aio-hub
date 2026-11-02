import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ElRadioButton, ElRadioGroup } from "element-plus";
import type { WireJsonValue } from "@aiohub/llm-core";
import ChangesAndCacheView from "../ChangesAndCacheView.vue";
import { projectSnapshot } from "../../../services/requestSnapshotProjection";
import type { ChatRequestAttemptSnapshot } from "../../../types/requestSnapshot";
import type { ChatSessionDetail } from "../../../types/session";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../../../services/requestSnapshots", async () => {
  const { reactive, ref } = await import("vue");
  return {
    requestSnapshots: { list },
    loadSnapshotSettings: vi.fn(),
    saveSnapshotSettings: vi.fn(),
    snapshotSettings: reactive({ enabled: true, saveTextPreview: true }),
    snapshotStorageError: ref(""),
    snapshotRevision: ref(0),
    snapshotDirectory: vi.fn(async () => "/snapshots"),
  };
});
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn() },
}));

// Verify rendered cache states and selected text, independent of the storage backend.
const slot = { template: "<div><slot /></div>" };
const card = {
  template:
    "<section><header><slot name='header' /></header><slot /></section>",
};
const mounted: ReturnType<typeof mount>[] = [];
const sessionDetail = {
  id: "session",
  nodes: {
    "before-assistant": { id: "before-assistant", parentId: null },
    "current-user": { id: "current-user", parentId: "before-assistant" },
  },
} as unknown as ChatSessionDetail;

async function snapshot(
  id: string,
  body: WireJsonValue,
  preview = true
): Promise<ChatRequestAttemptSnapshot> {
  return {
    attemptId: id,
    requestId: id,
    attemptIndex: 1,
    sessionId: "session",
    assistantNodeIds: [`${id}-assistant`],
    triggerNodeId: id === "after" ? "current-user" : undefined,
    startedAt: id === "after" ? 2 : 1,
    status: "completed",
    route: {
      logicalProfileId: "p",
      logicalModelId: "m",
      actualProfileId: "p",
      actualModelId: "m",
      providerType: "anthropic",
    },
    sources: [],
    providerUsageStatus: "missing",
    ...(await projectSnapshot(
      {
        method: "POST",
        url: "https://example.test",
        headers: {},
        body: { kind: "json", value: body },
        streaming: false,
      },
      preview
    )),
  };
}

async function render(
  before: WireJsonValue,
  after: WireJsonValue,
  preview = true
) {
  return renderSnapshots([
    await snapshot("before", before, preview),
    await snapshot("after", after, preview),
  ]);
}

async function renderSnapshots(records: ChatRequestAttemptSnapshot[]) {
  list.mockResolvedValue(records);
  const wrapper = mount(ChangesAndCacheView, {
    props: { sessionDetail, nodeId: "after-assistant", isActive: true },
    global: {
      components: { ElRadioButton, ElRadioGroup },
      stubs: {
        InfoCard: card,
        ElSelect: true,
        ElOption: true,
        ElPopover: true,
        ElSwitch: true,
        ElButton: slot,
        ElIcon: slot,
        ElTag: slot,
        ElAlert: true,
      },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));

const messages = [{ role: "user", content: "existing message" }];
const delta = { role: "assistant", content: "added answer" };
const region = '[role="region"][aria-label="请求文本差异"]';

describe("request changes presentation", () => {
  it.each(["replace", "remove"])(
    "marks downstream messages as affected after a top-level system %s",
    async (change) => {
      const wrapper = await render(
        { system: "old instructions", messages },
        {
          ...(change === "replace" ? { system: "new instructions" } : {}),
          messages,
        }
      );
      expect(
        wrapper
          .get('button[aria-label="顶层指令 · SYS · 变化断裂点"]')
          .attributes("aria-pressed")
      ).toBe("true");
      expect(
        wrapper
          .get('button[aria-label="#1 · USER · 受牵连"]')
          .attributes("aria-pressed")
      ).toBe("false");
      expect(wrapper.get(region).text()).toContain("old instructions");
    }
  );

  it.each(["append-message", "remove-message", "append-part", "remove-part"])(
    "renders a one-sided %s with saved text",
    async (change) => {
      const short = change.endsWith("part")
        ? {
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: "existing message" }],
              },
            ],
          }
        : { messages };
      const long = change.endsWith("part")
        ? {
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "existing message" },
                  { type: "text", text: delta.content },
                ],
              },
            ],
          }
        : { messages: [...messages, delta] };
      const removed = change.startsWith("remove");
      const wrapper = await render(
        removed ? long : short,
        removed ? short : long
      );
      expect(wrapper.get(region).text()).toContain(delta.content);
      if (removed && change.endsWith("message")) {
        expect(
          wrapper
            .get('button[aria-label="#2 · AI · 已移除"]')
            .attributes("aria-pressed")
        ).toBe("true");
      }
      await wrapper.get('input[value="split"]').setValue();
      expect(
        wrapper.findAll(`${region} pre`).map((node) => node.text())
      ).toEqual(removed ? [delta.content, ""] : ["", delta.content]);
    }
  );

  it("updates inline and split previews when selecting a different message", async () => {
    const wrapper = await render(
      {
        messages: [
          { role: "user", content: "old first" },
          { role: "assistant", content: "old second" },
        ],
      },
      {
        messages: [
          { role: "user", content: "new first" },
          { role: "assistant", content: "new second" },
        ],
      }
    );
    expect(wrapper.get(region).text()).toContain("old first");
    const second = wrapper.get('button[aria-label="#2 · AI · 受牵连"]');
    await second.trigger("click");
    expect(second.attributes("aria-pressed")).toBe("true");
    expect(wrapper.get(region).text()).toContain("old second");
    expect(wrapper.get(region).text()).toContain("new second");
    await wrapper.get('input[value="split"]').setValue();
    expect(wrapper.findAll(`${region} pre`).map((node) => node.text())).toEqual(
      ["old second", "new second"]
    );
  });
});

describe("limited snapshot details", () => {
  it.each(["before", "after"])(
    "keeps the graph unavailable when %s retains only a summary",
    async (side) => {
      const body = { system: "instructions", messages };
      const records = [
        await snapshot("before", body),
        await snapshot("after", body),
      ];
      const summary = records.find((record) => record.attemptId === side)!;
      summary.captureQuality = "summaryOnly";
      summary.messages = [];
      delete summary.topLevelSystem;

      const wrapper = await renderSnapshots(records);
      expect(wrapper.get(".prefix-card").findAll("button")).toHaveLength(0);
      expect(wrapper.get('.prefix-card [role="status"]').isVisible()).toBe(
        true
      );
      expect(wrapper.find(region).exists()).toBe(false);
    }
  );

  it.each(["truncated", "redacted"])(
    "preserves matching %s previews and mode switching despite different original content",
    async (state) => {
      const prefix = "x ".repeat(32769);
      const before =
        state === "truncated" ? prefix + "before" : "name: old@example.com";
      const after =
        state === "truncated" ? prefix + "after" : "name: new@example.com";
      const records = [
        await snapshot("before", {
          messages: [{ role: "user", content: before }],
        }),
        await snapshot("after", {
          messages: [{ role: "user", content: after }],
        }),
      ];
      const left = records[0].messages[0].parts[0];
      const right = records[1].messages[0].parts[0];
      expect(left.contentHash).not.toBe(right.contentHash);
      expect(left.textState).toBe(state);
      expect(left.textPreview).toBe(right.textPreview);

      const wrapper = await renderSnapshots(records);
      expect(wrapper.get('.diff-card [role="status"]').isVisible()).toBe(true);
      expect(wrapper.get(region).text()).toContain(left.textPreview!.trim());
      await wrapper.get('input[value="split"]').setValue();
      expect(
        wrapper.findAll(`${region} pre`).map((node) => node.text())
      ).toEqual([left.textPreview!.trim(), right.textPreview!.trim()]);
      await wrapper.get('input[value="inline"]').setValue();
      expect(wrapper.get(region).text()).toContain(left.textPreview!.trim());
    }
  );
});
