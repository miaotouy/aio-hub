// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: {
    saveAgentAsset: vi.fn(),
    readAgentAsset: vi.fn(),
    deleteAgentAsset: vi.fn(),
  },
  dialog: vi.fn(),
  message: vi.fn(),
}));

vi.mock("../../composables/useAgentStorage", () => ({
  useAgentStorage: () => mocks.storage,
}));

vi.mock("@/utils/feedback", () => ({
  customDialog: (...args: unknown[]) => mocks.dialog(...args),
  customMessage: (...args: unknown[]) => mocks.message(...args),
}));

vi.mock("@/i18n", () => {
  const useScopedT = (prefix: string) => (key: string) => `${prefix}.${key}`;
  return {
    useScopedT,
    useI18n: () => ({ t: (key: string) => key.split(".").pop() ?? key, useScopedT }),
  };
});

// jsdom 没有 createObjectURL
if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock"),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
}

import { flushPromises, mount } from "@vue/test-utils";
import type { AgentAsset, AgentAssetGroup } from "../../types/agent";
import AgentAssetsSection from "../AgentAssetsSection.vue";

function asset(overrides: Partial<AgentAsset> = {}): AgentAsset {
  return {
    id: "pic",
    filename: "pic.png",
    path: "assets/pic.png",
    type: "image",
    mimeType: "image/png",
    size: 10,
    ...overrides,
  };
}

function mountSection(
  options: {
    assets?: AgentAsset[];
    groups?: AgentAssetGroup[];
    presetMessages?: Array<{ presetAttachments?: Array<{ assetId: string }> }>;
    greetings?: Array<{ attachments?: unknown[] }>;
  } = {}
) {
  return mount(AgentAssetsSection, {
    props: {
      agentId: "agent-1",
      assets: options.assets ?? [],
      groups: options.groups ?? [],
      presetMessages: options.presetMessages as never,
      greetings: options.greetings as never,
    },
  });
}

describe("AgentAssetsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dialog.mockResolvedValue(true);
  });

  it("添加文件即落盘并回写 AgentAsset 记录", async () => {
    mocks.storage.saveAgentAsset.mockResolvedValue("assets/hero.png");
    const wrapper = mountSection();
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement;

    const file = new File([new Uint8Array([1, 2, 3])], "hero.png", {
      type: "image/png",
    });
    Object.defineProperty(input, "files", { value: [file] });
    await wrapper.find('input[type="file"]').trigger("change");
    await flushPromises();

    expect(mocks.storage.saveAgentAsset).toHaveBeenCalledWith(
      "agent-1",
      "assets/hero.png",
      expect.any(Uint8Array)
    );
    const emitted = wrapper.emitted("update:assets");
    expect(emitted).toHaveLength(1);
    expect(emitted![0][0]).toEqual([
      {
        id: "hero",
        filename: "hero.png",
        path: "assets/hero.png",
        type: "image",
        mimeType: "image/png",
        size: 3,
      },
    ]);
  });

  it("重名资产 Handle 自动追加序号", async () => {
    mocks.storage.saveAgentAsset.mockResolvedValue("assets/pic (1).png");
    const wrapper = mountSection({ assets: [asset()] });
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement;

    const file = new File([new Uint8Array([1])], "pic.png", {
      type: "image/png",
    });
    Object.defineProperty(input, "files", { value: [file] });
    await wrapper.find('input[type="file"]').trigger("change");
    await flushPromises();

    const emitted = wrapper.emitted("update:assets")!;
    expect((emitted[0][0] as AgentAsset[])[1].id).toBe("pic-2");
  });

  it("删除资产时级联确认并通知页面清理引用", async () => {
    const target = asset({ id: "pic", path: "assets/pic.png" });
    const wrapper = mountSection({
      assets: [target],
      presetMessages: [{ presetAttachments: [{ assetId: "pic" }] }],
      greetings: [{ attachments: [{ assetId: "pic" }, { assetId: "other" }] }],
    });

    await wrapper
      .find('[data-testid="agent-asset-delete-pic"]')
      .trigger("click");
    await flushPromises();

    // 确认弹窗带引用摘要
    expect(mocks.dialog).toHaveBeenCalledTimes(1);
    expect(mocks.dialog.mock.calls[0][0].message).toContain("×1");
    expect(mocks.storage.deleteAgentAsset).toHaveBeenCalledWith(
      "agent-1",
      "assets/pic.png"
    );
    expect(wrapper.emitted("update:assets")![0][0]).toEqual([]);
    expect(wrapper.emitted("asset-removed")![0][0]).toMatchObject({
      id: "pic",
    });
  });

  it("引用摘要为空时使用通用确认文案", async () => {
    const wrapper = mountSection({ assets: [asset()] });
    await wrapper
      .find('[data-testid="agent-asset-delete-pic"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.dialog.mock.calls[0][0].message).not.toContain("×");
  });

  it("用户取消删除时不移除资产", async () => {
    mocks.dialog.mockResolvedValue(false);
    const wrapper = mountSection({ assets: [asset()] });
    await wrapper
      .find('[data-testid="agent-asset-delete-pic"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.storage.deleteAgentAsset).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:assets")).toBeUndefined();
  });

  it("编辑资产描述与分组后回写", async () => {
    const wrapper = mountSection({
      assets: [asset({ id: "bgm", type: "audio" })],
      groups: [{ id: "bgm-group", displayName: "音乐" }],
    });

    await wrapper
      .find('[data-testid="agent-asset-bgm"] .icon-action')
      .trigger("click");
    // 编辑面板 Teleport 到 body
    const sheet = document.querySelector(
      '[data-testid="agent-asset-edit"]'
    ) as HTMLElement;
    expect(sheet).toBeTruthy();
    const descriptionInput = sheet.querySelector("input") as HTMLInputElement;
    descriptionInput.value = "背景音乐";
    descriptionInput.dispatchEvent(new Event("input"));
    const select = sheet.querySelector("select") as HTMLSelectElement;
    select.value = "bgm-group";
    select.dispatchEvent(new Event("change"));
    await flushPromises();
    (sheet.querySelector(
      '[data-testid="agent-asset-edit-confirm"]'
    ) as HTMLElement).click();
    await flushPromises();

    const emitted = wrapper.emitted("update:assets")!;
    expect(emitted[0][0]).toEqual([
      expect.objectContaining({ id: "bgm", group: "bgm-group" }),
    ]);
  });
});
