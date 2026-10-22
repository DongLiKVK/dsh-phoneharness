set -u
cd "/d/Program/dsh-phoneharness" || exit 1

echo '=== 重新生成 SHA256SUMS ==='
cd release
sha256sum dsh-phone-0.6.26.apk dsh-phoneharness-0.5.19.tgz > SHA256SUMS
cat SHA256SUMS
sha256sum -c SHA256SUMS