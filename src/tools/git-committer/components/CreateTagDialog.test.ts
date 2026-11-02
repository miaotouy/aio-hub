import { flushPromises, mount } from "@vue/test-utils";
import ElementPlus, { ElCheckbox, ElInput, ElSelect } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateTagDialog from "./CreateTagDialog.vue";
import { createTag, pushTag } from "../composables/useGitOverview";

vi.mock("../composables/useGitOverview", () => ({
  createTag: vi.fn(),
  pushTag: vi.fn(),
}));
vi.mock("../composables/useGitCommitterErrorHandler", () => ({
  errorHandler: { wrapAsync: (action: () => Promise<unknown>) => action() },
}));

const mounted: ReturnType<typeof mount>[] = [];
async function openDialog(waitForData = true) {
  const wrapper = mount(CreateTagDialog, {
    props: {
      modelValue: true,
      repoPath: "E:/repos/demo",
      targetHash: "a".repeat(40),
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        ElSelect: {
          props: ["modelValue", "disabled"],
          emits: ["update:modelValue"],
          template: `<select :value="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`,
        },
        ElOption: {
          props: ["label", "value"],
          template: '<option :value="value">{{ label }}</option>',
        },
      },
    },
  });
  mounted.push(wrapper);
  if (waitForData) await flushPromises();
  return wrapper;
}

describe("CreateTagDialog", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue({
      remotes: [{ name: "upstream" }, { name: "origin" }],
      tags: [],
    });
    vi.mocked(createTag).mockReset().mockResolvedValue(true);
    vi.mocked(pushTag).mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  });

  it("prefills the next version from existing tags", async () => {
    vi.mocked(invoke).mockResolvedValue({
      remotes: [],
      tags: [{ name: "v0.7.0-alpha.6" }],
    });
    const wrapper = await openDialog();
    expect(wrapper.findAllComponents(ElInput)[0].props("modelValue")).toBe(
      "v0.7.0-alpha.7"
    );
  });

  it("preserves a manually edited name when tags finish loading", async () => {
    let resolve!: (data: unknown) => void;
    vi.mocked(invoke).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const wrapper = await openDialog(false);
    await wrapper.findAllComponents(ElInput)[0].setValue("release-custom");
    resolve({ remotes: [], tags: [{ name: "v1.0.0" }] });
    await flushPromises();
    expect(wrapper.findAllComponents(ElInput)[0].props("modelValue")).toBe(
      "release-custom"
    );
  });

  it.each(["annotated", "lightweight"])(
    "submits explicit %s type with the selected commit",
    async (type) => {
      const wrapper = await openDialog();
      await wrapper.findAllComponents(ElInput)[0].setValue("v1.0.0");
      await wrapper.getComponent(ElSelect).setValue(type);
      if (type === "annotated")
        await wrapper.findAllComponents(ElInput)[1].setValue("Release notes");
      await wrapper.get(".el-button--primary").trigger("click");
      await flushPromises();
      expect(createTag).toHaveBeenCalledWith(
        "E:/repos/demo",
        "v1.0.0",
        "a".repeat(40),
        type === "annotated" ? "Release notes" : undefined,
        type === "annotated"
      );
      expect(pushTag).not.toHaveBeenCalled();
      expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
    }
  );

  it("preserves annotated type when the optional message is empty", async () => {
    const wrapper = await openDialog();
    await wrapper.findAllComponents(ElInput)[0].setValue("v1.0.0");
    await wrapper.get(".el-button--primary").trigger("click");
    await flushPromises();
    expect(createTag).toHaveBeenCalledWith(
      "E:/repos/demo",
      "v1.0.0",
      "a".repeat(40),
      "",
      true
    );
  });

  it("retries only the failed push and retains the opening repository", async () => {
    vi.mocked(pushTag).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const wrapper = await openDialog();
    await wrapper.findAllComponents(ElInput)[0].setValue("v1.0.0");
    await wrapper.getComponent(ElCheckbox).setValue(true);
    await wrapper.setProps({ repoPath: "E:/repos/other" });
    await wrapper.get(".el-button--primary").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.findAllComponents(ElInput)[0].props("disabled")).toBe(true);
    await wrapper.findAllComponents(ElSelect)[1].setValue("upstream");
    await wrapper.get(".el-button--primary").trigger("click");
    await flushPromises();
    expect(createTag).toHaveBeenCalledTimes(1);
    expect(pushTag).toHaveBeenNthCalledWith(
      1,
      "E:/repos/demo",
      "v1.0.0",
      "origin"
    );
    expect(pushTag).toHaveBeenNthCalledWith(
      2,
      "E:/repos/demo",
      "v1.0.0",
      "upstream"
    );
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("blocks invalid Git tag names before submission", async () => {
    const wrapper = await openDialog();
    await wrapper.findAllComponents(ElInput)[0].setValue("release..candidate");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(createTag).not.toHaveBeenCalled();
    expect(
      wrapper.get(".el-button--primary").attributes("disabled")
    ).toBeDefined();
  });
});
