import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { executeRequest, runBatch } from "./commands";
import { main } from "./cli";
import { matchesIdentity } from "./connection";
import { acquireWindowLock, type DevInstance } from "./discovery";
import { validateInstance } from "./discovery";
import { validateRequest } from "./protocol";

function instance(): DevInstance {
  return {
    protocolVersion: 1,
    instanceId: "control-test",
    startupId: randomUUID(),
    launcherPid: process.pid,
    appPid: 1234,
    startedAt: new Date().toISOString(),
    endpoint: "http://127.0.0.1:9333",
    frontendUrl: "http://localhost:1420",
    frontendMode: "hmr",
    dataDir: "unused",
    status: "ready",
  };
}

describe("development control contracts", () => {
  it("rejects the entire batch before connecting when a later instruction is invalid", async () => {
    await expect(
      executeRequest({
        steps: [
          { op: "click", target: { role: "button", name: "Save" } },
          { op: "fill", target: { css: "input" }, text: 12 },
        ],
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(main(["click", "--text", "unexpected"])).rejects.toMatchObject(
      { code: "INVALID_REQUEST" }
    );
    expect(() =>
      validateRequest({
        steps: [{ op: "navigate", path: "//external.example" }],
      })
    ).toThrow();
    expect(() =>
      validateRequest({
        steps: [{ op: "click", target: { css: "button", testid: "save" } }],
      })
    ).toThrow();
  });

  it("reports completed steps and stops at the first failed action", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ changed: true })
      .mockRejectedValueOnce(new Error("disabled"));
    const request = validateRequest({
      steps: [
        { op: "navigate", path: "/settings" },
        { op: "click", target: { testid: "save" } },
        { op: "fill", target: { css: "input" }, text: "next" },
      ],
    });
    const result = await runBatch(request, execute);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: false,
      steps: [
        {
          index: 0,
          op: "navigate",
          mode: "appAction",
          result: { changed: true },
        },
      ],
      failedStep: { index: 1, op: "click" },
    });
  });

  it("retains completed steps when a result cannot be represented as JSON", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce("done")
      .mockResolvedValueOnce(1n);
    const request = validateRequest({
      steps: [
        { op: "inspect" },
        { op: "eval", expression: "1n" },
        { op: "click", target: { css: "button" } },
      ],
    });
    const result = await runBatch(request, execute);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: false,
      steps: [{ index: 0, result: "done" }],
      failedStep: { index: 1, op: "eval" },
      error: { code: "NON_JSON_RESULT" },
    });
  });

  it("rejects a stale startup identity or a different application process", () => {
    const app = instance();
    const description = {
      protocolVersion: 1,
      instanceId: app.instanceId,
      startupId: app.startupId,
      windowLabel: "main",
      pid: 1234,
      route: "/",
      ready: true,
    };
    expect(matchesIdentity(app, description)).toBe(true);
    expect(
      matchesIdentity(app, { ...description, startupId: randomUUID() })
    ).toBe(false);
    expect(matchesIdentity(app, { ...description, pid: 4321 })).toBe(false);
    expect(matchesIdentity(app, { ...description, protocolVersion: 2 })).toBe(
      false
    );
  });

  it("accepts only local CDP endpoints from instance descriptors", () => {
    const app = instance();
    expect(validateInstance(app).endpoint).toBe(app.endpoint);
    expect(() =>
      validateInstance({ ...app, endpoint: "http://192.168.1.20:9333" })
    ).toThrow();
    expect(() =>
      validateInstance({ ...app, endpoint: "http://127.0.0.1:70000" })
    ).toThrow();
    expect(() =>
      validateInstance({ ...app, startupId: "../../outside" })
    ).toThrow();
  });

  it("serializes writers to one window and releases ownership after a batch", async () => {
    const app = instance();
    const release = await acquireWindowLock(app, "main");
    try {
      await expect(acquireWindowLock(app, "main")).rejects.toMatchObject({
        code: "WINDOW_BUSY",
      });
      const other = await acquireWindowLock(app, "detached-tool");
      other();
    } finally {
      release();
    }
    const again = await acquireWindowLock(app, "main");
    again();
  });
});
