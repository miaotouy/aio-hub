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

import { describe, expect, it } from "vitest";
import type { ChatSettings } from "../../types/settings";
import { buildRichTextRendererSettings } from "../richTextRendererSettings";

describe("buildRichTextRendererSettings", () => {
  it("maps every llm-chat renderer preference to the renderer prop name", () => {
    const preferences = {
      rendererVersion: "test-renderer-version",
      defaultRenderHtml: true,
      seamlessMode: true,
      defaultCodeBlockExpanded: true,
      defaultToolCallCollapsed: true,
      enableCdnLocalizer: false,
      allowExternalScripts: true,
      allowDangerousHtml: true,
      rendererThrottleMs: 144,
      smoothingEnabled: false,
      throttleEnabled: false,
      safetyGuardEnabled: false,
      enableEnterAnimation: false,
      showTokenCountForBlocks: false,
    } as unknown as ChatSettings["uiPreferences"];

    expect(buildRichTextRendererSettings(preferences)).toEqual({
      version: preferences.rendererVersion,
      defaultRenderHtml: true,
      seamlessMode: true,
      defaultCodeBlockExpanded: true,
      defaultToolCallCollapsed: true,
      enableCdnLocalizer: false,
      allowExternalScripts: true,
      allowDangerousHtml: true,
      throttleMs: 144,
      smoothingEnabled: false,
      throttleEnabled: false,
      safetyGuardEnabled: false,
      enableEnterAnimation: false,
      showTokenCount: false,
    });
  });
});
