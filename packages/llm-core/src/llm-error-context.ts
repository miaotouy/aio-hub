/**
 * 为 LLM 调用错误补充渠道/模型上下文。
 * 前缀形如 "[渠道名 · 模型名] "，便于用户在报错信息中直接定位来源。
 */

export interface LlmErrorContext {
  /** 渠道（Profile）名称 */
  profileName?: string;
  /** 模型名称或 ID */
  modelName?: string;
}

/** 生成错误上下文前缀，无有效信息时返回空字符串。 */
export function formatLlmErrorContextLabel(context: LlmErrorContext): string {
  const parts = [context.profileName, context.modelName]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter((part) => part.length > 0);
  return parts.length > 0 ? `[${parts.join(" · ")}] ` : "";
}

/**
 * 在错误信息前追加渠道/模型前缀。
 * 优先原地修改以保留错误类型及 status/code 等属性；
 * message 只读时（如 DOMException）回退为包装错误，并保留 name、stack 与常见字段。
 */
export function decorateLlmError(
  error: unknown,
  context: LlmErrorContext
): unknown {
  const prefix = formatLlmErrorContextLabel(context);
  if (!prefix) return error;

  if (error instanceof Error) {
    if (error.message.startsWith(prefix)) return error;
    try {
      error.message = `${prefix}${error.message}`;
      return error;
    } catch {
      const wrapped = new Error(`${prefix}${error.message}`);
      wrapped.name = error.name;
      if (error.stack) wrapped.stack = error.stack;
      copyErrorExtras(error, wrapped);
      return wrapped;
    }
  }

  return new Error(`${prefix}${String(error)}`);
}

function copyErrorExtras(source: Error, target: Error): void {
  for (const key of ["status", "statusCode", "statusText", "code", "body"]) {
    const value = (source as unknown as Record<string, unknown>)[key];
    if (value !== undefined) {
      (target as unknown as Record<string, unknown>)[key] = value;
    }
  }
}
