import { Token, ParserContext } from "../types";
import { VcpRoleNode } from "../../types";
import { Tokenizer } from "../Tokenizer";

/**
 * 解析 VCP 角色容器
 */
export function parseVcpRole(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: VcpRoleNode | null; nextIndex: number } {
  const token = tokens[start];
  if (token.type !== "vcp_role") {
    return { node: null, nextIndex: start };
  }

  const { role, content, closed } = token;

  // 对内容进行二次分词
  const tokenizer = new Tokenizer();
  const innerTokens = tokenizer.tokenize(content);

  // 递归解析内部块
  const children = ctx.parseBlocks(innerTokens);

  return {
    node: {
      id: "",
      type: "vcp_role",
      props: {
        role,
        closed,
      },
      children,
      meta: { range: { start: 0, end: 0 }, status: closed ? "stable" : "pending" },
    },
    nextIndex: start + 1,
  };
}