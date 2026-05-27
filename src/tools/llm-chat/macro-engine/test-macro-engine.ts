/**
 * 宏引擎测试脚本
 * 用于验证宏处理的核心功能
 */

import {
  initializeMacroEngine,
  MacroProcessor,
  createMacroContext,
} from "./index";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/macro-test");
const errorHandler = createModuleErrorHandler("llm-chat/macro-test");

/**
 * 运行宏引擎测试
 */
export async function testMacroEngine(): Promise<void> {
  logger.info("🧪 开始测试宏引擎...");

  // 初始化宏引擎
  initializeMacroEngine();
  logger.info("✅ 宏引擎初始化完成");

  const processor = new MacroProcessor();

  // 测试1: 简单值替换
  await testSimpleSubstitution(processor);

  // 测试2: 变量操作
  await testVariableOperations(processor);

  // 测试3: 时间日期宏
  await testDateTimeMacros(processor);

  // 测试4: 功能性宏
  await testFunctionMacros(processor);

  // 测试5: 完整的三阶段处理
  await testFullPipeline(processor);

  logger.info("🎉 所有测试完成！");
}

/**
 * 测试简单值替换
 */
async function testSimpleSubstitution(
  processor: MacroProcessor
): Promise<void> {
  logger.info("📝 测试1: 简单值替换");

  const context = createMacroContext({
    userName: "张三",
    charName: "AI助手",
  });

  const text = "你好 {{user}}，我是 {{char}}。";
  const result = await processor.process(text, context, { debug: true });

  logger.info("输入:", text);
  logger.info("输出:", result.output);
  logger.info("宏数量:", result.macroCount);

  if (result.output === "你好 张三，我是 AI助手。") {
    logger.info("✅ 测试通过");
  } else {
    errorHandler.handle(new Error("输出不符合预期"), {
      userMessage: "❌ 测试失败",
      showToUser: false,
    });
  }
}

/**
 * 测试变量操作
 */
async function testVariableOperations(
  processor: MacroProcessor
): Promise<void> {
  logger.info("📝 测试2: 变量操作");

  const context = createMacroContext({
    userName: "用户",
    charName: "助手",
  });

  const text =
    "{{setvar::count::0}}计数器初始值: {{getvar::count}}{{incvar::count}}{{incvar::count}}增加后: {{getvar::count}}";
  const result = await processor.process(text, context, { debug: true });

  logger.info("输入:", text);
  logger.info("输出:", result.output);

  if (result.output === "计数器初始值: 0增加后: 2") {
    logger.info("✅ 测试通过");
  } else {
    errorHandler.handle(new Error("输出不符合预期"), {
      userMessage: "❌ 测试失败",
      showToUser: false,
    });
  }
}

/**
 * 测试时间日期宏
 */
async function testDateTimeMacros(processor: MacroProcessor): Promise<void> {
  logger.info("📝 测试3: 时间日期宏");

  const context = createMacroContext({
    userName: "用户",
    charName: "助手",
  });

  const text = "当前时间: {{time}}，日期: {{date}}";
  const result = await processor.process(text, context);

  logger.info("输入:", text);
  logger.info("输出:", result.output);

  // 检查是否包含时间和日期格式
  if (result.output.includes("当前时间:") && result.output.includes("日期:")) {
    logger.info("✅ 测试通过");
  } else {
    errorHandler.handle(new Error("输出不符合预期"), {
      userMessage: "❌ 测试失败",
      showToUser: false,
    });
  }
}

/**
 * 测试功能性宏
 */
async function testFunctionMacros(processor: MacroProcessor): Promise<void> {
  logger.info("📝 测试4: 功能性宏");

  const context = createMacroContext({
    userName: "用户",
    charName: "助手",
  });

  const text = "随机选择: {{random::A::B::C}}，换行测试:{{newline}}第二行";
  const result = await processor.process(text, context);

  logger.info("输入:", text);
  logger.info("输出:", result.output);

  // 检查是否包含随机选择和换行
  if (
    result.output.includes("随机选择:") &&
    result.output.includes("\n第二行")
  ) {
    logger.info("✅ 测试通过");
  } else {
    errorHandler.handle(new Error("输出不符合预期"), {
      userMessage: "❌ 测试失败",
      showToUser: false,
    });
  }
}

/**
 * 测试完整的三阶段处理
 */
async function testFullPipeline(processor: MacroProcessor): Promise<void> {
  logger.info("📝 测试5: 完整的三阶段处理");

  const context = createMacroContext({
    userName: "李四",
    charName: "Claude",
  });

  const text = `
{{setvar::score::100}}
# 欢迎 {{user}}！

我是 {{char}}，当前时间是 {{time}}。
你的初始分数是 {{getvar::score}}。
{{incvar::score}}
更新后的分数是 {{getvar::score}}。

随机祝福: {{random::祝你好运::加油::继续努力}}
`.trim();

  const result = await processor.process(text, context, { debug: true });

  logger.info("输入:", text);
  logger.info("输出:", result.output);

  if (result.phaseOutputs) {
    logger.info("\n=== 三阶段处理详情 ===");
    logger.info("原始输入:", result.phaseOutputs.original);
    logger.info("预处理后:", result.phaseOutputs.afterPreProcess);
    logger.info("替换后:", result.phaseOutputs.afterSubstitute);
    logger.info("后处理后:", result.phaseOutputs.afterPostProcess);
  }

  // 检查关键元素
  const checks = [
    result.output.includes("欢迎 李四"),
    result.output.includes("我是 Claude"),
    result.output.includes("你的初始分数是 100"),
    result.output.includes("更新后的分数是 101"),
    result.macroCount >= 8,
  ];

  if (checks.every((check) => check)) {
    logger.info("✅ 测试通过");
  } else {
    errorHandler.handle(new Error("输出不符合预期"), {
      userMessage: "❌ 测试失败",
      showToUser: false,
      context: { checks },
    });
  }
}
