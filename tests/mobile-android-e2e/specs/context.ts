import type { Browser } from "webdriverio";
import type { AdbClient } from "../support/adb";
import type { ArtifactManager } from "../support/artifacts";
import type { PreparedFixtures } from "../support/fixtures";
import type { MobileE2eOptions } from "../support/runner-options";

export interface ScenarioContext {
  driver: Browser;
  adb: AdbClient;
  serial: string;
  options: MobileE2eOptions;
  artifacts: ArtifactManager;
  fixtures: PreparedFixtures;
  deterministicBaseUrl?: string;
  deterministicRequests?: Array<Record<string, unknown>>;
}
