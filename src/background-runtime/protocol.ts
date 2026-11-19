/** Request and lifecycle types used by the Electron utility-process runtime. */
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

export type BackgroundJsRuntimeStatus = {
  available: boolean;
  ready: boolean;
  generation: number;
  runtimeVersion?: string;
  lastHeartbeatAt?: number;
};
