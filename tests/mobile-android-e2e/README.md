# Mobile Android AVD E2E

This runner drives the AIO Hub debug APK through Appium 2, UiAutomator2, the
Tauri WebView, Android DocumentsUI, and serial-scoped ADB helpers. It is an
Android Studio AVD regression lane; it is not an Android real-device or iOS
release gate.

## Prerequisites

- Bun workspace dependencies installed.
- Android SDK `adb` and `emulator` available through the configured SDK.
- A configured Android Studio AVD (the default is `Medium_Phone_API_36`).
- Appium 2 and the pinned UiAutomator2 driver installed by the runner setup.
- For the optional Ollama lane, Ollama must already be running on the host and
  the requested model must already be installed. The runner never downloads a
  model or changes the Ollama service.

## Commands

Build a target-ABI debug APK and run the core regression preset:

```powershell
bun tests/mobile-android-e2e/run.ts --preset core --avd Medium_Phone_API_36
```

Use a prebuilt APK and an explicit serial when the AVD is already running:

```powershell
bun tests/mobile-android-e2e/run.ts --preset attachment `
  --serial emulator-5554 `
  --apk mobile/src-tauri/target/release/bundle/android/AIO-Hub_0.1.1-m-beta.2_android-x86_64-debug.apk
```

Available presets are `feasibility`, `smoke`, `asset`, `media`, `attachment`,
`recovery`, `core`, and opt-in `ollama`. The `core` preset intentionally does
not create the 768 MiB interrupted-import fixture; run `recovery` separately
when exercising that path.

Run the Ollama attachment lane explicitly:

```powershell
bun tests/mobile-android-e2e/run.ts --preset ollama `
  --serial emulator-5554 `
  --apk mobile/src-tauri/target/release/bundle/android/AIO-Hub_0.1.1-m-beta.2_android-x86_64-debug.apk `
  --ollama-model qwen3.5:9b --require-ollama
```

The root scripts also expose `bun run test:mobile:e2e` and
`bun run test:mobile:e2e:unit`.

For repeated stability runs, let the runner own a fresh AVD lifecycle for each
iteration. Do not pass `--serial` or `--keep-avd` in this lane; each completed
run shuts down only the AVD that it started. Reusing one long-lived AVD can
carry Android DocumentsUI activity-result state between otherwise independent
runs.

```powershell
$apk = "mobile/src-tauri/target/release/bundle/android/AIO-Hub_0.1.1-m-beta.2_android-x86_64-debug.apk"
1..10 | ForEach-Object {
  bun tests/mobile-android-e2e/run.ts --preset core `
    --avd Medium_Phone_API_36 --apk $apk
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

## Ownership and artifacts

Every ADB, reverse mapping, install, app-data clear, and process operation is
bound to the selected serial. A running third-party emulator is rejected. Only
an AVD started by this runner is eligible for automatic shutdown; use
`--keep-avd` while inspecting a run.

Each run writes `.dev-data/mobile-android-e2e/<run-id>/e2e-run.json` and
`request-summaries.jsonl`. Failure runs additionally retain a screenshot,
UiAutomator hierarchy, a bounded WebView DOM capture, logcat, and Appium log.
Artifacts redact API keys, authorization headers, full attachment payloads,
chat text, and machine-specific absolute paths.

The deterministic attachment preset is the normal gate. The Ollama preset is a
separate model capability check and cannot substitute for Android real-device,
low-storage, camera, or iOS release validation.

Named presets enforce an 80 MiB single-ABI debug APK baseline. Use
`--max-apk-bytes` only when reviewing an intentional baseline change; an
oversized APK fails before installation.
