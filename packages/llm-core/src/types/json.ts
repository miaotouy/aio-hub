export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface LocalFileRef {
  kind: "local-file-ref";
  path: string;
  contentType?: string;
}

export interface ManagedAssetFileRef {
  kind: "managed-asset-ref";
  assetId: string;
}

export type WireFileRef = LocalFileRef | ManagedAssetFileRef;

export type WireJsonValue =
  | JsonPrimitive
  | WireFileRef
  | WireJsonValue[]
  | { [key: string]: WireJsonValue };
