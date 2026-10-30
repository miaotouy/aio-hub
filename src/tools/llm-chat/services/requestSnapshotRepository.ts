import type {
  ChatRequestAttemptSnapshot,
  SessionRequestSnapshotFile,
} from "../types/requestSnapshot";

export const SNAPSHOT_LIMITS = {
  attempts: 10,
  attemptBytes: 1024 * 1024,
  sessionBytes: 4 * 1024 * 1024,
};
const encoder = new TextEncoder();
export const snapshotBytes = (value: unknown) =>
  encoder.encode(JSON.stringify(value)).byteLength;

export function boundAttempt(
  input: ChatRequestAttemptSnapshot
): ChatRequestAttemptSnapshot {
  const attempt: ChatRequestAttemptSnapshot = JSON.parse(JSON.stringify(input));
  if (snapshotBytes(attempt) <= SNAPSHOT_LIMITS.attemptBytes) return attempt;
  for (const message of [
    ...attempt.messages,
    ...(attempt.topLevelSystem ? [attempt.topLevelSystem] : []),
  ]) {
    for (const part of message.parts) {
      delete part.textPreview;
      if (part.textState) part.textState = "omitted";
    }
  }
  for (const source of attempt.sources)
    for (const macro of source.executedMacros ?? []) delete macro.preview;
  if (snapshotBytes(attempt) <= SNAPSHOT_LIMITS.attemptBytes) return attempt;
  attempt.sources = [];
  delete attempt.transformations;
  attempt.captureQuality = "partial";
  for (const message of [
    ...attempt.messages,
    ...(attempt.topLevelSystem ? [attempt.topLevelSystem] : []),
  ]) {
    message.sourceKeys = [];
    for (const part of message.parts) part.sourceKeys = [];
  }
  if (snapshotBytes(attempt) <= SNAPSHOT_LIMITS.attemptBytes) return attempt;
  attempt.messages = [];
  delete attempt.topLevelSystem;
  attempt.captureQuality = "summaryOnly";
  attempt.assistantNodeIds = attempt.assistantNodeIds
    .slice(0, 100)
    .map((id) => id.slice(0, 200));
  for (const key of Object.keys(attempt.route) as Array<
    keyof typeof attempt.route
  >) {
    const value = attempt.route[key];
    if (typeof value === "string") attempt.route[key] = value.slice(0, 512);
  }
  if (attempt.reportedUsageFields)
    attempt.reportedUsageFields = Object.fromEntries(
      Object.entries(attempt.reportedUsageFields)
        .slice(0, 32)
        .map(([key, value]) => [key.slice(0, 120), value])
    );
  return attempt;
}
export interface SnapshotIO {
  read(sessionId: string): Promise<SessionRequestSnapshotFile | null>;
  write(file: SessionRequestSnapshotFile): Promise<void>;
}
export class RequestSnapshotRepository {
  private queues = new Map<string, Promise<unknown>>();
  private epochs = new Map<string, number>();
  private indices = new Map<string, number>();
  private deleted = new Set<string>();
  constructor(private io: SnapshotIO) {}
  epoch(id: string) {
    return this.epochs.get(id) ?? 0;
  }
  private serial<T>(id: string, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    this.queues.set(id, next);
    void next
      .finally(() => {
        if (this.queues.get(id) === next) this.queues.delete(id);
      })
      .catch(() => {});
    return next;
  }
  async list(id: string): Promise<ChatRequestAttemptSnapshot[]> {
    return this.serial(
      id,
      async () => (await this.io.read(id))?.attempts ?? []
    );
  }
  async prepare(id: string) {
    const attempts = await this.list(id);
    for (const item of attempts) {
      const key = `${id}:${item.requestId}`;
      this.indices.set(
        key,
        Math.max(this.indices.get(key) ?? 0, item.attemptIndex)
      );
    }
    return this.epoch(id);
  }
  reserve(id: string, requestId: string) {
    const key = `${id}:${requestId}`;
    const index = (this.indices.get(key) ?? 0) + 1;
    this.indices.set(key, index);
    return index;
  }
  save(attempt: ChatRequestAttemptSnapshot, epoch: number): Promise<void> {
    const frozen = boundAttempt(attempt);
    return this.serial(attempt.sessionId, async () => {
      if (
        this.epoch(attempt.sessionId) !== epoch ||
        this.deleted.has(attempt.sessionId)
      )
        return;
      const file = await this.io.read(attempt.sessionId);
      if (this.epoch(attempt.sessionId) !== epoch) return;
      const attempts = (file?.attempts ?? []).filter(
        (item) => item.attemptId !== frozen.attemptId
      );
      attempts.push(frozen);
      attempts.sort(
        (a, b) =>
          a.startedAt - b.startedAt ||
          a.attemptIndex - b.attemptIndex ||
          a.attemptId.localeCompare(b.attemptId)
      );
      while (attempts.length > SNAPSHOT_LIMITS.attempts) attempts.shift();
      const updated: SessionRequestSnapshotFile = {
        schemaVersion: 1,
        sessionId: attempt.sessionId,
        updatedAt: Date.now(),
        attempts,
        _persistence: { revision: (file?._persistence?.revision ?? 0) + 1 },
      };
      while (
        attempts.length &&
        snapshotBytes(updated) > SNAPSHOT_LIMITS.sessionBytes
      )
        attempts.shift();
      await this.io.write(updated);
    });
  }
  clear(id: string): Promise<void> {
    this.epochs.set(id, this.epoch(id) + 1);
    return this.serial(id, async () => {
      const file = await this.io.read(id).catch(() => null);
      await this.io.write({
        schemaVersion: 1,
        sessionId: id,
        updatedAt: Date.now(),
        attempts: [],
        _persistence: {
          revision: Math.max(
            Date.now(),
            (file?._persistence?.revision ?? 0) + 1
          ),
        },
      });
    });
  }
  invalidateDeleted(id: string) {
    this.epochs.set(id, this.epoch(id) + 1);
    this.deleted.add(id);
  }
}
