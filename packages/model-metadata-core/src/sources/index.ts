export * from "./types";
export * from "./models-dev";
export * from "./litellm";

import { litellmAdapter } from "./litellm";
import { modelsDevAdapter } from "./models-dev";
import type { MetadataSourceAdapter } from "./types";

export const BUILTIN_METADATA_SOURCE_ADAPTERS: MetadataSourceAdapter[] = [
  modelsDevAdapter,
  litellmAdapter,
];

export function getMetadataSourceAdapter(
  sourceId: string
): MetadataSourceAdapter | undefined {
  return BUILTIN_METADATA_SOURCE_ADAPTERS.find(
    (adapter) => adapter.definition.id === sourceId
  );
}
