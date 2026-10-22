set -u
cd "/d/Program/dsh-phoneharness" || exit 1
G='/c/Program Files/Git/cmd/git.exe'
GCM='/c/Program Files/Git/ucrt64/bin/git-credential-manager.exe'
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | "$GCM" get 2>/dev/null | grep '^password=' | cut -d= -f2)
API=https://api.github.com/repos/DongLiKVK/dsh-phoneharness

echo '=== 1) 提交并推送代码 ==='
"$G" add -A
"$G" commit -q -m 'feat: APK 下载文件名带版本号（dsh-phone-<versionName>.apk），插件升到 0.5.20' 2>&1 | tail -3
"$G" log --oneline -1
"$G" push origin main 2>&1 | tail -3
echo
echo '=== 2) 打 tag v0.5.20 ==='
"$G" tag -a v0.5.20 -m 'dsh-phoneharness 0.5.20 / APK 0.6.26：下载文件名带版本' 2>&1 | tail -2
"$G" push origin v0.5.20 2>&1 | tail -2