#!/usr/bin/env bash
# 构建锁：多个 agent 共用 android/ 时序列化 aapt2/javac/d8，避免 bin/ 与中间产物互相踩。
# 用法：bash tools/build-lock.sh ./build.sh [timeout_seconds]
set -u
DIR="${TMPDIR:-/tmp}/phone-harness-build-lock"
TIMEOUT="${2:-900}"
start=$(date +%s)
while ! mkdir "$DIR" 2>/dev/null; do
  now=$(date +%s)
  if [ $((now - start)) -ge "$TIMEOUT" ]; then
    echo "[build-lock] TIMEOUT after ${TIMEOUT}s waiting for $DIR" >&2
    exit 1
  fi
  sleep 2
done
echo "$$" > "$DIR/owner"
trap 'rm -rf "$DIR"' EXIT INT TERM
"$@"
