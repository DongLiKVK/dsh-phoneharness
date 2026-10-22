set -u
cd "/d/Program/dsh-phoneharness/release" || exit 1
GCM='/c/Program Files/Git/ucrt64/bin/git-credential-manager.exe'
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | "$GCM" get 2>/dev/null | grep '^password=' | cut -d= -f2)
REL=420753090
echo '=== 上传新 SHA256SUMS ==='
curl -sS --max-time 90 --retry 2 -w '\nHTTP=%{http_code}\n' -o /tmp/sum.json \
  -X POST -H "Authorization: token $TOKEN" -H 'Content-Type: application/octet-stream' \
  --data-binary @SHA256SUMS \
  "https://uploads.github.com/repos/DongLiKVK/dsh-phoneharness/releases/$REL/assets?name=SHA256SUMS" | tail -2
echo
echo '=== Release 最终资产清单 ==='
curl -s --max-time 30 -H "Authorization: token $TOKEN" \
  https://api.github.com/repos/DongLiKVK/dsh-phoneharness/releases/$REL \
  | python -c "import json,sys;d=json.load(sys.stdin);print('tag:',d['tag_name']);[print(f\"  {a['name']:34s} {a['size']:>9d} bytes\") for a in d['assets']]"