// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref, h, KeepAlive } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import SymlinkMover from "./SymlinkMover.vue";
const { logic } = vi.hoisted(() => ({
  logic: {
    startProgressListener: vi.fn(),
    stopProgressListener: vi.fn(),
    dispose: vi.fn(),
    getLatestLog: vi.fn(),
    getAllLogs: vi.fn(),
    validateFiles: vi.fn(),
    parsePathsToFileItems: vi.fn(),
    mergeFileItems: vi.fn(),
    removeFileByIndex: vi.fn(),
    cancelOperation: vi.fn(),
    preflight: vi.fn(),
    moveAndLink: vi.fn(),
    createLinksOnly: vi.fn(),
  },
}));
vi.mock("./composables/useSymlinkMover", () => ({
  useSymlinkMoverLogic: () => logic,
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));
vi.mock("@/platform/native/dialog", () => ({ open: vi.fn() }));
const Files = defineComponent({
  name: "FileListPanel",
  props: ["files", "disabled"],
  emits: ["add-files", "update:files", "remove-file"],
  template: "<div />",
});
const Settings = defineComponent({
  name: "SettingsPanel",
  props: ["isProcessing", "targetDirectory"],
  emits: ["execute", "cancel", "update:targetDirectory", "update:linkType"],
  template: "<div />",
});
let wrapper: ReturnType<typeof mount>;
const report = (paths = ["C:/a.txt"]) => ({
  canExecute: true,
  items: paths.map((sourcePath) => ({
    sourcePath,
    targetPath: "C:/target/" + sourcePath.split("/").pop(),
    blockingIssues: [],
  })),
  blockingIssues: [],
});
const operationLog = () => ({
  timestamp: 1,
  operationType: "move",
  linkType: "symlink",
  sourceCount: 2,
  successCount: 1,
  errorCount: 1,
  errors: ["b failed"],
  warnings: [],
  durationMs: 1,
  targetDirectory: "C:/target",
  sourcePaths: ["C:/a.txt", "C:/b.txt"],
  totalSize: 2,
  processedFiles: ["C:\\a.txt"],
});
beforeEach(async () => {
  vi.resetAllMocks();
  logic.startProgressListener.mockResolvedValue(true);
  logic.dispose.mockResolvedValue(undefined);
  logic.getLatestLog.mockResolvedValue(null);
  logic.getAllLogs.mockResolvedValue([]);
  logic.validateFiles.mockImplementation(async (files) => files);
  logic.parsePathsToFileItems.mockImplementation((paths) =>
    paths.map((path: string) => ({
      path,
      name: path.split("/").pop(),
      status: "pending",
    }))
  );
  logic.mergeFileItems.mockImplementation((a, b) => [...a, ...b]);
  logic.removeFileByIndex.mockImplementation((files, index) =>
    files.filter((_: unknown, n: number) => n !== index)
  );
  logic.cancelOperation.mockResolvedValue(true);
  logic.preflight.mockResolvedValue(report());
  logic.moveAndLink.mockResolvedValue("done");
  wrapper = mount(SymlinkMover, {
    global: {
      stubs: { FileListPanel: Files, SettingsPanel: Settings, LogDialog: true },
    },
  });
  await flushPromises();
});
afterEach(() => wrapper.unmount());
async function configure(paths = ["C:/a.txt"]) {
  wrapper.getComponent(Files).vm.$emit("add-files", paths);
  wrapper
    .getComponent(Settings)
    .vm.$emit("update:targetDirectory", "C:/target");
  await flushPromises();
}
describe("symlink operation orchestration", () => {
  it("holds one preflight and submits the exact options the user started with", async () => {
    await configure();
    let finish!: (value: unknown) => void;
    logic.preflight.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const settings = wrapper.getComponent(Settings);
    settings.vm.$emit("execute");
    settings.vm.$emit("execute");
    await flushPromises();
    expect(logic.preflight).toHaveBeenCalledOnce();
    expect(settings.props("isProcessing")).toBe(true);
    settings.vm.$emit("update:targetDirectory", "C:/changed");
    settings.vm.$emit("update:linkType", "link");
    finish(report());
    await flushPromises();
    expect(logic.moveAndLink).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDir: "C:/target",
        linkType: "symlink",
        sourcePaths: ["C:/a.txt"],
      })
    );
    expect(settings.props("isProcessing")).toBe(false);
  });
  it("cancels during preflight without starting a filesystem mutation", async () => {
    await configure();
    let finish!: (value: unknown) => void;
    logic.preflight.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const settings = wrapper.getComponent(Settings);
    settings.vm.$emit("execute");
    await flushPromises();
    settings.vm.$emit("cancel");
    await flushPromises();
    finish(report());
    await flushPromises();
    expect(logic.moveAndLink).not.toHaveBeenCalled();
    expect(logic.createLinksOnly).not.toHaveBeenCalled();
    expect(settings.props("isProcessing")).toBe(false);
  });
  it("retains only confirmed successes after a partial filesystem failure", async () => {
    await configure(["C:/a.txt", "C:/b.txt"]);
    logic.preflight.mockResolvedValueOnce(report(["C:/a.txt", "C:/b.txt"]));
    logic.getLatestLog.mockResolvedValueOnce(operationLog());
    wrapper.getComponent(Settings).vm.$emit("execute");
    await flushPromises();
    expect(
      wrapper
        .getComponent(Files)
        .props("files")
        .map((file: any) => file.status)
    ).toEqual(["success", "error"]);
  });
  it("keeps cleared files removed when their old validation finishes later", async () => {
    let finish!: (value: unknown) => void;
    logic.validateFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await configure();
    wrapper.getComponent(Files).vm.$emit("update:files", []);
    await flushPromises();
    finish([{ path: "C:/a.txt", name: "a.txt", status: "pending" }]);
    await flushPromises();
    expect(wrapper.getComponent(Files).props("files")).toEqual([]);
  });
  it("cancels cached-page work on deactivation and resumes listening on return", async () => {
    wrapper.unmount();
    vi.clearAllMocks();
    const shown = ref(true);
    const Host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (shown.value ? h(SymlinkMover) : null),
        }),
    });
    wrapper = mount(Host, {
      global: {
        stubs: {
          FileListPanel: Files,
          SettingsPanel: Settings,
          LogDialog: true,
        },
      },
    });
    await flushPromises();
    await configure();
    let finish!: (value: string) => void;
    logic.moveAndLink.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    wrapper.getComponent(Settings).vm.$emit("execute");
    await flushPromises();
    shown.value = false;
    await flushPromises();
    expect(logic.cancelOperation).toHaveBeenCalledOnce();
    expect(logic.stopProgressListener).toHaveBeenCalledOnce();
    expect(logic.dispose).not.toHaveBeenCalled();
    shown.value = true;
    await flushPromises();
    expect(logic.startProgressListener).toHaveBeenCalledTimes(2);
    finish("操作已被用户取消");
    await flushPromises();
    expect(wrapper.getComponent(Settings).props("isProcessing")).toBe(false);
  });
});
