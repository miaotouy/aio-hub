export const BACKGROUND_JS_RUNTIME_WINDOW_LABEL = "background-js" as const;

export const BACKGROUND_JS_RUNTIME_EVENTS = {
  ready: "background-js:ready",
  request: "background-js:request",
  response: "background-js:response",
} as const;

export type BackgroundJsRuntimeReadyPayload = {
  runtimeVersion: string;
  generation: number;
};

export type BackgroundJsRuntimeRequest = {
  id: string;
  method: string;
  payload: unknown;
};

export type BackgroundJsRuntimeResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
};
