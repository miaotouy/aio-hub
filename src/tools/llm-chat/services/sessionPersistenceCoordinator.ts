// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {
  AtomicWriteRequest,
  CommitResult,
  PersistReason,
} from "../types/persistence";

export interface SessionPersistenceWriter {
  write(request: AtomicWriteRequest): Promise<CommitResult>;
}

export interface SessionPersistenceCoordinatorOptions {
  writer: SessionPersistenceWriter;
  onBackgroundError?: (
    error: unknown,
    context: Record<string, unknown>
  ) => void;
}

interface WriteSlot {
  running: Promise<CommitResult> | null;
  pending: boolean;
  deleted: boolean;
  revision: number;
  capture: ((revision: number) => string) | null;
  reasons: Set<PersistReason>;
}

/**
 * Coalesces session writes without allowing two writes for one session to run
 * concurrently. A pending slot stores only a dirty marker, so large session
 * snapshots are captured immediately before their actual commit.
 */
export class SessionPersistenceCoordinator {
  private readonly sessionSlots = new Map<string, WriteSlot>();
  private readonly indexSlot: WriteSlot = {
    running: null,
    pending: false,
    deleted: false,
    revision: 0,
    capture: null,
    reasons: new Set(),
  };

  constructor(private readonly options: SessionPersistenceCoordinatorOptions) {}

  primeSessionRevision(sessionId: string, revision: number): void {
    const slot = this.getSessionSlot(sessionId);
    slot.revision = Math.max(slot.revision, revision);
  }

  primeIndexRevision(revision: number): void {
    this.indexSlot.revision = Math.max(this.indexSlot.revision, revision);
  }

  markSessionDirty(
    sessionId: string,
    capture: (revision: number) => string,
    reason: PersistReason = "session-content"
  ): void {
    const slot = this.getSessionSlot(sessionId);
    if (slot.deleted) return;
    slot.capture = capture;
    slot.pending = true;
    slot.reasons.add(reason);
    this.ensureSessionDrain(sessionId, slot).catch((error) => {
      this.options.onBackgroundError?.(error, { sessionId, reason });
    });
  }

  flushSession(
    sessionId: string,
    capture?: (revision: number) => string,
    reason: PersistReason = "session-completed"
  ): Promise<CommitResult> {
    const slot = this.getSessionSlot(sessionId);
    if (slot.deleted) {
      return Promise.resolve({
        outcome: "cancelled",
        revision: slot.revision,
        bytes: 0,
      });
    }
    if (capture) slot.capture = capture;
    if (!slot.capture) {
      return Promise.reject(
        new Error(`No persistence snapshot registered for ${sessionId}`)
      );
    }
    slot.pending = true;
    slot.reasons.add(reason);
    return this.ensureSessionDrain(sessionId, slot);
  }

  markIndexDirty(
    capture: (revision: number) => string,
    reason: PersistReason = "index-mutation"
  ): void {
    this.indexSlot.capture = capture;
    this.indexSlot.pending = true;
    this.indexSlot.reasons.add(reason);
    this.ensureIndexDrain().catch((error) => {
      this.options.onBackgroundError?.(error, { reason });
    });
  }

  flushIndex(
    capture?: (revision: number) => string,
    reason: PersistReason = "index-mutation"
  ): Promise<CommitResult> {
    if (capture) this.indexSlot.capture = capture;
    if (!this.indexSlot.capture) {
      return Promise.reject(
        new Error("No index persistence snapshot registered")
      );
    }
    this.indexSlot.pending = true;
    this.indexSlot.reasons.add(reason);
    return this.ensureIndexDrain();
  }

  markSessionDeleted(sessionId: string): void {
    const slot = this.getSessionSlot(sessionId);
    slot.deleted = true;
    slot.pending = false;
    slot.capture = null;
    slot.reasons.clear();
  }

  async flushAll(timeoutMs = 5_000): Promise<void> {
    const tasks = [
      ...[...this.sessionSlots.entries()]
        .filter(([, slot]) => !slot.deleted && (slot.pending || slot.running))
        .map(([sessionId]) => this.flushSession(sessionId)),
      this.indexSlot.pending || this.indexSlot.running
        ? this.flushIndex()
        : Promise.resolve(),
    ];
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Timed out flushing session persistence")),
        timeoutMs
      );
    });
    await Promise.race([Promise.all(tasks), timeout]);
  }

  private getSessionSlot(sessionId: string): WriteSlot {
    let slot = this.sessionSlots.get(sessionId);
    if (!slot) {
      slot = {
        running: null,
        pending: false,
        deleted: false,
        revision: 0,
        capture: null,
        reasons: new Set(),
      };
      this.sessionSlots.set(sessionId, slot);
    }
    return slot;
  }

  private ensureSessionDrain(
    sessionId: string,
    slot: WriteSlot
  ): Promise<CommitResult> {
    if (slot.running) return slot.running;
    slot.running = this.drain(slot, "session", sessionId, false).finally(() => {
      slot.running = null;
    });
    return slot.running;
  }

  private ensureIndexDrain(): Promise<CommitResult> {
    if (this.indexSlot.running) return this.indexSlot.running;
    this.indexSlot.running = this.drain(
      this.indexSlot,
      "index",
      undefined,
      true
    ).finally(() => {
      this.indexSlot.running = null;
    });
    return this.indexSlot.running;
  }

  private async drain(
    slot: WriteSlot,
    kind: "session" | "index",
    sessionId: string | undefined,
    keepLastValidBackup: boolean
  ): Promise<CommitResult> {
    let last: CommitResult = {
      outcome: "coalesced",
      revision: slot.revision,
      bytes: 0,
    };
    while (slot.pending && !slot.deleted) {
      slot.pending = false;
      const capture = slot.capture;
      if (!capture) break;
      // Capture synchronously before the first await: no Vue proxy/reference is retained.
      const revision = ++slot.revision;
      const content = capture(revision);
      slot.reasons.clear();
      try {
        last = await this.options.writer.write({
          kind,
          sessionId,
          content,
          revision,
          expectedMinRevision: revision - 1,
          keepLastValidBackup,
        });
      } catch (error) {
        // Retain a single pending marker; a later dirty/flush retries from the newest state.
        slot.pending = !slot.deleted;
        throw error;
      }
    }
    return slot.deleted
      ? { outcome: "cancelled", revision: slot.revision, bytes: 0 }
      : last;
  }
}
