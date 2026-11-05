// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ContextFilePolicy } from "./context-file-policy";
import type { LlmProfilesSnapshot } from "../src/llm-apis/configuration/profiles";
import type {
  KeyCommand,
  KeyCommandReply,
} from "../src/llm-apis/configuration/keyProtocol";

/** Internal utility-process capabilities. Never accept these through page RPC. */
export type ExecutionKeyCommand = Extract<
  KeyCommand,
  { method: "pick" | "sync" | "success" | "failure" }
>;
export interface BackgroundHostServices {
  "host.initialize": {
    params: undefined;
    result: { root: string; runtimeRoot: string };
  };
  "context.files.policy": { params: undefined; result: ContextFilePolicy };
  "context.assets.root": { params: undefined; result: string };
  "llm.proxy.resolve": { params: { url: string }; result: string };
  "llm.configuration.load": { params: undefined; result: LlmProfilesSnapshot };
  "llm.keys.execute": {
    params: ExecutionKeyCommand;
    result: Pick<KeyCommandReply, "key" | "unavailable">;
  };
}
export type HostServiceMethod = keyof BackgroundHostServices;
export type HostServiceRequest = {
  [M in HostServiceMethod]: {
    type: "host-request";
    id: number;
    method: M;
    params: BackgroundHostServices[M]["params"];
  };
}[HostServiceMethod];
export type HostServiceResponse = {
  type: "host-response";
  id: number;
} & (
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } }
);
export type HostServiceHandler = (
  request: HostServiceRequest
) => Promise<unknown>;
