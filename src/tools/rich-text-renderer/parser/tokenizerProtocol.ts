// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { Token, TokenizerOptions } from "./types";

/** Large top-level token strings may refer to the preceding session revision. */
export type TokenTextField = "raw" | "content" | "resultContent";
export interface TokenTextPatch {
  from: number;
  to: number;
  insert: string;
}

type WithTextPatches<T> = {
  [K in keyof T]: K extends TokenTextField ? T[K] | TokenTextPatch : T[K];
};
export type TokenUpdate = WithTextPatches<Token>;
export type TokenUpdateBatch =
  | { tokens: Token[]; textPatches?: false }
  | { tokens: TokenUpdate[]; textPatches: true };

export interface TokenizeRequest {
  id: number;
  text: string;
  options?: TokenizerOptions;
  session?: {
    id: number;
    baseRevision: number;
    revision: number;
    from: number;
  };
}

export type TokenizerRequest = TokenizeRequest | { release: number };

export type TokenizerResponse =
  | (TokenUpdateBatch & {
      id: number;
      status: "success";
      prefix: number;
      revision?: number;
    })
  | { id: number; status: "error"; error: string };
