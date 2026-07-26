import { describe, expect, it } from "vitest";
import type {
  PipelineContext,
  ProcessableMessage,
} from "@/tools/llm-chat/types";
import { userProfileInjector } from "../user-profile-injector";

const history: ProcessableMessage[] = [
  {
    role: "user",
    content: "What should I do today?",
    sourceType: "session_history",
    sourceId: "message-1",
  },
];

function createContext(
  userProfile: PipelineContext["userProfile"]
): PipelineContext {
  return {
    messages: structuredClone(history),
    session: {} as PipelineContext["session"],
    agentConfig: null,
    userProfile,
    settings: {} as PipelineContext["settings"],
    timestamp: Date.now(),
    sharedData: new Map(),
    logs: [],
  };
}

describe("userProfileInjector", () => {
  it("places an enabled profile system context before chat history", async () => {
    const context = createContext({
      id: "profile-1",
      name: "Ada & Bob",
      content: "I enjoy practical answers.",
      enabled: true,
      createdAt: "2026-07-26T10:00:00.000Z",
    });

    await userProfileInjector.execute(context);

    expect(context.messages).toEqual([
      {
        role: "system",
        content: [
          '<user_profile name="Ada &amp; Bob">',
          "I enjoy practical answers.",
          "</user_profile>",
        ].join("\n"),
        sourceType: "unknown",
        sourceId: "user-profile:profile-1",
      },
      ...history,
    ]);
  });

  for (const { profile, label } of [
    { profile: null, label: "no profile" },
    {
      profile: {
        id: "profile-1",
        name: "Disabled",
        content: "This should not be sent.",
        enabled: false,
        createdAt: "2026-07-26T10:00:00.000Z",
      },
      label: "disabled profile",
    },
    {
      profile: {
        id: "profile-1",
        name: "Empty",
        content: "   ",
        enabled: true,
        createdAt: "2026-07-26T10:00:00.000Z",
      },
      label: "empty profile content",
    },
  ]) {
    it(`keeps history unchanged for ${label}`, async () => {
      const context = createContext(profile);

      await userProfileInjector.execute(context);

      expect(context.messages).toEqual(history);
    });
  }
});
