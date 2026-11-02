import { describe, expect, it } from "vitest";
import { suggestNextTag } from "./tagVersion";

// 保护公开的版本建议规则：数值排序、预发布递增及发布序列隔离。
describe("suggestNextTag", () => {
  it.each([
    [["v1.2.9", "v1.2.10"], "v1.2.11"],
    [["v0.7.0-alpha.9", "v0.7.0-alpha.6"], "v0.7.0-alpha.10"],
    [["v1.0.0-rc.5", "v1.0.0"], "v1.0.1"],
    [["v1.0.0-alpha.10", "v1.0.0-beta.2"], "v1.0.0-beta.3"],
    [["1.2.3-beta"], "1.2.3-beta.1"],
    [["v1.2.3+build.4", "mv9.0.0"], "v1.2.4"],
    [["mv1.2.3"], "mv1.2.4"],
    [["release-notes", "v01.2.3", "v1.0.0-alpha.01"], null],
    [[], null],
  ] as const)("suggests from %j", (tags, expected) => {
    expect(suggestNextTag(tags)).toBe(expected);
  });
});
