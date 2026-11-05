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
 * 自定义超时错误
 */
export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}
/**
 * 检查是否为 AbortError
 * 兼容多种环境（浏览器 DOMException、Tauri HTTP 插件等）
 */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  // 如果 signal 已经中止，且不是因为超时，那么这就是一个纯粹的中止
  if (signal?.aborted && !isTimeoutError(error, signal)) {
    return true;
  }

  if (error === null || error === undefined) return false;

  // 如果是字符串，直接判断内容
  if (typeof error === "string") {
    const lower = error.toLowerCase();
    return (
      lower.includes("canceled") ||
      lower.includes("cancelled") ||
      lower.includes("aborted")
    );
  }

  // 如果是对象/Error实例
  const err = error as any;

  // 标准 AbortError (浏览器 DOMException)
  if (err.name === "AbortError") return true;

  // 检查 message 属性
  const message = String(err.message || "").toLowerCase();
  if (
    message.includes("canceled") ||
    message.includes("cancelled") ||
    message.includes("aborted")
  ) {
    return true;
  }

  // 兜底检查：如果 constructor 名字包含 AbortError
  if (err.constructor?.name === "AbortError") return true;

  return false;
}

/**
 * 检查是否为超时错误
 * 逻辑：
 * 1. 显式的 TimeoutError 实例
 * 2. 错误消息包含 timeout
 * 3. AbortSignal 的 reason 包含 timeout
 */
export function isTimeoutError(error: unknown, signal?: AbortSignal): boolean {
  if (error instanceof TimeoutError) return true;

  // 检查错误对象
  const errMsg = String((error as any)?.message || error || "").toLowerCase();
  if (errMsg.includes("timeout")) return true;

  // 检查信号原因 (AbortSignal.reason)
  // 现代浏览器中，如果通过 AbortSignal.timeout() 触发，reason 会是一个 TimeoutError 或包含 timeout 的对象
  const signalReason = String(signal?.reason || "").toLowerCase();
  if (signalReason.includes("timeout")) return true;

  return false;
}

/**
 * LLM API 错误
 */
export class LlmApiError extends Error {
  status: number;
  statusText: string;
  body?: string;

  constructor(
    message: string,
    status: number,
    statusText: string,
    body?: string
  ) {
    super(message);
    this.name = "LlmApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

/**
 * AIO 本地代理错误标记头。由 Rust 代理在"响应完全由本地生成"时写入，
 * 上游透传的响应不会带该头。详见 `src-tauri/src/commands/llm_proxy.rs`。
 */
export const AIO_PROXY_ORIGIN_HEADER = "x-aio-proxy-origin";
export const AIO_PROXY_ORIGIN_VALUE = "aiohub";

/**
 * 本地 Rust 代理自身产生的错误（连接失败、请求非法等），与上游服务返回的
 * 同状态码响应区分开。`proxyGenerated` 供错误分类器识别。
 */
export class LlmProxyError extends LlmApiError {
  readonly proxyGenerated = true;

  constructor(
    message: string,
    status: number,
    statusText: string,
    body?: string
  ) {
    super(message, status, statusText, body);
    this.name = "LlmProxyError";
  }
}

/**
 * 判断响应是否由 AIO 本地代理生成（而非上游透传）
 */
export function isProxyGeneratedResponse(response: Response): boolean {
  return (
    response.headers.get(AIO_PROXY_ORIGIN_HEADER) === AIO_PROXY_ORIGIN_VALUE
  );
}

/**
 * 确保响应成功，否则抛出 LlmApiError
 */
export const ensureResponseOk = async (response: Response): Promise<void> => {
  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {
      // 忽略读取错误
    }
    // 本地代理错误：请求可能根本没到达目标服务，必须与上游响应区分。
    if (isProxyGeneratedResponse(response)) {
      throw new LlmProxyError(
        `AIO 本地代理错误 (${response.status} ${response.statusText})：请求未成功到达目标服务。${errorText}`,
        response.status,
        response.statusText,
        errorText
      );
    }
    throw new LlmApiError(
      `API 请求失败 (${response.status} ${response.statusText}): ${errorText}`,
      response.status,
      response.statusText,
      errorText
    );
  }
};
