import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentUpgradeDialog from "../AgentUpgradeDialog.vue";

// Protect actual file-import/confirm behavior, including target identity and save failures.
const mocks = vi.hoisted(() => ({
  preflight: vi.fn(),
  updateAgent: vi.fn(),
  loadAgentDetails: vi.fn(),
  invoke: vi.fn(),
  open: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../../../stores/agentStore", () => ({
  useAgentStore: () => ({
    preflightImportAgents: mocks.preflight,
    updateAgent: mocks.updateAgent,
    loadAgentDetails: mocks.loadAgentDetails,
  }),
}));
vi.mock("@/tools/st-worldbook-manager/stores/worldbookStore", () => ({
  useWorldbookStore: () => ({ worldbooks: [] }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: async () => new Uint8Array([1]),
  readDir: vi.fn(),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: mocks.success },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: mocks.error }),
}));
vi.mock("@/tools/st-worldbook-manager/services/worldbookImportService", () => ({
  normalizeWorldbook: (value: unknown) => value,
}));

const stubs = {
  BaseDialog: {
    template: '<div><slot /><footer><slot name="footer" /></footer></div>',
  },
  DropZone: { template: '<div><slot :dragging="false" /></div>' },
  "el-input": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<textarea :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
  },
  "el-button": {
    props: ["disabled"],
    template: '<button :disabled="disabled"><slot /></button>',
  },
  "el-radio-group": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<select aria-label="strategy" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`,
  },
  "el-radio-button": {
    props: ["value"],
    template: '<option :value="value">{{ value }}</option>',
  },
  "el-icon": true,
  "el-tag": true,
};
const current = {
  id: "target",
  name: "Current",
  icon: "current-avatar.png",
  profileId: "local-profile",
  modelId: "local-model",
  parameters: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockResolvedValue(undefined);
  mocks.open.mockResolvedValue("C:/package.zip");
  mocks.loadAgentDetails.mockResolvedValue(current);
  mocks.preflight.mockResolvedValue({
    agents: [
      {
        id: "source",
        name: "Incoming",
        icon: "assets/avatar.png",
        parameters: {},
        assets: [
          {
            id: "picture",
            path: "assets/images/picture.png",
            thumbnailPath: "assets/thumbs/picture.png",
          },
        ],
      },
    ],
    assets: {
      source: {
        "assets/avatar.png": new Uint8Array([1]).buffer,
        "assets/images/picture.png": new Uint8Array([2]).buffer,
        "assets/thumbs/picture.png": new Uint8Array([3]).buffer,
      },
    },
  });
});

async function openPackage(strategy = "merge") {
  const wrapper = mount(AgentUpgradeDialog, {
    props: { visible: true, agent: current as any },
    global: { stubs, directives: { loading: {} } },
  });
  await wrapper.find('select[aria-label="strategy"]').setValue(strategy);
  await wrapper
    .findAll("button")
    .find((button) => button.text() === "选择文件")!
    .trigger("click");
  await flushPromises();
  return wrapper;
}

describe("agent package upgrades", () => {
  it.each(["merge", "overwrite"])(
    "restores asset directories before confirming %s",
    async (strategy) => {
      const wrapper = await openPackage(strategy);
      try {
        expect(wrapper.find(".error-msg").exists()).toBe(false);
        await wrapper.find("footer button:last-child").trigger("click");
        await flushPromises();
        const update = mocks.updateAgent.mock.lastCall!;
        expect(update[0]).toBe("target");
        expect(update[1].assets[0]).toMatchObject({
          path: "assets/images/picture.png",
          thumbnailPath: "assets/thumbs/picture.png",
        });
        expect(mocks.invoke).toHaveBeenCalledWith(
          "save_uploaded_file",
          expect.objectContaining({
            subdirectory: "agent-manager/agents/target/assets/images",
            filename: "picture.png",
          })
        );
        expect(mocks.invoke).toHaveBeenCalledWith(
          "save_uploaded_file",
          expect.objectContaining({
            subdirectory: "agent-manager/agents/target/assets/thumbs",
            filename: "picture.png",
          })
        );
        if (strategy === "overwrite") expect(update[1].icon).toBe("avatar.png");
        else expect(update[1].icon).toBeUndefined();
        expect(wrapper.emitted("upgraded")).toHaveLength(1);
      } finally {
        wrapper.unmount();
      }
    }
  );

  it("keeps the dialog open and leaves configuration intact if asset saving fails", async () => {
    const wrapper = await openPackage();
    try {
      mocks.invoke.mockRejectedValue(new Error("disk full"));
      await wrapper.find("footer button:last-child").trigger("click");
      await flushPromises();
      expect(mocks.updateAgent).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(wrapper.emitted("upgraded")).toBeUndefined();
      expect(mocks.error).toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });
});
