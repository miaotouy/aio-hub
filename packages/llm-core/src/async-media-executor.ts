import type {
  AsyncMediaRequest,
  AsyncMediaTaskAdapter,
  AsyncMediaTaskSnapshot,
} from "./types/async-media";
import type { ProviderProfile } from "./types/provider";
import type { LlmTransport, TransportOptions } from "./types/transport";

export interface ExecuteAsyncMediaTaskOptions {
  adapter: AsyncMediaTaskAdapter;
  profile: ProviderProfile;
  request: AsyncMediaRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  onProgress?: (task: AsyncMediaTaskSnapshot) => void;
}

export async function executeAsyncMediaTask(
  options: ExecuteAsyncMediaTaskOptions
): Promise<AsyncMediaTaskSnapshot> {
  const createResponse = await options.transport.send(
    options.adapter.buildCreateRequest(options.profile, options.request),
    options.transportOptions
  );
  let task = await options.adapter.parseCreateResponse(
    createResponse,
    options.request
  );
  options.onProgress?.(task);

  const maxAttempts = options.maxPollAttempts ?? 120;
  let attempts = 0;
  while (task.status === "queued" || task.status === "running") {
    if (attempts >= maxAttempts) {
      throw new Error(
        `Async media task ${task.id} timed out after ${maxAttempts} poll attempts`
      );
    }
    if (options.transportOptions.signal?.aborted) {
      await cancelTask(options, task);
      throw createAbortError();
    }
    await abortableDelay(
      options.pollIntervalMs ?? 5_000,
      options.transportOptions.signal
    );
    const pollResponse = await options.transport.send(
      options.adapter.buildPollRequest(options.profile, options.request, task),
      options.transportOptions
    );
    task = await options.adapter.parsePollResponse(
      pollResponse,
      options.request,
      task
    );
    attempts += 1;
    options.onProgress?.(task);
  }

  if (task.status === "failed") {
    throw new Error(task.error || `Async media task ${task.id} failed`);
  }
  if (task.status === "cancelled") throw createAbortError();

  const resultRequests = options.adapter.buildResultRequests?.(
    options.profile,
    options.request,
    task
  );
  if (resultRequests?.length && options.adapter.parseResultResponses) {
    const responses = [];
    for (const request of resultRequests) {
      responses.push(await options.transport.send(request, options.transportOptions));
    }
    task = await options.adapter.parseResultResponses(
      responses,
      options.request,
      task
    );
  }
  return task;
}

async function cancelTask(
  options: ExecuteAsyncMediaTaskOptions,
  task: AsyncMediaTaskSnapshot
) {
  const request = options.adapter.buildCancelRequest?.(
    options.profile,
    options.request,
    task
  );
  if (!request) return;
  try {
    await options.transport.send(request, {
      ...options.transportOptions,
      signal: undefined,
    });
  } catch {
    // The local abort must not be hidden by a best-effort provider cancellation.
  }
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(createAbortError());
      },
      { once: true }
    );
  });
}

function createAbortError(): Error {
  return typeof DOMException === "undefined"
    ? new Error("Async media task cancelled")
    : new DOMException("Async media task cancelled", "AbortError");
}
