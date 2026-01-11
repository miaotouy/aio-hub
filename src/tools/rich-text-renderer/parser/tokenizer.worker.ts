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