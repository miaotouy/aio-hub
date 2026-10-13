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

import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { canvasToBlob, exportStageToCanvas } from "../../core/konva-export";
import type { EditorSession } from "../useEditorSession";
import { useEditorExport } from "../useEditorExport";

vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeImage: vi.fn(),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn() },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: vi.fn(() => ({ error: vi.fn() })),
}));
vi.mock("../useSketchStorage", () => ({ useSketchStorage: () => ({}) }));
vi.mock("../../stores/sketchPadStore", () => ({
  useSketchPadStore: () => ({}),
}));
vi.mock("../useSendSketchToChat", () => ({ useSendSketchToChat: () => ({}) }));
vi.mock("../useImageAsset", () => ({ useImageAsset: () => ({}) }));
vi.mock("../../core/sketch-packager", () => ({ packageSketch: vi.fn() }));
vi.mock("../../core/konva-export", () => ({
  canvasToBlob: vi.fn(),
  exportStageToCanvas: vi.fn(),
}));

function createLayer() {
  let visible = true;
  return {
    hide: () => {
      visible = false;
    },
    show: () => {
      visible = true;
    },
    isVisible: () => visible,
  };
}

function createEditor() {
  const overlay = createLayer();
  const border = createLayer();
  const stage = {
    findOne: (selector: string) => (selector === ".overlay" ? overlay : border),
    batchDraw: vi.fn(),
  };
  const session = {
    state: { project: ref({ name: "Sketch", width: 320, height: 240 }) },
    runtime: {
      capabilities: {
        getStage: () => stage,
        getCanvases: () => new Map(),
      },
    },
    actions: {},
  } as unknown as EditorSession;
  return { ...useEditorExport(session), stage, overlay, border };
}

describe("sketch image export", () => {
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const canvas = {} as HTMLCanvasElement;
  const errorHandler = vi.mocked(createModuleErrorHandler).mock.results[0]
    .value;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(writeImage).mockResolvedValue(undefined);
    vi.mocked(exportStageToCanvas).mockReturnValue(canvas);
    vi.mocked(canvasToBlob).mockResolvedValue(
      new NodeBlob([pngBytes], { type: "image/png" }) as unknown as Blob
    );
  });

  it("copies the full canvas as PNG image data without opening a save dialog", async () => {
    const editor = createEditor();
    vi.mocked(exportStageToCanvas).mockImplementation(() => {
      expect(editor.overlay.isVisible()).toBe(false);
      expect(editor.border.isVisible()).toBe(false);
      return canvas;
    });

    await editor.handleExport("clipboard-png");

    expect(exportStageToCanvas).toHaveBeenCalledWith(editor.stage, {
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      pixelRatio: 2,
    });
    expect(canvasToBlob).toHaveBeenCalledWith(canvas, "image/png", undefined);
    expect(writeImage).toHaveBeenCalledWith(pngBytes);
    expect(save).not.toHaveBeenCalled();
    expect(editor.overlay.isVisible()).toBe(true);
    expect(editor.border.isVisible()).toBe(true);
    expect(customMessage.success).toHaveBeenCalledOnce();
  });

  it.each(["encoding", "clipboard"] as const)(
    "reports %s failure and leaves the editor usable",
    async (failure) => {
      const editor = createEditor();
      const error = new Error("Export failed");
      if (failure === "encoding") {
        vi.mocked(canvasToBlob).mockRejectedValueOnce(error);
      } else {
        vi.mocked(writeImage).mockRejectedValueOnce(error);
      }

      await expect(
        editor.handleExport("clipboard-png")
      ).resolves.toBeUndefined();

      expect(errorHandler.error).toHaveBeenCalledWith(
        error,
        expect.any(String)
      );
      expect(customMessage.success).not.toHaveBeenCalled();
      expect(editor.overlay.isVisible()).toBe(true);
      expect(editor.border.isVisible()).toBe(true);
    }
  );

  it("continues saving PNG exports to the selected file", async () => {
    const editor = createEditor();
    vi.mocked(save).mockResolvedValueOnce("C:/Sketch.png");

    await editor.handleExport("png");

    expect(canvasToBlob).toHaveBeenCalledWith(canvas, "image/png", undefined);
    expect(writeFile).toHaveBeenCalledWith("C:/Sketch.png", pngBytes);
    expect(writeImage).not.toHaveBeenCalled();
  });
});
