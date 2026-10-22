set -u
cd "/d/Program/dsh-phoneharness" || exit 1
GCM='/c/Program Files/Git/ucrt64/bin/git-credential-manager.exe'
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | "$GCM" get 2>/dev/null | grep '^password=' | cut -d= -f2)
API=https://api.github.com/repos/DongLiKVK/dsh-phoneharness

echo '=== 1) 重命名 APK 资产 -> dsh-phone-0.6.26.apk ==='
curl -s --max-time 30 -X PATCH -H "Authorization: token $TOKEN" -H 'Accept: application/vnd.github+json' \
  -d '{"name":"dsh-phone-0.6.26.apk"}' -w '\nHTTP=%{http_code}\n' \
  $API/releases/assets/665958458 | tail -3

echo
echo '=== 2) 删除旧 SHA256SUMS 资产 ==='
curl -s --max-time 30 -X DELETE -H "Authorization: token $TOKEN" -o /dev/null -w 'HTTP=%{http_code}\n' $API/releases/assets/665958723

echo
echo '=== 3) 本地改名 ==='
mv release/dsh-phone.apk release/dsh-phone-0.6.26.apk
mv release/dsh-phone.apk.json release/dsh-phone-0.6.26.apk.json
ls -la release/