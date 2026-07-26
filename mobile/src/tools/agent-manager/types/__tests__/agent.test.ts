import { describe, expect, it } from "vitest";
import { AgentCategory, normalizeAgentCategory } from "../agent";

describe("normalizeAgentCategory", () => {
  it("maps legacy custom data to the desktop-compatible Other category", () => {
    expect(normalizeAgentCategory("custom")).toBe(AgentCategory.Other);
  });

  it("keeps all current categories valid", () => {
    expect(normalizeAgentCategory(AgentCategory.Assistant)).toBe(
      AgentCategory.Assistant
    );
    expect(normalizeAgentCategory(AgentCategory.Creative)).toBe(
      AgentCategory.Creative
    );
    expect(normalizeAgentCategory(AgentCategory.Workflow)).toBe(
      AgentCategory.Workflow
    );
  });

  it("does not claim unknown future categories are current values", () => {
    expect(normalizeAgentCategory("future-category")).toBeUndefined();
  });
});
