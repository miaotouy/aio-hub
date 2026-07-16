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
 * Token Calculator Worker 通信协议
 *
 * 详见 docs/Plan/分词器资产注册表方案.md §9
 */

import type {
  TokenizerProfile,
  TokenizerRule,
} from "../types/tokenizer-profile";

// =================================================================
// 主线程 → Worker 的消息
// =================================================================

/** Worker 初始化（推送注册表快照） */
export interface WorkerInitMessage {
  type: "init";
  profiles: TokenizerProfile[];
  rules: TokenizerRule[];
}

/** 主线程响应 Worker 的 needProfileData 请求 */
export interface WorkerProfileDataMessage {
  type: "profileData";
  profileId: string;
  /** tokenizer.json 文件内容（JSON 字符串） */
  tokenizerJSON: string;
  /** tokenizer_config.json 文件内容（可选） */
  tokenizerConfigJSON?: string;
  /** 如果加载失败，主线程通过此字段告知 Worker */
  error?: string;
}

/** 业务方法调用 */
export interface WorkerRequestMessage {
  id: number;
  method: string;
  params: unknown;
}

export type WorkerInbound =
  WorkerInitMessage | WorkerProfileDataMessage | WorkerRequestMessage;

// =================================================================
// Worker → 主线程的消息
// =================================================================

/** Worker 启动完毕，等待 init */
export interface WorkerReadyMessage {
  type: "ready";
}

/** Worker 收到 init，重建内部状态完成 */
export interface WorkerInitializedMessage {
  type: "initialized";
}

/** Worker 请求按需推送 profile 的 tokenizer.json 数据 */
export interface WorkerNeedProfileDataMessage {
  type: "needProfileData";
  profileId: string;
}

/** 业务方法响应 */
export interface WorkerResponseMessage {
  id: number;
  type: "response";
  result: unknown;
}

/** 业务方法错误 */
export interface WorkerErrorMessage {
  id: number;
  type: "error";
  error: string;
}

export type WorkerOutbound =
  | WorkerReadyMessage
  | WorkerInitializedMessage
  | WorkerNeedProfileDataMessage
  | WorkerResponseMessage
  | WorkerErrorMessage;
