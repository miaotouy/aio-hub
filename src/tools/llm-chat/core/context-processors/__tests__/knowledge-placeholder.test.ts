import { describe, expect, it } from "vitest";
import {
  KnowledgePlaceholderError,
  parseKnowledgePlaceholder,
  scanKnowledgePlaceholders,
  serializeKnowledgePlaceholder,
} from "../knowledge-placeholder";

describe("Knowledge placeholder protocol", () => {
  it("serializes in canonical order and round-trips URL encoded values", () => {
    const raw = serializeKnowledgePlaceholder({
      library: "library/1",
      strategy: "hybrid",
      limit: 8,
      minScore: 0.35,
      when: "always",
      citation: true,
    });
    expect(raw).toBe(
      "【knowledge::library=library%2F1::strategy=hybrid::limit=8::min-score=0.35::when=always::citation=true】"
    );
    expect(parseKnowledgePlaceholder(raw, 3)).toMatchObject({
      messageIndex: 3,
      library: "library/1",
      strategy: "hybrid",
      citation: true,
    });
  });

  it("rejects Recall parameters, duplicates and historical positional syntax", () => {
    for (const raw of [
      "【knowledge::profile=semantic】",
      "【knowledge::library=a::library=b】",
      "【knowledge::when=gate】",
      "【knowledge::old::4】",
    ]) {
      expect(() => parseKnowledgePlaceholder(raw, 0)).toThrow(
        KnowledgePlaceholderError
      );
    }
  });

  it("only scans Knowledge outside session history", () => {
    const placeholders = scanKnowledgePlaceholders([
      { content: "【knowledge::limit=2】 【recall::limit=9】" },
      { content: "【knowledge::limit=4】", sourceType: "session_history" },
    ]);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toMatchObject({ messageIndex: 0, limit: 2 });
  });
});
