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

import { Tokenizer } from "./Tokenizer";

/**
 * Tokenizer Worker
 * 用于在后台线程执行分词逻辑，避免阻塞主线程。
 */

self.onmessage = (e: MessageEvent<{ text: string; id: number }>) => {
  const { text, id } = e.data;
  try {
    const tokenizer = new Tokenizer();
    const tokens = tokenizer.tokenize(text);
    self.postMessage({ id, status: "success", tokens });
  } catch (error) {
    self.postMessage({ id, status: "error", error: String(error) });
  }
};
