import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { EmbeddedConnection } from "./embedded";
import { assertLoopbackListeners } from "./listener";
import { validateInstance, type DevInstance } from "./discovery";

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
