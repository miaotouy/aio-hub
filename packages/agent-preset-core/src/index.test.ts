import { describe, expect, it } from "vitest";
import {
  applyPresetCompositionOperation,
  clonePresetComposition,
  compilePresetComposition,
  extractPresetChoice,
  flattenPresetMessage,
  importPresetMessage,
  materializePresetMessage,
  normalizePresetGroupState,
  suggestPresetComposition,
  validatePresetComposition,
  requiredPresetFeatures,
  type ComposablePreset,
  type PresetChoicePart,
  type PresetComposition,
} from "./index";

// Protects persisted selection identity, exact template output and atomic import validation.
// All assertions target public outputs so editor and compiler refactors retain these contracts.
const template = (): PresetComposition => ({
  version: 1,
  separator: "",
  parts: [
    { id: "prefix", kind: "text", content: "前文\n" },
    {
      id: "choice",
      kind: "choice",
      selectedOptionId: "a",
      options: [
        { id: "a", content: "{{AIOgugu}}" },
        { id: "b", content: "{{AIOgugu2}}" },
      ],
    },
    { id: "suffix", kind: "text", content: "\n后文 " },
  ],
});
describe("structured preset contract", () => {
  it("reproduces each original template while retaining the host identity and settings", () => {
    const input = {
      id: "host",
      content: "",
      role: "system",
      injectionStrategy: { type: "anchor", anchorTarget: "chat_history" },
      presetAttachments: [{ assetId: "asset" }],
      presetComposition: template(),
    };
    const before = JSON.stringify(input);
    expect(materializePresetMessage(input)).toMatchObject({
      id: "host",
      content: "前文\n{{AIOgugu}}\n后文 ",
      role: "system",
      injectionStrategy: input.injectionStrategy,
      presetAttachments: input.presetAttachments,
    });
    expect(JSON.stringify(input)).toBe(before);
    const next = applyPresetCompositionOperation(input.presetComposition, {
      type: "selectOption",
      partId: "choice",
      optionId: "b",
    });
    expect(compilePresetComposition(next).content).toBe(
      "前文\n{{AIOgugu2}}\n后文 "
    );
  });
  it("keeps selected identity across option moves, including serialization", () => {
    const moved = applyPresetCompositionOperation(template(), {
      type: "moveOption",
      partId: "choice",
      optionId: "a",
      index: 1,
    });
    const restored = importPresetMessage({
      id: "host",
      content: "",
      presetComposition: JSON.parse(JSON.stringify(moved)),
    });
    expect(
      (restored.presetComposition.parts[1] as PresetChoicePart).selectedOptionId
    ).toBe("a");
    expect(
      compilePresetComposition(restored.presetComposition).content
    ).toContain("{{AIOgugu}}");
  });
  it("preserves empty text, whitespace and separator boundaries, skipping only inactive positions", () => {
    const input: PresetComposition = {
      version: 1,
      separator: "\n",
      parts: [
        { id: "a", kind: "text", content: "" },
        { id: "b", kind: "text", content: " " },
        { id: "off", kind: "text", content: "{{tools}}", enabled: false },
        {
          id: "none",
          kind: "choice",
          selectedOptionId: null,
          options: [{ id: "x", content: "{{unused}}" }],
        },
      ],
    };
    expect(compilePresetComposition(input)).toEqual({
      content: "\n ",
      contributingParts: [{ partId: "a" }, { partId: "b" }],
    });
  });
  it("skips disabled hosts and preserves list positions while rejecting multiple active radio members", () => {
    const messages: ComposablePreset[] = [
      { id: "first", content: "x", groupId: "g" },
      { id: "anchor", content: "" },
      { id: "last", content: "y", groupId: "g" },
    ];
    expect(
      normalizePresetGroupState(messages, [
        { id: "g", enabled: false, selectionMode: "radio" },
      ]).map((message) => [message.id, message.isEnabled])
    ).toEqual([
      ["first", false],
      ["anchor", undefined],
      ["last", false],
    ]);
    expect(() =>
      normalizePresetGroupState(messages, [
        { id: "g", name: "工作模式", enabled: true, selectionMode: "radio" },
      ])
    ).toThrow("「工作模式」");
  });
  it("rejects dangling selections, duplicate identities and unknown versions without mutating data", () => {
    const input = template();
    (input.parts[1] as PresetChoicePart).selectedOptionId = "missing";
    expect(() =>
      materializePresetMessage({
        id: "host",
        content: "",
        presetComposition: input,
      })
    ).toThrow(/备选已失效/);
    const duplicate = template();
    duplicate.parts[2].id = duplicate.parts[0].id;
    expect(validatePresetComposition(duplicate).length).toBeGreaterThan(0);
    expect(() =>
      importPresetMessage({
        id: "host",
        content: "",
        presetComposition: {
          ...template(),
          version: 99,
        } as unknown as PresetComposition,
      })
    ).toThrow(/版本/);
  });
  it("converts macros in all imported alternatives and explicitly flattens only the chosen template", () => {
    const imported = importPresetMessage(
      { id: "host", content: "old cache", presetComposition: template() },
      (text) => text.split("AIOgugu").join("newMacro")
    );
    expect(imported.content).toBe("");
    expect(
      (imported.presetComposition.parts[1] as PresetChoicePart).options.map(
        (option) => option.content
      )
    ).toEqual(["{{newMacro}}", "{{newMacro2}}"]);
    expect(flattenPresetMessage(imported)).toEqual({
      id: "host",
      content: "前文\n{{newMacro}}\n后文 ",
    });
  });
  it("suggests a lossless split at whole macro boundaries and handles identical templates", () => {
    expect(suggestPresetComposition([])).toEqual({
      version: 1,
      separator: "",
      parts: [],
    });
    for (const originals of [
      ["前文{{AIOgugu}}后文", "前文{{AIOgugu2}}后文"],
      ["same", "same"],
      ["😀前{{outer({{inner_a}})}}后", "😀前{{outer({{inner_b}})}}后"],
      ["", ""],
      ["{{macro(a)}}\r\n", "{{macro(b)}}\r\n"],
    ]) {
      const result = suggestPresetComposition(originals);
      const choice = result.parts.find(
        (part): part is PresetChoicePart => part.kind === "choice"
      )!;
      choice.options.forEach((option, index) => {
        choice.selectedOptionId = option.id;
        expect(compilePresetComposition(result).content).toBe(originals[index]);
      });
    }
    const choice = suggestPresetComposition([
      "前文{{AIOgugu}}后文",
      "前文{{AIOgugu2}}后文",
    ]).parts.find((part): part is PresetChoicePart => part.kind === "choice")!;
    expect(choice.options.map((option) => option.content)).toEqual([
      "{{AIOgugu}}",
      "{{AIOgugu2}}",
    ]);
  });
  it("expands partial macro selections and preserves all original whitespace", () => {
    const original = "  前{{AIOgugu}}后\r\n";
    const result = extractPresetChoice(original, 7, 9);
    expect((result.parts[1] as PresetChoicePart).options[0].content).toBe(
      "{{AIOgugu}}"
    );
    expect(compilePresetComposition(result).content).toBe(original);
  });
  it("duplicates with fresh identities and clears only the deleted active position", () => {
    let counter = 0;
    const copy = clonePresetComposition(template(), () => `new-${++counter}`);
    expect(compilePresetComposition(copy).content).toBe(
      compilePresetComposition(template()).content
    );
    const copiedChoice = copy.parts[1] as PresetChoicePart;
    expect(copiedChoice.selectedOptionId).not.toBe("a");
    const deleted = applyPresetCompositionOperation(copy, {
      type: "removeOption",
      partId: copiedChoice.id,
      optionId: copiedChoice.selectedOptionId!,
    });
    expect(compilePresetComposition(deleted).content).toBe("前文\n\n后文 ");
    expect(compilePresetComposition(template()).content).toContain(
      "{{AIOgugu}}"
    );
  });
});

