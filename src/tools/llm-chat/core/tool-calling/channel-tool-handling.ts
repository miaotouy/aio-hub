// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { ChannelToolHandling, LlmProfile } from "@/types/llm-profiles";

export type ChannelToolHandlingSource =
  "explicit" | "same-host-heuristic" | "default";

export interface ResolvedChannelToolHandling {
  handling: ChannelToolHandling;
  source: ChannelToolHandlingSource;
  evidence: string[];
  isVcpTextChannel: boolean;
}

const CALL_CONSUMERS = new Set<ChannelToolHandling["callConsumer"]>([
  "aio",
  "upstream",
]);
const UPSTREAM_PROTOCOLS = new Set<ChannelToolHandling["upstreamProtocol"]>([
  "provider-native",
  "vcp-text",
  "transparent",
  "none",
]);
const DISTRIBUTED_EXPOSURES = new Set<
  NonNullable<ChannelToolHandling["aioDistributedExposure"]>
>(["complete", "partial", "none", "unknown"]);

/** 将本地回环地址规范化为统一形式，避免 localhost 与 127.0.0.1 不匹配。 */
function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") {
    return "localhost";
  }
  return lower;
}

/**
 * 比较两个 URL 是否指向同一 VCP 主机（hostname + port）。
 * 本地回环地址（localhost / 127.0.0.1 / ::1）统一视为相同。
 */
export function isSameHost(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    if (normalizeHostname(a.hostname) !== normalizeHostname(b.hostname)) {
      return false;
    }
    return !(a.port && b.port && a.port !== b.port);
  } catch {
    return false;
  }
}

/** 验证持久化渠道工具处理声明，忽略旧配置或手工编辑产生的无效值。 */
export function isChannelToolHandling(
  value: unknown
): value is ChannelToolHandling {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const handling = value as Partial<ChannelToolHandling>;
  if (
    !handling.callConsumer ||
    !CALL_CONSUMERS.has(handling.callConsumer) ||
    !handling.upstreamProtocol ||
    !UPSTREAM_PROTOCOLS.has(handling.upstreamProtocol)
  ) {
    return false;
  }

  return (
    handling.aioDistributedExposure === undefined ||
    DISTRIBUTED_EXPOSURES.has(handling.aioDistributedExposure)
  );
}

/**
 * 解析当前渠道的工具调用消费方。
 *
 * 明确保存到 LLM Profile 的声明优先；未声明的旧 Profile 保留同主机启发式，
 * 以维持已有 VCP 文本调用行为。后续握手与能力探测可在该函数之前提供更高优先级证据。
 */
export function resolveChannelToolHandling(
  profile: Pick<LlmProfile, "baseUrl" | "toolHandling"> | undefined,
  vcpWsUrl?: string
): ResolvedChannelToolHandling {
  if (profile && isChannelToolHandling(profile.toolHandling)) {
    const handling: ChannelToolHandling = {
      ...profile.toolHandling,
      evidence: "explicit",
    };
    return {
      handling,
      source: "explicit",
      evidence: ["LLM Profile 中的显式工具处理声明"],
      isVcpTextChannel:
        handling.callConsumer === "upstream" &&
        handling.upstreamProtocol === "vcp-text",
    };
  }

  if (profile?.baseUrl && vcpWsUrl && isSameHost(profile.baseUrl, vcpWsUrl)) {
    return {
      handling: {
        callConsumer: "upstream",
        upstreamProtocol: "vcp-text",
        aioDistributedExposure: "unknown",
        evidence: "heuristic",
      },
      source: "same-host-heuristic",
      evidence: ["LLM Profile API 地址与 VCP WebSocket 同主机"],
      isVcpTextChannel: true,
    };
  }

  return {
    handling: {
      callConsumer: "aio",
      upstreamProtocol: "none",
      evidence: "heuristic",
    },
    source: "default",
    evidence: ["未声明上游工具调用消费方"],
    isVcpTextChannel: false,
  };
}
