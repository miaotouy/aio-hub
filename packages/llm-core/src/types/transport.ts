import type { LocalFileRef, WireJsonValue } from "./json";

export type WireMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type MultipartPartBody =
  | { kind: "text"; value: string }
  | { kind: "bytes"; value: Uint8Array }
  | { kind: "file-ref"; ref: LocalFileRef };

export interface MultipartPart {
  name: string;
  body: MultipartPartBody;
  filename?: string;
  contentType?: string;
  headers?: Record<string, string>;
}

export type WireBody =
  | { kind: "json"; value: WireJsonValue }
  | { kind: "text"; value: string; contentType?: string }
  | { kind: "bytes"; value: Uint8Array; contentType: string }
  | { kind: "multipart"; parts: MultipartPart[] }
  | { kind: "file-ref"; ref: LocalFileRef };

export interface WireRequest {
  method: WireMethod;
  url: string;
  headers: Record<string, string>;
  body?: WireBody;
  streaming: boolean;
}

export interface NetworkOptions {
  strategy?: "auto" | "proxy" | "native";
  proxyUrl?: string;
  relaxInvalidCerts?: boolean;
  http1Only?: boolean;
}

export interface TransportRequestEvent {
  requestId: string;
  request: WireRequest;
  startedAt: number;
}

export interface TransportResponseStartEvent {
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  startedAt: number;
}

export interface TransportChunkEvent {
  requestId: string;
  chunk: Uint8Array;
  receivedAt: number;
}

export interface TransportErrorEvent {
  requestId: string;
  error: unknown;
  occurredAt: number;
}

export interface TransportObserver {
  onRequest?(event: TransportRequestEvent): void;
  onResponseStart?(event: TransportResponseStartEvent): void;
  onResponseChunk?(event: TransportChunkEvent): void;
  onError?(event: TransportErrorEvent): void;
}

export interface TransportOptions {
  requestId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  network?: NetworkOptions;
  observer?: TransportObserver;
}

export interface WireResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
}

export interface LlmTransport {
  send(request: WireRequest, options: TransportOptions): Promise<WireResponse>;
}
