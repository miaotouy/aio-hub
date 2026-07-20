# Tauri E2E

This suite drives a debug Tauri binary through WebdriverIO's embedded Tauri
WebDriver service. The Rust WebDriver plugins are registered only when
`debug_assertions` is enabled.

The repository pins `@wdio/tauri-service` to `1.1.x`. The `1.2.0` package
currently imports `installMockSyncOverride` from `@wdio/native-utils@2.4.0`,
where that export is absent; upgrading should wait until the upstream package
dependency is corrected.

Build a debug binary with the repository's normal Tauri toolchain, then run:

```powershell
$env:AIO_E2E_BINARY = "E:\\path\\to\\aiohub.exe"
$env:AIO_E2E_ID_SUFFIX = "tauri-e2e"
$env:AIO_E2E_DATA_DIR = ".dev-data\\tauri-e2e"
$env:AIO_E2E_WEBDRIVER_PORT = "4451"
bun run test:tauri:e2e
```

`AIO_E2E_BINARY` is optional when the binary is at
`src-tauri/target/debug/aiohub.exe`. When the suffix, data directory, or
WebDriver port is omitted, the config derives isolated defaults from the
current process. `AIO_E2E_WEBDRIVER_PORT` can be used to select a known free
port when running alongside another debug instance. The standard debug binary
loads `http://localhost:1420/`; a binary intentionally built with another
Tauri dev URL must set the same origin through `AIO_E2E_FRONTEND_URL`. The
suite is intentionally
single-process and debug-only; the normal command excludes native file dialogs
and drag/drop. File and folder dialogs use the opt-in Windows layer below.

The runner starts a deterministic local OpenAI-compatible server, writes an
isolated `E2E Local Mock` profile, and stores request summaries under the
artifact directory. It never logs authorization headers or API keys. Fixture
seeding is enabled only for the runner's generated data directory by default.
The runner intentionally uses `AIO_E2E_DATA_DIR` and `AIO_E2E_ID_SUFFIX` so Bun's
automatic `.env.local` loading cannot redirect tests into a development data
root. Set `AIO_E2E_SEED_FIXTURES=1` to opt in when providing an explicit E2E data
directory, or `0` to disable it.

Recall fixture seeding also writes a versioned Agent and two sessions using
stable IDs. The artifact directory receives only a redacted fixture summary;
the full LLM profile and isolated data directory must not be uploaded as CI
artifacts. Set `AIO_E2E_FIXTURE_MODE=verify` on a second launch to validate the
persisted Agent/session references without resetting messages or timestamps.

Pure runner, fixture, mock, and corpus checks run without opening the app:

```powershell
bun run test:tauri:e2e:unit
```

## Recall model lanes

The deterministic mock remains the default. A local Ollama embedding lane is
explicitly selected and uses the mock only for Chat:

```powershell
$env:AIO_E2E_OLLAMA_MODEL = "lmstudio-nomic-embed-text:q4_k_m"
bun run test:tauri:e2e:ollama
```

The runner checks `/api/tags` and the product-facing `/v1/embeddings` batch
contract before starting Tauri. An unavailable Ollama lane is recorded as
skipped; set `AIO_E2E_REQUIRE_OLLAMA=1` to make it fail instead. The runner
never downloads models and never silently changes this lane back to mock.

Private channels use the product `aiohub.llm-profiles@1` export format and are
activated only by an explicit profile ID:

```powershell
$env:AIO_E2E_LLM_CONFIG = ".dev-data\e2e-llm-channels.aio-llm.json"
$env:AIO_E2E_LLM_PROFILE_ID = "e2e-real-ollama"
$env:AIO_E2E_CHAT_MODEL_ID = "qwen3.5:9b"
$env:AIO_E2E_EMBEDDING_MODEL_ID = "lmstudio-nomic-embed-text:q4_k_m"
$env:AIO_E2E_EMBEDDING_DIMENSION = "768"
bun run test:tauri:e2e:real
```

The explicit dimension is required only when startup fixture seeding is active
because the generic channel export has no embedding-dimension field. Run
metadata records only profile/model IDs and endpoint origin, never keys,
authorization headers, or the source configuration path.

The Ollama and private-profile scripts run the lane-compatible
`recall-runtime-fixture.spec.ts`. That spec loads the selected profiles, writes
the selected Recall corpus through production Tauri commands, reads it back,
and confirms the collection and entries are visible in the Recall UI. The
deterministic default continues to run the full suite; its Knowledge workflow
is explicitly skipped for non-deterministic lanes.

Select the larger reviewed corpus explicitly:

```powershell
bun run test:tauri:e2e -- --corpus-mode curated --spec tests/tauri-e2e/specs/recall-runtime-fixture.spec.ts
```

`external-full` is reserved for the later explicit backup-import lane and is
rejected until that lane supplies and verifies `AIO_E2E_RECALL_SOURCE`.

The reviewed curated corpus is versioned independently. Re-audit it against an
explicit source backup without printing source text or paths:

```powershell
bun tests/tauri-e2e/scripts/derive-recall-curated-corpus.ts --source <backup.aio-kb>
```

`specs/knowledge-workflow.spec.ts` covers deterministic isolated library
creation, Agent Knowledge authorization persistence, and cross-tool
navigation. `specs/recall-runtime-fixture.spec.ts` covers lane-aware profile
loading and the production Recall IPC/UI fixture round trip.

## Windows native selectors

On Windows 10 or later, run the opt-in native suite with:

```powershell
bun run test:tauri:e2e:native
```

This mode builds the FlaUI/UIA3 helper under `tests/windows-ui-automation/`,
creates isolated file and directory fixtures, and enables
`specs/native-file-dialog.spec.ts`. WDIO still triggers each product action and
asserts the resulting document/source state; the helper only operates the
system-owned dialog. The session must remain logged in, unlocked, and visible.
See [`../windows-ui-automation/README.md`](../windows-ui-automation/README.md)
for selector rules, artifacts, and current drag/drop limitations.
