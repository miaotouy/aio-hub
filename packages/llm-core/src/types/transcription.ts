import type { JsonValue } from "./json";
import type { MediaInput } from "./media";
import type { ProviderProfile } from "./provider";
import type { WireRequest, WireResponse } from "./transport";

/**
 * Speech-to-text (STT) request for OpenAI-style `/v1/audio/transcriptions`
 * endpoints (Whisper convention, e.g. audio.cpp server).
 */
export interface TranscriptionRequest {
  model: string;
  /** The audio payload; rendered as the multipart `file` part. */
  audio: MediaInput;
  /** Input language hint. */
  language?: string;
  /** Guiding prompt sent to the STT model. */
  prompt?: string;
  /** Sampling temperature. */
  temperature?: number;
  /** Response format (`text`, `json`, `verbose_json`, `srt`, `vtt`). */
  responseFormat?: string;
  extensions?: Record<string, JsonValue>;
}

export interface TranscriptionSegment {
  id?: number;
  start?: number;
  end?: number;
  text: string;
  [key: string]: JsonValue | undefined;
}

export interface TranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
  raw?: unknown;
}

export interface TranscriptionProviderAdapter {
  readonly id: string;
  buildRequest(
    profile: ProviderProfile,
    request: TranscriptionRequest
  ): WireRequest;
  parseResponse(
    response: WireResponse,
    request: TranscriptionRequest
  ): Promise<TranscriptionResponse>;
}
