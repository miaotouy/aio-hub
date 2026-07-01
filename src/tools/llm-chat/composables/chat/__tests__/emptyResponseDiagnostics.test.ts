import { describe, expect, it } from "vitest";
import {
  buildEmptyResponseDiagnostic,
  scanForHiddenText,
} from "../emptyResponseDiagnostics";

describe("emptyResponseDiagnostics", () => {
  it("does not warn when visible content exists", () => {
    expect(
      buildEmptyResponseDiagnostic({
        response: { content: "hello" },
        visibleText: "hello",
      })
    ).toBeUndefined();
  });

  it("does not warn when reasoning content is visible", () => {
    expect(
      buildEmptyResponseDiagnostic({
        response: {
          content: "",
          reasoningContent: "thinking only",
          usage: { promptTokens: 1, completionTokens: 12, totalTokens: 13 },
          isStream: true,
        },
        visibleText: "thinking only",
      })
    ).toBeUndefined();
  });

  it("detects responses with only hidden thinking fields", () => {
    const diagnostic = buildEmptyResponseDiagnostic({
      response: {
        content: "",
        thought: "hidden thinking only",
        usage: { promptTokens: 1, completionTokens: 12, totalTokens: 13 },
        isStream: true,
      },
      visibleText: "",
    });

    expect(diagnostic).toContain("未展示思考/推理内容");
    expect(diagnostic).toContain("输出 12 tokens");
    expect(diagnostic).toContain("流式响应");
  });

  it("detects unsupported native tool call only responses", () => {
    const diagnostic = buildEmptyResponseDiagnostic({
      response: {
        content: "",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "search", arguments: "{}" },
          },
        ],
      },
      visibleText: "",
    });

    expect(diagnostic).toContain("原生工具调用字段");
    expect(diagnostic).toContain("停止原因是工具调用");
  });

  it("does not warn for media-only responses", () => {
    expect(
      buildEmptyResponseDiagnostic({
        response: { content: "", images: [{ b64_json: "abc" }] },
        visibleText: "",
      })
    ).toBeUndefined();
  });

  it("heuristically detects unadapted custom text fields", () => {
    const response: any = {
      content: "",
      // 模拟一个未适配的自定义字段，比如 choices[0].message.reasoning_content
      extraBody: {
        choices: [
          {
            message: {
              reasoning_content:
                "this is a very long unadapted reasoning content from upstream API",
            },
          },
        ],
      },
    };

    const diagnostic = buildEmptyResponseDiagnostic({
      response,
      visibleText: "",
    });

    expect(diagnostic).toContain("检测到约 65 字的未展示文本内容");
    expect(diagnostic).toContain(
      "extraBody.choices.0.message.reasoning_content"
    );
    expect(diagnostic).toContain("this is a very long unadapted ...");
  });

  it("excludes known metadata and short non-content strings", () => {
    const diagnostic = buildEmptyResponseDiagnostic({
      response: {
        content: "",
        id: "chatcmpl-12345", // 排除
        model: "gpt-4o", // 排除
        finishReason: "stop", // 排除
        status: "success", // 排除
        someShortEnum: "stop", // 排除（太短且不含中文/空格）
        someOtherField: "this is long enough to be content", // 保留
      } as any,
      visibleText: "",
    });

    expect(diagnostic).not.toContain("id");
    expect(diagnostic).not.toContain("model");
    expect(diagnostic).not.toContain("finishReason");
    expect(diagnostic).not.toContain("someShortEnum");
    expect(diagnostic).toContain("someOtherField");
  });

  it("excludes text that is already visible", () => {
    const response = {
      content: "",
      thought: "this is already visible", // 排除，因为包含在 visibleText 中
      unadaptedField: "this is hidden", // 保留
    } as any;

    const hiddenFields = scanForHiddenText(response, "this is already visible");

    const paths = hiddenFields.map((f) => f.path);
    expect(paths).not.toContain("thought");
    expect(paths).toContain("unadaptedField");
  });
});

