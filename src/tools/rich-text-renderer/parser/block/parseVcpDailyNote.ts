import { Token, ParserContext } from "../types";
import { VcpDailyNoteNode } from "../../types";
import { Tokenizer } from "../Tokenizer";

/**
 * 解析 VCP 日记容器
 */
export function parseVcpDailyNote(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: VcpDailyNoteNode | null; nextIndex: number } {
  const token = tokens[start];
  if (token.type !== "vcp_daily_note") {
    return { node: null, nextIndex: start };
  }

  const { content, closed } = token;

  // 对内容进行二次分词
  const tokenizer = new Tokenizer();
  const innerTokens = tokenizer.tokenize(content);

  // 递归解析内部块
  const children = ctx.parseBlocks(innerTokens);

  return {
    node: {
      id: "",
      type: "vcp_daily_note",
      props: {
        closed,
      },
      children,
      meta: { range: { start: 0, end: 0 }, status: closed ? "stable" : "pending" },
    },
    nextIndex: start + 1,
  };
}