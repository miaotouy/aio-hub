import fs from "node:fs";
import path from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CONTROL_ROOT,
  acquireInstanceLock,
  findInstance,
  getInstance,
  publishInstance,
  removeInstance,
  launcherIsCurrent,
  probeEndpoint,
  processStartedAtMs,
  type DevInstance,
} from "./discovery";

function descriptor(overrides: Partial<DevInstance> = {}): DevInstance {
  return {
    protocolVersion: 1,
    instanceId: "discovery-" + randomUUID(),
    startupId: randomUUID(),
    launcherPid: process.pid,
    startedAt: new Date().toISOString(),
    endpoint: "http://127.0.0.1:1",
    frontendUrl: "http://localhost:1420",
    frontendMode: "hmr",
    dataDir: "unused",
    status: "ready",
    ...overrides,
  };
}

describe("instance liveness", () => {
  it.skipIf(process.platform !== "win32")(
    "rejects a launcher PID recycled after its descriptor was published",
    async () => {
      // A live PID whose process started after the descriptor was written can
      // only be a recycled PID that happens to match the recorded number.
      expect(
        await launcherIsCurrent(
          descriptor({
            startedAt: new Date(Date.now() - 86_400_000).toISOString(),
          })
        )
      ).toBe(false);
      expect(await launcherIsCurrent(descriptor())).toBe(true);
    }
  );

  it.skipIf(process.platform !== "win32")(
    "rejects a descriptor whose recorded start time differs from the process",
    async () => {
      const startedAtMs = await processStartedAtMs(process.pid);
      expect(startedAtMs).toBeDefined();
      expect(
        await launcherIsCurrent(
          descriptor({ launcherStartedAtMs: startedAtMs })
        )
      ).toBe(true);
      expect(
        await launcherIsCurrent(
          descriptor({ launcherStartedAtMs: startedAtMs! - 3_600_000 })
        )
      ).toBe(false);
    }
  );

  it("probes the control endpoint instead of trusting the PID alone", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const port = (server.address() as AddressInfo).port;
    const instance = descriptor({ endpoint: `http://127.0.0.1:${port}` });
    try {
      expect(await probeEndpoint(instance, 500)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(await probeEndpoint(instance, 500)).toBe(false);
  });
  it("retains launcher ownership while an application endpoint rebuilds and recovers", async () => {
    const server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const instance = descriptor({ endpoint: `http://127.0.0.1:${port}` });
    const release = await acquireInstanceLock(instance.instanceId);
    const file = path.join(
      CONTROL_ROOT,
      "instances",
      instance.instanceId + ".json"
    );
    try {
      publishInstance(instance);
      expect(await findInstance(instance.instanceId)).toMatchObject({
        status: "starting",
      });
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
        status: "ready",
      });
      await expect(getInstance(instance.instanceId)).rejects.toMatchObject({
        code: "INSTANCE_STARTING",
      });
      await expect(
        acquireInstanceLock(instance.instanceId)
      ).rejects.toMatchObject({ code: "INSTANCE_RUNNING" });
      const pending = findInstance(instance.instanceId);
      publishInstance({ ...instance, status: "starting" });
      expect(await pending).toMatchObject({ status: "starting" });
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
        status: "starting",
      });
      await new Promise<void>((resolve) =>
        server.listen(port, "127.0.0.1", resolve)
      );
      publishInstance(instance);
      expect(await getInstance(instance.instanceId)).toMatchObject({
        startupId: instance.startupId,
        status: "ready",
      });
    } finally {
      removeInstance(instance);
      release();
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.skipIf(!["win32", "linux"].includes(process.platform))(
    "rejects a live lease and reclaims it when its PID belongs to another process incarnation",
    async () => {
      const id = "lease-" + randomUUID();
      const file = path.join(CONTROL_ROOT, "locks", "instance-" + id + ".json");
      const releaseOld = await acquireInstanceLock(id);
      let releaseNew: (() => void) | undefined;
      try {
        await expect(acquireInstanceLock(id)).rejects.toMatchObject({
          code: "INSTANCE_RUNNING",
        });
        const old = JSON.parse(fs.readFileSync(file, "utf8"));
        if (process.platform === "win32") {
          expect(old.startedAtMs).toEqual(
            await processStartedAtMs(process.pid)
          );
          old.startedAtMs -= 1000;
        } else {
          expect(old.startTicks).toMatch(/^\d+$/);
          old.startTicks = String(BigInt(old.startTicks) - 1n);
        }
        fs.writeFileSync(file, JSON.stringify(old));
        releaseNew = await acquireInstanceLock(id);
        releaseOld();
        await expect(acquireInstanceLock(id)).rejects.toMatchObject({
          code: "INSTANCE_RUNNING",
        });
      } finally {
        releaseNew?.();
        releaseOld();
      }
      const releaseAgain = await acquireInstanceLock(id);
      releaseAgain();
    }
  );
  it.skipIf(process.platform !== "win32")(
    "reclaims a legacy lease when its PID was reused within one minute",
    async () => {
      const id = "legacy-" + randomUUID();
      const file = path.join(CONTROL_ROOT, "locks", "instance-" + id + ".json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({ pid: process.pid, token: randomUUID() })
      );
      const startedAt = await processStartedAtMs(process.pid);
      expect(startedAt).toBeDefined();
      const beforeProcessStart = new Date(startedAt! - 20_000);
      fs.utimesSync(file, beforeProcessStart, beforeProcessStart);
      try {
        const release = await acquireInstanceLock(id);
        release();
      } finally {
        fs.rmSync(file, { force: true });
      }
    }
  );
});
