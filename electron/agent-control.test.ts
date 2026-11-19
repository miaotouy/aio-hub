import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { AgentControl } from "./agent-control";
import { send } from "../scripts/agent-control/cli";
import type {
  ControlDelivery,
  ControlManifest,
} from "../src/services/agent-control/protocol";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-control-test-"));
  cleanups.push(async () => {
    const target = path.resolve(root);
    if (
      !target.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(target).startsWith("aiohub-control-test-")
    )
      throw new Error("unexpected temporary cleanup path");
    await fs.rm(target, { recursive: true, force: true });
  });
  let control: AgentControl;
  control = new AgentControl(
    root,
    {
      windows: () => ["main", "tool"],
      status: () => {},
      deliver: (window, _event, payload) => {
        const request = payload as ControlDelivery;
        queueMicrotask(() =>
          control.reply(window, request.id, {
            ok: true,
            result: { op: request.command.op, window },
          })
        );
        return true;
      },
    },
    path.join(root, "discovery")
  );
  cleanups.push(() => control.stop());
  const manifest = async () =>
    JSON.parse(
      await fs.readFile(path.join(root, "control.json"), "utf8")
    ) as ControlManifest;
  return { root, control, manifest };
}
function raw(
  endpoint: string,
  text: string
): Promise<{ ok: boolean; error: { code: string } }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    let data = "";
    socket.on("connect", () => socket.write(text));
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      data += chunk;
      if (data.includes("\n")) {
        resolve(JSON.parse(data));
        socket.end();
      }
    });
  });
}
describe("production local control transport", () => {
  it("starts disabled, routes to ready windows and rotates connection identity on re-enable", async () => {
    const { control, manifest } = await fixture();
    await control.initialize();
    expect(control.status().enabled).toBe(false);
    await control.configure(true);
    const first = await manifest();
    expect(await send(first, { op: "state" })).toMatchObject({
      ok: false,
      error: { code: "WINDOW_NOT_READY" },
    });
    control.ready("tool");
    expect(await send(first, { op: "state" }, "tool")).toEqual({
      ok: true,
      result: { op: "state", window: "tool" },
    });
    const forged = await raw(
      first.endpoint,
      JSON.stringify({ token: "wrong", command: { op: "windows" } }) + "\n"
    );
    expect(forged.error.code).toBe("CONTROL_UNAVAILABLE");
    await control.configure(false);
    await expect(send(first, { op: "state" })).rejects.toThrow(/连接/);
    await control.configure(true);
    const second = await manifest();
    expect(second.token).not.toBe(first.token);
    expect(second.endpoint).not.toBe(first.endpoint);
  });
  it("rejects oversized frames before waiting for a newline and reports malformed requests", async () => {
    const { control, manifest } = await fixture();
    await control.configure(true);
    const m = await manifest();
    expect((await raw(m.endpoint, "{bad-json}\n")).error.code).toBe(
      "INVALID_REQUEST"
    );
    expect((await raw(m.endpoint, "x".repeat(256 * 1024 + 1))).error.code).toBe(
      "REQUEST_TOO_LARGE"
    );
  });
  it("restores the opt-in setting with a new session after restarting the host", async () => {
    const { control, root, manifest } = await fixture();
    await control.configure(true);
    const first = await manifest();
    await control.stop();
    await control.initialize();
    expect(control.status().enabled).toBe(true);
    expect((await manifest()).token).not.toBe(first.token);
    expect(
      JSON.parse(
        await fs.readFile(path.join(root, "control-settings.json"), "utf8")
      ).enabled
    ).toBe(true);
  });
});
