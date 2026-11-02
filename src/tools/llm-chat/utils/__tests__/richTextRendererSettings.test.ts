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
import { STREAM_EFFECT_OPTIONS } from "@/tools/rich-text-renderer/utils/streamEffectStyles";
import type { AgentBaseConfig } from "@/tools/agent-manager/types/agent";
import {
  buildRichTextRendererSettings,
  resolveMessageEnterAnimationEnabled,
} from "../richTextRendererSettings";

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
      vcpFuzzyModeEnabled: false,
      enableEnterAnimation: false,
      streamEffect: "stardust-vivid",
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
      vcpFuzzyModeEnabled: false,
      enableEnterAnimation: false,
      streamEffect: "stardust-vivid",
      showTokenCount: false,
    });
  });

  it("uses the default effect for older saved preferences", () => {
    expect(
      buildRichTextRendererSettings({} as ChatSettings["uiPreferences"])
        .streamEffect
    ).toBe("none");
  });

  it.each([
    { agentEffect: undefined, globalEffect: "scan", expected: "scan" },
    { agentEffect: "inherit", globalEffect: "petals", expected: "petals" },
    { agentEffect: "none", globalEffect: "scan", expected: "none" },
    { agentEffect: "inherit", globalEffect: undefined, expected: "none" },
    ...STREAM_EFFECT_OPTIONS.filter(({ value }) => value !== "none").map(
      ({ value }) => ({
        agentEffect: value,
        globalEffect: "none",
        expected: value,
      })
    ),
  ] as const)(
    "resolves agent=$agentEffect and global=$globalEffect to $expected",
    ({ agentEffect, globalEffect, expected }) => {
      expect(
        buildRichTextRendererSettings(
          { streamEffect: globalEffect } as ChatSettings["uiPreferences"],
          { streamEffect: agentEffect }
        ).streamEffect
      ).toBe(expected);
    }
  );

  it("re-resolves inherited preferences and agent switches without changing global settings", () => {
    const preferences = {
      streamEffect: "scan",
    } as ChatSettings["uiPreferences"];
    const agent: Pick<AgentBaseConfig, "streamEffect"> = {
      streamEffect: "petals",
    };
    expect(buildRichTextRendererSettings(preferences, agent).streamEffect).toBe(
      "petals"
    );
    expect(preferences.streamEffect).toBe("scan");
    agent.streamEffect = "inherit";
    expect(buildRichTextRendererSettings(preferences, agent).streamEffect).toBe(
      "scan"
    );
    preferences.streamEffect = "ink";
    expect(buildRichTextRendererSettings(preferences, agent).streamEffect).toBe(
      "ink"
    );
    expect(
      buildRichTextRendererSettings(preferences, { streamEffect: "none" })
        .streamEffect
    ).toBe("none");
  });

  it.each([
    "inherit",
    ...STREAM_EFFECT_OPTIONS.map(({ value }) => value),
  ] as const)("disables agent effect %s for screenshots", (streamEffect) => {
    expect(
      buildRichTextRendererSettings(
        { streamEffect: "scan" } as ChatSettings["uiPreferences"],
        { streamEffect, screenshotMode: true }
      ).streamEffect
    ).toBe("none");
  });

  it("keeps enter animation enabled for live rendering and disables it for screenshots", () => {
    expect(resolveMessageEnterAnimationEnabled(true, false)).toBe(true);
    expect(resolveMessageEnterAnimationEnabled(true, true)).toBe(false);
    expect(resolveMessageEnterAnimationEnabled(false, false)).toBe(false);
  });
});
