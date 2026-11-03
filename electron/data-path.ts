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

import path from "node:path";

/** Portable launchers extract the runtime to a temporary directory. Keep data next to the original executable. */
export function resolveUserDataPath(options: {
  packaged: boolean;
  dataDirectory?: string;
  portableDirectory?: string;
}): string | undefined {
  if (options.dataDirectory) return path.resolve(options.dataDirectory);
  if (options.packaged && options.portableDirectory)
    return path.resolve(options.portableDirectory, "data");
  return undefined;
}
