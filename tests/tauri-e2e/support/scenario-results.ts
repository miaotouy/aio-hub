import fs from "node:fs";
import path from "node:path";

export interface RecallScenarioResult {
  scenarioId: string;
  phase: string;
  passed: boolean;
  queryEmbedding: boolean;
  embeddingRequests: number;
  topEntryId?: string;
  chatStatus: number;
  chatEvidence: boolean;
  uiReply: boolean;
  sessionPersisted: boolean;
  detail?: string;
}

interface ScenarioResultsFile {
  schemaVersion: 1;
  results: RecallScenarioResult[];
}

export function recordRecallScenarioResult(
  artifactDir: string,
  result: RecallScenarioResult
): void {
  const filePath = path.join(artifactDir, "scenario-results.json");
  let payload: ScenarioResultsFile = { schemaVersion: 1, results: [] };
  if (fs.existsSync(filePath)) {
    payload = JSON.parse(
      fs.readFileSync(filePath, "utf8")
    ) as ScenarioResultsFile;
  }
  payload.results = [
    ...payload.results.filter(
      (candidate) =>
        candidate.scenarioId !== result.scenarioId ||
        candidate.phase !== result.phase
    ),
    result,
  ];
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
