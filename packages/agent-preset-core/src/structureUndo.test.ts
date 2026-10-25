import { describe, expect, it } from "vitest";
import {
  undoPresetStructureEdit,
  type PresetComposition,
  type PresetChoicePart,
} from "./index";
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const fixture = (): PresetComposition => ({
  version: 1,
  separator: "",
  parts: [
    { id: "body", kind: "text", name: "Body", content: "original" },
    {
      id: "group",
      kind: "choice",
      name: "Group",
      selectedOptionId: "a",
      options: [
        { id: "a", name: "A", content: "first" },
        { id: "b", name: "B", content: "second" },
      ],
    },
  ],
});
// Public undo outputs protect authored text, including unselected options and restored deletions.
// Pure inputs/outputs keep failures localized and remain stable across editor refactoring.
describe("structural undo", () => {
  it("restores selection/order/separator and retains latest names and every option body", () => {
    const before = fixture();
    const after = copy(before);
    after.separator = "\n";
    const group = after.parts[1] as PresetChoicePart;
    group.selectedOptionId = "b";
    group.options.reverse();
    after.parts.reverse();
    const current = copy(after);
    const latest = current.parts[0] as PresetChoicePart;
    latest.name = "Renamed group";
    latest.options.forEach((option) => {
      option.name = "Edited " + option.id;
      option.content = "New " + option.id;
    });
    current.parts[1].name = "";
    if (current.parts[1].kind === "text") current.parts[1].content = "";
    const savedInputs = copy({ before, after, current });
    const result = undoPresetStructureEdit(current, { before, after });
    expect(result).toEqual({
      ...before,
      parts: [
        { ...before.parts[0], name: "", content: "" },
        {
          ...before.parts[1],
          name: "Renamed group",
          options: [
            { id: "a", name: "Edited a", content: "New a" },
            { id: "b", name: "Edited b", content: "New b" },
          ],
        },
      ],
    });
    expect({ before, after, current }).toEqual(savedInputs);
  });

  it("restores deleted options/parts with their last text across successive undos", () => {
    const before = fixture();
    (before.parts[1] as PresetChoicePart).options[0].content =
      "typed before deletion";
    const after = copy(before);
    (after.parts[1] as PresetChoicePart).options.shift();
    (after.parts[1] as PresetChoicePart).selectedOptionId = "b";
    const beforePartDeletion = copy(after);
    (beforePartDeletion.parts[1] as PresetChoicePart).options[0].content =
      "latest surviving body";
    const afterPartDeletion = { ...copy(beforePartDeletion), parts: [] };
    const restoredPart = undoPresetStructureEdit(afterPartDeletion, {
      before: beforePartDeletion,
      after: afterPartDeletion,
    });
    const restoredOption = undoPresetStructureEdit(restoredPart, {
      before,
      after,
    });
    expect((restoredOption.parts[1] as PresetChoicePart).options).toEqual([
      { id: "a", name: "A", content: "typed before deletion" },
      { id: "b", name: "B", content: "latest surviving body" },
    ]);
    expect((restoredOption.parts[1] as PresetChoicePart).selectedOptionId).toBe(
      "a"
    );
  });

  it("keeps edits to the original body when undoing text-to-choice conversion", () => {
    const before = fixture();
    const after = copy(before);
    after.parts[0] = {
      id: "body",
      kind: "choice",
      selectedOptionId: "original-option",
      options: [{ id: "original-option", content: "original" }],
    };
    const current = copy(after);
    const group = current.parts[0] as PresetChoicePart;
    group.name = "Renamed body";
    group.options[0].content = "edited after conversion";
    const result = undoPresetStructureEdit(current, { before, after });
    expect(result.parts[0]).toEqual({
      id: "body",
      kind: "text",
      name: "Renamed body",
      content: "edited after conversion",
    });
  });
});
