param([int]$X, [int]$Y, [long]$Hwnd = <HWND>, [int]$DelayMs = 120, [int]$HoldMs = 900)
Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
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
$sx = [int][Math]::Round($pt.X + $ox + $X * $scale)
$sy = [int][Math]::Round($pt.Y + $oy + $Y * $scale)
[void][W.U]::SetCursorPos($sx, $sy)
Start-Sleep -Milliseconds $DelayMs
[W.U]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 70
[W.U]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)
"held app($X,$Y) for $($HoldMs)ms -> screen($sx,$sy) client $($cw)x$($ch) scale $([Math]::Round($scale,4)) origin $($pt.X),$($pt.Y) fg $([W.U]::GetForegroundWindow())"
