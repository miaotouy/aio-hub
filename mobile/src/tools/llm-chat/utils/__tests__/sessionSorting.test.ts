import { describe, expect, it } from "vitest";
import { sortSessionMetas, type SessionSortOption } from "../sessionSorting";
import type { SessionIndexItem } from "../../composables/useSessionManager";

const sessions: SessionIndexItem[] = [
  {
    id: "bravo",
    name: "Bravo",
    updatedAt: "2026-07-24T00:00:00.000Z",
    createdAt: "2026-07-22T00:00:00.000Z",
    messageCount: 3,
  },
  {
    id: "alpha",
    name: "Alpha",
    updatedAt: "2026-07-26T00:00:00.000Z",
    createdAt: "2026-07-21T00:00:00.000Z",
    messageCount: 1,
  },
  {
    id: "charlie",
    name: "charlie",
    updatedAt: "2026-07-25T00:00:00.000Z",
    createdAt: "2026-07-23T00:00:00.000Z",
    messageCount: 3,
  },
];

function ids(option: SessionSortOption): string[] {
  return sortSessionMetas(sessions, option).map((session) => session.id);
}

describe("session sorting", () => {
  it("defaults to the most recently updated session without mutating the source", () => {
    expect(sortSessionMetas(sessions).map((session) => session.id)).toEqual([
      "alpha",
      "charlie",
      "bravo",
    ]);
    expect(sessions.map((session) => session.id)).toEqual([
      "bravo",
      "alpha",
      "charlie",
    ]);
  });

  it("supports both directions for every desktop-compatible sort field", () => {
    expect(ids({ field: "updatedAt", direction: "asc" })).toEqual([
      "bravo",
      "charlie",
      "alpha",
    ]);
    expect(ids({ field: "createdAt", direction: "desc" })).toEqual([
      "charlie",
      "bravo",
      "alpha",
    ]);
    expect(ids({ field: "createdAt", direction: "asc" })).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
    expect(ids({ field: "messageCount", direction: "desc" })).toEqual([
      "bravo",
      "charlie",
      "alpha",
    ]);
    expect(ids({ field: "messageCount", direction: "asc" })).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
    expect(ids({ field: "name", direction: "asc" })).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
    expect(ids({ field: "name", direction: "desc" })).toEqual([
      "charlie",
      "bravo",
      "alpha",
    ]);
  });

  it("uses the id as a deterministic tie-breaker", () => {
    expect(
      sortSessionMetas(
        [
          { ...sessions[0], id: "zeta", name: "Same" },
          { ...sessions[1], id: "alpha", name: "same" },
        ],
        { field: "name", direction: "asc" }
      ).map((session) => session.id)
    ).toEqual(["alpha", "zeta"]);
  });
});
