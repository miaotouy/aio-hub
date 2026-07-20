import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openPicker: vi.fn(),
  openFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.openPicker,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  open: mocks.openFile,
  SeekMode: { Start: 0, Current: 1, End: 2 },
}));

import {
  selectAndReadValidationFileAtThroughputBaseline,
  selectAndResumeValidationFileRead,
} from "../platformFileValidation";

interface FakeFileHandle {
  read: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  seek: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function createFileHandle(size: number): FakeFileHandle {
  let offset = 0;
  return {
    read: vi.fn(async (buffer: Uint8Array) => {
      if (offset >= size) return null;
      const bytesRead = Math.min(buffer.byteLength, size - offset);
      offset += bytesRead;
      return bytesRead;
    }),
    stat: vi.fn(async () => ({ size })),
    seek: vi.fn(async (nextOffset: number) => {
      offset = nextOffset;
      return offset;
    }),
    close: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  const setTimer = globalThis.setTimeout.bind(globalThis);
  const clearTimer = globalThis.clearTimeout.bind(globalThis);
  vi.stubGlobal("window", {
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  mocks.openPicker.mockReset();
  mocks.openFile.mockReset();
  mocks.openPicker.mockResolvedValue("content://validation/large-file");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform file read validation", () => {
  it("uses 1 MiB bounded reads for the throughput baseline", async () => {
    const size = 5 * 1024 * 1024;
    const handle = createFileHandle(size);
    mocks.openFile.mockResolvedValue(handle);

    const summary = await selectAndReadValidationFileAtThroughputBaseline();

    expect(summary).toMatchObject({
      status: "passed",
      size,
      bytesRead: size,
      readChunkBytes: 1024 * 1024,
      failurePhase: "",
    });
    expect(handle.read).toHaveBeenCalledTimes(6);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("closes, reopens, seeks, and continues from the interruption point", async () => {
    const size = 10 * 1024 * 1024;
    const firstHandle = createFileHandle(size);
    const resumedHandle = createFileHandle(size);
    mocks.openFile
      .mockResolvedValueOnce(firstHandle)
      .mockResolvedValueOnce(resumedHandle);
    const phases: string[] = [];

    const summary = await selectAndResumeValidationFileRead((progress) => {
      if (progress.phase) phases.push(progress.phase);
    });

    expect(summary).toMatchObject({
      status: "passed",
      size,
      bytesRead: size,
      interruptAtBytes: 4 * 1024 * 1024,
      resumedOffset: 4 * 1024 * 1024,
      failurePhase: "",
    });
    expect(firstHandle.close).toHaveBeenCalledOnce();
    expect(resumedHandle.seek).toHaveBeenCalledWith(4 * 1024 * 1024, 0);
    expect(resumedHandle.close).toHaveBeenCalledOnce();
    expect(mocks.openFile).toHaveBeenCalledTimes(2);
    expect(phases).toContain("interrupted");
    expect(phases).toContain("resumed");
    expect(phases[phases.length - 1]).toBe("completed");
  });
});
