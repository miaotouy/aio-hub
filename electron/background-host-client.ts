// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type {
  BackgroundHostServices,
  HostServiceMethod,
  HostServiceRequest,
  HostServiceResponse,
} from "./background-host-protocol";
import { ApiKeyUnavailableError } from "../src/llm-apis/configuration/keyManager";
import type {
  KeySelectionProfile,
  KeyFailureOptions,
} from "../src/llm-apis/configuration/keyProtocol";

const failure = (code: string, message: string) =>
  Object.assign(new Error(message), { code });
interface Pending {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  cleanup(): void;
}
/** Cancellation detaches the waiter; Main drains an already admitted durable transaction. */
export class BackgroundHostClient {
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private closed = false;
  constructor(
    private send: (message: HostServiceRequest) => void,
    private timeoutMs = 30_000
  ) {}
  call<M extends HostServiceMethod>(
    method: M,
    params: BackgroundHostServices[M]["params"],
    signal?: AbortSignal
  ): Promise<BackgroundHostServices[M]["result"]> {
    if (this.closed)
      return Promise.reject(failure("HOST_CLOSED", "后台宿主连接已关闭"));
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.pending.size >= 32)
      return Promise.reject(
        failure("HOST_BUSY", "后台宿主请求较多，请稍后重试")
      );
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const finish = (error: unknown) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.cleanup();
        reject(error);
      };
      const abort = () => finish(signal!.reason);
      const timer = setTimeout(
        () => finish(failure("HOST_TIMEOUT", "后台宿主服务响应超时")),
        this.timeoutMs
      );
      this.pending.set(id, {
        resolve: (value) =>
          resolve(value as BackgroundHostServices[M]["result"]),
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        },
      });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        this.send({
          type: "host-request",
          id,
          method,
          params,
        } as HostServiceRequest);
      } catch (error) {
        finish(error);
      }
    });
  }
  receive(message: HostServiceResponse) {
    if (message?.type !== "host-response") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    pending.cleanup();
    if (message.ok) pending.resolve(message.result);
    else pending.reject(failure(message.error.code, message.error.message));
  }
  close() {
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(failure("HOST_CLOSED", "后台宿主连接已关闭"));
    }
    this.pending.clear();
  }
  /** Shared physical-model middleware port; health writes always go through Main. */
  readonly keys = {
    pickKey: async (profile: KeySelectionProfile) => {
      const reply = await this.call("llm.keys.execute", {
        method: "pick",
        profile: {
          id: profile.id,
          name: profile.name,
          apiKeys: profile.apiKeys,
          enabled: profile.enabled,
        },
      });
      if (reply.unavailable) {
        const error = reply.unavailable;
        throw new ApiKeyUnavailableError(
          error.message,
          error.reason,
          error.profileId,
          error.retryAt
        );
      }
      return reply.key;
    },
    reportSuccess: async (profileId: string, key: string) => {
      await this.call("llm.keys.execute", {
        method: "success",
        profileId,
        key,
      });
    },
    reportFailure: async (
      profileId: string,
      key: string,
      error: unknown,
      options?: KeyFailureOptions
    ) => {
      const detail = error as {
        message?: unknown;
        status?: unknown;
        statusCode?: unknown;
      } | null;
      await this.call("llm.keys.execute", {
        method: "failure",
        profileId,
        key,
        error: {
          message:
            typeof detail?.message === "string"
              ? detail.message
              : "模型请求失败",
          status:
            typeof detail?.status === "number" ? detail.status : undefined,
          statusCode:
            typeof detail?.statusCode === "number"
              ? detail.statusCode
              : undefined,
        },
        options,
      });
    },
  };
}
