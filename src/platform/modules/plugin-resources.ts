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

import { getElectronBridge, request } from "../electron/client";
import { convertFileSrc } from "../native/core";

/** Module-relative imports and CSS URLs retain the installed plugin's resource scope. */
export async function getPluginResourceUrl(
  pluginPath: string,
  resourcePath: string
): Promise<string> {
  if (getElectronBridge())
    return request<string>("plugin.resourceUrl", { pluginPath, resourcePath });
  return convertFileSrc(resourcePath.replace(/\\/g, "/")).replace(/%2F/g, "/");
}
