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

import { createRequire } from "node:module";
const parent = process.parentPort;
const addon = createRequire(import.meta.url)(process.argv[2]!) as {
  windowAutomation(
    command: string,
    configuration: string,
    selfPid: number
  ): string;
};
function receive(message: unknown) {
  const input = message as {
    id: string;
    command: string;
    configuration: string;
    selfPid: number;
  };
  try {
    const result = JSON.parse(
      addon.windowAutomation(input.command, input.configuration, input.selfPid)
    );
    const reply = { id: input.id, ok: true, result };
    if (parent) parent.postMessage(reply);
    else process.send?.(reply);
  } catch (error) {
    const reply = {
      id: input.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    if (parent) parent.postMessage(reply);
    else process.send?.(reply);
  }
}
if (parent) parent.on("message", (event) => receive(event.data));
else process.on("message", receive);
