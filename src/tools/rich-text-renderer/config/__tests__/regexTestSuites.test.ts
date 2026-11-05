import { describe, expect, it } from "vitest";
import { applyRegexRules } from "@/tools/llm-chat/utils/chatRegexUtils";
import { regexTestSuites } from "../regexTestSuites";

describe("rich text renderer regex test suites", () => {
  it("provides examples whose enabled rules demonstrate the configured transformations", () => {
    const outputs = new Map(
      regexTestSuites.map((suite) => {
        const rules = suite.config.presets
          .filter((preset) => preset.enabled)
          .flatMap((preset) => preset.rules)
          .filter((rule) => rule.enabled && rule.applyTo.render);

        return [suite.id, applyRegexRules(suite.content, rules)];
      })
    );

    expect(outputs.get("renderer-regex-think-cleanup")).not.toContain(
      "内部推理"
    );
    expect(outputs.get("renderer-regex-think-cleanup")).toContain(
      "答案是 **42**"
    );
    expect(outputs.get("renderer-regex-notice-conversion")).toContain(
      "> **提示：** 文件已成功保存。"
    );
    expect(outputs.get("renderer-regex-scene-template")).toContain(
      "### 雨夜来信\n\n**地点：** 旧车站\n\n月台的灯忽明忽暗。"
    );
    expect(outputs.get("renderer-regex-scene-template")).toContain(
      "故事仍在继续。"
    );
    expect(outputs.get("renderer-regex-rule-pipeline")).not.toContain(
      "tone=calm"
    );
    expect(outputs.get("renderer-regex-rule-pipeline")).toContain(
      "- **信号：** 微弱"
    );
    expect(outputs.get("renderer-regex-rule-pipeline")).toContain(
      "- **电量：** 充足"
    );
    expect(outputs.get("renderer-regex-placeholder-replacement")).toContain(
      "你好，访客。"
    );
    expect(outputs.get("renderer-regex-placeholder-replacement")).toContain(
      "智能助手"
    );
  });
});
