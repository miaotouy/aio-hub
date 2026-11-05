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

import {
  BACKGROUND_HEARTBEAT_INTERVAL_MS,
  BACKGROUND_RUNTIME_VERSION,
  type BackgroundHostMessage,
  type BackgroundWorkerMessage,
} from "./background-runtime-protocol";
import type { BackgroundJsRuntimeResponse } from "../src/background-runtime/protocol";

import { BackgroundContextServices } from "./background-context-services";
import { BackgroundHostClient } from "./background-host-client";

const parent = process.parentPort;
if (!parent)
  throw Error("Background runtime requires an Electron utility process");
const runtimeInfo = {
  runtimeVersion: BACKGROUND_RUNTIME_VERSION,
  engine: "node",
  pid: process.pid,
  nodeVersion: process.versions.node,
  startedAt: new Date().toISOString(),
};
const send = (message: BackgroundWorkerMessage) => parent.postMessage(message);
const host = new BackgroundHostClient((message) => send(message));
let contexts: BackgroundContextServices | undefined;
let closing = false;
process.once("exit", () => host.close());
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(heartbeat);
  host.close();
  try {
    await contexts?.shutdown();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
// Keep the existing diagnostic methods while Agent execution is extracted separately.
parent.on("message", ({ data }: { data: BackgroundHostMessage }) => {
  if (data?.type === "shutdown") {
    void shutdown();
    return;
  }
  if (closing) return;
  if (data?.type === "host-response") {
    host.receive(data);
    return;
  }
  if (data?.type !== "request") return;
  const { id, method } = data.request;
  let response: BackgroundJsRuntimeResponse;
  switch (method) {
    case "runtime.ping":
      response = {
        id,
        ok: true,
        result: { pong: true, respondedAt: new Date().toISOString() },
      };
      break;
    case "runtime.getInfo":
      response = { id, ok: true, result: runtimeInfo };
      break;
    default:
      response = {
        id,
        ok: false,
        error: {
          code: "METHOD_NOT_IMPLEMENTED",
          message: `Background JS Runtime method is not implemented: ${method}`,
        },
      };
  }
  send({ type: "response", response });
});
// Startup uses only nonsecret environment metadata. Credentials load lazily for execution.
void host
  .call("host.initialize", undefined)
  .then((environment) => {
    if (closing) return;
    contexts = new BackgroundContextServices(host, environment);
    send({ type: "ready", runtimeVersion: BACKGROUND_RUNTIME_VERSION });
  })
  .catch(() => {
    host.close();
    process.exit(1);
  });
const heartbeat = setInterval(
  () => send({ type: "heartbeat" }),
  BACKGROUND_HEARTBEAT_INTERVAL_MS
);
