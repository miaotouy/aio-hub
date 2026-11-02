import { describe, expect, it } from "vitest";
import { parsePromptFile, type SillyTavernPrompt } from "../sillyTavernParser";

function parse(prompt: Partial<SillyTavernPrompt>, beforeHistory = false) {
  return parsePromptFile({
    prompts: [
      { identifier: "p", name: "Prompt", content: "Instructions", ...prompt },
    ],
    prompt_order: [
      {
        character_id: 1,
        order: [
          ...(beforeHistory ? [{ identifier: "p", enabled: true }] : []),
          { identifier: "chatHistory", enabled: true },
          ...(!beforeHistory ? [{ identifier: "p", enabled: true }] : []),
        ],
      },
    ],
  });
}

describe("PromptManager position import", () => {
  it.each([true, false])(
    "honors absolute depth zero and custom order beforeHistory=%s",
    (beforeHistory) => {
      const parsed = parse(
        { injection_position: 1, injection_depth: 0, injection_order: 37 },
        beforeHistory
      );
      expect(
        [...parsed.systemPrompts, ...parsed.injectionPrompts][0]
          .injectionStrategy
      ).toEqual({ type: "depth", depth: 0, order: 37 });
    }
  );
  it("uses the upstream default absolute depth and our default order", () => {
    expect(
      parse({ injection_position: 1 }).injectionPrompts[0].injectionStrategy
    ).toEqual({ type: "depth", depth: 4, order: 100 });
  });
  it.each([0, undefined, 2, 4])(
    "keeps relative and unknown positions in list order (%s)",
    (position) => {
      expect(
        parse({ injection_position: position, injection_depth: 9 })
          .injectionPrompts[0].injectionStrategy
      ).toBeUndefined();
    }
  );
});
