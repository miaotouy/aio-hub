import { normalizeCanonicalModelId } from "./canonical-id";
import type {
  EmbeddingSpaceDescriptorV1,
  EmbeddingSpaceInput,
  ModelRouteRef,
} from "./types";

export function buildEmbeddingSpaceDescriptor(
  input: EmbeddingSpaceInput
): EmbeddingSpaceDescriptorV1 {
  const canonicalId = normalizeCanonicalModelId(input.modelIdentity.canonicalId);
  if (!canonicalId) throw new Error("Embedding space 的 canonical model ID 非法");
  if (!Number.isInteger(input.dimensions) || input.dimensions <= 0) {
    throw new Error("Embedding space 的 dimensions 必须为正整数");
  }
  const adapterContractVersion = input.adapterContractVersion ?? 1;
  if (!Number.isInteger(adapterContractVersion) || adapterContractVersion <= 0) {
    throw new Error("adapterContractVersion 必须为正整数");
  }
  const revision = input.modelIdentity.revision?.trim();
  return {
    schemaVersion: 1,
    model: {
      canonicalId,
      ...(revision ? { revision } : {}),
    },
    dimensions: input.dimensions,
    ...(input.queryTaskType ? { queryTaskType: input.queryTaskType } : {}),
    ...(input.documentTaskType
      ? { documentTaskType: input.documentTaskType }
      : {}),
    encodingFormat: input.encodingFormat ?? "float",
    similarity: "cosine",
    adapterContractVersion,
  };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function getEmbeddingSpaceId(
  descriptor: EmbeddingSpaceDescriptorV1
): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(descriptor));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `emb:v1:${hash}`;
}

export async function getLegacyRouteCanonicalId(
  route: ModelRouteRef
): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(route));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `legacy-route/${hash}`;
}
