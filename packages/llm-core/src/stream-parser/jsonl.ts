import type { JsonValue } from "../types/json";
import { Utf8LineDecoder } from "./line-decoder";

export class JsonLineDecoder extends Utf8LineDecoder<string> {
  protected onLine(line: string): string[] {
    const trimmed = line.trim();
    return trimmed ? [trimmed] : [];
  }

  protected onFinish(): string[] {
    return [];
  }
}

export class JsonlDecoder {
  private readonly lines = new JsonLineDecoder();

  push(chunk: Uint8Array): JsonValue[] {
    return this.lines.push(chunk).map(parseJsonLine);
  }

  finish(): JsonValue[] {
    return this.lines.finish().map(parseJsonLine);
  }
}

function parseJsonLine(line: string): JsonValue {
  return JSON.parse(line) as JsonValue;
}
