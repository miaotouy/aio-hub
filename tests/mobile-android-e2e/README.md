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

Available presets are `feasibility`, `smoke`, `asset`, `media`, `rich-text`, `rich-text-media`,
`attachment`, `recovery`, `core`, and opt-in `ollama`. The `core` preset intentionally does
not create the 768 MiB interrupted-import fixture; run `recovery` separately
when exercising that path.

Run the RichText narrow-screen regression lane:

```powershell
bun tests/mobile-android-e2e/run.ts --preset rich-text --avd Medium_Phone_API_36
```

This verifies the in-app RichText test page through the Android WebView: normal
code blocks, Mermaid rendering, code wrapping, and a long unbroken code line
that must remain inside its scroll container. It does not replace Android
real-device, iOS, chat-message, or managed-media acceptance.

Run the RichText managed-media regression lane:

```powershell
bun tests/mobile-android-e2e/run.ts --preset rich-text-media --avd Medium_Phone_API_36
```

This sends a message that owns an imported image attachment and embeds it as
`![...](asset://<assetId>)`. The scenario verifies the chat RichText resolver
only accepts that message-owned asset, obtains a managed preview URL, reaches
ready state, and opens/closes the immersive image view.

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

## Stuck AVD and ADB recovery

The runner bounds ADB discovery and property probes, treats an emulator or
Appium subprocess exit as immediately fatal, and applies hard deadlines to
failure capture and cleanup. Successful command probes cancel their pending
timeout timers so an otherwise completed Bun process is not kept alive until a
stale 60-second timer expires. `SIGINT` and `SIGTERM` trigger the same bounded
cleanup path. A runner-owned AVD receives `adb emu kill` first and is then
terminated only if it does not exit within the shutdown deadline; cleanup also
waits for the owned serial to disappear from `adb devices` before returning.

A serial passed with `--serial` is user-owned. The runner deliberately does not
stop it, restart the shared ADB server, or kill unrelated Android processes.
This protects LDPlayer, real devices, and Android Studio sessions that may be
using the same ADB server.

When an AVD stops responding, inspect ownership before retrying:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match '^(emulator|qemu-system.*)\.exe$' } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine
```

If `adb devices` no longer lists the AVD but an emulator/QEMU process still
references the same AVD, stop that instance from Android Studio Device Manager
or terminate only the confirmed process tree before retrying. Do not delete
AVD lock files while any matching emulator/QEMU process exists. A historical
`e2e-run.json` with `status: running` means the runner did not reach its final
cleanup write; it is not proof that the process is still active.
