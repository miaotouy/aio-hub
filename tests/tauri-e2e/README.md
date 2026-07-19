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
port when running alongside another debug instance. The suite is intentionally
single-process and debug-only; native file dialogs and drag/drop still require
a separate Windows UI Automation layer.

The runner starts a deterministic local OpenAI-compatible server, writes an
isolated `E2E Local Mock` profile, and stores request summaries under the
artifact directory. It never logs authorization headers or API keys. Fixture
seeding is enabled only for the runner's generated data directory by default.
The runner intentionally uses `AIO_E2E_DATA_DIR` and `AIO_E2E_ID_SUFFIX` so Bun's
automatic `.env.local` loading cannot redirect tests into a development data
root. Set `AIO_E2E_SEED_FIXTURES=1` to opt in when providing an explicit E2E data
directory, or `0` to disable it.

`specs/knowledge-workflow.spec.ts` covers isolated library creation, Agent
Knowledge authorization persistence, cross-tool navigation, and loading the
seeded Chat/Embedding profile through the real Tauri UI.
