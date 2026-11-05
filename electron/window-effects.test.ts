// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { expect, it, vi } from "vitest";
import { applyWindowEffect } from "./window-effects";
it("preserves transparent component surfaces across initial and subsequent appearance changes", () => {
  const target = {
    setBackgroundMaterial: vi.fn(),
    setBackgroundColor: vi.fn(),
  };
  for (const effect of ["none", "mica", "blur", "none"])
    applyWindowEffect(target, effect, true, "win32");
  expect(target.setBackgroundColor.mock.calls).toEqual(
    Array(4).fill(["#00000000"])
  );
  expect(target.setBackgroundMaterial).not.toHaveBeenCalled();
});
it("retains opaque-window Windows material aliases and rejects unsupported requests", () => {
  const target = {
    setBackgroundMaterial: vi.fn(),
    setBackgroundColor: vi.fn(),
  };
  applyWindowEffect(target, "blur", false, "win32");
  applyWindowEffect(target, "none", false, "win32");
  expect(target.setBackgroundMaterial.mock.calls).toEqual([
    ["acrylic"],
    ["none"],
  ]);
  expect(() => applyWindowEffect(target, "mica", false, "linux")).toThrow(
    "窗口材质"
  );
  expect(() => applyWindowEffect(target, "invalid", true, "win32")).toThrow(
    "窗口材质"
  );
});
