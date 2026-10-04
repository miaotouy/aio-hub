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

import { releaseNotesRegistry } from "../releaseNotesRegistry";
import { releaseNoteV070Alpha1 } from "./v0.7.0-alpha.1";
import { releaseNoteV070Alpha2 } from "./v0.7.0-alpha.2";
import { releaseNoteV070Alpha3 } from "./v0.7.0-alpha.3";
import { releaseNoteV070Alpha4 } from "./v0.7.0-alpha.4";
import { releaseNoteV070Alpha5 } from "./v0.7.0-alpha.5";
import { releaseNoteV070Alpha6 } from "./v0.7.0-alpha.6";

export function registerBuiltInReleaseNotes(): void {
  for (const manifest of [
    releaseNoteV070Alpha1,
    releaseNoteV070Alpha2,
    releaseNoteV070Alpha3,
    releaseNoteV070Alpha4,
    releaseNoteV070Alpha5,
    releaseNoteV070Alpha6,
  ]) {
    if (!releaseNotesRegistry.get(manifest.version)) {
      releaseNotesRegistry.register(manifest);
    }
  }
}
