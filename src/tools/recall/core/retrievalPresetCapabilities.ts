// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type {
  RecallExternalRequirementKind,
  RecallPipelineCompileResult,
  RecallPresetSummary,
} from "../types/pipeline";

export interface RecallIntegerOverrideBounds {
  minimum: number;
  maximum: number;
  defaultValue?: number;
}

export type RecallCapabilityStatus = "ready" | "runtime" | "missing";

export interface RecallCapabilityPreflightItem {
  kind: RecallExternalRequirementKind;
  label: string;
  status: RecallCapabilityStatus;
  blocking: boolean;
  message: string;
}

export interface RecallCapabilityPreflight {
  status: "ready" | "blocked";
  items: RecallCapabilityPreflightItem[];
}

const CAPABILITY_LABELS: Record<RecallExternalRequirementKind, string> = {
  "query-embedding": "查询向量",
  "embedding-space": "向量空间",
  "entry-vectors": "条目向量",
  "tag-pool": "标签池",
  "index-snapshot": "索引快照",
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function getIntegerOverrideBounds(
  summary: RecallPresetSummary | undefined,
  key: string
): RecallIntegerOverrideBounds | null {
  const override = summary?.allowedOverrides.find((item) => item.key === key);
  if (!override || override.schema.type !== "integer") return null;

  const minimum = finiteNumber(override.schema.minimum);
  const maximum = finiteNumber(override.schema.maximum);
  if (minimum === undefined || maximum === undefined || minimum > maximum) {
    return null;
  }

  const defaultValue = finiteNumber(override.schema.default);
  return {
    minimum,
    maximum,
    ...(defaultValue !== undefined &&
    defaultValue >= minimum &&
    defaultValue <= maximum
      ? { defaultValue }
      : {}),
  };
}

export function buildCapabilityPreflight(
  compilation: RecallPipelineCompileResult,
  queryEmbeddingReady: boolean
): RecallCapabilityPreflight {
  const items = compilation.externalRequirements.map((requirement) => {
    const label = CAPABILITY_LABELS[requirement.kind];
    if (requirement.kind === "query-embedding") {
      return {
        kind: requirement.kind,
        label,
        status: queryEmbeddingReady ? "ready" : "missing",
        blocking: requirement.blocking && !queryEmbeddingReady,
        message: queryEmbeddingReady
          ? "全局活动 Embedding 模型可用"
          : "未配置可用的全局活动 Embedding 模型",
      } satisfies RecallCapabilityPreflightItem;
    }

    return {
      kind: requirement.kind,
      label,
      status: "runtime",
      blocking: false,
      message: "运行时按思绪集和活动模型准备",
    } satisfies RecallCapabilityPreflightItem;
  });

  return {
    status: items.some((item) => item.blocking) ? "blocked" : "ready",
    items,
  };
}
