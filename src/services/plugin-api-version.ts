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

export const CURRENT_PLUGIN_API_VERSION = 3;
export const CURRENT_SIDECAR_PROTOCOL_VERSION = 3;

export interface SidecarHostContext {
  pluginApiVersion: number;
  sidecarProtocolVersion: number;
}

export function createSidecarHostContext(): SidecarHostContext {
  return {
    pluginApiVersion: CURRENT_PLUGIN_API_VERSION,
    sidecarProtocolVersion: CURRENT_SIDECAR_PROTOCOL_VERSION,
  };
}

export function isPluginApiVersionSupported(required?: number): boolean {
  return required === undefined || required <= CURRENT_PLUGIN_API_VERSION;
}

export function requiresStrictPluginCompatibility(required?: number): boolean {
  return (required ?? 0) >= 3;
}
