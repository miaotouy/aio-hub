import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRequest } from "./commands";
import { DevConnection } from "./connection";
import { acquireWindowLock, getInstance, type DevInstance } from "./discovery";

vi.mock("./connection", () => ({ DevConnection: { attach: vi.fn() } }));
vi.mock("./discovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./discovery")>()),
  getInstance: vi.fn(),
  acquireWindowLock: vi.fn(),
}));

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
function nativeTimeout(diagnostic = "locator.waitFor: Timeout exceeded") {
  return Object.assign(new Error(diagnostic), { name: "TimeoutError" });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(getInstance).mockReturnValue({
    instanceId: "deadline-test",
  } as DevInstance);
});
afterEach(() => vi.useRealTimers());

function connect(locator: object, close = vi.fn(async () => {})) {
  const release = vi.fn();
  const description = { route: "/settings", bridgeAvailable: true };
  const page = { locator: () => locator, setDefaultTimeout: vi.fn() };
  vi.mocked(acquireWindowLock).mockResolvedValue(release);
  vi.mocked(DevConnection.attach).mockResolvedValue({
    window: async () => page,
    verify: async () => description,
    // A failing command must finish cleanup without waiting for another page read.
    description: async () => {
      await pause(3000);
      return description;
    },
    close,
  } as unknown as DevConnection);
  return { release, close };
}

describe("development control action deadlines", () => {
  it("reports an absent target within the request budget without performing the write", async () => {
    const click = vi.fn();
    const { release, close } = connect({
      count: async () => {
        await pause(100);
        return 0;
      },
      waitFor: async ({ timeout }: { timeout: number }) => {
        await pause(timeout);
        throw nativeTimeout();
      },
      click,
    });
    const pending = executeRequest({
      timeoutMs: 1000,
      steps: [{ op: "click", target: { css: "button" } }],
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;
    expect(result).toMatchObject({
      ok: false,
      route: "/settings",
      error: { code: "TARGET_NOT_FOUND" },
    });
    expect(result.elapsedMs).toBeLessThanOrEqual(1000);
    expect(click).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("retains the native obstruction diagnostic when locating consumes part of the budget", async () => {
    let attached = false;
    connect({
      count: async () => {
        await pause(100);
        return attached ? 1 : 0;
      },
      waitFor: async () => {
        await pause(200);
        attached = true;
      },
      click: async ({ timeout }: { timeout: number }) => {
        await pause(timeout);
        throw nativeTimeout(
          "locator.click: Timeout exceeded\nCall log: private input text\n<div> intercepts pointer events"
        );
      },
    });
    const pending = executeRequest({
      timeoutMs: 1000,
      steps: [{ op: "click", target: { css: "button" } }],
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;
    expect(result).toMatchObject({
      ok: false,
      error: { code: "TARGET_OBSCURED" },
    });
    expect(result.elapsedMs).toBeLessThanOrEqual(1000);
    expect(JSON.stringify(result)).not.toContain("private input text");
  });

  it("disconnects a stalled action before it can perform a delayed SDK write", async () => {
    let writes = 0;
    let pendingWrite: ReturnType<typeof setTimeout> | undefined;
    const close = vi.fn(async () => {
      clearTimeout(pendingWrite);
    });
    connect(
      {
        count: async () => 1,
        click: () =>
          new Promise<void>(() => {
            pendingWrite = setTimeout(() => {
              writes++;
            }, 1200);
          }),
      },
      close
    );
    const pending = executeRequest({
      timeoutMs: 1000,
      steps: [{ op: "click", target: { css: "button" } }],
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: "COMMAND_TIMEOUT" },
    });
    expect(writes).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });
});
