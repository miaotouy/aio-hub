import { describe, expect, it } from "vitest";
import { formatDate } from "../useGitProcessor";

describe("git analyzer date formatting", () => {
  it("keeps ISO commit timestamps in their original offset", () => {
    const commitDate = "2026-06-08T08:59:00+08:00";

    expect(formatDate(commitDate, "iso")).toBe(commitDate);
  });
});
