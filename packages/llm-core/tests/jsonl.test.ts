import { describe, expect, it } from "vitest";
import { JsonLineDecoder, JsonlDecoder } from "../src";

const encoder = new TextEncoder();

describe("JSONL decoders", () => {
  it("frames CRLF, LF, glued records, UTF-8 splits, and a final unterminated line", () => {
    const source = '{"text":"你"}\r\n{"text":"好"}\n{"done":true}';
    const bytes = encoder.encode(source);
    const decoder = new JsonLineDecoder();
    const lines = Array.from(bytes, (byte) => Uint8Array.of(byte)).flatMap(
      (chunk) => decoder.push(chunk)
    );

    lines.push(...decoder.finish());
    expect(lines).toEqual(['{"text":"你"}', '{"text":"好"}', '{"done":true}']);
  });

  it("parses framed records as JSON values", () => {
    const decoder = new JsonlDecoder();
    const values = decoder.push(encoder.encode('{"a":1}\n[2,3]\n'));
    values.push(...decoder.finish());

    expect(values).toEqual([{ a: 1 }, [2, 3]]);
  });

  it("surfaces malformed JSON records", () => {
    const decoder = new JsonlDecoder();
    expect(() => decoder.push(encoder.encode("{broken}\n"))).toThrow();
  });
});
