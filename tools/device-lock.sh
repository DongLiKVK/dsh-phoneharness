#!/usr/bin/env bash
# 设备占用锁 —— <DEVICE> 是唯一采集设备，多个 agent 同时 input/record 会产出互相污染的废证据。
# 用法:
#   tools/device-lock.sh acquire <owner> [timeout_s]   # 拿不到就等到超时，退出码 1
#   tools/device-lock.sh release <owner>
#   tools/device-lock.sh status
#   tools/device-lock.sh run <owner> -- <command...>    # acquire; command; release（异常也释放）
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCKDIR="$ROOT/shots/.device-lock"
STALE_SEC=900          # 15 分钟没释放视为持有者已死
OWNER_FILE="$LOCKDIR/owner"

now() { date +%s; }

lock_age() {
  [ -f "$OWNER_FILE" ] || { echo 999999; return; }
  local t
  t=$(stat -c %Y "$OWNER_FILE" 2>/dev/null || echo 0)
  echo $(( $(now) - t ))
}

acquire() {
  local owner="$1" timeout="${2:-600}" waited=0
  mkdir -p "$ROOT/shots" 2>/dev/null
  while :; do
    if mkdir "$LOCKDIR" 2>/dev/null; then
      printf '%s\n%s\n' "$owner" "$$" > "$OWNER_FILE"
      echo "[device-lock] acquired by $owner (pid $$)"
      return 0
    fi
    local cur age
    cur=$(head -1 "$OWNER_FILE" 2>/dev/null || echo unknown)
    age=$(lock_age)
    if [ "$cur" = "$owner" ]; then
      touch "$OWNER_FILE" 2>/dev/null
      echo "[device-lock] already held by $owner (age ${age}s) - refreshing"
      return 0
    fi
    if [ "$age" -gt "$STALE_SEC" ]; then
      echo "[device-lock] stale lock from '$cur' (age ${age}s) - breaking"
      rm -rf "$LOCKDIR"
      continue
    fi
    if [ "$waited" -ge "$timeout" ]; then
      echo "[device-lock] TIMEOUT after ${waited}s; held by '$cur' (age ${age}s)" >&2
      return 1
    fi
    sleep 2; waited=$((waited+2))
    [ $((waited % 30)) -eq 0 ] && echo "[device-lock] waiting for '$cur' (${waited}s)"
  done
}

release() {
  local owner="$1"
  local cur
  cur=$(head -1 "$OWNER_FILE" 2>/dev/null || echo "")
  if [ "$cur" = "$owner" ] || [ -z "$cur" ]; then
    rm -rf "$LOCKDIR"
    echo "[device-lock] released by $owner"
  else
    echo "[device-lock] WARN: held by '$cur', refusing release by '$owner'" >&2
    return 1
  fi
}

case "${1:-status}" in
  acquire) shift; acquire "$@" ;;
  release) shift; release "$@" ;;
  status)
    if [ -d "$LOCKDIR" ]; then
      echo "LOCKED by $(head -1 "$OWNER_FILE" 2>/dev/null) age=$(lock_age)s"
    else
      echo "FREE"
    fi ;;
  run)
    shift; owner="$1"; shift
    [ "${1:-}" = "--" ] && shift
    acquire "$owner" || exit 1
    trap 'release "'"$owner"'" >/dev/null 2>&1' EXIT INT TERM
    "$@"
    rc=$?
    release "$owner" >/dev/null 2>&1
    trap - EXIT INT TERM
    exit $rc ;;
  *) echo "usage: $0 {acquire|release|status|run} ..." >&2; exit 2 ;;
esac
