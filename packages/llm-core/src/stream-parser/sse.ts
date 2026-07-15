import { Utf8LineDecoder } from "./line-decoder";

export interface SseEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

export class SseDecoder extends Utf8LineDecoder<SseEvent> {
  private dataLines: string[] = [];
  private eventType: string | undefined;
  private lastEventId: string | undefined;
  private retry: number | undefined;
  private hasData = false;

  protected onLine(line: string): SseEvent[] {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return [];

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "data":
        this.hasData = true;
        this.dataLines.push(value);
        break;
      case "event":
        this.eventType = value;
        break;
      case "id":
        if (!value.includes("\0")) this.lastEventId = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
    }

    return [];
  }

  protected onFinish(): SseEvent[] {
    return this.dispatch();
  }

  private dispatch(): SseEvent[] {
    if (!this.hasData) {
      this.eventType = undefined;
      this.retry = undefined;
      return [];
    }

    const event: SseEvent = {
      data: this.dataLines.join("\n"),
      ...(this.eventType ? { event: this.eventType } : {}),
      ...(this.lastEventId !== undefined ? { id: this.lastEventId } : {}),
      ...(this.retry !== undefined ? { retry: this.retry } : {}),
    };

    this.dataLines = [];
    this.eventType = undefined;
    this.retry = undefined;
    this.hasData = false;
    return [event];
  }
}

export class SseDataLineDecoder extends Utf8LineDecoder<string> {
  protected onLine(line: string): string[] {
    if (!line.startsWith("data:")) return [];
    let data = line.slice(5);
    if (data.startsWith(" ")) data = data.slice(1);
    return [data];
  }

  protected onFinish(): string[] {
    return [];
  }
}

export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: string) => void,
  onError?: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  // Existing adapters consume one JSON payload per data line, including
  // non-standard streams that omit the blank SSE event separator.
  const decoder = new SseDataLineDecoder();
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };

  try {
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });

    while (true) {
      if (signal?.aborted) throw createAbortError();
      const { done, value } = await reader.read();
      if (signal?.aborted) throw createAbortError();
      if (done) break;
      emitDataLines(decoder.push(value), onChunk);
    }

    emitDataLines(decoder.finish(), onChunk);
  } catch (error) {
    if (onError) onError(toError(error));
    else throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

function emitDataLines(
  dataLines: string[],
  onChunk: (chunk: string) => void
): void {
  for (const data of dataLines) {
    if (data !== "[DONE]") onChunk(data);
  }
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
