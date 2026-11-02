// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus, { ElInputNumber } from "element-plus";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileDropOptions } from "@/composables/useFileDrop";

const mocks = vi.hoisted(() => ({
  readDir: vi.fn(),
  invoke: vi.fn(),
  open: vi.fn(),
  warning: vi.fn(),
  drop: undefined as FileDropOptions | undefined,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/path", () => ({
  dirname: async (path: string) => path.slice(0, path.lastIndexOf("/")),
  basename: async (path: string) => path.slice(path.lastIndexOf("/") + 1),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: mocks.readDir,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.open,
  save: vi.fn(),
}));
vi.mock("@/composables/useFileDrop", () => ({
  useFileDrop: (options: FileDropOptions) => {
    mocks.drop = options;
    return { isDraggingOver: ref(false) };
  },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { warning: mocks.warning },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: (callback: () => unknown) => callback(),
  }),
}));
vi.mock("../ffmpegStore", () => ({
  useFFmpegStore: () => ({ tasks: [], config: { defaultWorkDir: "" } }),
}));
vi.mock("../composables/useFFmpegCore", () => ({
  useFFmpegCore: () => ({
    activeFfmpegPath: ref("ffmpeg"),
    getMetadata: vi.fn(),
    startProcess: vi.fn(),
    killProcess: vi.fn(),
  }),
}));
import FFmpegImageSequence from "../components/FFmpegImageSequence.vue";

function setFrames(names: string[]) {
  mocks.readDir.mockResolvedValue(
    names.map((name) => ({ name, isFile: true }))
  );
}
function mountWorkspace() {
  return mount(FFmpegImageSequence, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        InfoCard: {
          template: '<section><slot name="headerExtra" /><slot /></section>',
        },
        VideoPlayer: true,
        FFmpegConsole: true,
      },
    },
  });
}
let workspace: ReturnType<typeof mountWorkspace>;
async function drop(path: string, isDirectory: boolean) {
  mocks.invoke.mockResolvedValue(isDirectory);
  await mocks.drop!.onDrop!([path]);
  await flushPromises();
}
async function refresh() {
  await workspace
    .findAll("button")
    .find((button) => button.text() === "刷新")!
    .trigger("click");
  await flushPromises();
}

// Protect source import and refresh behavior at the workspace boundary, with
// filesystem/dialog/drop delivery stubbed; assertions observe editable controls
// and the command the user can copy, rather than component-local state.
describe("image sequence source updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace = mountWorkspace();
  });
  afterEach(() => workspace.unmount());

  it.each([true, false])(
    "imports a dropped source with directory=%s",
    async (directory) => {
      setFrames(["a_0001.png", "b_0001.png", "b_0002.png"]);
      await drop(directory ? "D:/renders" : "D:/renders/b_0002.png", directory);
      expect(mocks.readDir).toHaveBeenCalledWith("D:/renders");
      expect(workspace.get(".command-preview").text()).toContain(
        directory ? "a_%04d.png" : "b_%04d.png"
      );
      expect(workspace.get("img").attributes("src")).toBe(
        directory ? "D:/renders/a_0001.png" : "D:/renders/b_0001.png"
      );
    }
  );

  it("extends the default range on refresh and clears stale sources when all frames are removed", async () => {
    setFrames(["a_0001.png", "a_0002.png"]);
    await drop("D:/renders", true);
    setFrames(["a_0001.png", "a_0002.png", "a_0003.png"]);
    await refresh();
    expect(
      workspace.findAllComponents(ElInputNumber)[1].props("modelValue")
    ).toBe(3);
    setFrames([]);
    await refresh();
    expect(workspace.find("img").exists()).toBe(false);
    expect(
      workspace
        .findAll("button")
        .find((button) => button.text() === "开始合成")!
        .attributes("disabled")
    ).toBeDefined();
    expect(mocks.warning).toHaveBeenCalled();
  });

  it("retains the selected sequence, edited range and custom output on refresh", async () => {
    setFrames([
      "a_0001.png",
      "b_0001.png",
      "b_0002.png",
      "b_0003.png",
      "b_0004.png",
    ]);
    await drop("D:/renders/b_0002.png", false);
    const numbers = workspace.findAllComponents(ElInputNumber);
    await numbers[0].get("input").setValue("2");
    await numbers[0].get("input").trigger("change");
    await numbers[1].get("input").setValue("3");
    await numbers[1].get("input").trigger("change");
    const output = workspace.get(
      'input[placeholder="选择保存位置（MP4 / MOV / MKV）"]'
    );
    await output.setValue("D:/output/custom.mp4");
    setFrames([
      "a_0001.png",
      "b_0001.png",
      "b_0002.png",
      "b_0003.png",
      "b_0004.png",
      "b_0005.png",
    ]);
    await refresh();
    expect(numbers[0].props("modelValue")).toBe(2);
    expect(numbers[1].props("modelValue")).toBe(3);
    expect((output.element as HTMLInputElement).value).toBe(
      "D:/output/custom.mp4"
    );
    expect(workspace.get(".command-preview").text()).toContain("b_%04d.png");
    expect(workspace.get("img").attributes("src")).toBe(
      "D:/renders/b_0002.png"
    );
  });
});
