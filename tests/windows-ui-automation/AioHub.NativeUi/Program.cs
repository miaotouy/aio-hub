// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Capturing;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.Tools;
using FlaUI.Core.WindowsAPI;
using FlaUI.UIA3;

return NativeUiProgram.Run(args);

internal static class NativeUiProgram
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    public static int Run(string[] args)
    {
        NativeUiOptions? options = null;
        string? treePath = null;
        Point? initialMousePosition = null;
        try
        {
            initialMousePosition = Mouse.Position;
            options = NativeUiOptions.Parse(args);
            Directory.CreateDirectory(options.ArtifactDirectory);

            using var automation = new UIA3Automation();
            if (options.Command == "probe")
            {
                var desktop = automation.GetDesktop();
                WriteResult(new NativeUiResult(
                    true,
                    options.Command,
                    desktop.Properties.Name.ValueOrDefault,
                    desktop.Properties.ProcessId.ValueOrDefault,
                    null,
                    null,
                    null,
                    new Dictionary<string, string>
                    {
                        ["os"] = RuntimeInformation.OSDescription,
                        ["architecture"] = RuntimeInformation.ProcessArchitecture.ToString(),
                        ["interactive"] = Environment.UserInteractive.ToString(),
                        ["topLevelWindowCount"] = NativeWindows.Enumerate().Count.ToString(),
                    }));
                return 0;
            }
            var dialog = WaitForDialog(automation, options);
            var windowTitle = dialog.Title;
            var processId = dialog.Properties.ProcessId.Value;
            treePath = WriteTree(
                dialog,
                options.ArtifactDirectory,
                $"native-ui-{options.Command}-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmssfff}-tree.json");

            switch (options.Command)
            {
                case "select-files":
                    SelectFiles(dialog, options.Paths);
                    break;
                case "select-folder":
                    SelectFolder(dialog, options.Paths.Single());
                    break;
                case "dump-tree":
                    break;
                default:
                    throw new NativeUiException($"Unsupported command: {options.Command}");
            }

            WriteResult(new NativeUiResult(true, options.Command, windowTitle, processId, treePath, null, null, null));
            return 0;
        }
        catch (Exception exception)
        {
            var artifactDirectory = options?.ArtifactDirectory ?? Path.Combine(Path.GetTempPath(), "aiohub-native-ui");
            Directory.CreateDirectory(artifactDirectory);
            var screenshotPath = TryCaptureScreen(artifactDirectory);
            WriteResult(new NativeUiResult(false, options?.Command, null, null, treePath, screenshotPath, exception.Message, null));
            return 1;
        }
        finally
        {
            if (initialMousePosition is Point position)
            {
                try
                {
                    NativeWindows.SetCursorPosition(position);
                }
                catch
                {
                    // Restoring the test runner's cursor must not mask the test result.
                }
            }
        }
    }

    private static Window WaitForDialog(UIA3Automation automation, NativeUiOptions options)
    {
        var result = Retry.WhileNull(
            () => FindDialog(automation, options),
            options.Timeout,
            TimeSpan.FromMilliseconds(200),
            throwOnTimeout: false,
            ignoreException: true);
        return result.Result ?? throw new NativeUiException(
            $"No native dialog for process '{options.ProcessName}' appeared within {options.Timeout.TotalSeconds:0.#} seconds.");
    }

    private static Window? FindDialog(UIA3Automation automation, NativeUiOptions options)
    {
        foreach (var nativeWindow in NativeWindows.Enumerate())
        {
            if (!nativeWindow.IsVisible || !MatchesProcess(nativeWindow.ProcessId, options))
            {
                continue;
            }

            try
            {
                var window = automation.FromHandle(nativeWindow.Handle).AsWindow();
                if (nativeWindow.ClassName == "#32770" || window.IsModal)
                {
                    return window;
                }
            }
            catch (Exception exception) when (exception is not NativeUiException)
            {
                // A window can disappear between EnumWindows and the UIA lookup.
            }
        }

        return null;
    }

    private static bool MatchesProcess(int processId, NativeUiOptions options)
    {
        if (options.ProcessId is not null)
        {
            return processId == options.ProcessId;
        }

        try
        {
            return string.Equals(
                Process.GetProcessById(processId).ProcessName,
                options.ProcessName,
                StringComparison.OrdinalIgnoreCase);
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static void SelectFiles(Window dialog, IReadOnlyList<string> paths)
    {
        foreach (var path in paths)
        {
            if (!File.Exists(path))
            {
                throw new NativeUiException($"Fixture file does not exist: {path}");
            }
        }

        var directoryPath = Path.GetDirectoryName(paths[0])
            ?? throw new NativeUiException($"Cannot resolve the fixture directory: {paths[0]}");
        if (paths.Any(path => !string.Equals(
                Path.GetDirectoryName(path),
                directoryPath,
                StringComparison.OrdinalIgnoreCase)))
        {
            throw new NativeUiException("Multi-file selection requires all fixture files to share one directory.");
        }

        NavigateToPath(dialog, directoryPath);

        var fileNames = paths.Select(path => new FileInfo(path).Name).ToArray();
        foreach (var fileName in fileNames)
        {
            _ = WaitForFileItem(dialog, fileName);
        }

        var fileNameEdit = dialog.FindFirstDescendant(cf =>
            cf.ByAutomationId("1148").And(cf.ByControlType(ControlType.Edit)))
            ?? throw new NativeUiException("The file picker file-name editor was not found.");
        var valuePattern = fileNameEdit.Patterns.Value;
        if (!valuePattern.IsSupported)
        {
            throw new NativeUiException("The file picker file-name editor does not support ValuePattern.");
        }
        var fileNameValue = fileNames.Length == 1
            ? fileNames[0]
            : string.Join(" ", fileNames.Select(fileName => $"\"{fileName}\""));
        valuePattern.Pattern.SetValue(fileNameValue);

        var confirmButton = FindConfirmButton(dialog)
            ?? throw new NativeUiException("The file picker confirm button was not found.");
        confirmButton.Patterns.Invoke.Pattern.Invoke();
        WaitUntilClosed(dialog);
    }

    private static AutomationElement WaitForFileItem(Window dialog, string fileName)
    {
        var result = Retry.WhileNull(
            () => dialog.FindFirstDescendant(cf =>
                cf.ByName(fileName).And(cf.ByControlType(ControlType.ListItem))),
            TimeSpan.FromSeconds(8),
            TimeSpan.FromMilliseconds(200),
            throwOnTimeout: false,
            ignoreException: true);
        return result.Result
            ?? throw new NativeUiException($"The file picker did not expose the requested file item: {fileName}");
    }

    private static AutomationElement? FindListItem(Window dialog, string itemName)
    {
        return dialog.FindFirstDescendant(cf =>
            cf.ByName(itemName).And(cf.ByControlType(ControlType.ListItem)));
    }

    private static void SelectFolder(Window dialog, string path)
    {
        if (!Directory.Exists(path))
        {
            throw new NativeUiException($"Fixture directory does not exist: {path}");
        }

        var windowHandle = new IntPtr(dialog.Properties.NativeWindowHandle.ValueOrDefault);
        var normalizedPath = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        NavigateToPath(dialog, normalizedPath);
        var targetName = new DirectoryInfo(normalizedPath).Name;
        var navigationResult = Retry.WhileNull(
            () =>
            {
                if (!NativeWindows.Exists(windowHandle))
                {
                    return new NativeNavigationResult(true, null);
                }
                var addressMatches = dialog
                    .FindAllDescendants(cf => cf.ByAutomationId("1001"))
                    .Any(element =>
                        (element.Properties.Name.ValueOrDefault ?? string.Empty)
                        .TrimEnd(Path.DirectorySeparatorChar)
                        .EndsWith(normalizedPath, StringComparison.OrdinalIgnoreCase));
                if (addressMatches)
                {
                    return new NativeNavigationResult(false, null);
                }
                var item = FindListItem(dialog, targetName);
                return item is null ? null : new NativeNavigationResult(false, item);
            },
            TimeSpan.FromSeconds(8),
            TimeSpan.FromMilliseconds(200),
            throwOnTimeout: false,
            ignoreException: true).Result;
        if (navigationResult?.DialogClosed == true)
        {
            return;
        }
        if (navigationResult is null)
        {
            throw new NativeUiException($"The folder picker did not navigate to the requested path: {path}");
        }
        if (navigationResult.Item is not null)
        {
            var selectionItem = navigationResult.Item.Patterns.SelectionItem;
            if (!selectionItem.IsSupported)
            {
                throw new NativeUiException($"The folder item does not support SelectionItemPattern: {path}");
            }
            selectionItem.Pattern.Select();
        }

        var confirmButton = Retry.WhileNull(
            () => FindConfirmButton(dialog),
            TimeSpan.FromSeconds(5),
            TimeSpan.FromMilliseconds(150),
            throwOnTimeout: false,
            ignoreException: true).Result;
        (confirmButton ?? throw new NativeUiException("The folder picker confirm button was not found."))
            .Patterns.Invoke.Pattern.Invoke();
        WaitUntilClosed(dialog);
    }

    private static void NavigateToPath(Window dialog, string path)
    {
        var normalizedPath = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        var addressRoot = dialog.FindFirstDescendant(cf =>
            cf.ByAutomationId("41477").And(cf.ByClassName("Address Band Root")))
            ?? throw new NativeUiException("The native picker address band was not found.");
        var addressToolbar = addressRoot.FindFirstDescendant(cf =>
            cf.ByAutomationId("1001").And(cf.ByControlType(ControlType.ToolBar)))
            ?? throw new NativeUiException("The native picker address toolbar was not found.");

        addressToolbar.Click();
        var addressEdit = Retry.WhileNull(
            () => addressRoot.FindFirstDescendant(cf => cf.ByControlType(ControlType.Edit)),
            TimeSpan.FromSeconds(3),
            TimeSpan.FromMilliseconds(100),
            throwOnTimeout: false,
            ignoreException: true).Result
            ?? throw new NativeUiException("The native picker address editor was not exposed.");
        var valuePattern = addressEdit.Patterns.Value;
        if (!valuePattern.IsSupported)
        {
            throw new NativeUiException("The native picker address editor does not support ValuePattern.");
        }

        valuePattern.Pattern.SetValue(normalizedPath);
        addressEdit.Focus();
        Keyboard.Press(VirtualKeyShort.ENTER);

        var navigation = Retry.WhileFalse(
            () => AddressShowsPath(dialog, normalizedPath),
            TimeSpan.FromSeconds(8),
            TimeSpan.FromMilliseconds(200),
            throwOnTimeout: false,
            ignoreException: true);
        if (!navigation.Success)
        {
            throw new NativeUiException($"The native picker did not navigate to the requested path: {path}");
        }
    }

    private static bool AddressShowsPath(Window dialog, string normalizedPath)
    {
        return dialog
            .FindAllDescendants(cf => cf.ByAutomationId("1001"))
            .Any(element =>
                (element.Properties.Name.ValueOrDefault ?? string.Empty)
                .TrimEnd(Path.DirectorySeparatorChar)
                .EndsWith(normalizedPath, StringComparison.OrdinalIgnoreCase));
    }

    private static AutomationElement? FindConfirmButton(Window dialog)
    {
        return dialog.FindFirstDescendant(cf =>
            cf.ByAutomationId("1").And(cf.ByControlType(ControlType.Button)));
    }

    private static void WaitUntilClosed(Window dialog)
    {
        var windowHandle = new IntPtr(dialog.Properties.NativeWindowHandle.ValueOrDefault);
        var result = Retry.WhileTrue(
            () => NativeWindows.Exists(windowHandle),
            TimeSpan.FromSeconds(10),
            TimeSpan.FromMilliseconds(200),
            throwOnTimeout: false,
            ignoreException: true);
        if (!result.Success)
        {
            throw new NativeUiException("The native dialog remained open after confirmation.");
        }
    }

    private static string WriteTree(AutomationElement root, string artifactDirectory, string fileName)
    {
        var path = Path.Combine(artifactDirectory, fileName);
        var nodes = new List<NativeUiNode>();
        AppendTree(root, nodes, 0, 0, 1_000);
        File.WriteAllText(path, JsonSerializer.Serialize(nodes, JsonOptions));
        return path;
    }

    private static void AppendTree(
        AutomationElement element,
        ICollection<NativeUiNode> nodes,
        int depth,
        int siblingIndex,
        int remaining)
    {
        if (depth > 10 || remaining <= 0)
        {
            return;
        }

        nodes.Add(new NativeUiNode(
            depth,
            siblingIndex,
            element.Properties.Name.ValueOrDefault ?? string.Empty,
            element.Properties.AutomationId.ValueOrDefault ?? string.Empty,
            element.Properties.ClassName.ValueOrDefault ?? string.Empty,
            element.Properties.ControlType.ValueOrDefault.ToString(),
            element.Properties.ProcessId.ValueOrDefault));

        var children = element.FindAllChildren();
        for (var index = 0; index < children.Length && nodes.Count < 1_000; index++)
        {
            AppendTree(children[index], nodes, depth + 1, index, remaining - nodes.Count);
        }
    }

    private static string? TryCaptureScreen(string artifactDirectory)
    {
        try
        {
            var path = Path.Combine(artifactDirectory, $"native-ui-failure-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmssfff}.png");
            Capture.Screen().ToFile(path);
            return path;
        }
        catch
        {
            return null;
        }
    }

    private static void WriteResult(NativeUiResult result)
    {
        Console.WriteLine(JsonSerializer.Serialize(result, JsonOptions));
    }
}

internal sealed record NativeUiOptions(
    string Command,
    IReadOnlyList<string> Paths,
    string ProcessName,
    int? ProcessId,
    TimeSpan Timeout,
    string ArtifactDirectory)
{
    public static NativeUiOptions Parse(string[] args)
    {
        if (args.Length == 0 || args[0] is "--help" or "-h")
        {
            throw new NativeUiException(
                "Usage: AioHub.NativeUi <probe|select-files|select-folder|dump-tree> [--path PATH] [--process-name aiohub] [--process-id PID] [--timeout-ms 15000] [--artifact-dir PATH]");
        }

        var command = args[0];
        var paths = new List<string>();
        var processName = "aiohub";
        int? processId = null;
        var timeoutMs = 15_000;
        var artifactDirectory = Path.Combine(Path.GetTempPath(), "aiohub-native-ui");

        for (var index = 1; index < args.Length; index++)
        {
            var argument = args[index];
            string RequireValue()
            {
                if (++index >= args.Length)
                {
                    throw new NativeUiException($"Missing value for {argument}.");
                }
                return args[index];
            }

            switch (argument)
            {
                case "--path":
                    paths.Add(Path.GetFullPath(RequireValue()));
                    break;
                case "--process-name":
                    processName = RequireValue();
                    break;
                case "--process-id":
                    processId = int.Parse(RequireValue());
                    break;
                case "--timeout-ms":
                    timeoutMs = int.Parse(RequireValue());
                    break;
                case "--artifact-dir":
                    artifactDirectory = Path.GetFullPath(RequireValue());
                    break;
                default:
                    throw new NativeUiException($"Unknown argument: {argument}");
            }
        }

        if (command is "select-files" or "select-folder" && paths.Count == 0)
        {
            throw new NativeUiException($"{command} requires at least one --path argument.");
        }
        if (command == "select-folder" && paths.Count != 1)
        {
            throw new NativeUiException("select-folder requires exactly one --path argument.");
        }
        if (timeoutMs is < 1_000 or > 120_000)
        {
            throw new NativeUiException("--timeout-ms must be between 1000 and 120000.");
        }

        return new NativeUiOptions(
            command,
            paths,
            Path.GetFileNameWithoutExtension(processName),
            processId,
            TimeSpan.FromMilliseconds(timeoutMs),
            artifactDirectory);
    }
}

internal sealed record NativeUiResult(
    bool Success,
    string? Command,
    string? WindowTitle,
    int? ProcessId,
    string? TreePath,
    string? ScreenshotPath,
    string? Error,
    IReadOnlyDictionary<string, string>? Details);

internal sealed record NativeUiNode(
    int Depth,
    int SiblingIndex,
    string Name,
    string AutomationId,
    string ClassName,
    string ControlType,
    int ProcessId);

internal sealed record NativeNavigationResult(bool DialogClosed, AutomationElement? Item);

internal sealed class NativeUiException(string message) : Exception(message);

internal sealed record NativeWindow(IntPtr Handle, int ProcessId, string ClassName, bool IsVisible);

internal static class NativeWindows
{
    private delegate bool EnumWindowsProc(IntPtr windowHandle, IntPtr parameter);

    public static IReadOnlyList<NativeWindow> Enumerate()
    {
        var windows = new List<NativeWindow>();
        EnumWindows(
            (windowHandle, unusedParameter) =>
            {
                _ = GetWindowThreadProcessId(windowHandle, out var processId);
                var className = new StringBuilder(256);
                _ = GetClassName(windowHandle, className, className.Capacity);
                windows.Add(new NativeWindow(
                    windowHandle,
                    unchecked((int)processId),
                    className.ToString(),
                    IsWindowVisibleNative(windowHandle)));
                return true;
            },
            IntPtr.Zero);
        return windows;
    }

    public static bool Exists(IntPtr windowHandle) => IsWindowNative(windowHandle);

    public static void SetCursorPosition(Point position) => SetCursorPos(position.X, position.Y);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr windowHandle, StringBuilder className, int maximumCount);

    [DllImport("user32.dll", EntryPoint = "IsWindowVisible")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisibleNative(IntPtr windowHandle);

    [DllImport("user32.dll", EntryPoint = "IsWindow")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowNative(IntPtr windowHandle);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetCursorPos(int x, int y);
}
