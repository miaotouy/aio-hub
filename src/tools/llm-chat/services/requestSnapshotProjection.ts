import type { WireRequest } from "@aiohub/llm-core";
import type { ProcessableMessage } from "../types/context";
import type { MacroExecution } from "../macro-engine/MacroProcessor";
import type {
  SnapshotContentPart,
  SnapshotMessageItem,
  SnapshotSource,
} from "../types/requestSnapshot";

export function stableJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]])
          )
        : item
    ) ?? "null"
  );
}
export async function snapshotHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableJson(value))
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** Apply to every human-readable persisted field. Full hashes always precede this step. */
export function redactSnapshotText(text: string): string {
  return text
    .replace(/data:[^\s;]+;base64,[a-z0-9+/=]+/gi, "[媒体内容]")
    .replace(/\b(?:Bearer|Basic)\s+[a-z0-9._~+/=-]+/gi, "[凭据]")
    .replace(
      /\b(?:sk-|sess-|ghp_|github_pat_|xox[baprs]-)[a-z0-9_-]+/gi,
      "[凭据]"
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie)["']?\s*[=:]\s*["']?)[^\s"'&,;}]+/gi,
      "$1[已隐藏]"
    )
    .replace(/https?:\/\/[^\s<>"']+/gi, (value) => {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()])
          if (
            /key|token|auth|signature|credential|secret|password|code/i.test(
              key
            )
          )
            url.searchParams.set(key, "[已隐藏]");
        return url.toString();
      } catch {
        return "[链接]";
      }
    })
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[邮箱]")
    .replace(/(?<!\w)(?:\+?\d[\d ()-]{7,}\d)(?!\w)/g, "[电话号码]")
    .replace(/(?:[a-z]:[\\/]|\\\\)[^\s<>"'|]+/gi, "[本机路径]")
    .replace(/(?:\/(?:Users|home|tmp|var|private)\/)[^\s<>"']+/g, "[本机路径]");
}
const utf8 = new TextEncoder();
export function limitUtf8(text: string, bytes: number): string {
  if (utf8.encode(text).byteLength <= bytes) return text;
  let end = Math.min(text.length, bytes);
  let result = text.slice(0, end);
  while (utf8.encode(result).byteLength > bytes) result = text.slice(0, --end);
  if (/[\uD800-\uDBFF]$/.test(result)) result = result.slice(0, -1);
  return result;
}
function preview(
  text: string,
  enabled: boolean
): Pick<SnapshotContentPart, "textPreview" | "textState"> {
  if (!enabled) return { textState: "omitted" };
  const redacted = redactSnapshotText(text);
  const truncated = utf8.encode(text).byteLength > 64 * 1024;
  return {
    textPreview: truncated ? limitUtf8(redacted, 16 * 1024) : redacted,
    textState:
      redacted !== text ? "redacted" : truncated ? "truncated" : "full",
  };
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function readableProtocol(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(readableProtocol);
  if (typeof value === "string" && /^[\[{]/.test(value.trim())) {
    try {
      return stableJson(readableProtocol(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /api.?key|token|password|secret|authorization|cookie/i.test(key)
        ? "[凭据]"
        : /^(data|base64|bytes|inlineData|inline_data|signature|encrypted_content)$/i.test(
              key
            )
          ? "[二进制或回放内容]"
          : readableProtocol(item),
    ])
  );
}
async function parts(
  value: unknown,
  keys: string[],
  enabled: boolean
): Promise<SnapshotContentPart[]> {
  const items = Array.isArray(value) ? value : [value];
  return Promise.all(
    items.map(async (item) => {
      const obj = object(item);
      const kind =
        typeof item === "string"
          ? "text"
          : String(
              obj.type ??
                (obj.text !== undefined
                  ? "text"
                  : obj.functionCall
                    ? "tool_use"
                    : obj.functionResponse
                      ? "tool_result"
                      : obj.thought
                        ? "reasoning"
                        : "protocol")
            );
      const text =
        typeof item === "string"
          ? item
          : typeof obj.text === "string"
            ? obj.text
            : typeof obj.thinking === "string"
              ? obj.thinking
              : undefined;
      // Tool/reasoning JSON is shown only through the same privacy filter; binary blocks stay digests.
      const readable =
        text ??
        (/tool|function|reasoning/.test(kind)
          ? stableJson(readableProtocol(item))
          : undefined);
      return {
        kind: limitUtf8(redactSnapshotText(kind), 100),
        contentHash: await snapshotHash(item),
        sourceKeys: keys,
        ...(readable !== undefined
          ? {
              charLength: (text ?? stableJson(item)).length,
              ...preview(readable, enabled),
              ...(text === undefined && stableJson(item) !== readable && enabled
                ? { textState: "redacted" as const }
                : {}),
            }
          : {}),
      };
    })
  );
}
export async function projectSnapshot(wire: WireRequest, enabled: boolean) {
  const body = wire.body?.kind === "json" ? object(wire.body.value) : {};
  const rawMessages = body.messages ?? body.contents ?? body.input;
  const values = Array.isArray(rawMessages)
    ? rawMessages
    : typeof rawMessages === "string"
      ? [{ role: "user", content: rawMessages }]
      : [];
  const top = body.system ?? body.systemInstruction ?? body.instructions;
  const messages: SnapshotMessageItem[] = await Promise.all(
    values.map(async (value, index) => {
      const item = object(value);
      const keys = wire.sourceMap?.messages[index] ?? [];
      const content = item.content ?? item.parts ?? value;
      const result = await parts(content, keys, enabled);
      // Hashes cover the entire item, including tool IDs, replay state and cache_control.
      if (item.reasoning_content !== undefined)
        result.push(
          ...(await parts(
            { type: "reasoning", thinking: item.reasoning_content },
            keys,
            enabled
          ))
        );
      if (item.tool_calls !== undefined)
        result.push(
          ...(await parts(
            { type: "tool_use", calls: item.tool_calls },
            keys,
            enabled
          ))
        );
      return {
        role: limitUtf8(
          redactSnapshotText(String(item.role ?? item.type ?? "unknown")),
          100
        ),
        wireHash: await snapshotHash(value),
        parts: result,
        sourceKeys: keys,
      };
    })
  );
  const options = Object.fromEntries(
    Object.entries(body).filter(
      ([key]) =>
        ![
          "messages",
          "contents",
          "input",
          "system",
          "systemInstruction",
          "instructions",
          "tools",
          "model",
          "stream",
          "stream_options",
          "requestId",
        ].includes(key)
    )
  );
  const input = { ...body };
  delete input.stream;
  delete input.stream_options;
  delete input.requestId;
  const tools = Array.isArray(body.tools) ? body.tools : undefined;
  const knownKeys = new Set([
    "messages",
    "contents",
    "input",
    "system",
    "systemInstruction",
    "instructions",
    "tools",
    "model",
    "stream",
    "stream_options",
    "requestId",
    "temperature",
    "top_p",
    "top_k",
    "max_tokens",
    "max_completion_tokens",
    "max_output_tokens",
    "stop",
    "stop_sequences",
    "frequency_penalty",
    "presence_penalty",
    "seed",
    "n",
    "tool_choice",
    "parallel_tool_calls",
    "response_format",
    "text",
    "thinking",
    "reasoning",
    "reasoning_effort",
    "generationConfig",
    "toolConfig",
    "safetySettings",
    "cachedContent",
    "cache_control",
    "output_config",
  ]);
  const hasUnmaterialisedSource = (value: unknown): boolean => {
    if (typeof value === "string") return value.includes("local-file://");
    if (Array.isArray(value)) return value.some(hasUnmaterialisedSource);
    const item = object(value);
    return (
      item.kind === "managed-asset-ref" ||
      item.kind === "local-file-ref" ||
      Object.values(item).some(hasUnmaterialisedSource)
    );
  };
  const knownBody =
    Object.keys(body).every((key) => knownKeys.has(key)) &&
    !hasUnmaterialisedSource(body);
  return {
    inputHash: await snapshotHash(
      wire.body?.kind === "json" ? input : (wire.body ?? null)
    ),
    promptOptionsHash: await snapshotHash(options),
    messages,
    ...(top === undefined
      ? {}
      : {
          topLevelSystem: {
            wireHash: await snapshotHash(top),
            parts: await parts(
              object(top).parts ?? top,
              wire.sourceMap?.system ?? [],
              enabled
            ),
            sourceKeys: wire.sourceMap?.system ?? [],
          },
        }),
    ...(tools
      ? {
          nativeToolsDigest: {
            count: tools.length,
            schemaHash: await snapshotHash(tools),
          },
        }
      : {}),
    captureQuality:
      wire.body?.kind === "json" && wire.sourceMap?.complete && knownBody
        ? ("complete" as const)
        : ("partial" as const),
  };
}

export function freezeSnapshotSources(
  messages: ProcessableMessage[],
  macros: Map<string, MacroExecution[]> | undefined,
  enabled: boolean
) {
  const sources: SnapshotSource[] = [];
  const counts = new Map<string, number>();
  const pending: Promise<void>[] = [];
  function visit(message: ProcessableMessage): string {
    const type =
      message._snapshotIdentity?.type ?? message.sourceType ?? "unknown";
    const sourceId = message._snapshotIdentity?.id ?? message.sourceId;
    const identity = stableJson([type, sourceId ?? null]);
    const occurrence = counts.get(identity) ?? 0;
    counts.set(identity, occurrence + 1);
    const sourceKey = `source-${sources.length}`;
    const content = stableJson({
      content: message.content,
      reasoningContent: message.reasoningContent,
      reasoningArtifacts: message.reasoningArtifacts,
    });
    const source: SnapshotSource = {
      sourceKey,
      originalRole: message._historyRole ?? message.role,
      occurrence,
      sourceType: type,
      sourceId:
        typeof sourceId === "string"
          ? limitUtf8(redactSnapshotText(sourceId), 200)
          : sourceId,
      sourceName: message._name
        ? limitUtf8(redactSnapshotText(message._name), 160)
        : undefined,
      contentHash: "",
      charLength: content.length,
      presetContributions: message.presetContributingParts?.map((part) => ({
        partId: limitUtf8(redactSnapshotText(part.partId), 160),
        optionId: part.optionId
          ? limitUtf8(redactSnapshotText(part.optionId), 160)
          : undefined,
      })),
    };
    sources.push(source);
    const executions = (macros?.get(String(message.sourceId)) ?? []).map(
      (macro) => ({ ...macro, args: [...macro.args] })
    );
    pending.push(
      (async () => {
        source.contentHash = await snapshotHash(JSON.parse(content));
        const macroOccurrences = new Map<string, number>();
        source.executedMacros = await Promise.all(
          executions.map(async (macro) => {
            const occurrence = macroOccurrences.get(macro.name) ?? 0;
            macroOccurrences.set(macro.name, occurrence + 1);
            return {
              name: limitUtf8(redactSnapshotText(macro.name), 100),
              occurrence,
              argsHash: await snapshotHash(macro.args),
              outputLength: macro.output.length,
              outputHash: await snapshotHash(macro.output),
              ...(enabled
                ? {
                    preview: limitUtf8(
                      redactSnapshotText(macro.output),
                      16 * 1024
                    ),
                  }
                : {}),
            };
          })
        );
      })()
    );
    const children = [...(message._mergedSources ?? [])];
    for (const fragment of message._snapshotFragments ?? [])
      children.push({
        role: message.role,
        content: fragment.content,
        sourceType: "unknown",
        sourceId: fragment.sourceId,
        _snapshotIdentity: { type: fragment.sourceType, id: fragment.sourceId },
      });
    if (children.length) source.parentSourceKeys = children.map(visit);
    return sourceKey;
  }
  const messageKeys = messages.map((message) => [visit(message)]);
  return { messageKeys, sources: Promise.all(pending).then(() => sources) };
}

export function createSnapshotPipelineTrace() {
  const steps: Promise<
    import("../types/requestSnapshot").SnapshotTransformation
  >[] = [];
  const identities = (messages: ProcessableMessage[]): string[] =>
    messages.flatMap((message) => [
      ...(message.sourceType === "session_history" &&
      message.sourceId !== undefined
        ? [String(message.sourceId)]
        : []),
      ...identities(message._mergedSources ?? []),
    ]);
  return {
    trace(name: string, messages: ProcessableMessage[]) {
      const beforeHash = snapshotHash(
        messages.map((message) => ({
          role: message.role,
          content: message.content,
          reasoningContent: message.reasoningContent,
        }))
      );
      const beforeIds = identities(messages);
      return (after: ProcessableMessage[]) => {
        const afterIds = new Set(identities(after));
        const afterHash = snapshotHash(
          after.map((message) => ({
            role: message.role,
            content: message.content,
            reasoningContent: message.reasoningContent,
          }))
        );
        steps.push(
          Promise.all([beforeHash, afterHash]).then(
            ([beforeHash, afterHash]) => ({
              name: limitUtf8(redactSnapshotText(name), 160),
              beforeHash,
              afterHash,
              removedSourceIds: beforeIds
                .filter((id) => !afterIds.has(id))
                .map((id) => limitUtf8(redactSnapshotText(id), 200)),
            })
          )
        );
      };
    },
    finish: () =>
      Promise.all(steps).then((results) =>
        results.filter((step) => step.beforeHash !== step.afterHash)
      ),
  };
}
