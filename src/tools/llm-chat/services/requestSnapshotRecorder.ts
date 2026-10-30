import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { isAbortError } from "@/llm-apis/common";
import type {
  ChatRequestAttemptSnapshot,
  SnapshotSource,
  SnapshotTransformation,
} from "../types/requestSnapshot";
import { projectSnapshot } from "./requestSnapshotProjection";
import { requestSnapshots, reportSnapshotError } from "./requestSnapshots";

export interface SnapshotRecorderContext {
  sessionId: string;
  requestId: string;
  triggerNodeId?: string;
  logicalProfileId: string;
  logicalModelId: string;
  sources: Promise<SnapshotSource[]>;
  transformations?: Promise<SnapshotTransformation[]>;
  assistantNodeIds: () => string[];
  saveTextPreview: boolean;
  epoch: number;
}
export function createRequestSnapshotRecorder(
  context: SnapshotRecorderContext
) {
  let latest: Promise<ChatRequestAttemptSnapshot> | undefined;
  const pending: Promise<unknown>[] = [];
  function save(promise: Promise<ChatRequestAttemptSnapshot>) {
    const task = promise
      .then((snapshot) => requestSnapshots.save(snapshot, context.epoch))
      .catch(reportSnapshotError);
    pending.push(task);
  }
  const capture: NonNullable<LlmRequestOptions["requestCapture"]> = (route) => {
    let active: Promise<ChatRequestAttemptSnapshot> | undefined;
    let lastUsage: LlmResponse["usage"];
    function finish(
      status: ChatRequestAttemptSnapshot["status"],
      response?: LlmResponse
    ) {
      if (!active) return;
      const current = active;
      active = undefined;
      const endedAt = Date.now();
      const ids = [...context.assistantNodeIds()];
      const observed = response?.usage ?? lastUsage;
      const usage =
        observed && !observed.isLocalEstimated
          ? JSON.parse(JSON.stringify(observed))
          : undefined;
      const settled = current.then(
        (snapshot) =>
          ({
            ...snapshot,
            endedAt,
            status,
            assistantNodeIds: ids,
            processingScope: ids.length > 1 ? ("server" as const) : undefined,
            providerUsage: usage,
            providerUsageStatus: usage?.providerUsageStatus ?? "missing",
            reportedUsageFields: usage?.reportedUsageFields,
          }) satisfies ChatRequestAttemptSnapshot
      );
      latest = settled;
      save(settled);
    }
    return {
      observer: {
        onUsage(event) {
          lastUsage = JSON.parse(JSON.stringify(event.usage));
        },
        onRequest(event) {
          if (active) finish("error");
          lastUsage = undefined;
          const attemptId = crypto.randomUUID();
          const attemptIndex = requestSnapshots.reserve(
            context.sessionId,
            context.requestId
          );
          // Snapshot only the body and out-of-band source references. Headers and URL never enter capture.
          const frozen = {
            method: event.request.method,
            url: "",
            headers: {},
            streaming: event.request.streaming,
            body: event.request.body
              ? JSON.parse(JSON.stringify(event.request.body))
              : undefined,
            sourceMap: event.request.sourceMap
              ? JSON.parse(JSON.stringify(event.request.sourceMap))
              : undefined,
          };
          active = Promise.all([
            projectSnapshot(frozen, context.saveTextPreview),
            context.sources,
            context.transformations,
          ]).then(([projection, sources, transformations]) => ({
            ...projection,
            attemptId,
            attemptIndex,
            requestId: context.requestId,
            sessionId: context.sessionId,
            triggerNodeId: context.triggerNodeId,
            assistantNodeIds: [...context.assistantNodeIds()],
            startedAt: event.startedAt,
            status: "error",
            route: {
              ...route,
              logicalProfileId: context.logicalProfileId,
              logicalModelId: context.logicalModelId,
            },
            sources,
            transformations,
            providerUsageStatus: "missing",
          }));
          // Install a rejection handler immediately; networking may stay pending for a long time.
          void active.catch(() => {});
        },
        onError(event) {
          finish(isAbortError(event.error) ? "aborted" : "error");
        },
      },
      complete(response) {
        finish("completed", response);
      },
      error(error) {
        finish(isAbortError(error) ? "aborted" : "error");
      },
    };
  };
  function supplement(response: LlmResponse) {
    if (!latest || !response.estimatedUsage) return;
    const estimatedUsage = JSON.parse(JSON.stringify(response.estimatedUsage));
    latest = latest.then((snapshot) => ({ ...snapshot, estimatedUsage }));
    save(latest);
  }
  return { capture, supplement, flush: () => Promise.all(pending) };
}
