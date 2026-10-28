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

import { decodeTokenUpdates } from "./tokenizerTokenDelta";
import { createModuleLogger } from "@/utils/logger";
import type { Token, TokenizerOptions } from "./types";
import type { TokenizeRequest, TokenizerResponse } from "./tokenizerProtocol";

const logger = createModuleLogger("rich-text-renderer/tokenizer");

interface TokenizerSession {
  id: number;
  text: string;
  tokens: Token[];
  sentRevision: number;
  receivedRevision: number;
}

interface TokenizerCallback {
  resolve: (tokens: Token[]) => void;
  reject: (error: Error) => void;
  owner?: object;
  session?: TokenizerSession;
  baseRevision?: number;
  revision?: number;
}

/** Shared Worker transport; streaming owners exchange text/token tails independently. */
class TokenizerService {
  private worker: Worker | null = null;
  private nextId = 0;
  private nextSessionId = 0;
  private callbacks = new Map<number, TokenizerCallback>();
  private sessions = new WeakMap<object, TokenizerSession>();

  private initWorker() {
    if (this.worker) return;
    const worker = new Worker(
      new URL("./tokenizer.worker.ts", import.meta.url),
      {
        type: "module",
      }
    );
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<TokenizerResponse>) => {
      if (this.worker !== worker) return;
      const response = event.data;
      const callback = this.callbacks.get(response.id);
      if (!callback) return;
      this.callbacks.delete(response.id);
      if (response.status === "error") {
        this.releaseCallbackSession(callback);
        callback.reject(new Error(response.error));
        return;
      }
      const session = callback.session;
      try {
        if (!session) {
          callback.resolve(
            response.textPatches
              ? decodeTokenUpdates([], response.prefix, response.tokens)
              : response.tokens
          );
          return;
        }
        if (
          response.revision === undefined ||
          response.revision !== callback.revision ||
          session.receivedRevision !== callback.baseRevision ||
          !Number.isInteger(response.prefix) ||
          response.prefix < 0 ||
          response.prefix > session.tokens.length
        ) {
          throw new Error("Tokenizer stream response mismatch");
        }
        // Reuse unchanged objects; patched strings belong to this revision's new tokens.
        const tokens = response.textPatches
          ? decodeTokenUpdates(session.tokens, response.prefix, response.tokens)
          : session.tokens.slice(0, response.prefix).concat(response.tokens);
        session.tokens = tokens;
        session.receivedRevision = response.revision;
        callback.resolve(tokens);
      } catch (error) {
        this.releaseCallbackSession(callback);
        callback.reject(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      const error = new Error(event.message || "Tokenizer Worker crashed");
      logger.error("分词 Worker 异常", error);
      this.stop(new Error("Tokenizer Worker crashed"));
    };
  }

  private releaseCallbackSession(callback: TokenizerCallback) {
    if (
      callback.owner &&
      this.sessions.get(callback.owner) === callback.session
    )
      this.release(callback.owner);
  }

  public tokenize(
    text: string,
    options: TokenizerOptions = {},
    owner?: object
  ): Promise<Token[]> {
    this.initWorker();
    const id = this.nextId++;
    let session = owner ? this.sessions.get(owner) : undefined;
    if (owner && !session) {
      session = {
        id: this.nextSessionId++,
        text: "",
        tokens: [],
        sentRevision: 0,
        receivedRevision: 0,
      };
      this.sessions.set(owner, session);
    }
    const request: TokenizeRequest = { text, id, options };
    if (session) {
      const previous = session.text;
      let from = 0;
      if (text.slice(0, previous.length) === previous) from = previous.length;
      else if (
        previous.endsWith("\n") &&
        text.slice(0, previous.length - 1) === previous.slice(0, -1)
      )
        from = previous.length - 1;
      request.text = text.slice(from);
      request.session = {
        id: session.id,
        from,
        baseRevision: session.sentRevision,
        revision: session.sentRevision + 1,
      };
    }
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, {
        resolve,
        reject,
        owner,
        session,
        baseRevision: request.session?.baseRevision,
        revision: request.session?.revision,
      });
      try {
        this.worker!.postMessage(request);
        if (session) {
          session.text = text;
          session.sentRevision = request.session!.revision;
        }
      } catch (error) {
        this.callbacks.delete(id);
        reject(error);
      }
    });
  }

  /** Release the streaming snapshot without starting a Worker for static-only parsers. */
  public release(owner: object) {
    const session = this.sessions.get(owner);
    if (!session) return;
    this.sessions.delete(owner);
    this.worker?.postMessage({ release: session.id });
  }

  public terminate() {
    this.stop(new Error("Tokenizer Worker terminated"));
  }

  private stop(error: Error) {
    this.worker?.terminate();
    this.worker = null;
    this.sessions = new WeakMap();
    for (const callback of this.callbacks.values()) callback.reject(error);
    this.callbacks.clear();
  }
}

export const tokenizerService = new TokenizerService();
