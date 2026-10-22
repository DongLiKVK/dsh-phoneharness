#!/usr/bin/env bash
# MuMu 设备操作助手：取当前 app 所在虚拟屏 + 用它截图 + Windows 级鼠标点击（绕开 input -d 无效的问题）
set -u
ADB="<PLATFORM_TOOLS>/adb.exe"
ROOT="<PROJECT_ROOT>"
export MSYS2_ARG_CONV_EXCL="*"
A() { "$ADB" "$@"; }

disp() {  # 打印 app 窗口所在 display 的 screencap id（uniqueId 数字）
  A shell "dumpsys window windows | grep -m1 'com.lc.phoneharness' -A1 | grep -o 'mDisplayId=[0-9]*'" \
    | sed 's/mDisplayId=//' | tr -d '\r' | {
      read -r id
      [ -z "${id:-}" ] && { echo "0"; return; }
      A shell "dumpsys display | tr ',' '\n' | grep -A2 'displayId=${id}\$' | grep -o 'local:[0-9]*'" \
        | head -1 | sed 's/local://' | tr -d '\r'
    }
}

shot() { # shot 输出png
  local out="$1" did
  did="$(disp)"
  A shell screencap -p -d "$did" /sdcard/_s.png >/dev/null 2>&1
  mkdir -p "$(dirname "$out")"
  A pull /sdcard/_s.png "$out" >/dev/null 2>&1
  echo "$out display=$did md5=$(md5sum "$out" | cut -c1-12)"
}

drag() { # drag x1 y1 x2 y2 [sleep_ms]
  local x1="$1" y1="$2" x2="$3" y2="$4" wait="${5:-400}"
  pwsh -NoProfile -File "$ROOT/tools/win-drag.ps1" -X1 "$x1" -Y1 "$y1" -X2 "$x2" -Y2 "$y2" >/dev/null
  sleep "$(awk -v ms="$wait" 'BEGIN{printf "%.2f", ms/1000}')"
}

hold() { powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/tools/win-hold.ps1" -X "$1" -Y "$2" -HoldMs "${3:-900}" >/dev/null; sleep "${4:-1}"; }
tap() { # tap x y [sleep_ms]
  local x="$1" y="$2" wait="${3:-260}"
  pwsh -NoProfile -File "$ROOT/tools/win-tap.ps1" -X "$x" -Y "$y" >/dev/null
  sleep "$(awk -v ms="$wait" 'BEGIN{printf "%.2f", ms/1000}')"
}

"$@"
