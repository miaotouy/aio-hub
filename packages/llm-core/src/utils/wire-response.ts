import type { WireResponse } from "../types/transport";

export async function readWireResponseBytes(
  response: WireResponse
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of response.body) {
    chunks.push(chunk);
    length += chunk.length;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function readWireResponseJson(
  response: WireResponse
): Promise<unknown> {
  const text = new TextDecoder().decode(await readWireResponseBytes(response));
  return text ? JSON.parse(text) : {};
}
