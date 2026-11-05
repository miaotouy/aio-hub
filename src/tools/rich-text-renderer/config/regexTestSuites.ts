import type { ChatRegexConfig } from "@/tools/llm-chat/types/chatRegex";

export interface RegexTestSuite {
  id: string;
  name: string;
  description: string;
  content: string;
  config: ChatRegexConfig;
}

const createRule = (
  id: string,
  name: string,
  regex: string,
  replacement: string
) => ({
  id,
  name,
  enabled: true,
  regex,
  replacement,
  flags: "gm",
  applyTo: { render: true, request: false },
  targetRoles: ["system", "user", "assistant"] as Array<
    "system" | "user" | "assistant"
  >,
  replacementType: "regex" as const,
  substitutionMode: "NONE" as const,
});

export const regexTestSuites: RegexTestSuite[] = [
  {
    id: "renderer-regex-think-cleanup",
    name: "隐藏思考标签",
    description: "移除 <think>...</think> 内容，检查渲染前清理效果。",
    content:
      "# 回复\n\n<think>这里是模型的内部推理，不应显示在正文中。</think>\n\n答案是 **42**。",
    config: {
      bindingMode: "message",
      presets: [
        {
          id: "renderer-regex-think-cleanup-preset",
          name: "思考标签清理",
          enabled: true,
          priority: 100,
          rules: [
            createRule(
              "renderer-regex-remove-think",
              "移除 think 块",
              "<think>[\\s\\S]*?</think>",
              ""
            ),
          ],
        },
      ],
    },
  },
  {
    id: "renderer-regex-notice-conversion",
    name: "自定义标签转 Markdown",
    description: "将 <notice> 标签转换为 Markdown 引用提示。",
    content:
      "处理结果如下：\n\n<notice>文件已成功保存。</notice>\n\n你可以继续编辑。",
    config: {
      bindingMode: "message",
      presets: [
        {
          id: "renderer-regex-notice-conversion-preset",
          name: "通知标签转换",
          enabled: true,
          priority: 100,
          rules: [
            createRule(
              "renderer-regex-convert-notice",
              "转换 notice 标签",
              "<notice>([\\s\\S]*?)</notice>",
              "> **提示：** $1"
            ),
          ],
        },
      ],
    },
  },
  {
    id: "renderer-regex-scene-template",
    name: "多行捕获组模板化",
    description: "提取块级标签中的标题、地点和多行正文，组装成 Markdown 场景卡片。",
    content:
      '<scene title="雨夜来信" place="旧车站">\n月台的灯忽明忽暗。\n她把信封递了过来。\n</scene>\n\n故事仍在继续。',
    config: {
      bindingMode: "message",
      presets: [
        {
          id: "renderer-regex-scene-template-preset",
          name: "场景块模板",
          enabled: true,
          priority: 100,
          rules: [
            createRule(
              "renderer-regex-scene-to-markdown",
              "场景块转 Markdown",
              '<scene title="([^"]+)" place="([^"]+)">\\n?([\\s\\S]*?)\\n?</scene>',
              "### $1\\n\\n**地点：** $2\\n\\n$3"
            ),
          ],
        },
      ],
    },
  },
  {
    id: "renderer-regex-rule-pipeline",
    name: "多规则流水线",
    description: "先清理内部元数据，再把状态标签整理为 Markdown 列表。",
    content:
      '<meta>tone=calm</meta>\n<status key="信号">微弱</status>\n<status key="电量">充足</status>\n连接已建立。',
    config: {
      bindingMode: "message",
      presets: [
        {
          id: "renderer-regex-rule-pipeline-preset",
          name: "元数据与状态格式化",
          enabled: true,
          priority: 100,
          rules: [
            createRule(
              "renderer-regex-remove-meta",
              "移除元数据块",
              "<meta>[\\s\\S]*?</meta>\\n?",
              ""
            ),
            createRule(
              "renderer-regex-status-to-list",
              "状态标签转列表",
              '<status key="([^"]+)">([\\s\\S]*?)</status>',
              "- **$1：** $2\\n"
            ),
          ],
        },
      ],
    },
  },
  {
    id: "renderer-regex-placeholder-replacement",
    name: "占位符替换",
    description: "将固定占位符替换为展示文本。",
    content: "你好，[[user]]。\n\n本次会话由 [[assistant]] 为你整理。",
    config: {
      bindingMode: "message",
      presets: [
        {
          id: "renderer-regex-placeholder-replacement-preset",
          name: "演示占位符",
          enabled: true,
          priority: 100,
          rules: [
            createRule(
              "renderer-regex-user-placeholder",
              "替换用户占位符",
              "\\[\\[user\\]\\]",
              "访客"
            ),
            createRule(
              "renderer-regex-assistant-placeholder",
              "替换助手占位符",
              "\\[\\[assistant\\]\\]",
              "智能助手"
            ),
          ],
        },
      ],
    },
  },
];
