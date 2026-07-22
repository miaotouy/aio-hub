import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRetrievalPipelineRun } from "../useRetrievalPipelineRun";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../../services/retrievalPipeline", () => ({
  inspectRetrievalPipeline: mocks.inspect,
  executeRetrievalPipeline: mocks.execute,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function compiled(runId: string, configHash: string, valid = true) {
  return {
    presetId: "algorithmic" as const,
    runId,
    result: {
      runId,
      valid,
      pipelineId: "algorithmic",
      configHash,
      algorithmVersion: "v1",
      candidateBudget: 80,
      expansionBudget: 0,
      externalRequirements: [],
      issues: valid
        ? []
        : [
            {
              severity: "error" as const,
              code: "parameter-invalid" as const,
              message: "invalid",
            },
          ],
      stages: [],
      moduleVersions: {},
    },
  };
}

describe("useRetrievalPipelineRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("follows compile, prepare, run and outcome states", async () => {
    const controller = useRetrievalPipelineRun();
    const value = compiled("run-1", "hash-1");
    mocks.inspect.mockResolvedValueOnce(value);
    mocks.execute.mockImplementationOnce(
      async (_params, _compiled, observer) => {
        observer.onPreparing(value);
        expect(controller.state.value).toBe("preparing");
        observer.onRunning(value);
        expect(controller.state.value).toBe("running");
        return {
          runId: "run-1",
          configHash: "hash-1",
          outcome: "empty",
          results: [],
        };
      }
    );

    await expect(
      controller.run({
        query: "query",
        recallIds: ["collection"],
        presetId: "algorithmic",
      })
    ).resolves.toMatchObject({ outcome: "empty" });
    expect(controller.state.value).toBe("empty");
  });

  it("blocks invalid compilation before prepare", async () => {
    const controller = useRetrievalPipelineRun();
    mocks.inspect.mockResolvedValueOnce(compiled("run-1", "hash-1", false));

    await expect(
      controller.run({
        query: "query",
        recallIds: ["collection"],
        presetId: "algorithmic",
      })
    ).resolves.toBeNull();
    expect(controller.state.value).toBe("blocked");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("ignores a late response after a newer run starts", async () => {
    const controller = useRetrievalPipelineRun();
    const first = deferred<ReturnType<typeof compiled>>();
    mocks.inspect
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(compiled("run-2", "hash-2"));
    mocks.execute.mockImplementationOnce(async (_params, value, observer) => {
      observer.onPreparing(value);
      observer.onRunning(value);
      return {
        runId: "run-2",
        configHash: "hash-2",
        outcome: "success",
        results: [],
      };
    });

    const stale = controller.run({
      query: "old",
      recallIds: ["collection"],
      presetId: "algorithmic",
    });
    const current = controller.run({
      query: "new",
      recallIds: ["collection"],
      presetId: "algorithmic",
    });
    await expect(current).resolves.toMatchObject({ runId: "run-2" });
    first.resolve(compiled("run-1", "hash-1"));
    await expect(stale).resolves.toBeNull();
    expect(controller.snapshot.value?.runId).toBe("run-2");
  });
});
