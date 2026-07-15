// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type { LlmProfile, ProviderType } from "@/types/llm-profiles";

export type LlmConfigImportFormat = "auto" | "curl" | "env" | "json" | "toml";
export type LlmConfigImportConfidence = "high" | "medium" | "low";

export interface LlmConfigImportDocument {
  id: string;
  name?: string;
  content: string;
}

export interface LlmConfigImportDiagnostic {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  documentId?: string;
  blocking?: boolean;
}

export interface ParsedLlmProfileDraft {
  id: string;
  suggestedName: string;
  providerType: ProviderType;
  baseUrl: string;
  apiKeys: string[];
  models: Array<{ id: string; name?: string }>;
  customHeaders?: Record<string, string>;
  customEndpoints?: LlmProfile["customEndpoints"];
  options?: Record<string, unknown>;
  sourceKind: string;
  sourceDocumentIds: string[];
  confidence: LlmConfigImportConfidence;
  warnings: LlmConfigImportDiagnostic[];
}

export interface LlmConfigImportResult {
  detectedFormat: Exclude<LlmConfigImportFormat, "auto"> | null;
  profiles: ParsedLlmProfileDraft[];
  diagnostics: LlmConfigImportDiagnostic[];
}

export interface LlmConfigCredentialCandidate {
  documentId: string;
  key: string;
  kind: "codex-auth";
}

export interface LlmConfigParserOutcome {
  format: Exclude<LlmConfigImportFormat, "auto">;
  score: number;
  profiles: ParsedLlmProfileDraft[];
  diagnostics: LlmConfigImportDiagnostic[];
  credentials?: LlmConfigCredentialCandidate[];
}
