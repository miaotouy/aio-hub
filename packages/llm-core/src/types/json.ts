export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface LocalFileRef {
  kind: "local-file-ref";
  path: string;
  contentType?: string;
}

export type WireJsonValue =
  | JsonPrimitive
  | LocalFileRef
  | WireJsonValue[]
  | { [key: string]: WireJsonValue };
