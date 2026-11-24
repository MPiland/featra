param([int]$Root, [string]$Out)
# TEMPORARY diagnostic (STORY-25, Windows close hang): which of the app's processes outlive its quit.
function Get-Tree([int]$root) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
  $ids = @{ $root = $true }
  do {
    $added = $false
    foreach ($p in $all) {
      if ($ids.ContainsKey([int]$p.ParentProcessId) -and -not $ids.ContainsKey([int]$p.ProcessId)) {
        $ids[[int]$p.ProcessId] = $true; $added = $true
      }
    }
  } while ($added)
  $all | Where-Object { $ids.ContainsKey([int]$_.ProcessId) }
}
$line = { param($p) "{0} <- {1} {2} :: {3}" -f $p.ProcessId, $p.ParentProcessId, $p.Name, $p.CommandLine }
$before = @(Get-Tree $Root)
$text = @("== before close: tree of $Root") + ($before | ForEach-Object { & $line $_ })
[Console]::Out.WriteLine("[diag] ready"); [Console]::Out.Flush()
foreach ($after in 3, 20) {
  Start-Sleep -Seconds $after
  $alive = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
  $ids = $before | ForEach-Object { [int]$_.ProcessId }
  $text += "== $after s later: still alive of that tree"
  $text += $alive | Where-Object { $ids -contains [int]$_.ProcessId } | ForEach-Object { & $line $_ }
}
$text | Set-Content -Path $Out
$text | ForEach-Object { Write-Output "[diag] $_" }
