import type { KnowledgeBinding } from "@/tools/agent-manager/types/agent";
import { searchKnowledge } from "@/tools/knowledge-base/service";
import type { KnowledgeResult } from "@/tools/knowledge-base/types";
import type { ProcessableMessage } from "../../types/context";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import {
  KnowledgePlaceholderError,
  parseKnowledgePlaceholder,
  serializeKnowledgePlaceholder,
  type KnowledgePlaceholder,
} from "./knowledge-placeholder";
import { scanRetrievalEnvelopes } from "./retrieval-envelope";

function insertAutoPlaceholders(
  messages: ProcessableMessage[],
  raws: string[],
  position: "context_head" | "before_last_user"
) {
  const content = raws.join("\n");
  if (position === "before_last_user") {
    const lastUserIndex = messages
      .map((message) => message.role)
      .lastIndexOf("user");
    messages.splice(Math.max(0, lastUserIndex), 0, {
      role: "user",
      content,
      sourceType: "depth_injection",
    });
    return;
  }
  const lastSystemIndex = messages
    .map((message) => message.role)
    .lastIndexOf("system");
  const system = lastSystemIndex >= 0 ? messages[lastSystemIndex] : undefined;
  if (system && typeof system.content === "string") {
    system.content = `${system.content.trimEnd()}\n\n${content}`;
    return;
  }
  messages.unshift({ role: "user", content, sourceType: "depth_injection" });
}

function extractQuery(messages: ProcessableMessage[]) {
  const history = messages.filter(
    (message) => message.sourceType === "session_history"
  );
  const userIndex = history.map((message) => message.role).lastIndexOf("user");
  if (userIndex < 0) return "";
  const userText = history[userIndex].content;
  const aiText = history
    .slice(userIndex + 1)
    .filter(
      (message) =>
        message.role === "assistant" && typeof message.content === "string"
    )
    .map((message) => (message.content as string).trim())
    .filter(Boolean)
    .join("\n");
  return [typeof userText === "string" ? userText.trim() : "", aiText]
    .filter(Boolean)
    .join("\n");
}

function formatResult(result: KnowledgeResult, citation: boolean) {
  const heading = result.heading ? ` / ${result.heading}` : "";
  const source = citation
    ? `\n[来源: ${result.libraryName} / ${result.title}${heading} / ${result.sourcePath}#${result.chunkIndex + 1}]`
    : "";
  return `${result.content}${source}`;
}

function applyCharLimit(results: string[], maxChars: number) {
  if (!maxChars) return results;
  const accepted: string[] = [];
  let total = 0;
  for (const result of results) {
    if (total + result.length > maxChars) break;
    accepted.push(result);
    total += result.length;
  }
  return accepted;
}

function resolveBindings(
  placeholder: KnowledgePlaceholder,
  bindings: KnowledgeBinding[]
) {
  return placeholder.library
    ? bindings.filter((binding) => binding.libraryId === placeholder.library)
    : bindings;
}

export class KnowledgeProcessor implements ContextProcessor {
  id = "primary:knowledge-processor";
  name = "资料处理器";
  description = "执行 Knowledge 检索并替换【knowledge】占位符";
  priority = 440;

  async execute(context: PipelineContext): Promise<void> {
    const config = context.agentConfig.knowledgeConfig;
    const settings = context.agentConfig.knowledgeSettings;
    let placeholders: KnowledgePlaceholder[] = [];
    for (const token of scanRetrievalEnvelopes(context.messages, "knowledge")) {
      try {
        placeholders.push(
          parseKnowledgePlaceholder(token.raw, token.messageIndex)
        );
      } catch (error) {
        if (!(error instanceof KnowledgePlaceholderError)) throw error;
        context.logs.push({
          processorId: this.id,
          level: "warn",
          message: error.message,
          details: {
            messageIndex: error.messageIndex,
            raw: error.raw,
            key: error.key,
          },
        });
      }
    }
    if (!config?.enabled) return;
    const enabledBindings = config.bindings.filter(
      (binding) => binding.enabled
    );
    if (
      config.autoInjectIfMacroMissing &&
      !placeholders.some((placeholder) => !placeholder.library)
    ) {
      const referenced = new Set(
        placeholders.map((placeholder) => placeholder.library).filter(Boolean)
      );
      const generated = enabledBindings.filter(
        (binding) => !referenced.has(binding.libraryId)
      );
      if (generated.length) {
        insertAutoPlaceholders(
          context.messages,
          generated.map((binding) =>
            serializeKnowledgePlaceholder({
              library: binding.libraryId,
              strategy: binding.strategy,
              limit: binding.limit,
              minScore: binding.minScore,
              when: "always",
              citation: binding.citation,
            })
          ),
          config.autoInjectPosition ?? "context_head"
        );
        placeholders = scanRetrievalEnvelopes(
          context.messages,
          "knowledge"
        ).map((token) =>
          parseKnowledgePlaceholder(token.raw, token.messageIndex)
        );
      }
    }

    const query = extractQuery(context.messages);
    for (const placeholder of placeholders) {
      const targets = resolveBindings(placeholder, enabledBindings);
      if (placeholder.library && targets.length === 0) {
        context.logs.push({
          processorId: this.id,
          level: "warn",
          message: "Knowledge 占位符引用未授权资料库",
          details: { library: placeholder.library, raw: placeholder.raw },
        });
        continue;
      }
      const formatted: string[] = [];
      const sources: Array<Record<string, unknown>> = [];
      for (const binding of targets) {
        const strategy =
          placeholder.strategy ??
          binding.strategy ??
          settings?.defaultStrategy ??
          "auto";
        const results = await searchKnowledge({
          query,
          libraryIds: [binding.libraryId],
          strategy,
          limit:
            placeholder.limit ?? binding.limit ?? settings?.defaultLimit ?? 8,
          minScore:
            placeholder.minScore ??
            binding.minScore ??
            settings?.defaultMinScore ??
            0,
        });
        const citation =
          placeholder.citation ??
          binding.citation ??
          settings?.defaultCitation ??
          true;
        formatted.push(
          ...results.map((result) => formatResult(result, citation))
        );
        sources.push(
          ...results.map((result) => ({
            sourceType: result.sourceType,
            libraryId: result.libraryId,
            documentId: result.documentId,
            sourcePath: result.sourcePath,
            chunkIndex: result.chunkIndex,
            heading: result.heading,
            score: result.score,
            signals: result.signals,
          }))
        );
      }
      const message = context.messages[placeholder.messageIndex];
      if (!message || typeof message.content !== "string") continue;
      const limited = applyCharLimit(formatted, settings?.maxRecallChars ?? 0);
      const replacement = limited.length
        ? limited.join("\n\n---\n\n")
        : settings?.emptyText || "（未检索到相关资料）";
      message.content = message.content.replace(placeholder.raw, replacement);
      context.logs.push({
        processorId: this.id,
        level: "info",
        message: "Knowledge 检索完成",
        details: {
          query,
          resultCount: limited.length,
          sources,
        },
      });
    }
  }
}

export const knowledgeProcessor = new KnowledgeProcessor();
