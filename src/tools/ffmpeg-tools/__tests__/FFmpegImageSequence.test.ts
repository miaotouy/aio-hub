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
  getMetadata: vi.fn(),
  drops: [] as FileDropOptions[],
}));
vi.mock("@/platform/native/core", () => ({
  invoke: mocks.invoke,
  convertFileSrc: (path: string) => path,
}));
vi.mock("@/platform/native/path", () => ({
  dirname: async (path: string) => path.slice(0, path.lastIndexOf("/")),
  basename: async (path: string) => path.slice(path.lastIndexOf("/") + 1),
}));
vi.mock("@/platform/native/fs", () => ({
  readDir: mocks.readDir,
}));
vi.mock("@/platform/native/dialog", () => ({
  open: mocks.open,
  save: vi.fn(),
}));
vi.mock("@/composables/useFileDrop", () => ({
  useFileDrop: (options: FileDropOptions) => {
    mocks.drops.push(options);
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
    getMetadata: mocks.getMetadata,
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
  await dropZone(".sequence-source").onDrop!([path]);
  await flushPromises();
}
function dropZone(selector: string) {
  return mocks.drops.find((options) =>
    typeof options.element !== "string" &&
    options.element?.value?.matches(selector)
  )!;
}
function audioInputValue() {
  return (workspace.get(".audio-input input").element as HTMLInputElement).value;
}
async function dropAudio(path: string) {
  await dropZone(".audio-input").onDrop!([path]);
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
    mocks.drops = [];
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

// Audio imports must reach the generated command only after metadata validation.
describe("image sequence audio imports", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.drops = [];
    workspace = mountWorkspace();
    setFrames(["a_0001.png", "a_0002.png"]);
    await drop("D:/renders", true);
  });
  afterEach(() => workspace.unmount());

  it.each(["drop", "dialog"])(
    "uses a validated audio track from %s in the synthesis command",
    async (entry) => {
      const path = "D:/audio/background.mov";
      mocks.getMetadata.mockResolvedValue({ hasAudio: true });
      if (entry === "drop") {
        await dropAudio(path);
        expect(mocks.open).not.toHaveBeenCalled();
      } else {
        mocks.open.mockResolvedValue(path);
        await workspace.get(".audio-input button").trigger("click");
        await flushPromises();
      }
      expect(mocks.getMetadata).toHaveBeenCalledWith(path);
      expect(audioInputValue()).toBe(path);
      expect(workspace.get(".command-preview").text()).toContain(path);
      expect(workspace.get(".command-preview").text()).toContain("1:a:0");
    }
  );

  it("retains the current track when the dropped file has no usable audio", async () => {
    mocks.getMetadata.mockResolvedValue({ hasAudio: true });
    await dropAudio("D:/audio/background.wav");
    mocks.getMetadata.mockResolvedValue({ hasAudio: false });
    await dropAudio("D:/audio/silent.mp4");
    expect(mocks.warning).toHaveBeenCalledOnce();
    expect(audioInputValue()).toBe(
      "D:/audio/background.wav"
    );
    expect(workspace.get(".command-preview").text()).toContain(
      "D:/audio/background.wav"
    );
  });

  it("keeps the current track and ignores another drop while audio is being checked", async () => {
    mocks.getMetadata.mockResolvedValue({ hasAudio: true });
    await dropAudio("D:/audio/background.wav");
    let finish!: (value: { hasAudio: boolean }) => void;
    mocks.getMetadata.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = dropAudio("D:/audio/new.wav");
    await flushPromises();
    expect(audioInputValue()).toBe(
      "D:/audio/background.wav"
    );
    await dropAudio("D:/audio/other.wav");
    expect(mocks.getMetadata).toHaveBeenCalledTimes(2);
    finish({ hasAudio: true });
    await pending;
    expect(audioInputValue()).toBe(
      "D:/audio/new.wav"
    );
  });
});
