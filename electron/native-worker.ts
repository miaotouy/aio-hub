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

import koffi, { type LibraryHandle } from "koffi";

// Each utility process owns one library. Synchronous C calls stay off the UI/main threads.
const parent = process.parentPort;
const send = (value: unknown) => {
  if (parent) parent.postMessage(value);
  else process.send?.(value);
};
let library: LibraryHandle | undefined;
let call: ReturnType<LibraryHandle["func"]> | undefined;
let free: ReturnType<LibraryHandle["func"]> | undefined;
const cRuntime = koffi.load(
  process.platform === "win32" ? "ucrtbase.dll" : null
);
const strnlen = cRuntime.func("strnlen", "size_t", ["void *", "size_t"]);
const copyBytes = cRuntime.func("memcpy", "void", [
  "void *",
  "void *",
  "size_t",
]);
function receive(message: unknown) {
  const input = message as {
    id: string;
    operation: string;
    library?: string;
    method?: string;
    payload?: string;
  };
  try {
    let result: unknown;
    if (input.operation === "load") {
      if (library || typeof input.library !== "string")
        throw new Error("原生库加载状态无效");
      library = koffi.load(input.library);
      call = library.func("call", "void *", ["str", "str"]);
      try {
        free = library.func("free_string", "void", ["void *"]);
      } catch {
        console.warn(
          "原生插件未提供 free_string，返回内存将在宿主进程结束时回收"
        );
      }
    } else if (input.operation === "call") {
      if (!call) throw new Error("原生库尚未加载");
      const pointer = call(input.method, input.payload);
      if (!pointer) throw new Error("插件函数返回空指针");
      try {
        const length = Number(strnlen(pointer, 16 * 1024 ** 2 + 1));
        if (length > 16 * 1024 ** 2) throw new Error("插件返回值超过 16 MiB");
        // Electron forbids external ArrayBuffers. Copy into JS-owned memory before decoding.
        const bytes = Buffer.alloc(length);
        if (length) copyBytes(bytes, pointer, length);
        result = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } finally {
        free?.(pointer);
      }
    } else if (input.operation === "unload") {
      call = undefined;
      free = undefined;
      library?.unload();
      library = undefined;
    } else throw new Error("原生库操作无效");
    send({ id: input.id, ok: true, result });
  } catch (error) {
    send({
      id: input.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
if (parent) parent.on("message", (event) => receive(event.data));
else process.on("message", receive);
