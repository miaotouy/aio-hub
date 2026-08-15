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

/**
 * OpenCode Go 预设模板
 */

import type { LlmPreset } from "../types";

// ---- 聚合渠道预设 ----
// OpenCode Go：内置官方模型协议路由表，模型 ID 与端点关系以官方文档为准。
export const opencodeGoPreset: LlmPreset = {
  type: "opencode-go",
  name: "OpenCode Go",
  description:
    "OpenCode Go 订阅 API - 低成本开源编程模型订阅，模型协议由内置路由表自动确定",
  defaultBaseUrl: "https://opencode.ai/zen/go/v1",
  logoUrl: "/model-icons/opencode.svg",
  links: [
    { label: "文档", url: "https://opencode.ai/docs/zh-cn/go/" },
    { label: "控制台", url: "https://opencode.ai/auth" },
    { label: "模型列表", url: "https://opencode.ai/zen/go/v1/models" },
  ],
  defaultModels: [
    {
      id: "grok-4.5",
      name: "Grok 4.5",
      group: "Grok",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "glm-5.2",
      name: "GLM-5.2",
      group: "GLM",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "glm-5.1",
      name: "GLM-5.1",
      group: "GLM",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT 5.6 Luna",
      group: "GPT",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（OpenAI Responses）",
    },
    {
      id: "kimi-k3",
      name: "Kimi K3",
      group: "Kimi",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      group: "Kimi",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "kimi-k2.6",
      name: "Kimi K2.6",
      group: "Kimi",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "mimo-v2.5",
      name: "MiMo-V2.5",
      group: "MiMo",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "mimo-v2.5-pro",
      name: "MiMo-V2.5-Pro",
      group: "MiMo",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "minimax-m3",
      name: "MiniMax M3",
      group: "MiniMax",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Anthropic Messages）",
    },
    {
      id: "minimax-m2.7",
      name: "MiniMax M2.7",
      group: "MiniMax",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Anthropic Messages）",
    },
    {
      id: "minimax-m2.5",
      name: "MiniMax M2.5",
      group: "MiniMax",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Anthropic Messages）",
    },
    {
      id: "qwen3.8-max",
      name: "Qwen3.8 Max",
      group: "Qwen3",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Anthropic Messages）",
    },
    {
      id: "qwen3.7-max",
      name: "Qwen3.7 Max",
      group: "Qwen3",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Anthropic Messages）",
    },
    {
      id: "qwen3.7-plus",
      name: "Qwen3.7 Plus",
      group: "Qwen3",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Anthropic Messages）",
    },
    {
      id: "qwen3.6-plus",
      name: "Qwen3.6 Plus",
      group: "Qwen3",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Anthropic Messages）",
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      group: "DeepSeek",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      group: "DeepSeek",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
    {
      id: "hy3",
      name: "Hy3",
      group: "Hy",
      provider: "opencode-go",
      capabilities: { toolUse: true },
      description: "OpenCode Go 内置模型（Chat Completions）",
    },
  ],
};
