import { createServer } from "node:http";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { EmbeddedConnection } from "./embedded";
import { assertLoopbackListeners } from "./listener";
import { CONTROL_ROOT, validateInstance, type DevInstance } from "./discovery";

it("rejects wildcard listeners and accepts explicit loopback listeners", () => {
  expect(() => assertLoopbackListeners(["127.0.0.1", "::1"])).not.toThrow();
  for (const address of ["0.0.0.0", "::", "192.168.251.128"])
    expect(() => assertLoopbackListeners(["127.0.0.1", address])).toThrow();
  expect(() => assertLoopbackListeners([])).toThrow();
});
it("rejects the wrong startup identity before selecting or acting and releases its session", async () => {
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      /* Consume the request body. */
    }
    requests.push(request.method + " " + request.url);
    const value =
      request.url === "/session"
        ? { sessionId: "owned-session" }
        : request.url?.endsWith("/handles")
          ? ["main"]
          : request.url === "/wdio/eval"
            ? {
                ok: true,
                value: {
                  protocolVersion: 1,
                  instanceId: "test",
                  startupId: randomUUID(),
                  pid: 4321,
                  windowLabel: "main",
                  route: "/",
                  ready: true,
                  bridgeAvailable: true,
                },
              }
            : null;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ value }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const instance: DevInstance = {
    protocolVersion: 1,
    instanceId: "test",
    startupId: randomUUID(),
    launcherPid: process.pid,
    startedAt: new Date().toISOString(),
    endpoint: "http://127.0.0.1:" + address.port,
    transport: "embedded-webdriver",
    frontendUrl: "tauri://localhost",
    frontendMode: "bundled-debug",
    dataDir: "unused",
    status: "ready",
  };
  const connection = await EmbeddedConnection.attach(
    validateInstance(instance),
    1000
  );
  try {
    await expect(connection.select("main", 1000)).rejects.toMatchObject({
      code: "IDENTITY_MISMATCH",
    });
  } finally {
    await connection.close();
    server.close();
    await once(server, "close");
  }
  expect(requests).toEqual([
    "POST /session",
    "GET /session/owned-session/window/handles",
    "POST /wdio/eval",
    "DELETE /session/owned-session",
  ]);
});

it("preserves async JSON results and typed page errors through the actual direct-eval envelope", async () => {
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const value =
      request.url === "/session"
        ? { sessionId: "eval-session" }
        : request.url === "/wdio/eval"
          ? await new Promise((resolve) => {
              const script = JSON.parse(body).script;
              new Function(script)((result: { value: unknown }) =>
                resolve(result.value)
              );
            })
          : null;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ value }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const connection = await EmbeddedConnection.attach(
    {
      protocolVersion: 1,
      instanceId: "eval",
      startupId: randomUUID(),
      launcherPid: process.pid,
      startedAt: new Date().toISOString(),
      endpoint: "http://127.0.0.1:" + port,
      transport: "embedded-webdriver",
      frontendUrl: "tauri://localhost",
      frontendMode: "bundled-debug",
      dataDir: "unused",
      status: "ready",
    },
    1000
  );
  try {
    await expect(
      connection.evaluate("Promise.resolve({answer:42,items:[true,null]})")
    ).resolves.toEqual({ answer: 42, items: [true, null] });
    await expect(
      connection.evaluate(
        'Promise.reject(Object.assign(new Error("covered"),{code:"TARGET_OBSCURED"}))'
      )
    ).rejects.toMatchObject({ code: "TARGET_OBSCURED", message: "covered" });
  } finally {
    await connection.close();
    server.close();
    await once(server, "close");
  }
});

it.each(["key-order", "mask-change", "viewport-change", "crop-change"])(
  "validates screenshot geometry across JSON transport: %s",
  async (change) => {
    const startupId = randomUUID();
    const artifactDir = path.join(CONTROL_ROOT, "artifacts", startupId);
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    let evaluations = 0;
    const before = {
      viewport: { width: 800, height: 600 },
      crop: { x: 0, y: 0, width: 800, height: 600 },
      masks: [{ x: 10, y: 20, width: 30, height: 40 }],
    };
    const after = {
      masks: [
        { height: 40, width: 30, y: 20, x: change === "mask-change" ? 11 : 10 },
      ],
      crop: {
        height: 600,
        width: change === "crop-change" ? 799 : 800,
        y: 0,
        x: 0,
      },
      viewport: {
        height: 600,
        width: change === "viewport-change" ? 801 : 800,
      },
    };
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) {
        /* Consume the request body. */
      }
      const value =
        request.url === "/session"
          ? { sessionId: "screenshot-session" }
          : request.url === "/wdio/eval"
            ? {
                ok: true,
                value:
                  ++evaluations === 1
                    ? before
                    : evaluations === 2
                      ? after
                      : png.toString("base64"),
              }
            : request.url?.endsWith("/screenshot")
              ? "raw-native-snapshot"
              : null;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ value }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const connection = await EmbeddedConnection.attach(
      {
        protocolVersion: 1,
        instanceId: "screenshot",
        startupId,
        launcherPid: process.pid,
        startedAt: new Date().toISOString(),
        endpoint: "http://127.0.0.1:" + port,
        transport: "embedded-webdriver",
        frontendUrl: "tauri://localhost",
        frontendMode: "bundled-debug",
        dataDir: "unused",
        status: "ready",
      },
      1000
    );
    try {
      if (change === "key-order") {
        const result = await connection.screenshot(undefined, undefined, 1000);
        expect(result.redacted).toBe(true);
        expect(await fs.readFile(result.path)).toEqual(png);
      } else {
        await expect(
          connection.screenshot(undefined, undefined, 1000)
        ).rejects.toMatchObject({ code: "SCREENSHOT_CHANGED" });
        await expect(fs.access(artifactDir)).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    } finally {
      await connection.close();
      server.close();
      await once(server, "close");
      await fs.rm(artifactDir, { recursive: true, force: true });
    }
  }
);
