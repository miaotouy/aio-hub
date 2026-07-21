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
current process ID and start time so rapid reruns cannot reuse a stale fixture
directory after PID recycling. `AIO_E2E_WEBDRIVER_PORT` can be used to select a
known free port when running alongside another debug instance. The standard
debug binary loads `http://localhost:1420/`; a binary intentionally built with another
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

Recall fixture seeding also writes a versioned Agent and four scenario-isolated sessions using
stable IDs. The artifact directory receives only a redacted fixture summary;
the full LLM profile and isolated data directory must not be uploaded as CI
artifacts. Set `AIO_E2E_FIXTURE_MODE=verify` on a second launch to validate the
persisted Agent/session references without resetting messages or timestamps.
The fixture also selects the lane-specific Embedding model and active Recall
collection in `knowledge/workspace.json`; verify mode checks those references
without replacing runtime settings.

Pure runner, fixture, mock, and corpus checks run without opening the app:

```powershell
bun run test:tauri:e2e:unit
```

Named presets own the stable Recall, corpus, model, recovery, and native suite
assembly. List their requirements and skip/fail behavior without starting Vite,
the mock server, or Tauri:

```powershell
bun run test:tauri:e2e -- --list-presets
```

Use `bun run test:tauri:e2e -- --preset <id>` for a named lane. A preset cannot
be combined with `--spec`, `--restart-spec`, `--required-scenarios`,
`--corpus-mode`, `--vector-mode`, `--llm-profile`, or `--native`. Those low-level
options remain available only for focused diagnosis when no preset is selected.

## Recall model lanes

The deterministic mock remains the default. A local Ollama embedding lane is
explicitly selected with `AIO_E2E_OLLAMA_MODEL`; it keeps mock Chat for the
short vector workflow:

```powershell
$env:AIO_E2E_OLLAMA_MODEL = "lmstudio-nomic-embed-text:q4_k_m"
bun run test:tauri:e2e -- --preset ollama-vector
```

Run the opt-in full Ollama lane by selecting a completion model as well. The
runner probes both models, keeps Chat on the product's Tauri Rust proxy, and
uses a local redacting JSON proxy for Embedding. It records only request
hashes, counts, dimensions, and status in `ollama-requests.jsonl`; Chat target
delivery is verified from the captured Tauri backend log:

```powershell
$env:AIO_E2E_OLLAMA_MODEL = "lmstudio-nomic-embed-text:q4_k_m"
$env:AIO_E2E_OLLAMA_CHAT_MODEL = "phi4:latest"
bun run test:tauri:e2e -- --preset ollama-chat
```

The full lane uses response-present assertions for real Chat output and
relative/state assertions for vector retrieval. Chat request delivery is
verified from Tauri backend logs; Embedding summaries are redacted in
`ollama-requests.jsonl`. It never falls back to the mock when either explicit
model fails preflight. Without a completion model,
the original embedding-only lane remains available.

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
bun run test:tauri:e2e -- --preset private-profile
```

The explicit dimension is required only when startup fixture seeding is active
because the generic channel export has no embedding-dimension field. Run
metadata records only profile/model IDs and endpoint origin, never keys,
authorization headers, or the source configuration path.

The Ollama and private-profile scripts run the lane-compatible
`recall-vector-workflow.spec.ts`. It writes the selected Recall corpus through
production Tauri commands, triggers vectorization and semantic search from the
visible UI, then reads vector coverage, model, dimension, ranking, and trace
state back through production IPC. The deterministic lane additionally checks
the mock server's redacted request summaries. Its Knowledge workflow is
explicitly skipped for non-deterministic lanes.

Run the deterministic Recall workflow directly:

```powershell
bun run test:tauri:e2e -- --preset recall-vector
bun run test:tauri:e2e -- --preset recall-curated
bun run test:tauri:e2e -- --preset recall-chat
```

The Chat command runs two sequential Tauri launches against the same isolated
data root. The first launch covers positive evidence injection, an explicit
empty-collection response, and a required-evidence 422. The second launch uses
fixture verify mode, reloads the persisted Recall workspace, vectors, Agent
binding, and session, then sends a new Recall-backed turn. The runner rejects
unconsumed required scenarios and unexpected Chat requests, and writes the
embedding, Chat evidence, UI, and session cross-check to `scenario-results.json`.
Retrieval ranking is recorded separately by `recall-vector-workflow.spec.ts`.
The recovery spec also writes redacted state transitions to
`recall-recovery-probes.jsonl`, including request counts, pipeline/vector/Chat
stage counters, message statuses, and key-state totals. It never records message
content, API keys, or vectors.

Select the larger reviewed corpus explicitly:

```powershell
bun run test:tauri:e2e -- --preset recall-curated
```

The external backup lane is opt-in and requires `AIO_E2E_RECALL_SOURCE`.
`external-sample` is the normal fast-feedback path; `external-full` is the final
473-entry coverage and restart gate. Both remain excluded from PR-required runs.

The reviewed curated corpus is versioned independently. Re-audit it against an
explicit source backup without printing source text or paths:

```powershell
bun tests/tauri-e2e/scripts/derive-recall-curated-corpus.ts --source <backup.aio-kb>
```

Run the quick legacy corpus lane after explicitly naming a local `.aio-kb`
source. It imports the complete backup, then uses the visible batch-selection UI
to vectorize three entries by default. Set `AIO_E2E_RECALL_SAMPLE_SIZE` to change
that small batch. The runner checks the ZIP envelope and writes only its SHA-256,
size, entry count, selected entry IDs, and outcome counts to artifacts; it never
records the source path, library name, content, or vectors.

```powershell
$env:AIO_E2E_RECALL_SOURCE = "E:\\path\\to\\backup.aio-kb"
bun run test:tauri:e2e -- --preset corpus-sample
```

After the quick path passes, run the full count and process-restart gate at the
end of the review:

```powershell
bun run test:tauri:e2e -- --preset corpus-full
```

Both paths use production `recall_inspect_backup` and `recall_import_backup`
with `conflictStrategy: cancel`. Only the full path invokes one-click
vectorization for every entry and starts a second Tauri process against the same
data root to reload the imported collection and all vectors. With no source, the
selected command reports an explicit skip and leaves the default suite unchanged.

`specs/knowledge-workflow.spec.ts` covers deterministic isolated library
creation, Agent Knowledge authorization persistence, and cross-tool
navigation. `specs/recall-runtime-fixture.spec.ts` covers lane-aware profile
loading and the production Recall IPC/UI fixture round trip, while
`specs/recall-vector-workflow.spec.ts` covers visible vectorization and
semantic ranking. `specs/recall-chat-injection.spec.ts` and
`specs/recall-session-recovery.spec.ts` cover Chat injection and same-root
process recovery without depending on cross-spec in-memory state.

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
