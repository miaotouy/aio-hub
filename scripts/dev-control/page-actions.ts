export interface DiagnosticEntry {
  cursor: number;
  kind: string;
  message: string;
  source?: string;
  at: number;
}
declare global {
  interface Window {
    __AIO_DEV_DIAGNOSTICS__?: {
      documentId: string;
      cursor: number;
      entries: DiagnosticEntry[];
    };
  }
}

export function readDiagnostics(input: {
  since: number;
  limit: number;
  documentId?: string;
}) {
  const buffer = window.__AIO_DEV_DIAGNOSTICS__;
  if (!buffer)
    throw Object.assign(
      new Error("当前程序缺少启动期诊断采集，请重建并重启开发实例。"),
      { code: "UNSUPPORTED_CAPABILITY" }
    );
  const reset =
    (input.documentId !== undefined &&
      input.documentId !== buffer.documentId) ||
    input.since > buffer.cursor;
  const since = reset ? 0 : input.since;
  const entries = buffer.entries
    .filter((e) => e.cursor > since)
    .slice(0, input.limit);
  return {
    documentId: buffer.documentId,
    entries,
    cursor: entries.at(-1)?.cursor ?? buffer.cursor,
    latestCursor: buffer.cursor,
    reset,
    truncated:
      buffer.entries.filter((e) => e.cursor > since).length > entries.length,
    dropped: !!buffer.entries.length && since < buffer.entries[0].cursor - 1,
  };
}

export async function resizeWindow(input: {
  width: number;
  height: number;
  timeoutMs: number;
}) {
  const invoke = (
    window as unknown as {
      __TAURI_INTERNALS__: {
        invoke(command: string, args: unknown): Promise<unknown>;
      };
    }
  ).__TAURI_INTERNALS__.invoke;
  const until = Date.now() + Math.max(1, input.timeoutMs - 100);
  const args = {
    label: window.__AIO_DEV_CONTROL__?.describe().windowLabel ?? "main",
  };
  const state = async () => ({
    size: await invoke("plugin:window|inner_size", args),
    scaleFactor: await invoke("plugin:window|scale_factor", args),
    maximized: await invoke("plugin:window|is_maximized", args),
    fullscreen: await invoke("plugin:window|is_fullscreen", args),
    viewport: { width: innerWidth, height: innerHeight },
  });
  if (await invoke("plugin:window|is_fullscreen", args))
    await invoke("plugin:window|set_fullscreen", { ...args, value: false });
  if (await invoke("plugin:window|is_maximized", args))
    await invoke("plugin:window|unmaximize", args);
  await invoke("plugin:window|set_size", {
    ...args,
    value: { Logical: { width: input.width, height: input.height } },
  });
  let actual = await state();
  while (Date.now() < until) {
    if (
      Math.abs(actual.viewport.width - input.width) <= 2 &&
      Math.abs(actual.viewport.height - input.height) <= 2
    )
      return {
        requested: { width: input.width, height: input.height },
        actual,
      };
    await new Promise((resolve) => setTimeout(resolve, 100));
    actual = await state();
  }
  throw Object.assign(
    new Error(
      "窗口尺寸尚未生效，实际视口 " +
        actual.viewport.width +
        " × " +
        actual.viewport.height +
        "；请保留该尺寸记录再继续探查。"
    ),
    { code: "WINDOW_RESIZE_UNCONFIRMED" }
  );
}
