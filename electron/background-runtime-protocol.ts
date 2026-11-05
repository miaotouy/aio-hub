// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {
  BackgroundJsRuntimeRequest,
  BackgroundJsRuntimeResponse,
} from "../src/background-runtime/protocol";

import type {
  HostServiceRequest,
  HostServiceResponse,
} from "./background-host-protocol";

export const BACKGROUND_RUNTIME_VERSION = "0.4.0-node";
export const BACKGROUND_HEARTBEAT_INTERVAL_MS = 5_000;
export type BackgroundWorkerMessage =
  | { type: "ready"; runtimeVersion: string }
  | { type: "heartbeat" }
  | { type: "response"; response: BackgroundJsRuntimeResponse }
  | HostServiceRequest;
export type BackgroundHostMessage =
  | HostServiceResponse
  | { type: "shutdown" }
  | {
      type: "request";
      request: BackgroundJsRuntimeRequest;
    };
