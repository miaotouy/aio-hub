# Windows UI Automation helper

`AioHub.NativeUi` operates Windows common file, folder and save dialogs with
FlaUI 5 and Microsoft's UI Automation 3 API. The Tauri E2E suite invokes it
alongside WDIO; Electron Dev Control scenarios can use the same executable.
The browser driver triggers the product action and checks its resulting state,
while the helper completes the system-owned dialog.

## Requirements

- Windows 10 or later with an unlocked interactive desktop session.
- .NET 8 SDK for building the helper.
- The helper and AIO Hub must run as the same user and at the same integrity
  level. Do not elevate one process without the other.
- Native scenarios are serialized and require a visible desktop. A service or
  locked session cannot be used as a substitute.

Run the integrated native suite with:

```powershell
bun run test:tauri:e2e -- --preset native
```

The `native` preset is opt-in through this entry point; use
`bun run test:tauri:e2e -- --list-presets` to inspect its runtime requirements.

The Bun runner builds the helper, creates isolated file/directory fixtures,
and passes the executable and fixture paths to WDIO. The normal
`bun run test:tauri:e2e` command does not build or require the helper.

To verify UIA3 availability without operating a window:

```powershell
dotnet build tests/windows-ui-automation/AioHub.NativeUi/AioHub.NativeUi.csproj --configuration Release
tests/windows-ui-automation/AioHub.NativeUi/bin/Release/net8.0-windows/AioHub.NativeUi.exe probe
```

## Selector contract

The integrated WDIO suite reads the current AIO Hub PID through the read-only
`wa_get_self_pid` command and passes it to the helper. Process-name matching is
available only as a standalone fallback; it is not sufficient when multiple
debug instances exist. The helper then scopes dialogs by PID and top-level
window semantics.
For Windows common item dialogs it accepts class `#32770` as an additional
signal. Child controls use `AutomationId`, `ControlType`, and UIA patterns:

- path navigation: click the address toolbar (`AutomationId` `1001`) inside the
  address-band root (`AutomationId` `41477`), then set the exposed editor with
  `ValuePattern` and verify the resulting address;
- file selection: validate the supplied fixture paths and set the file-name
  editor (`AutomationId` `1148`) with `ValuePattern`, quoting each absolute path
  for multi-selection;
- save selection: use the same editor or the modern `1001` editor scoped inside
  `FileNameControlHost`. The target parent must exist and the target must be new,
  keeping the fixture flow clear of overwrite prompts;
- confirm button: AutomationId `1`, then `InvokePattern`;
- folder selection: navigate to the absolute path through the same address-band
  contract, verify the address, then invoke AutomationId `1`;
- cancellation: invoke the dialog's `AutomationId` `2` button and wait for the
  dialog to close. The product driver checks its `null` result or unchanged state.

Localized button text and screen coordinates are not primary selectors. Before
each action the helper stores a bounded UIA tree in `AIO_E2E_ARTIFACT_DIR`. On
failure it also stores a desktop screenshot and returns a JSON error result.

Absolute-path drag/drop is intentionally not claimed by this helper yet. That
requires controlling a visible Explorer item and performing a real pointer
drag into a WDIO-measured WebView target; direct IPC and synthetic H5 `File`
objects are not acceptable substitutes.

## Electron native-dialog verification

Use an isolated Electron instance and the PID returned by its own
`wa_get_self_pid` command. Start the product action with Dev Control before
running the appropriate helper command:

```powershell
$helper = "tests/windows-ui-automation/AioHub.NativeUi/bin/Release/net8.0-windows/AioHub.NativeUi.exe"
& $helper select-files --process-id $appPid --path $fixtureA --path $fixtureB --artifact-dir $artifacts
& $helper select-folder --process-id $appPid --path $fixtureDirectory --artifact-dir $artifacts
& $helper save-file --process-id $appPid --path $newFixturePath --artifact-dir $artifacts
& $helper cancel-dialog --process-id $appPid --artifact-dir $artifacts
```

On November 5, 2026, Windows Electron production-resource checks covered
Knowledge file multi-selection, recursive directory selection, cancellation,
rescan/search and persistence; Recall backup import/copy/skip/error reports,
single and batch export, and stopping future batch items; and save selection
and cancellation. The existing Dev Control workflow verifies the application
state and exported archives after each native action. Evidence and remaining
platform/interaction coverage are tracked in
[`electron-feature-gap-execution.md`](../../docs/Plan/electron-feature-gap-execution.md).
