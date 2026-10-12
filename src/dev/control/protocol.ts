/** Shared wire contract for the local development controller. */
export const DEV_CONTROL_PROTOCOL_VERSION = 1;

export interface DevControlIdentity {
  protocolVersion: number;
  instanceId: string;
  startupId: string;
  windowLabel: string;
  pid: number;
}

export interface DevControlDescription extends DevControlIdentity {
  route: string;
  ready: boolean;
  bridgeAvailable?: boolean;
}

export interface DevControlBridge {
  describe(): DevControlDescription;
  navigate(path: string, timeoutMs: number): Promise<void>;
  readState(scope: string): Promise<unknown>;
  runAction(name: string, args: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    __AIO_DEV_CONTROL__?: DevControlBridge;
  }
}

export interface ControlTarget {
  testid?: string;
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  css?: string;
  exact?: boolean;
  scope?: string;
}

export type ControlStep =
  | { op: "navigate"; path: string }
  | { op: "inspect"; target?: ControlTarget; limit?: number }
  | {
      op: "observe";
      target?: ControlTarget;
      limit?: number;
      screenshot?: boolean;
    }
  | { op: "screenshot"; target?: ControlTarget; mask?: string[] }
  | { op: "click"; target: ControlTarget }
  | { op: "fill"; target: ControlTarget; text: string }
  | { op: "press"; target?: ControlTarget; key: string }
  | { op: "select"; target: ControlTarget; value: string | string[] }
  | { op: "scroll"; target?: ControlTarget; deltaX?: number; deltaY?: number }
  | {
      op: "wait";
      target?: ControlTarget;
      route?: string;
      state?: "visible" | "hidden" | "attached" | "detached";
    }
  | { op: "state"; scope: string }
  | { op: "action"; name: string; args?: unknown }
  | { op: "eval"; expression: string };

export interface ControlRequest {
  instance?: string;
  window?: string;
  timeoutMs?: number;
  steps: ControlStep[];
}

export interface StepResult {
  index: number;
  op: ControlStep["op"];
  mode: "ui" | "appAction" | "eval";
  result?: unknown;
}
