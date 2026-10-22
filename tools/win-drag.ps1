param([int]$X1,[int]$Y1,[int]$X2,[int]$Y2,[int]$Steps = 18,[long]$Hwnd = <HWND>,[int]$DelayMs = 120)
Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
public struct RECT { public int L, T, R, B; }
public struct POINT { public int X, Y; }
'@
$h = [IntPtr]$Hwnd
[void][W.U]::ShowWindow($h, 9)
Start-Sleep -Milliseconds 150
[void][W.U]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 250
$cr = New-Object W.U+RECT; [void][W.U]::GetClientRect($h, [ref]$cr) | Out-Null
$pt = New-Object W.U+POINT; $pt.X = 0; $pt.Y = 0; [void][W.U]::ClientToScreen($h, [ref]$pt) | Out-Null
$cw = $cr.R; $ch = $cr.B
$scale = [Math]::Min($cw / 1080.0, $ch / 1920.0)
$ox = ($cw - 1080 * $scale) / 2.0
$oy = ($ch - 1920 * $scale) / 2.0
function PX([int]$x) { return [int][Math]::Round($pt.X + $ox + $x * $scale) }
function PY([int]$y) { return [int][Math]::Round($pt.Y + $oy + $y * $scale) }
[void][W.U]::SetCursorPos((PX $X1), (PY $Y1))
Start-Sleep -Milliseconds $DelayMs
[W.U]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 90
for ($i = 1; $i -le $Steps; $i++) {
  $fx = $X1 + ($X2 - $X1) * $i / $Steps
  $fy = $Y1 + ($Y2 - $Y1) * $i / $Steps
  [void][W.U]::SetCursorPos((PX ([int][Math]::Round($fx))), (PY ([int][Math]::Round($fy))))
  Start-Sleep -Milliseconds 16
}
Start-Sleep -Milliseconds 60
[W.U]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)
"drag app($X1,$Y1)->($X2,$Y2) screen($(PX $X1),$(PY $Y1))->($(PX $X2),$(PY $Y2)) client $($cw)x$($ch)"
