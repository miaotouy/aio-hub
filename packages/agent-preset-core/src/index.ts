/** Structured preset bodies shared by desktop and mobile. Ordinals are UI-only. */
export interface PresetPartBase {
  id: string;
  /** Optional author-facing name for a composition dimension. */
  name?: string;
  enabled?: boolean;
}
export interface PresetChoicePart extends PresetPartBase {
  kind: "choice";
  selectedOptionId: string | null;
  options: Array<{ id: string; name?: string; content: string }>;
}
export type PresetPart = PresetChoicePart;
export interface PresetComposition {
  version: 1;
  separator: string;
  parts: PresetPart[];
}
/** Create a fragment with one active version; authors can add versions at any time. */
export function createPresetPart(
  content = "",
  newId: () => string = () => crypto.randomUUID()
): PresetPart {
  const id = newId();
  const optionId = newId();
  return {
    id,
    kind: "choice",
    selectedOptionId: optionId,
    options: [{ id: optionId, content }],
  };
}
export interface PresetContribution {
  partId: string;
  optionId?: string;
}
export interface PresetDiagnostic {
  path: string;
  message: string;
}
export class PresetConfigurationError extends Error {}
export class PresetCompositionError extends PresetConfigurationError {
  constructor(public diagnostics: PresetDiagnostic[]) {
    super(
      diagnostics.map((item) => `${item.path}：${item.message}`).join("；")
    );
    this.name = "PresetCompositionError";
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function validatePresetComposition(value: unknown): PresetDiagnostic[] {
  const issues: PresetDiagnostic[] = [];
  const fail = (path: string, message: string) =>
    issues.push({ path, message });
  if (!record(value)) return [{ path: "正文结构", message: "需要一个对象" }];
  if (value.version !== 1) fail("正文结构", "暂不支持此版本");
  if (typeof value.separator !== "string") fail("连接方式", "需要文本");
  if (!Array.isArray(value.parts))
    return [...issues, { path: "片段", message: "需要片段列表" }];
  const ids = new Set<string>();
  value.parts.forEach((part, index) => {
    const path = `片段 ${index + 1}`;
    if (!record(part)) {
      fail(path, "需要一个片段对象");
      return;
    }
    if (typeof part.id !== "string" || !part.id || ids.has(part.id))
      fail(path, "片段标识为空或重复");
    else ids.add(part.id);
    if (part.name !== undefined && typeof part.name !== "string")
      fail(path, "名称需要文本");
    if (part.enabled !== undefined && typeof part.enabled !== "boolean")
      fail(path, "启停状态无效");
    if (part.kind === "choice") {
      if (!Array.isArray(part.options)) {
        fail(path, "需要版本列表");
        return;
      }
      const optionIds = new Set<string>();
      part.options.forEach((option, optionIndex) => {
        const optionPath = `${path} / 版本 ${optionIndex + 1}`;
        if (!record(option)) {
          fail(optionPath, "版本无效");
          return;
        }
        if (
          typeof option.id !== "string" ||
          !option.id ||
          optionIds.has(option.id)
        )
          fail(optionPath, "版本标识为空或重复");
        else optionIds.add(option.id);
        if (option.name !== undefined && typeof option.name !== "string")
          fail(optionPath, "名称需要文本");
        if (typeof option.content !== "string")
          fail(optionPath, "正文需要文本");
      });
      if (
        part.selectedOptionId !== null &&
        (typeof part.selectedOptionId !== "string" ||
          !optionIds.has(part.selectedOptionId))
      )
        fail(path, "当前版本已失效，请重新选择");
    } else fail(path, "未知片段类型");
  });
  return issues;
}
export function assertPresetComposition(
  value: unknown
): asserts value is PresetComposition {
  const issues = validatePresetComposition(value);
  if (issues.length) throw new PresetCompositionError(issues);
}
export function selectedPresetOptions(
  part: PresetChoicePart
): PresetChoicePart["options"] {
  return part.options.filter((option) => option.id === part.selectedOptionId);
}
export function isPresetOptionSelected(
  part: PresetChoicePart,
  id: string
): boolean {
  return part.selectedOptionId === id;
}
export function setPresetOptionSelected(
  part: PresetChoicePart,
  id: string,
  selected = true
): void {
  if (!part.options.some((option) => option.id === id))
    throw new Error("未找到版本");
  if (selected) part.selectedOptionId = id;
  else if (part.selectedOptionId === id) part.selectedOptionId = null;
}
export function clearPresetSelection(part: PresetChoicePart): void {
  part.selectedOptionId = null;
}
export function presetPartContent(part: PresetPart): string {
  return selectedPresetOptions(part)[0]?.content ?? "";
}
export function requiredPresetFeatures(
  messages: readonly { presetComposition?: PresetComposition }[]
): string[] {
  const versions = new Set(
    messages.flatMap((message) =>
      message.presetComposition ? [message.presetComposition.version] : []
    )
  );
  return [...versions]
    .sort()
    .map((version) => "preset-composition-v" + version);
}
export function compilePresetComposition(composition: PresetComposition): {
  content: string;
  contributingParts: PresetContribution[];
} {
  assertPresetComposition(composition);
  const texts: string[] = [];
  const contributingParts: PresetContribution[] = [];
  for (const part of composition.parts) {
    if (part.enabled === false) continue;
    const selected = selectedPresetOptions(part);
    if (!selected.length) continue;
    texts.push(presetPartContent(part));
    contributingParts.push(
      ...selected.map((option) => ({ partId: part.id, optionId: option.id }))
    );
  }
  return { content: texts.join(composition.separator), contributingParts };
}
export interface ComposablePreset {
  id: string;
  content: string;
  isEnabled?: boolean;
  groupId?: string;
  presetComposition?: PresetComposition;
  presetContributingParts?: PresetContribution[];
}
export function materializePresetMessage<T extends ComposablePreset>(
  message: T
): T {
  if (!message.presetComposition) return message;
  const result = compilePresetComposition(message.presetComposition);
  return {
    ...message,
    content: result.content,
    presetContributingParts: result.contributingParts,
  };
}
/** Retain list positions/anchors. A malformed radio group must never inject two members. */
export function normalizePresetGroupState<T extends ComposablePreset>(
  messages: readonly T[],
  groups: readonly {
    id: string;
    name?: string;
    enabled?: boolean;
    selectionMode?: string;
  }[] = []
): T[] {
  for (const group of groups) {
    if (group.enabled === false || group.selectionMode !== "radio") continue;
    if (
      messages.filter(
        (message) => message.groupId === group.id && message.isEnabled !== false
      ).length > 1
    )
      throw new PresetConfigurationError(
        `单选消息组「${group.name || group.id}」存在多个启用项，请重新选择`
      );
  }
  return messages.map((message) =>
    groups.some(
      (group) => group.id === message.groupId && group.enabled === false
    )
      ? { ...message, isEnabled: false }
      : message
  );
}
/** Walk every original body, including inactive alternatives, for import and configuration tools. */
export function mapPresetCompositionText(
  composition: PresetComposition,
  map: (text: string, source: PresetContribution) => string
): PresetComposition {
  assertPresetComposition(composition);
  return {
    ...composition,
    parts: composition.parts.map((part) => ({
      ...part,
      options: part.options.map((option) => ({
        ...option,
        content: map(option.content, {
          partId: part.id,
          optionId: option.id,
        }),
      })),
    })),
  };
}
export function clonePresetComposition(
  composition: PresetComposition,
  newId: () => string = () => crypto.randomUUID()
): PresetComposition {
  assertPresetComposition(composition);
  return {
    ...composition,
    parts: composition.parts.map((part) => {
      const ids = new Map(part.options.map((option) => [option.id, newId()]));
      return {
        ...part,
        id: newId(),
        selectedOptionId:
          part.selectedOptionId === null
            ? null
            : ids.get(part.selectedOptionId)!,
        options: part.options.map((option) => ({
          ...option,
          id: ids.get(option.id)!,
        })),
      };
    }),
  };
}
function templateTokens(content: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < content.length;) {
    if (content.startsWith("{{", index)) {
      let end = index + 2;
      let depth = 1;
      while (end < content.length && depth) {
        if (content.startsWith("{{", end)) {
          depth++;
          end += 2;
        } else if (content.startsWith("}}", end)) {
          depth--;
          end += 2;
        } else end++;
      }
      if (!depth) {
        tokens.push(content.slice(index, end));
        index = end;
        continue;
      }
    }
    const character = String.fromCodePoint(content.codePointAt(index)!);
    tokens.push(character);
    index += character.length;
  }
  return tokens;
}
/** Whole macro tokens are indivisible so the proposed split never cuts a macro name. */
export function suggestPresetComposition(
  contents: string[],
  selectedIndex: number | null = 0,
  newId: () => string = () => crypto.randomUUID()
): PresetComposition {
  if (!contents.length) return { version: 1, separator: "", parts: [] };
  const tokens = contents.map(templateTokens);
  const shortest = Math.min(...tokens.map((items) => items.length));
  let prefix = 0;
  while (
    prefix < shortest &&
    tokens.every((items) => items[prefix] === tokens[0][prefix])
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    tokens.every(
      (items) =>
        items[items.length - 1 - suffix] ===
        tokens[0][tokens[0].length - 1 - suffix]
    )
  )
    suffix++;
  const options = tokens.map((items) => ({
    id: newId(),
    content: items.slice(prefix, items.length - suffix).join(""),
  }));
  const parts: PresetPart[] = [];
  if (prefix)
    parts.push(createPresetPart(tokens[0].slice(0, prefix).join(""), newId));
  parts.push({
    id: newId(),

    kind: "choice",
    selectedOptionId:
      selectedIndex === null ? null : (options[selectedIndex]?.id ?? null),
    options,
  });
  if (suffix)
    parts.push(
      createPresetPart(
        tokens[0].slice(tokens[0].length - suffix).join(""),
        newId
      )
    );
  return { version: 1, separator: "", parts };
}
export function extractPresetChoice(
  content: string,
  start: number,
  end: number,
  newId: () => string = () => crypto.randomUUID()
): PresetComposition {
  if (start < 0 || end <= start || end > content.length)
    throw new Error("请先选择需要提取的正文");
  let offset = 0;
  for (const token of templateTokens(content)) {
    const from = offset;
    const to = offset + token.length;
    if (token.startsWith("{{") && token.endsWith("}}")) {
      if (start > from && start < to) start = from;
      if (end > from && end < to) end = to;
    }
    offset = to;
  }
  const optionId = newId();
  return {
    version: 1,
    separator: "",
    parts: [
      createPresetPart(content.slice(0, start), newId),
      {
        id: newId(),
        kind: "choice",

        selectedOptionId: optionId,
        options: [{ id: optionId, content: content.slice(start, end) }],
      },
      createPresetPart(content.slice(end), newId),
    ],
  };
}

export function presetMessageRevision(message: ComposablePreset): string {
  const {
    metadata: _metadata,
    presetContributingParts: _parts,
    ...value
  } = message as ComposablePreset & { metadata?: unknown };
  return JSON.stringify(value);
}
export function importPresetMessage<T extends ComposablePreset>(
  message: T,
  map: (text: string) => string = (text) => text
): T {
  if (message.presetComposition !== undefined) {
    assertPresetComposition(message.presetComposition);
    return {
      ...message,
      content: "",
      presetComposition: mapPresetCompositionText(
        message.presetComposition,
        map
      ),
    };
  }
  return {
    ...message,
    content:
      typeof message.content === "string"
        ? map(message.content)
        : message.content,
  };
}
export function flattenPresetMessage<T extends ComposablePreset>(
  message: T
): T {
  const compiled = materializePresetMessage(message);
  const {
    presetComposition: _composition,
    presetContributingParts: _parts,
    ...plain
  } = compiled;
  return plain as T;
}
export type PresetCompositionOperation =
  | { type: "addPart"; part: PresetPart; index?: number }
  | { type: "removePart"; partId: string }
  | { type: "movePart"; partId: string; index?: number }
  | { type: "setContent"; partId: string; optionId?: string; content: string }
  | {
      type: "selectOption";
      partId: string;
      optionId: string | null;
      selected?: boolean;
    }
  | { type: "setPartEnabled"; partId: string; enabled: boolean }
  | { type: "setPartName"; partId: string; name: string }
  | { type: "setOptionName"; partId: string; optionId: string; name: string }
  | { type: "setSeparator"; separator: string }
  | { type: "addOption"; partId: string; content: string; index?: number }
  | { type: "removeOption"; partId: string; optionId: string }
  | { type: "moveOption"; partId: string; optionId: string; index?: number };
export function applyPresetCompositionOperation(
  composition: PresetComposition,
  operation: PresetCompositionOperation
): PresetComposition {
  assertPresetComposition(composition);
  const draft: PresetComposition = JSON.parse(JSON.stringify(composition));
  const position = (index: number | undefined, length: number) => {
    const value = index ?? length;
    if (!Number.isInteger(value) || value < 0 || value > length)
      throw new Error("目标位置超出范围");
    return value;
  };
  if (operation.type === "setSeparator") draft.separator = operation.separator;
  else if (operation.type === "addPart")
    draft.parts.splice(
      position(operation.index, draft.parts.length),
      0,
      operation.part
    );
  else {
    const index = draft.parts.findIndex((part) => part.id === operation.partId);
    const part = draft.parts[index];
    if (!part) throw new Error("未找到片段");
    if (operation.type === "setPartEnabled") {
      if (typeof operation.enabled !== "boolean")
        throw new Error("启停状态需要布尔值");
      part.enabled = operation.enabled;
    } else if (operation.type === "setPartName") part.name = operation.name;
    else if (operation.type === "removePart") draft.parts.splice(index, 1);
    else if (operation.type === "movePart") {
      draft.parts.splice(index, 1);
      draft.parts.splice(
        position(operation.index, draft.parts.length),
        0,
        part
      );
    } else {
      if (operation.type === "selectOption") {
        if (
          operation.selected !== undefined &&
          typeof operation.selected !== "boolean"
        )
          throw new Error("选入状态需要布尔值");
        if (operation.optionId === null) clearPresetSelection(part);
        else
          setPresetOptionSelected(
            part,
            operation.optionId,
            operation.selected ?? true
          );
      } else if (operation.type === "addOption") {
        const option = { id: crypto.randomUUID(), content: operation.content };
        const wasEmpty = part.options.length === 0;
        part.options.splice(
          position(operation.index, part.options.length),
          0,
          option
        );
        if (wasEmpty) setPresetOptionSelected(part, option.id);
      } else {
        const optionIndex = part.options.findIndex(
          (option) =>
            option.id ===
            (operation.optionId ??
              (operation.type === "setContent" ? part.selectedOptionId : null))
        );
        const option = part.options[optionIndex];
        if (!option) throw new Error("未找到版本");
        if (operation.type === "setContent") option.content = operation.content;
        else if (operation.type === "setOptionName")
          option.name = operation.name;
        else if (operation.type === "removeOption") {
          part.options.splice(optionIndex, 1);
          if (part.selectedOptionId === option.id) part.selectedOptionId = null;
        } else if (operation.type === "moveOption") {
          part.options.splice(optionIndex, 1);
          part.options.splice(
            position(operation.index, part.options.length),
            0,
            option
          );
        } else throw new Error("未知操作");
      }
    }
  }
  assertPresetComposition(draft);
  return draft;
}

export {
  undoPresetStructureEdit,
  type PresetStructureEdit,
} from "./structureUndo";
