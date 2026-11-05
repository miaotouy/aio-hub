param([string]$Vmx, [string]$Vmrun = $env:AIO_VM_VMRUN)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $Vmx -or -not (Test-Path -LiteralPath $Vmx -PathType Leaf)) { throw 'Use --vmx or AIO_VM_VMX to select an existing VM configuration.' }
$Vmx = (Resolve-Path -LiteralPath $Vmx).Path
if (-not $Vmrun) {
  $command = Get-Command vmrun.exe -ErrorAction SilentlyContinue
  if ($command) { $Vmrun = $command.Source }
  else {
    $Vmrun = @('D:\Program Files\VMware\VMware Workstation\vmrun.exe', 'C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe', 'C:\Program Files\VMware\VMware Workstation\vmrun.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  }
}
if (-not $Vmrun) { throw 'Set AIO_VM_VMRUN to the vmrun executable.' }
$running = & $Vmrun -T ws list
if ($LASTEXITCODE -ne 0) { throw 'Unable to list VMware instances.' }
if ($running | Where-Object { $_.Trim() -ieq $Vmx }) { @{ ok = $true; alreadyRunning = $true } | ConvertTo-Json -Compress; exit 0 }
$count = [int](Get-CimInstance Win32_Processor | Measure-Object NumberOfLogicalProcessors -Sum).Sum
if ($count -lt 1 -or $count -gt 63) { throw 'This affinity launcher requires a single processor group with 1-63 logical processors.' }
$self = Get-Process -Id $PID
$saved = $self.ProcessorAffinity
try {
  $self.ProcessorAffinity = [IntPtr]((1L -shl $count) - 1)
  $child = Start-Process -FilePath $Vmrun -ArgumentList @('-T', 'ws', 'start', ('"' + $Vmx + '"'), 'nogui') -WindowStyle Hidden -PassThru
  $child.WaitForExit()
  if ($child.ExitCode -ne 0) { throw ('VMware startup failed: ' + $child.ExitCode) }
} finally { $self.ProcessorAffinity = $saved }
@{ ok = $true; alreadyRunning = $false; logicalProcessors = $count } | ConvertTo-Json -Compress
