import type { JsonValue } from "./json";
import type { ProviderProfile } from "./provider";
import type { WireRequest, WireResponse } from "./transport";

/** JSON-compatible content understood by System One models. */
export type SystemOneContent = JsonValue;

export interface SystemOneNoulQuestion {
  type: "noul";
  instructions: SystemOneContent;
  criteria?: {
    true?: SystemOneContent;
    false?: SystemOneContent;
  };
}

export interface SystemOneChoiceQuestion {
  type: "choice";
  instructions: SystemOneContent;
  criteria: Record<string, SystemOneContent>;
}

export interface SystemOneScoreQuestion {
  type: "score";
  instructions: SystemOneContent;
  criteria: SystemOneContent[];
}

export interface SystemOneBoxQuestion {
  type: "box";
  instructions: SystemOneContent;
}

/** Inline PNG/JPEG asset; content strings refer to its key in assets. */
export interface SystemOneImageAsset {
  type?: "image";
  format: "png" | "jpg" | "jpeg";
  /** Standard padded base64, without a data URL prefix. */
  data_base64: string;
}

export type SystemOneQuestion =
  | SystemOneNoulQuestion
  | SystemOneChoiceQuestion
  | SystemOneScoreQuestion
  | SystemOneBoxQuestion;

export interface SystemOneRequest {
  model: string;
  state: SystemOneContent;
  questions: Record<string, SystemOneQuestion>;
  assets?: Record<string, SystemOneImageAsset>;
  /** Opt in to the experimental 262K per-request/per-question context. */
  longContext?: boolean;
  requestId?: string;
  extensions?: Record<string, JsonValue>;
}

export interface SystemOneNoulAnswer {
  type: "noul";
  noul: number;
}

export interface SystemOneChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface SystemOneScoreAnswer {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface SystemOneBoxAnswer {
  type: "box";
  /** Normalized edges measured from the image's top-left corner. */
  box: { top: number; bottom: number; left: number; right: number };
  confidence: number;
}

export type SystemOneAnswer =
  | SystemOneNoulAnswer
  | SystemOneChoiceAnswer
  | SystemOneScoreAnswer
  | SystemOneBoxAnswer;

export interface SystemOneResponse {
  id?: string;
  provider?: string;
  model: string;
  answers: Record<string, SystemOneAnswer>;
  usage: {
    /** Actual provider-reported request cost, when available. */
    cost?: number;
    inputTokens: number;
    outputTokens: number;
  };
}

export interface SystemOneProviderAdapter {
  readonly id: string;
  buildRequest(
    profile: ProviderProfile,
    request: SystemOneRequest
  ): WireRequest;
  parseResponse(
    response: WireResponse,
    request: SystemOneRequest
  ): Promise<SystemOneResponse>;
}
