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

export type NativeDragDrop =
  | {
      type: "enter" | "drop";
      paths: string[];
      position: { x: number; y: number };
    }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "leave" };

/** Runs only in the isolated preload. Paths come from Chromium File objects. */
export function installFileDragDrop(
  document: Document,
  window: Window,
  getFilePath: (file: File) => string,
  notify: (event: NativeDragDrop, preventDefault?: () => void) => void,
  fallback: (paths: string[]) => void = () => {}
): void {
  let depth = 0;
  const isFileDrag = (event: DragEvent) =>
    event.isTrusted && event.dataTransfer?.types.includes("Files");
  const position = (event: DragEvent) => ({
    x: event.clientX * window.devicePixelRatio,
    y: event.clientY * window.devicePixelRatio,
  });
  const paths = (event: DragEvent) => [
    ...new Set(
      Array.from(event.dataTransfer?.files ?? [], (file) =>
        getFilePath(file)
      ).filter(Boolean)
    ),
  ];
  const leave = () => {
    if (!depth) return;
    depth = 0;
    notify({ type: "leave" });
  };
  document.addEventListener(
    "dragenter",
    (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (depth++ === 0)
        notify({
          type: "enter",
          paths: paths(event),
          position: position(event),
        });
    },
    true
  );
  document.addEventListener(
    "dragover",
    (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (!depth) {
        depth = 1;
        notify({
          type: "enter",
          paths: paths(event),
          position: position(event),
        });
      }
      notify({ type: "over", position: position(event) });
    },
    true
  );
  document.addEventListener(
    "dragleave",
    (event) => {
      if (!event.isTrusted || !depth) return;
      if (--depth === 0) notify({ type: "leave" });
    },
    true
  );
  document.addEventListener(
    "drop",
    (event) => {
      if (!isFileDrag(event)) return;
      const files = paths(event);
      if (!files.length) {
        leave();
        return;
      }
      depth = 0;
      notify({ type: "drop", paths: files, position: position(event) }, () =>
        event.preventDefault()
      );
    },
    true
  );
  document.addEventListener("drop", (event) => {
    if (!isFileDrag(event)) return;
    const consumed = event.defaultPrevented;
    event.preventDefault();
    const files = paths(event);
    if (!consumed && files.length) fallback(files);
  });
  window.addEventListener("blur", leave);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) leave();
  });
}

/** Copy only the native event contract; malformed messages never reach app listeners. */
export function parseNativeDragDrop(value: unknown): NativeDragDrop {
  if (!value || typeof value !== "object") throw new Error("文件拖放事件无效");
  const event = value as Record<string, unknown>;
  if (event.type === "leave") return { type: "leave" };
  if (!["enter", "over", "drop"].includes(event.type as string))
    throw new Error("文件拖放事件类型无效");
  const point = event.position as { x?: unknown; y?: unknown } | undefined;
  if (
    !point ||
    typeof point.x !== "number" ||
    typeof point.y !== "number" ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    throw new Error("文件拖放坐标无效");
  const position = { x: point.x, y: point.y };
  if (event.type === "over") return { type: "over", position };
  if (
    !Array.isArray(event.paths) ||
    event.paths.some(
      (path) => typeof path !== "string" || !path || path.includes("\0")
    )
  )
    throw new Error("文件拖放路径无效");
  return {
    type: event.type as "enter" | "drop",
    paths: [...new Set(event.paths as string[])],
    position,
  };
}
