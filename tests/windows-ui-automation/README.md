# Windows UI Automation helper

`AioHub.NativeUi` is the native half of the real Tauri E2E suite. It uses
FlaUI 5 with Microsoft's UI Automation 3 API to operate Windows common file
and folder dialogs. It does not replace WDIO: WDIO triggers the product action
and verifies the resulting Knowledge state, while this helper only completes
the system-owned dialog.

## Requirements

- Windows 10 or later with an unlocked interactive desktop session.
- .NET 8 SDK for building the helper.
- The helper and AIO Hub must run as the same user and at the same integrity
  level. Do not elevate one process without the other.
- Native scenarios are serialized and require a visible desktop. A service or
  locked session cannot be used as a substitute.

Run the integrated native suite with:

```powershell
bun run test:tauri:e2e:native
```

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
- file selection: verify each target `ListItem`, then set the standard file-name
  editor (`AutomationId` `1148`) with `ValuePattern`;
- confirm button: AutomationId `1`, then `InvokePattern`;
- folder selection: navigate to the absolute path through the same address-band
  contract, verify the address, then invoke AutomationId `1`.

Localized button text and screen coordinates are not primary selectors. Before
each action the helper stores a bounded UIA tree in `AIO_E2E_ARTIFACT_DIR`. On
failure it also stores a desktop screenshot and returns a JSON error result.

Absolute-path drag/drop is intentionally not claimed by this helper yet. That
requires controlling a visible Explorer item and performing a real pointer
drag into a WDIO-measured WebView target; direct IPC and synthetic H5 `File`
objects are not acceptable substitutes.
