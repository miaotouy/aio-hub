import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type { ManagedAssetRef } from "@/tools/asset-manager/types";
import { createModuleLogger } from "@/utils/logger";
import type { ContextProcessor, PipelineContext, ProcessableMessage } from "../../../types";

const logger = createModuleLogger("primary:macros-renderer");

const PROCESSOR_ID = "primary:macros-renderer";
const SVAR_TAG_PATTERN = /<svar\s+([^>]*?)\/?>/gi;
const SVAR_ATTRIBUTE_PATTERN = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
const MACRO_PATTERN = /\\?\{\{\s*([^{}]+?)\s*\}\}/g;

type MacroValue = string | number | boolean;

type VariableOperation = "=" | "+" | "-" | "*" | "/" | "set" | "add" | "sub";

interface VariableDefinitionNode {
  key?: unknown;
  type?: unknown;
  initialValue?: unknown;
  children?: unknown;
}

interface MacroRuntimeContext {
  userName: string;
  charName: string;
  persona: string;
  description: string;
  scenario: string;
  mesExamples: string;
  visualGuideline: string;
  agentVersion: string;
  input: string;
  lastMessage: string;
  lastUserMessage: string;
  lastCharMessage: string;
  modelId: string;
  modelName: string;
  profileId: string;
  profileName: string;
  provider: string;
  assets: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function scalarValue(value: unknown): MacroValue {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    return value.trim() !== "" && Number.isFinite(numeric) ? numeric : value;
  }
  return "";
}

function flattenVariableDefinitions(
  nodes: unknown,
  parentPath = ""
): Array<[string, MacroValue]> {
  if (!Array.isArray(nodes)) return [];

  const definitions: Array<[string, MacroValue]> = [];
  for (const value of nodes) {
    if (!isRecord(value)) continue;
    const node = value as VariableDefinitionNode;
    const key = stringValue(node.key).trim();
    if (!key) continue;

    const path = parentPath ? `${parentPath}.${key}` : key;
    if (node.type === "variable") {
      definitions.push([path, scalarValue(node.initialValue)]);
      continue;
    }
    if (node.type === "group") {
      definitions.push(...flattenVariableDefinitions(node.children, path));
    }
  }
  return definitions;
}

function createVariableState(agent: ChatAgent | null): Map<string, MacroValue> {
  const config = agent?.variableConfig;
  if (!isRecord(config) || config.enabled !== true) return new Map();
  return new Map(flattenVariableDefinitions(config.definitions));
}

