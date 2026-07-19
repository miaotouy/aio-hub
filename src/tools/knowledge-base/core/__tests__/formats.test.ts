import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_DROP_ACCEPT,
  KNOWLEDGE_FILE_DIALOG_FILTERS,
  KNOWLEDGE_IMPORT_EXTENSIONS,
  KNOWLEDGE_SUPPORTED_FORMATS,
  KNOWLEDGE_UNSUPPORTED_FORMATS,
  getKnowledgeMimeType,
  resolveKnowledgeFormat,
} from "../formats";

describe("Knowledge format capabilities", () => {
  it("derives dialog and drop filters from the supported capability list", () => {
    const extensions = KNOWLEDGE_SUPPORTED_FORMATS.flatMap(
      (capability) => capability.extensions
    );
    expect(KNOWLEDGE_IMPORT_EXTENSIONS).toEqual(Array.from(new Set(extensions)));
    expect(KNOWLEDGE_FILE_DIALOG_FILTERS[0].extensions).toBe(
      KNOWLEDGE_IMPORT_EXTENSIONS
    );
    expect(KNOWLEDGE_DROP_ACCEPT).toEqual(
      KNOWLEDGE_IMPORT_EXTENSIONS.map((extension) => `.${extension}`)
    );
  });

  it("distinguishes verified, experimental, unsupported, and unknown formats", () => {
    expect(resolveKnowledgeFormat("guide.docx")?.validation).toBe("verified");
    expect(resolveKnowledgeFormat("scan.pdf")?.validation).toBe("experimental");
    expect(resolveKnowledgeFormat("sheet.xlsx")?.validation).toBe(
      "unsupported"
    );
    expect(resolveKnowledgeFormat("notes.custom")).toBeNull();
    expect(KNOWLEDGE_UNSUPPORTED_FORMATS.length).toBeGreaterThan(0);
  });

  it("derives MIME types for extensions sharing a text parser", () => {
    const capability = resolveKnowledgeFormat("data.json");
    expect(getKnowledgeMimeType(capability, "json")).toBe("application/json");
    expect(getKnowledgeMimeType(capability, "csv")).toBe("text/csv");
  });
});
