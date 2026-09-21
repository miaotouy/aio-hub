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

export type SystemOneQuestion =
  SystemOneNoulQuestion | SystemOneChoiceQuestion | SystemOneScoreQuestion;

export interface SystemOneRequest {
  model: string;
  state: SystemOneContent;
  questions: Record<string, SystemOneQuestion>;
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

export type SystemOneAnswer =
  SystemOneNoulAnswer | SystemOneChoiceAnswer | SystemOneScoreAnswer;

export interface SystemOneResponse {
  model: string;
  answers: Record<string, SystemOneAnswer>;
  usage: {
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
