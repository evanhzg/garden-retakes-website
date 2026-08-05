<#
.SYNOPSIS
  Stage 2 — drive a running CS2 through a generated lineup capture config.

.DESCRIPTION
  CS2 has no remote console, so the game is driven the only way it can be:
  keystrokes into the focused window, against the alias chain that
  generate.mjs wrote. One pass over the manifest photographs every lineup on
  the map twice — the aim, then the result of throwing it.

  SendInput rather than SendKeys. SendKeys posts window messages, and CS2 reads
  the keyboard through SDL's raw input path, which never sees them. SendInput
  synthesises events at the same level the driver does, so the game cannot tell
  the difference.

  Nothing here talks to the network or to Steam. It presses keys at a window
  and waits. If the window is not focused it stops rather than typing into
  whatever is.

.PARAMETER Map
  Map id, e.g. de_mirage. Reads out/garden_cap_<map>.json.

.PARAMETER Detonate
  Also throw each grenade and photograph where it lands. Doubles the run time.

.PARAMETER Start
  Index to resume from (0-based). The config's F8 rewinds to 0; this skips
  forward by pressing F9 without photographing.

.PARAMETER SettleMs
  Wait after teleporting before the shot. Long enough for the view to render
  and the grenade to be in hand.

.PARAMETER SmokeMs
  Wait between the throw and the result shot. A smoke needs roughly four
  seconds to fly and bloom; molotovs spread for about the same.

.EXAMPLE
  pwsh -File drive.ps1 -Map de_mirage -Detonate
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Map,
  [switch]$Detonate,
  [int]$Start = 0,
  [int]$SettleMs = 900,
  [int]$SmokeMs = 5000,
  [int]$ShotMs = 700,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class GardenInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public KEYBDINPUT ki; public int pad1; public int pad2; }

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);

  const uint INPUT_KEYBOARD = 1;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_SCANCODE = 0x0008;
  const uint MAPVK_VK_TO_VSC = 0;

  // Scan codes, not virtual keys. CS2 reads the keyboard through SDL's raw
  // input path, which looks at wScan; an event carrying only a virtual key
  // arrives with wScan 0 and the game maps it to nothing.
  //
  // Asked of the OS rather than written down. A hand-typed F-key scan table is
  // off by one row at the F8/F9 boundary more often than not, and the failure
  // mode is silent: the game takes a screenshot when it was told to advance.
  static ushort Scan(ushort vk) {
    return (ushort)MapVirtualKey(vk, MAPVK_VK_TO_VSC);
  }

  static void Send(ushort vk, bool up) {
    INPUT[] inp = new INPUT[1];
    inp[0].type = INPUT_KEYBOARD;
    inp[0].ki.wVk = 0;
    inp[0].ki.wScan = Scan(vk);
    inp[0].ki.dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0);
    inp[0].ki.time = 0;
    inp[0].ki.dwExtraInfo = IntPtr.Zero;
    SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void Tap(ushort vk, int holdMs) {
    Send(vk, false);
    System.Threading.Thread.Sleep(holdMs);
    Send(vk, true);
  }

  public static string ForegroundTitle() {
    IntPtr h = GetForegroundWindow();
    int len = GetWindowTextLength(h);
    if (len == 0) return "";
    var sb = new System.Text.StringBuilder(len + 1);
    GetWindowText(h, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

$F8 = 0x77; $F9 = 0x78; $F10 = 0x79; $F11 = 0x7A

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $here "out/garden_cap_$Map.json"
if (-not (Test-Path $manifestPath)) {
  throw "No manifest at $manifestPath — run generate.mjs first."
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$lineups = $manifest.lineups
Write-Host "$Map : $($lineups.Count) lineups" -ForegroundColor Cyan

if ($DryRun) {
  foreach ($l in $lineups) {
    Write-Host ("  {0,3}  {1,-40} {2,-8} {3}" -f $l.index, $l.name, $l.utility, $l.throwType)
  }
  return
}

# Focus is the one precondition worth being strict about: every keystroke below
# goes to whatever window is in front, and a stray F10 in an editor is harmless
# but a stray F11 held down for a quarter second is not.
$cs2 = Get-Process -Name cs2 -ErrorAction SilentlyContinue
if (-not $cs2) { throw "CS2 is not running." }
[void][GardenInput]::SetForegroundWindow($cs2.MainWindowHandle)
Start-Sleep -Milliseconds 1200
$title = [GardenInput]::ForegroundTitle()
if ($title -notmatch 'Counter-Strike') {
  throw "CS2 is not the foreground window (saw '$title'). Click the game, then re-run."
}

Write-Host "Focused: $title" -ForegroundColor DarkGray
Write-Host "Rewinding to lineup 0..." -ForegroundColor DarkGray
[GardenInput]::Tap($F8, 40)
Start-Sleep -Milliseconds $SettleMs

# Skipping forward costs one keypress per lineup and no screenshots, which is
# how a run that died at lineup 90 resumes without re-photographing 90 of them.
for ($i = 0; $i -lt $Start; $i++) {
  [GardenInput]::Tap($F9, 40)
  Start-Sleep -Milliseconds 120
}

$shots = 0
for ($i = $Start; $i -lt $lineups.Count; $i++) {
  $l = $lineups[$i]
  Write-Host ("[{0,3}/{1}] {2}" -f ($i + 1), $lineups.Count, $l.name)

  # F8 already put us on lineup 0, so the first iteration must not advance.
  if ($i -gt $Start) {
    [GardenInput]::Tap($F9, 40)
  }
  Start-Sleep -Milliseconds $SettleMs

  [GardenInput]::Tap($F10, 40)      # the aim shot
  $shots++
  Start-Sleep -Milliseconds $ShotMs

  if ($Detonate) {
    # A jump-throw is the release that matters: jump and attack go down
    # together and attack comes back up first, which the +gthrow/-gthrow pair
    # in the config does. Holding the key for a beat is what makes it a jump
    # throw rather than a standing one.
    $hold = if ($l.throwType -match 'jump') { 260 } else { 45 }
    [GardenInput]::Tap($F11, $hold)
    Start-Sleep -Milliseconds $SmokeMs
    [GardenInput]::Tap($F10, 40)    # where it landed
    $shots++
    Start-Sleep -Milliseconds $ShotMs
  }
}

Write-Host "Done. $shots screenshots taken." -ForegroundColor Green
Write-Host "Next: node tools/lineup-capture/ingest.mjs --map $Map$(if ($Detonate) { ' --throw' })"
