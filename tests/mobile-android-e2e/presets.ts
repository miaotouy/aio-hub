import type { ScenarioContext } from "./specs/context";
import { runAssetWorkflowScenario } from "./specs/asset-workflow.spec";
import { runFeasibilityScenario } from "./specs/feasibility.spec";
import { runSmokeScenario } from "./specs/smoke.spec";
import {
  runDeterministicAttachmentScenario,
  runOllamaAttachmentScenario,
} from "./specs/chat-attachment.spec";
import { runFailureRecoveryScenario } from "./specs/failure-recovery.spec";
import { runAudioMediaScenario } from "./specs/audio-media.spec";
import type { MobileE2ePresetId } from "./support/runner-options";

export interface MobileE2ePreset {
  id: MobileE2ePresetId;
  purpose: string;
  scenarios: Array<{
    id: string;
    run: (context: ScenarioContext) => Promise<unknown>;
  }>;
  requiresDeterministicServer: boolean;
  requiresOllama: boolean;
  apkSizeBaselineBytes: number;
}

export const E2E_APK_SIZE_BASELINE_BYTES = 80 * 1024 * 1024;

export const MOBILE_E2E_PRESETS: Record<MobileE2ePresetId, MobileE2ePreset> = {
  feasibility: {
    id: "feasibility",
    purpose: "Appium native/WebView context and home readiness",
    scenarios: [{ id: "feasibility", run: runFeasibilityScenario }],
    requiresDeterministicServer: false,
    requiresOllama: false,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
  smoke: {
    id: "smoke",
    purpose: "Registration, navigation, language/theme, and restart persistence",
    scenarios: [
      { id: "feasibility", run: runFeasibilityScenario },
      { id: "smoke", run: runSmokeScenario },
    ],
    requiresDeterministicServer: false,
    requiresOllama: false,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
  asset: {
    id: "asset",
    purpose: "DocumentsUI import, preview, restart recovery, and deletion",
    scenarios: [
      { id: "feasibility", run: runFeasibilityScenario },
      { id: "asset-workflow", run: runAssetWorkflowScenario },
    ],
    requiresDeterministicServer: false,
    requiresOllama: false,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
  media: {
    id: "media",
    purpose: "Managed audio preview and immersive controls",
    scenarios: [{ id: "audio-media", run: runAudioMediaScenario }],
    requiresDeterministicServer: false,
    requiresOllama: false,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
  attachment: {
    id: "attachment",
    purpose: "Deterministic managed attachment delivery and persistence",
    scenarios: [
      { id: "feasibility", run: runFeasibilityScenario },
      { id: "chat-attachment", run: runDeterministicAttachmentScenario },
    ],
    requiresDeterministicServer: true,
    requiresOllama: false,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
  recovery: {
    id: "recovery",
    purpose: "HTTP failure, interrupted SSE, and process-stop recovery",
    scenarios: [
      { id: "feasibility", run: runFeasibilityScenario },
      { id: "failure-recovery", run: runFailureRecoveryScenario },
    ],
    requiresDeterministicServer: true,
    requiresOllama: false,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
  core: {
    id: "core",
    purpose: "Smoke, assets, and deterministic attachment closure",
    scenarios: [
      { id: "feasibility", run: runFeasibilityScenario },
      { id: "chat-attachment", run: runDeterministicAttachmentScenario },
      { id: "asset-workflow", run: runAssetWorkflowScenario },
      { id: "smoke", run: runSmokeScenario },
    ],
    requiresDeterministicServer: true,
    requiresOllama: false,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
  ollama: {
    id: "ollama",
    purpose: "Opt-in Ollama attachment model lane",
    scenarios: [
      { id: "feasibility", run: runFeasibilityScenario },
      { id: "ollama-attachment", run: runOllamaAttachmentScenario },
    ],
    requiresDeterministicServer: false,
    requiresOllama: true,
    apkSizeBaselineBytes: E2E_APK_SIZE_BASELINE_BYTES,
  },
};

export function formatPresetList(): string {
  return Object.values(MOBILE_E2E_PRESETS)
    .map((preset) => `${preset.id.padEnd(12)} ${preset.purpose}`)
    .join("\n");
}
