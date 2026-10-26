import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { KeepAlive, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreviewPanel from "../PreviewPanel.vue";
import type { UploadedImage } from "../../types";

vi.mock("@composables/useFileDrop", () => ({
  useFileDrop: () => ({ isDraggingOver: false }),
}));
vi.mock("@/composables/useImageViewer", () => ({
  useImageViewer: () => ({ show: vi.fn() }),
}));
vi.mock("@/utils/fileTypeDetector", () => ({ detectFileType: vi.fn() }));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

const props = () => ({
  uploadedImages: [],
  selectedImageId: null,
  cutLinesMap: new Map(),
  imageBlocksMap: new Map(),
  isProcessing: false,
});
const options = {
  attachTo: document.body,
  global: {
    stubs: {
      ElButton: { template: "<button><slot /></button>" },
      ElTooltip: { template: "<div><slot /></div>" },
      ElIcon: true,
      ElTag: true,
    },
  },
};
let wrapper: VueWrapper;

function paste(target: EventTarget = document.body, prevented = false) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  const file = new File(["image"], "clipboard.png", { type: "image/png" });
  Object.defineProperty(event, "clipboardData", {
    value: { items: [{ type: file.type, getAsFile: () => file }] },
  });
  if (prevented) event.preventDefault();
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  // 固定浏览器读取与解码结果，让粘贴副作用在 flushPromises 后完整可见。
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
    this: FileReader
  ) {
    Object.defineProperty(this, "result", {
      value: "data:image/png;base64,aW1hZ2U=",
      configurable: true,
    });
    this.dispatchEvent(new ProgressEvent("load"));
  });
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      private source = "";
      get src() {
        return this.source;
      }
      set src(value: string) {
        this.source = value;
        this.onload?.();
      }
    }
  );
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// 保护图片导入的页面归属和编辑器粘贴契约，直接验证事件与公开上传输出。
describe("OCR image paste", () => {
  it("imports one image while active and releases paste after unmount", async () => {
    wrapper = mount(PreviewPanel, { ...options, props: props() });
    expect(paste().defaultPrevented).toBe(true);
    await vi.waitFor(() => {
      expect(wrapper.emitted("imagesUpload")).toHaveLength(1);
    });
    const images = wrapper.emitted("imagesUpload")![0][0] as UploadedImage[];
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ name: "clipboard.png" });

    wrapper.unmount();
    expect(paste().defaultPrevented).toBe(false);
  });

  it("pauses while cached and imports once after returning to OCR", async () => {
    const active = ref(true);
    wrapper = mount(
      {
        setup: () => () =>
          h(KeepAlive, null, {
            default: () => (active.value ? h(PreviewPanel, props()) : h("div")),
          }),
      },
      options
    );
    const panel = wrapper.getComponent(PreviewPanel);
    active.value = false;
    await nextTick();
    expect(paste().defaultPrevented).toBe(false);
    await flushPromises();
    expect(panel.emitted("imagesUpload")).toBeUndefined();

    active.value = true;
    await nextTick();
    expect(paste().defaultPrevented).toBe(true);
    await vi.waitFor(() =>
      expect(panel.emitted("imagesUpload")).toHaveLength(1)
    );
  });

  it.each([
    "<input>",
    "<textarea></textarea>",
    '<div contenteditable="true"><span>editor</span></div>',
    '<div role="textbox"><span>editor</span></div>',
  ])("preserves paste in %s", async (markup) => {
    wrapper = mount(PreviewPanel, { ...options, props: props() });
    const host = document.createElement("div");
    host.innerHTML = markup;
    document.body.append(host);
    const target = host.querySelector("span") ?? host.firstElementChild!;
    expect(paste(target).defaultPrevented).toBe(false);
    await flushPromises();
    expect(wrapper.emitted("imagesUpload")).toBeUndefined();
  });

  it("leaves an image paste already handled by another component alone", async () => {
    wrapper = mount(PreviewPanel, { ...options, props: props() });
    paste(document.body, true);
    await flushPromises();
    expect(wrapper.emitted("imagesUpload")).toBeUndefined();
  });
});