function parseSvarAttributes(rawAttributes: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  SVAR_ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SVAR_ATTRIBUTE_PATTERN.exec(rawAttributes))) {
    attributes[match[1].toLowerCase()] =
      match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function applyVariableOperation(
  variables: Map<string, MacroValue>,
  name: string,
  operation: VariableOperation,
  rawValue: string
): void {
  const value = scalarValue(rawValue);
  const previous = variables.get(name);
  const previousNumber = typeof previous === "number" ? previous : Number(previous) || 0;
  const valueNumber = typeof value === "number" ? value : Number(value) || 0;

  switch (operation) {
    case "=":
    case "set":
      variables.set(name, value);
      return;
    case "+":
    case "add":
      variables.set(name, previousNumber + valueNumber);
      return;
    case "-":
    case "sub":
      variables.set(name, previousNumber - valueNumber);
      return;
    case "*":
      variables.set(name, previousNumber * valueNumber);
      return;
    case "/":
      if (valueNumber !== 0) variables.set(name, previousNumber / valueNumber);
      return;
  }
}

function applySvarTags(content: string, variables: Map<string, MacroValue>): string {
  return content.replace(SVAR_TAG_PATTERN, (_tag, rawAttributes: string) => {
    const attributes = parseSvarAttributes(rawAttributes);
    const name = (attributes.name ?? attributes.path ?? "").trim();
    if (!name) return "";

    const operation = (attributes.op ?? "=").toLowerCase() as VariableOperation;
    if (
      !["=", "+", "-", "*", "/", "set", "add", "sub"].includes(operation)
    ) {
      return "";
    }
    applyVariableOperation(variables, name, operation, attributes.value ?? "");
    return "";
  });
}

function sourceContent(message: ProcessableMessage | undefined): string {
  return message && typeof message.content === "string" ? message.content : "";
}

function createAssetsSummary(messages: ProcessableMessage[]): string {
  const attachments = new Map<string, ManagedAssetRef>();
  for (const message of messages) {
    for (const attachment of message._attachments ?? []) {
      attachments.set(attachment.assetId, attachment);
    }
  }

  return [...attachments.values()]
    .map(
      (attachment) =>
        `- ${attachment.snapshot.displayName} (${attachment.snapshot.mimeType}, ${attachment.assetId})`
    )
    .join("\n");
}

function createMacroRuntimeContext(context: PipelineContext): MacroRuntimeContext {
  const history = context.messages.filter(
    (message) => message.sourceType === "session_history"
  );
  const lastUserMessage = [...history]
    .reverse()
    .find((message) => message.role === "user");
  const model = context.sharedData.get("model") as
    | { id?: unknown; name?: unknown }
    | undefined;
  const profile = context.sharedData.get("profile") as
    | { id?: unknown; name?: unknown }
    | undefined;
  const agent = context.agentConfig;
  const agentRecord = agent as Record<string, unknown> | null;
  const userProfile = context.userProfile;

  return {
    userName: userProfile?.displayName || userProfile?.name || "User",
    charName: agent?.displayName || agent?.name || "Assistant",
    persona: userProfile?.content || "",
    description: agent?.description || "",
    scenario: stringValue(agentRecord?.scenario),
    mesExamples: stringValue(agentRecord?.mesExamples),
    visualGuideline: agent?.visualGuideline || "",
    agentVersion: agent?.agentVersion || "",
    input: sourceContent(lastUserMessage),
    lastMessage: "",
    lastUserMessage: "",
    lastCharMessage: "",
    modelId: stringValue(model?.id) || agent?.modelId || "",
    modelName: stringValue(model?.name),
    profileId: stringValue(profile?.id) || agent?.profileId || "",
    profileName: stringValue(profile?.name),
    provider: stringValue(profile?.name),
    assets: createAssetsSummary(context.messages),
  };
}

function resolveMacro(
  expression: string,
  runtime: MacroRuntimeContext,
  variables: Map<string, MacroValue>
): string {
  const [rawName, ...rawArguments] = expression.split("::");
  const name = rawName.trim().toLowerCase();
  const arguments_ = rawArguments.map((argument) => argument.trim());

  switch (name) {
    case "user":
      return runtime.userName;
    case "agent":
    case "char":
      return runtime.charName;
    case "persona":
      return runtime.persona;
    case "description":
      return runtime.description;
    case "scenario":
      return runtime.scenario;
    case "mesexamples":
      return runtime.mesExamples;
    case "input":
      return runtime.input;
    case "lastmessage":
      return runtime.lastMessage;
    case "lastusermessage":
      return runtime.lastUserMessage;
    case "lastcharmessage":
      return runtime.lastCharMessage;
    case "modelid":
      return runtime.modelId;
    case "modelname":
      return runtime.modelName;
    case "profileid":
      return runtime.profileId;
    case "profilename":
      return runtime.profileName;
    case "provider":
      return runtime.provider;
    case "agentversion":
      return runtime.agentVersion;
    case "visual_guideline":
      return runtime.visualGuideline;
    case "assets":
      return runtime.assets;
    case "newline":
      return "\n";
    case "trim":
      return "__AIOHUB_TRIM__";
    case "getvar":
      return arguments_[0] ? String(variables.get(arguments_[0]) ?? "") : "";
    case "setvar":
      if (arguments_[0] && arguments_.length >= 2) {
        applyVariableOperation(variables, arguments_[0], "set", arguments_.slice(1).join("::"));
      }
      return "";
    case "incvar":
      if (arguments_[0]) applyVariableOperation(variables, arguments_[0], "+", "1");
      return "";
    case "decvar":
      if (arguments_[0]) applyVariableOperation(variables, arguments_[0], "-", "1");
      return "";
    default:
      return `{{${expression}}}`;
  }
}

function renderMacros(
  content: string,
  runtime: MacroRuntimeContext,
  variables: Map<string, MacroValue>
): string {
  const withVariablesApplied = applySvarTags(content, variables);
  const rendered = withVariablesApplied.replace(
    MACRO_PATTERN,
    (fullMatch: string, expression: string) => {
      if (fullMatch.startsWith("\\")) return fullMatch.slice(1);
      return resolveMacro(expression, runtime, variables);
    }
  );
  return rendered.replace(/\s*__AIOHUB_TRIM__\s*/g, "");
}

export const macrosRenderer: ContextProcessor = {
  id: PROCESSOR_ID,
  name: "宏与会话变量渲染器",
  description:
    "展开移动端角色聊天使用的角色、用户、会话、模型和附件宏，并处理导入角色的局部变量。",
  priority: 500,
  isCore: true,
  execute: async (context) => {
    const hasMacroSyntax = context.messages.some(
      (message) =>
        typeof message.content === "string" &&
        (message.content.includes("{{") || /<svar\s/i.test(message.content))
    );
    if (!hasMacroSyntax) return;

    const variables = createVariableState(context.agentConfig);
    const baseRuntime = createMacroRuntimeContext(context);
    let renderedCount = 0;
    let previousHistoryMessage = "";
    let previousUserMessage = "";
    let previousCharMessage = "";

    for (const message of context.messages) {
      if (typeof message.content !== "string") continue;
      const originalContent = message.content;
      const runtime: MacroRuntimeContext = {
        ...baseRuntime,
        lastMessage: previousHistoryMessage,
        lastUserMessage: previousUserMessage,
        lastCharMessage: previousCharMessage,
      };
      const renderedContent = renderMacros(originalContent, runtime, variables);
      if (renderedContent !== originalContent) {
        message._originalContent = originalContent;
        message.content = renderedContent;
        renderedCount += 1;
      }

      if (message.sourceType === "session_history") {
        previousHistoryMessage = originalContent;
        if (message.role === "user") previousUserMessage = originalContent;
        if (message.role === "assistant") previousCharMessage = originalContent;
      }
    }

    context.sharedData.set("sessionVariables", new Map(variables));
    const message = `已渲染 ${renderedCount} 条包含宏或会话变量的消息。`;
    logger.info(message, { renderedCount, variableCount: variables.size });
    context.logs.push({ processorId: PROCESSOR_ID, level: "info", message });
  },
};
