// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentProcess } from "./document-process";

const officeScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$kind = $env:AIO_DOCUMENT_KIND
$progId = switch ($kind) { 'pptx' { 'PowerPoint.Application' } 'xlsx' { 'Excel.Application' } default { 'Word.Application' } }
$processName = switch ($kind) { 'pptx' { 'POWERPNT' } 'xlsx' { 'EXCEL' } default { 'WINWORD' } }
$app = $null; $document = $null; $owned = $false
try {
# PowerPoint uses a shared application instance. Keep existing user windows untouched.
$existing = @(Get-Process -Name $processName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
if ($kind -eq 'pptx' -and $existing.Count -gt 0) { throw '请先关闭 PowerPoint，再执行文档转换，以保留现有窗口与文件。' }
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class AioDocumentWindow { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'
  $app = New-Object -ComObject $progId
  if ($null -eq $app) { throw '未检测到可用的 Microsoft Office。请安装对应程序，或改用 LibreOffice。' }
  [uint32]$officePid = 0
  $handle = if ($kind -eq 'pptx') { $app.HWND } else { $app.Hwnd }
  if ($null -eq $handle -or [long]$handle -eq 0) { throw '无法建立独立的 Microsoft Office 转换实例。请检查 Office 安装，或改用 LibreOffice。' }
  [void][AioDocumentWindow]::GetWindowThreadProcessId([IntPtr]$handle, [ref]$officePid)
  if ($officePid -eq 0 -or $existing -contains $officePid) { throw 'Office 返回了已有实例，请关闭对应程序后重试。' }
  $owned = $true
  $owner = Get-Process -Id $officePid
  @{ pid = $officePid; ticks = $owner.StartTime.ToUniversalTime().Ticks.ToString() } | ConvertTo-Json -Compress | Set-Content -LiteralPath $env:AIO_DOCUMENT_OWNER -Encoding UTF8
  if ($env:AIO_DOCUMENT_CHECK -eq '1') { Write-Output ('Microsoft Office ' + $app.Version); return }
  $app.AutomationSecurity = 3
  switch ($kind) {
    'pptx' {
      $app.DisplayAlerts = 1
      $document = $app.Presentations.Open($env:AIO_DOCUMENT_SOURCE, -1, 0, 0)
      $document.SaveAs($env:AIO_DOCUMENT_TARGET, 24)
    }
    'xlsx' {
      $app.Visible = $false; $app.DisplayAlerts = $false; $app.AskToUpdateLinks = $false
      $document = $app.Workbooks.Open($env:AIO_DOCUMENT_SOURCE, 0, $true)
      $document.SaveAs($env:AIO_DOCUMENT_TARGET, 51)
    }
    default {
      $app.Visible = $false; $app.DisplayAlerts = 0; $app.Options.UpdateLinksAtOpen = $false
      $document = $app.Documents.Open($env:AIO_DOCUMENT_SOURCE, $false, $true, $false)
      $document.SaveAs2($env:AIO_DOCUMENT_TARGET, 16)
    }
  }
  Write-Output 'OK'
} catch {
  if ($_.Exception.Message -match '80040154|REGDB_E_CLASSNOTREG') {
    [Console]::Error.WriteLine('未检测到可用的 Microsoft Office。请安装对应程序，或改用 LibreOffice。')
  } else { [Console]::Error.WriteLine($_.Exception.Message) }
  exit 1
} finally {
  if ($null -ne $document) {
    try { if ($kind -eq 'pptx') { $document.Close() } else { $document.Close($false) } } catch {}
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) } catch {}
  }
  if ($null -ne $app) {
    if ($owned) { try { $app.Quit() } catch {} }
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) } catch {}
  }
}
`;
const cleanupScript = `
$ErrorActionPreference = 'Stop'
$p = Get-Process -Id ([int]$env:AIO_DOCUMENT_PID) -ErrorAction SilentlyContinue
if ($null -ne $p -and $p.StartTime.ToUniversalTime().Ticks.ToString() -eq $env:AIO_DOCUMENT_TICKS) { Stop-Process -Id $p.Id -Force }
`;
function encoded(script: string): string[] {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-OutputFormat",
    "Text",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ];
}
export async function runMicrosoftOffice(
  run: DocumentProcess,
  directory: string,
  format: string,
  timeoutMs: number,
  source?: string,
  target?: string
): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  const owner = path.join(directory, "office-owner.json");
  const executable = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32/WindowsPowerShell/v1.0/powershell.exe"
  );
  try {
    const output = await run(executable, encoded(officeScript), {
      timeoutMs,
      cwd: directory,
      env: {
        AIO_DOCUMENT_KIND: format,
        AIO_DOCUMENT_SOURCE: source || "",
        AIO_DOCUMENT_TARGET: target || "",
        AIO_DOCUMENT_CHECK: source ? "0" : "1",
        AIO_DOCUMENT_OWNER: owner,
      },
    });
    return output.stdout;
  } finally {
    // Office COM servers may be launched by RPCSS, outside the PowerShell process tree.
    // Clean up only the PID and process creation time recorded by this invocation.
    try {
      const item = JSON.parse(
        (await fs.readFile(owner, "utf8")).replace(/^\uFEFF/, "")
      );
      if (
        Number.isInteger(item.pid) &&
        item.pid > 0 &&
        item.pid !== process.pid &&
        /^\d+$/.test(item.ticks)
      )
        await run(executable, encoded(cleanupScript), {
          timeoutMs: 5000,
          env: {
            AIO_DOCUMENT_PID: String(item.pid),
            AIO_DOCUMENT_TICKS: item.ticks,
          },
        });
    } catch {
      /* Normal COM shutdown usually leaves no live process. */
    }
  }
}
