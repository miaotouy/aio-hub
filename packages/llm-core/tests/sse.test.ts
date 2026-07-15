import { describe, expect, it } from "vitest";
import { SseDecoder, parseSSEStream, type SseEvent } from "../src";

const encoder = new TextEncoder();
const fixture = [
  "id: 7\r\n",
  "event: message\r\n",
  'data: {"delta":"你"}\r\n\r\n',
  'data: {"delta":"好"}\n\n',
  "data: [DONE]",
].join("");

function decode(chunks: Uint8Array[]): SseEvent[] {
  const decoder = new SseDecoder();
  return chunks
    .flatMap((chunk) => decoder.push(chunk))
    .concat(decoder.finish());
}

describe("SseDecoder", () => {
  it("produces identical events for whole, byte-wise, and UTF-8-split chunks", () => {
    const bytes = encoder.encode(fixture);
    const expected = [
      { event: "message", id: "7", data: '{"delta":"你"}' },
      { id: "7", data: '{"delta":"好"}' },
      { id: "7", data: "[DONE]" },
    ];

    expect(decode([bytes])).toEqual(expected);
    expect(decode(Array.from(bytes, (byte) => Uint8Array.of(byte)))).toEqual(
      expected
    );

    const utf8Boundary = fixture.indexOf("你");
    const prefixLength = encoder.encode(fixture.slice(0, utf8Boundary)).length;
    expect(
      decode([
        bytes.slice(0, prefixLength + 1),
        bytes.slice(prefixLength + 1, prefixLength + 2),
        bytes.slice(prefixLength + 2),
      ])
    ).toEqual(expected);
  });

  it("joins multiple data fields and handles comments and field metadata", () => {
    const events = decode([
      encoder.encode(
        ": keepalive\nid: abc\nretry: 1500\ndata: first\ndata: second\n\n"
      ),
    ]);

    expect(events).toEqual([{ id: "abc", retry: 1500, data: "first\nsecond" }]);
  });

  it("flushes an event without a trailing newline", () => {
    expect(decode([encoder.encode("data: tail")])).toEqual([{ data: "tail" }]);
  });

  it("rejects pushes after finish", () => {
    const decoder = new SseDecoder();
    decoder.finish();
    expect(() => decoder.push(encoder.encode("data: late"))).toThrow(
      "Cannot push data after the decoder has finished"
    );
  });
});

describe("parseSSEStream compatibility facade", () => {
  it("emits event data while filtering the done sentinel", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(fixture));
        controller.close();
      },
    });
    const chunks: string[] = [];

    await parseSSEStream(stream.getReader(), (chunk) => chunks.push(chunk));

    expect(chunks).toEqual(['{"delta":"你"}', '{"delta":"好"}']);
  });

  it("preserves line-by-line delivery for streams without blank separators", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: first\ndata: second\n"));
        controller.close();
      },
    });
    const chunks: string[] = [];

    await parseSSEStream(stream.getReader(), (chunk) => chunks.push(chunk));

    expect(chunks).toEqual(["first", "second"]);
  });

  it("cancels an already aborted stream", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = new ReadableStream<Uint8Array>();

    await expect(
      parseSSEStream(
        stream.getReader(),
        () => undefined,
        undefined,
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
