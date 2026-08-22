import { describe, expect, it } from "vitest";
import {
  QUICK_PROMPT_LIBRARY,
  SUGGESTED_PROMPTS_BY_TYPE,
} from "../prompt-library";
import { insertPromptAtSelection } from "../utils/promptInsertion";
import type { MediaTaskType } from "../types";

describe("media prompt library", () => {
  const mediaTypes: MediaTaskType[] = ["image", "video", "speech", "music"];

  it.each(mediaTypes)("为 %s 提供完整的分类快捷词库", (type) => {
    const categories = QUICK_PROMPT_LIBRARY[type];

    expect(categories.length).toBeGreaterThan(1);
    expect(categories[0].id).toBe("examples");
    expect(categories.every((category) => category.label.trim())).toBe(true);
    expect(categories.every((category) => category.prompts.length > 0)).toBe(
      true
    );
    expect(SUGGESTED_PROMPTS_BY_TYPE[type]).toEqual(categories[0].prompts);
  });
});

describe("insertPromptAtSelection", () => {
  it("在光标位置插入提示词并将光标移动到插入内容之后", () => {
    expect(insertPromptAtSelection("主体在场景中", "，电影光影", 2, 2)).toEqual(
      {
        value: "主体，电影光影在场景中",
        cursor: 7,
      }
    );
  });

  it("使用提示词替换当前选区", () => {
    expect(insertPromptAtSelection("一个红色的猫", "蓝色的猫", 2, 6)).toEqual({
      value: "一个蓝色的猫",
      cursor: 6,
    });
  });

  it("选区无效时回退到文本末尾", () => {
    expect(
      insertPromptAtSelection("已有内容", "，补充细节", null, null)
    ).toEqual({
      value: "已有内容，补充细节",
      cursor: 9,
    });
  });
});
