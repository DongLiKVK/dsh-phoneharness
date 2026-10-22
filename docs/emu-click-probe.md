# 模拟器点击探针（MuMu 虚拟屏）

MuMu 上 `com.lc.phoneharness` 跑在**虚拟屏**（`dumpsys window windows` 里 app 窗口的 `mDisplayId`，常见 99/100/101/…）。`adb shell input tap` 对虚拟屏**完全无效**，`screencap -d <mDisplayId>` 也会 `Status: -2`。下面这套是唯一实测可用的通道。

## 用法

```bash
export MSYS2_ARG_CONV_EXCL="*"          # 否则 /sdcard/x.png 会被 MSYS 改写成 Windows 路径
bash tools/emu.sh disp                  # 打印当前 app 所在屏的 screencap id
bash tools/emu.sh shot shots/x.png      # 取 id → screencap → pull → 打印 md5
bash tools/emu.sh tap 438 1353 600      # 点击（app 坐标 1080x1920）+ 等待 600ms
```

## 原理

1. **取 id**：`dumpsys display` 是多行 attribute 列表，先 `tr ',' '\n'` 再 `grep -A2 'displayId=101$'` 拿 `uniqueId='local:4619827732256257502'`，screencap 的 `-d` 要的是**这个数字**，不是 101。
2. **点击**：`tools/win-tap.ps1 -X -Y` 把 app 坐标映射到 MuMu 窗口的**屏幕坐标**再发 Win32 鼠标事件。
   - 窗口：进程 `MuMuNxDevice`，标题「MuMu安卓设备」，client 625x1152，clientOrigin=(-658,34)（负坐标副屏）。
   - `scale = min(cw/1080, ch/1920) = 0.5787`；`ox=(cw-1080*scale)/2`、`oy=(ch-1920*scale)/2`；落点 = clientOrigin + (ox + X*scale, oy + Y*scale)。
   - 先 `ShowWindow(9)` + `SetForegroundWindow`，再 `SetCursorPos` + `mouse_event(0x0002/0x0004)`。
   - **PowerShell 里不要写 `${var}`**：经 run_code 的 JS 模板串透传时会被当插值；用 `$($var)`。

## 已知判据

- 校准：点 ≡ (81,87) 后截图 md5 变号（会话页 `2ab86516c0c1` → 抽屉 `0a791b75cdc7`）。
- 静止页面 PNG 编码确定 → **相同 md5 只能说明画面没变**；但 toast 只活 ~2 s，验证 toast 要在 **300–900 ms** 内截图。
- 每次 `am start` 都会新开一块虚拟屏，id 递增，所以 `shot`/`tap` 前必须`disp`现取。
- 屏幕会自己熄灭：`input keyevent KEYCODE_WAKEUP` + `wm dismiss-keyguard`，并确认 `mCurrentFocus` 带包名后再点。
- 静态核对已装 APK 里的方法名必须 `grep -a`（二进制不加 `-a` 恒为 0 命中）。

## 会话页操作条盒子（1080x1920，y=1293–1413）

复制 (96,1353) · 赞 (210,1353) · 踩 (324,1353) · 朗读 (438,1353) · 分享 (552,1353) · 重新生成 (984,1353)
