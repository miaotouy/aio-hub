import { describe, expect, it } from "vitest";
import {
  createLlmProfileBundle,
  parseLlmProfileBundle,
} from "@/utils/llm-profile-transfer";
import { remapVirtualChannelReferences } from "@/utils/llm-virtual-profile";
import type { LlmProfile } from "@/types/llm-profiles";
const profile: LlmProfile = {
  id: "virtual",
  name: "组合",
  type: "virtual",
  enabled: true,
  baseUrl: "",
  apiKeys: [],
  virtualChannel: {
    mode: "failover",
    members: ["primary", "missing"],
    maxAttempts: 2,
    totalTimeoutMs: 1000,
  },
  models: [
    {
      id: "logical",
      name: "通用",
      virtualBindings: {
        chat: [
          { profileId: "primary", modelId: "model" },
          { profileId: "missing", modelId: "lost" },
        ],
      },
    },
  ],
};
describe("virtual channel transfer", () => {
  it("round trips logical mappings and dangling references through a redacted bundle", () => {
    const parsed = parseLlmProfileBundle(createLlmProfileBundle([profile]));
    expect(parsed).toMatchObject({ bundle: { profiles: [profile] } });
  });
  it("remaps imported member identities while preserving unresolved references and model IDs", () => {
    const imported = remapVirtualChannelReferences(
      profile,
      new Map([["primary", "new-primary"]])
    );
    expect(imported.virtualChannel?.members).toEqual([
      "new-primary",
      "missing",
    ]);
    expect(imported.models[0].virtualBindings?.chat).toEqual([
      { profileId: "new-primary", modelId: "model" },
      { profileId: "missing", modelId: "lost" },
    ]);
    expect(profile.virtualChannel?.members).toEqual(["primary", "missing"]);
  });
});
