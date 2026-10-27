// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: api }));
let renderMermaid: (typeof import("../mermaidRuntime"))["renderMermaid"];
beforeEach(async () => {
  vi.resetModules();
  api.initialize.mockReset();
  api.render.mockReset();
  ({ renderMermaid } = await import("../mermaidRuntime"));
});
const current = () => true;

// Protects stable themed output with many owners, while sharing one site configuration.
it("reuses a theme across concurrent owners and reconfigures when the theme changes", async () => {
  let theme = "";
  api.initialize.mockImplementation((config) => {
    theme = config.theme;
  });
  api.render.mockImplementation(async (id, content) => ({
    svg: id + ":" + theme + ":" + content,
  }));
  const first = await Promise.all(
    ["first", "second", "third"].map((content) =>
      renderMermaid({ content, dark: false, isCurrent: current })
    )
  );
  expect(
    first.map((result) => result?.svg.split(":").slice(1).join(":"))
  ).toEqual(["default:first", "default:second", "default:third"]);
  expect(new Set(first.map((result) => result?.svg.split(":")[0])).size).toBe(
    3
  );
  expect(api.initialize).toHaveBeenCalledTimes(1);
  expect(
    (await renderMermaid({ content: "dark", dark: true, isCurrent: current }))
      ?.svg
  ).toContain(":dark:dark");
  expect(
    (await renderMermaid({ content: "light", dark: false, isCurrent: current }))
      ?.svg
  ).toContain(":default:light");
  expect(api.initialize).toHaveBeenCalledTimes(3);
});

// The library keeps mutable global config during asynchronous layout. A later job must wait.
it("keeps theme configuration attached to its render and skips superseded queued work", async () => {
  let finish!: () => void;
  let started!: () => void;
  let theme = "";
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  api.initialize.mockImplementation((config) => {
    theme = config.theme;
  });
  api.render
    .mockImplementationOnce(async () => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { svg: theme };
    })
    .mockImplementation(async () => ({ svg: theme }));
  const first = renderMermaid({
    content: "light",
    dark: false,
    isCurrent: current,
  });
  await running;
  let stale = false;
  const old = renderMermaid({
    content: "obsolete",
    dark: true,
    isCurrent: () => !stale,
  });
  const next = renderMermaid({
    content: "dark",
    dark: true,
    isCurrent: current,
  });
  stale = true;
  expect(theme).toBe("default");
  finish();
  expect((await first)?.svg).toBe("default");
  expect(await old).toBeUndefined();
  expect((await next)?.svg).toBe("dark");
  expect(api.render.mock.calls.map((call) => call[1])).toEqual([
    "light",
    "dark",
  ]);
});

it("lets later owners render after a malformed diagram fails", async () => {
  api.render
    .mockRejectedValueOnce(new Error("syntax failure"))
    .mockResolvedValue({ svg: "recovered" });
  await expect(
    renderMermaid({ content: "invalid", dark: false, isCurrent: current })
  ).rejects.toThrow("syntax failure");
  expect(
    (await renderMermaid({ content: "valid", dark: false, isCurrent: current }))
      ?.svg
  ).toBe("recovered");
});