// Protects top-level participation, independent single choices and exact output order.
// Assertions target public compiler/operation results and remain stable across UI refactors.
const dimensions = (): PresetComposition => ({
  version: 1,
  separator: "\n",
  parts: [
    { id: "intro", kind: "text", content: "规则" },
    {
      id: "identity",
      name: "身份",
      kind: "choice",
      selectedOptionId: "writer",
      options: [
        { id: "writer", content: "写作者" },
        { id: "engineer", content: "工程师" },
      ],
    },
    { id: "brief", name: "风格", kind: "text", content: "简洁" },
    { id: "examples", kind: "text", content: "示例" },
    { id: "inactive", kind: "text", enabled: false, content: "未选内容" },
    {
      id: "format",
      kind: "choice",
      selectedOptionId: "markdown",
      options: [
        { id: "plain", content: "文本" },
        { id: "markdown", content: "Markdown" },
      ],
    },
  ],
});
describe("message-local composition dimensions", () => {
  it("combines enabled entries and independent single choices in list order", () => {
    const input = dimensions();
    expect(compilePresetComposition(input)).toEqual({
      content: "规则\n写作者\n简洁\n示例\nMarkdown",
      contributingParts: [
        { partId: "intro" },
        { partId: "identity", optionId: "writer" },
        { partId: "brief" },
        { partId: "examples" },
        { partId: "format", optionId: "markdown" },
      ],
    });
    const changed = applyPresetCompositionOperation(input, {
      type: "selectOption",
      partId: "identity",
      optionId: "engineer",
    });
    expect(compilePresetComposition(changed).content).toBe(
      "规则\n工程师\n简洁\n示例\nMarkdown"
    );
    const moved = applyPresetCompositionOperation(changed, {
      type: "movePart",
      partId: "examples",
      index: 2,
    });
    expect(compilePresetComposition(moved).content).toBe(
      "规则\n工程师\n示例\n简洁\nMarkdown"
    );
    expect(compilePresetComposition(input).content).toBe(
      "规则\n写作者\n简洁\n示例\nMarkdown"
    );
  });
  it("toggles entries independently and restores a single-choice selection on re-enable", () => {
    const input = dimensions();
    const off = applyPresetCompositionOperation(input, {
      type: "setPartEnabled",
      partId: "identity",
      enabled: false,
    });
    expect(compilePresetComposition(off).content).toBe(
      "规则\n简洁\n示例\nMarkdown"
    );
    expect(off.parts[1]).toMatchObject({
      selectedOptionId: "writer",
      options: input.parts[1].kind === "choice" ? input.parts[1].options : [],
    });
    const on = applyPresetCompositionOperation(off, {
      type: "setPartEnabled",
      partId: "identity",
      enabled: true,
    });
    expect(compilePresetComposition(on)).toEqual(
      compilePresetComposition(input)
    );
    const withExtra = applyPresetCompositionOperation(on, {
      type: "setPartEnabled",
      partId: "inactive",
      enabled: true,
    });
    expect(compilePresetComposition(withExtra).content).toBe(
      "规则\n写作者\n简洁\n示例\n未选内容\nMarkdown"
    );
    const withoutText = applyPresetCompositionOperation(withExtra, {
      type: "setPartEnabled",
      partId: "brief",
      enabled: false,
    });
    expect(compilePresetComposition(withoutText).content).toBe(
      "规则\n写作者\n示例\n未选内容\nMarkdown"
    );
  });
  it("round trips and clones all entries while retaining participation and remapping selections", () => {
    const host = {
      id: "host",
      content: "",
      role: "system",
      presetComposition: dimensions(),
    };
    const restored = importPresetMessage(JSON.parse(JSON.stringify(host)));
    let id = 0;
    const clone = clonePresetComposition(
      restored.presetComposition,
      () => "clone-" + ++id
    );
    expect(compilePresetComposition(clone)).toMatchObject({
      content: compilePresetComposition(host.presetComposition).content,
    });
    expect(
      clone.parts.some((item) =>
        host.presetComposition.parts.some((source) => source.id === item.id)
      )
    ).toBe(false);
    expect(clone.parts[4]).toMatchObject({
      enabled: false,
      content: "未选内容",
    });
    const choice = clone.parts[1] as PresetChoicePart;
    expect(
      choice.options.some((option) => option.id === choice.selectedOptionId)
    ).toBe(true);
    expect(clone.parts[2].name).toBe("风格");
    const plain = flattenPresetMessage(restored);
    expect(plain.content).toBe("规则\n写作者\n简洁\n示例\nMarkdown");
    expect(plain.presetComposition).toBeUndefined();
    expect(requiredPresetFeatures([host])).toEqual(["preset-composition-v1"]);
  });
  it("clears a removed single choice without affecting the other entries", () => {
    const removed = applyPresetCompositionOperation(dimensions(), {
      type: "removeOption",
      partId: "identity",
      optionId: "writer",
    });
    expect(compilePresetComposition(removed).content).toBe(
      "规则\n简洁\n示例\nMarkdown"
    );
    const selected = applyPresetCompositionOperation(removed, {
      type: "selectOption",
      partId: "identity",
      optionId: "engineer",
    });
    expect(compilePresetComposition(selected).content).toBe(
      "规则\n工程师\n简洁\n示例\nMarkdown"
    );
    const cleared = applyPresetCompositionOperation(selected, {
      type: "selectOption",
      partId: "identity",
      optionId: null,
    });
    expect(compilePresetComposition(cleared)).toEqual(
      compilePresetComposition(removed)
    );
    expect(() =>
      applyPresetCompositionOperation(dimensions(), {
        type: "selectOption",
        partId: "identity",
        optionId: "missing",
      })
    ).toThrow(/未找到备选/);
  });
});
