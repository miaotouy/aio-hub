import type { SessionIndexItem } from "../composables/useSessionManager";

export type SessionSortField =
  "updatedAt" | "createdAt" | "messageCount" | "name";
export type SessionSortDirection = "asc" | "desc";

export interface SessionSortOption {
  field: SessionSortField;
  direction: SessionSortDirection;
}

export const DEFAULT_SESSION_SORT: SessionSortOption = {
  field: "updatedAt",
  direction: "desc",
};

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
  const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
  return normalizedLeft - normalizedRight;
}

function compareSessions(
  left: SessionIndexItem,
  right: SessionIndexItem,
  field: SessionSortField
): number {
  switch (field) {
    case "updatedAt":
      return compareTimestamp(left.updatedAt, right.updatedAt);
    case "createdAt":
      return compareTimestamp(left.createdAt, right.createdAt);
    case "messageCount":
      return left.messageCount - right.messageCount;
    case "name":
      return left.name.localeCompare(right.name, "zh-CN", {
        sensitivity: "base",
      });
  }
}

/**
 * Returns a stable presentation order without mutating the store-backed list.
 * Ties always use the session id, so a refresh cannot reshuffle equal records.
 */
export function sortSessionMetas(
  sessions: readonly SessionIndexItem[],
  option: SessionSortOption = DEFAULT_SESSION_SORT
): SessionIndexItem[] {
  const multiplier = option.direction === "asc" ? 1 : -1;

  return [...sessions].sort((left, right) => {
    const comparison = compareSessions(left, right, option.field);
    if (comparison !== 0) return comparison * multiplier;
    return left.id.localeCompare(right.id);
  });
}
