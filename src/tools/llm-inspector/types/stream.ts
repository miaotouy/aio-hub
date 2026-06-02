/**
 * LLM Inspector — 流式响应数据类型
 */

/** 单个流式 chunk 更新（来自外部代理事件） */
export interface StreamUpdate {
  id: string;
  chunk: string;
  is_complete: boolean;
}

/** 流式缓冲区：recordId → 累积的 SSE 原始文本 */
export interface StreamBuffer {
  [recordId: string]: string;
}
