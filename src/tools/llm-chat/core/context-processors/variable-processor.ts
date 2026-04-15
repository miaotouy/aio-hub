import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { get, set } from "lodash-es";
import type { VariableChange, VariableOperator, FlatVariableDefinition } from "../../types/sessionVariable";
import { flattenDefinitions } from "../../utils/variableUtils";

const logger = createModuleLogger("primary:variable-processor");

/**
 * 解析 <svar> 标签
 * 格式: <svar name="path.to.var" op="+" value="10" />
 */
const SVAR_REGEX = /<svar\s+([^>]*?)\/?>/g;
const ATTR_REGEX = /(\w+)=["']?([^"'\s>]+)["']?/g;

/**
 * 解析内置替换符
 * $[path.to.var] 或 $[svars::format]
 */
const REPLACE_REGEX = /\$\[([\w.:-]+)\]/g;

export const variableProcessor: ContextProcessor = {
  id: "primary:variable-processor",
  name: "会话变量处理器",
  description: "处理消息中的 <svar> 标签并维护变量状态。",
  priority: 500,
  execute: async (context: PipelineContext) => {
    const { messages, agentConfig } = context;
    if (!messages || messages.length === 0 || !agentConfig.variableConfig?.enabled) {
      return;
    }

    const variableConfig = agentConfig.variableConfig;
    // 将树形定义扁平化为路径映射
    const definitions = flattenDefinitions(variableConfig.definitions || []);

    // 1. 寻找最近的快照作为起点
    let currentState: Record<string, any> = {};

    // 初始化默认值
    definitions.forEach((def) => {
      let val = def.initialValue;
      // 自动转换数字类型，避免运算错误
      if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) {
        val = Number(val);
      }
      set(currentState, def.path, val);
    });

    // 从后往前找最近的快照
    let snapshotStartIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.metadata?.sessionVariableSnapshot) {
        currentState = structuredClone(msg.metadata.sessionVariableSnapshot.values);
        snapshotStartIndex = i;
        break;
      }
    }

    // 2. 从快照点开始（或从头开始）遍历并应用变更
    const startIndex = snapshotStartIndex + 1;
    let totalChanges = 0;

    for (let i = startIndex; i < messages.length; i++) {
      const message = messages[i];
      if (typeof message.content !== "string") continue;

      const changes: VariableChange[] = [];

      // 解析 <svar> 标签
      let match;
      while ((match = SVAR_REGEX.exec(message.content)) !== null) {
        const attrStr = match[1];
        const attrs: Record<string, string> = {};
        let attrMatch;
        while ((attrMatch = ATTR_REGEX.exec(attrStr)) !== null) {
          attrs[attrMatch[1]] = attrMatch[2];
        }

        const path = attrs.name || attrs.path;
        const op = (attrs.op || "=") as VariableOperator;
        let val: any = attrs.value;

        if (!path) continue;

        // 尝试解析 JSON
        if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
          try {
            val = JSON.parse(val);
          } catch (e) {
            // 解析失败保持原样
          }
        } else if (!isNaN(Number(val))) {
          val = Number(val);
        }

        // 应用变更
        const oldValue = get(currentState, path);
        let newValue = oldValue;

        switch (op) {
          case "=":
          case "set":
            newValue = val;
            break;
          case "+":
          case "add":
            newValue = (typeof oldValue === "number" ? oldValue : 0) + (typeof val === "number" ? val : 0);
            break;
          case "-":
          case "sub":
            newValue = (typeof oldValue === "number" ? oldValue : 0) - (typeof val === "number" ? val : 0);
            break;
          case "*":
            newValue = (typeof oldValue === "number" ? oldValue : 0) * (typeof val === "number" ? val : 1);
            break;
          case "/":
            newValue = (typeof oldValue === "number" ? oldValue : 0) / (typeof val === "number" ? val : 1);
            break;
        }

        // 边界处理
        const def = definitions.find((d) => d.path === path);
        if (def && typeof newValue === "number") {
          if (def.min !== undefined) newValue = Math.max(def.min, newValue);
          if (def.max !== undefined) newValue = Math.min(def.max, newValue);
        }

        // 记录变更
        set(currentState, path, newValue);
        changes.push({
          path,
          op,
          opValue: val,
          oldValue,
          newValue,
        });
        totalChanges++;
      }

      // 重置正则索引
      SVAR_REGEX.lastIndex = 0;

      // 如果有变更，记录到元数据
      if (changes.length > 0) {
        if (!message.metadata) message.metadata = {};
        message.metadata.sessionVariableSnapshot = {
          values: structuredClone(currentState),
          changes,
          timestamp: Date.now(),
        };
      } else if (message.metadata?.isCompressionNode) {
        // 对于压缩节点，强制持久化快照，即使没有新变更
        if (!message.metadata) message.metadata = {};
        message.metadata.sessionVariableSnapshot = {
          values: structuredClone(currentState),
          timestamp: Date.now(),
        };
      }

      // 3. 执行内置替换 $[...]
      message.content = message.content.replace(REPLACE_REGEX, (fullMatch, key) => {
        if (key.startsWith("svars::")) {
          const format = key.split("::")[1] || "json";
          return formatVariables(currentState, definitions, format);
        }
        const val = get(currentState, key);
        return val !== undefined ? String(val) : fullMatch;
      });
    }

    if (totalChanges > 0) {
      const logMsg = `变量处理器执行完成，共检测到 ${totalChanges} 次变量变更。`;
      logger.info(logMsg);
      context.logs.push({
        processorId: "primary:variable-processor",
        level: "info",
        message: logMsg,
      });
    }
  },
};

/**
 * 格式化变量列表
 */
function formatVariables(state: Record<string, any>, definitions: FlatVariableDefinition[], format: string): string {
  const visibleVars = definitions
    .filter((d) => !d.hidden)
    .map((d) => ({
      name: d.displayName || d.path,
      path: d.path,
      value: get(state, d.path),
      description: d.description,
    }));

  switch (format) {
    case "table":
      let table = "| 变量 | 值 | 描述 |\n| --- | --- | --- |\n";
      visibleVars.forEach((v) => {
        table += `| ${v.name} | ${v.value} | ${v.description || "-"} |\n`;
      });
      return table;
    case "list":
      return visibleVars.map((v) => `- ${v.name}: ${v.value}${v.description ? ` (${v.description})` : ""}`).join("\n");
    case "json":
    default:
      // 仅导出可见变量的键值对
      const json: Record<string, any> = {};
      visibleVars.forEach((v) => {
        json[v.path] = v.value;
      });
      return JSON.stringify(json, null, 2);
  }
}
