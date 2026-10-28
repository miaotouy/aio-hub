// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { Token, TokenizerOptions } from "./types";

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
  | {
      id: number;
      status: "success";
      tokens: Token[];
      prefix: number;
      revision?: number;
    }
  | { id: number; status: "error"; error: string };
