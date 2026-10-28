// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { isEqual } from "lodash-es";
import { encodeTokenUpdates } from "./tokenizerTokenDelta";
import { Tokenizer } from "./Tokenizer";
import type { Token } from "./types";
import type { TokenizerRequest, TokenizerResponse } from "./tokenizerProtocol";

/** Only streaming owners retain a previous token snapshot; static requests stay stateless. */
export class TokenizerWorkerState {
  private sessions = new Map<
    number,
    { text: string; tokens: Token[]; revision: number }
  >();

  handle(request: TokenizerRequest): TokenizerResponse | undefined {
    if ("release" in request) {
      this.sessions.delete(request.release);
      return;
    }
    const { id, options, session } = request;
    try {
      const previous = session ? this.sessions.get(session.id) : undefined;
      if (
        session &&
        ((previous?.revision ?? 0) !== session.baseRevision ||
          session.revision !== session.baseRevision + 1 ||
          session.from < 0 ||
          session.from > (previous?.text.length ?? 0))
      ) {
        throw new Error("Tokenizer stream revision mismatch");
      }
      const text = session
        ? (previous?.text.slice(0, session.from) ?? "") + request.text
        : request.text;
      const tokens = new Tokenizer(options).tokenize(text);
      let prefix = 0;
      if (previous) {
        const length = Math.min(previous.tokens.length, tokens.length);
        while (
          prefix < length &&
          isEqual(previous.tokens[prefix], tokens[prefix])
        )
          prefix++;
      }
      if (session) {
        this.sessions.set(session.id, {
          text,
          tokens,
          revision: session.revision,
        });
      }
      return {
        id,
        status: "success",
        ...(previous
          ? encodeTokenUpdates(previous.tokens, tokens, prefix)
          : { tokens }),
        prefix,
        ...(session ? { revision: session.revision } : {}),
      };
    } catch (error) {
      if (session) this.sessions.delete(session.id);
      return { id, status: "error", error: String(error) };
    }
  }
}
