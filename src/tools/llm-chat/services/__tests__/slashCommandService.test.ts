import { describe, it, expect, vi } from "vitest";
import {
  getPinyinInitials,
  filterCommands,
  getSystemCommands,
  groupCommandsByCategory,
  applyCommand,
} from "../slashCommandService";
import type { SlashCommandItem, ChatInputContext } from "../../types/slash-command";

describe("slashCommandService", () => {
  it("getPinyinInitials should extract correct initials for Chinese words", () => {
    expect(getPinyinInitials("新建会话")).toBe("xjhh");
    expect(getPinyinInitials("翻译")).toBe("fy");
    expect(getPinyinInitials("压缩")).toBe("ys");
    expect(getPinyinInitials("分析")).toBe("fx");
    expect(getPinyinInitials("路径转附件")).toBe("ljzfj");
    expect(getPinyinInitials("智能转写")).toBe("znzx");
    expect(getPinyinInitials("临时模型")).toBe("lsmx");
    expect(getPinyinInitials("剪切草稿")).toBe("jqcg");
    expect(getPinyinInitials("粘贴草稿")).toBe("ztcg");
  });

  it("filterCommands matches by name, aliases and pinyin initials", () => {
    const commands = getSystemCommands();

    // 匹配中文名
    const matchName = filterCommands(commands, "新建会话");
    expect(matchName.some((c) => c.name === "新建会话")).toBe(true);

    // 匹配别名 new
    const matchNew = filterCommands(commands, "new");
    expect(matchNew.some((c) => c.name === "新建会话")).toBe(true);

    // 兼容别名 clear
    const matchAlias = filterCommands(commands, "clear");
    expect(matchAlias.some((c) => c.name === "新建会话")).toBe(true);

    // 匹配拼音首字母 xj / xjh
    const matchPinyinXj = filterCommands(commands, "xj");
    expect(matchPinyinXj.some((c) => c.name === "新建会话")).toBe(true);

    // 匹配拼音首字母 fy -> 翻译
    const matchPinyinFy = filterCommands(commands, "fy");
    expect(matchPinyinFy.some((c) => c.name === "翻译")).toBe(true);

    // 匹配拼音首字母 ls -> 临时模型
    const matchPinyinLs = filterCommands(commands, "ls");
    expect(matchPinyinLs.some((c) => c.name === "临时模型")).toBe(true);
  });

  it("groupCommandsByCategory orders system and model first", () => {
    const commands: SlashCommandItem[] = [
      {
        id: "custom:1",
        name: "test",
        displayName: "Test",
        description: "",
        category: "custom",
        type: "insert",
      },
      {
        id: "sys:1",
        name: "新建会话",
        displayName: "新建会话",
        description: "",
        category: "system",
        type: "action",
      },
      {
        id: "model:1",
        name: "临时模型",
        displayName: "临时模型",
        description: "",
        category: "model",
        type: "action",
      },
    ];

    const groups = groupCommandsByCategory(commands);
    expect(groups[0].category).toBe("system");
    expect(groups[1].category).toBe("model");
    expect(groups[2].category).toBe("custom");
  });

  it("applyCommand invokes execute if present", async () => {
    const executeMock = vi.fn();
    const mockContext: ChatInputContext = {
      getValue: () => "test",
      replaceValue: vi.fn(),
      insertText: vi.fn(),
      requestSubmit: vi.fn(),
      focus: vi.fn(),
    };

    const item: SlashCommandItem = {
      id: "test:action",
      name: "actionTest",
      displayName: "Action Test",
      description: "",
      category: "system",
      type: "action",
      execute: executeMock,
    };

    await applyCommand(item, mockContext);
    expect(executeMock).toHaveBeenCalledWith(mockContext);
  });
});
