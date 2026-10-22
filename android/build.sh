#!/usr/bin/env bash
# 手工构建 dsh-phone-harness 的 Android APK（本机没有 gradle）。
# 用法: ./build.sh   产物 -> android/bin/dsh-phone.apk
#
# 注意：build-tools/android-14 的 d8 在 JDK 25 编译出的匿名内部类上会崩
# （NullPointerException: Cannot invoke "String.length()" because "<parameter1>" is null），
# 所以固定用 android-16（r36）的 d8。
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8 -Duser.language=en -Duser.country=US"

# 必须用 pwd -W 拿 Windows 形式的绝对路径（C:/...）：aapt2.exe / d8.bat / apksigner.bat
# 是原生 Windows 程序，喂 /c/... 这种 MSYS 路径会报 "failed to open APK: I/O error"。
SDK="$(cd ../sdk && pwd -W)"
BT="$SDK/build-tools/android-16"
PLAT="$SDK/platform/android-35/android.jar"
for f in "$BT/aapt2.exe" "$BT/d8.bat" "$BT/zipalign.exe" "$BT/apksigner.bat" "$PLAT"; do
  [ -e "$f" ] || { echo "缺少 $f"; exit 1; }
done

[ -f debug.keystore ] || keytool -genkeypair -keystore debug.keystore \
  -storepass android -keypass android -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1

rm -rf build && mkdir -p build/obj build/classes build/dex build/gen build/bin

# 版本号单一来源：AndroidManifest.xml 里写死，构建时可用环境变量覆盖。
# aapt2 link 的 --version-code/--version-name 不会盖掉 manifest 里的显式值，
# 所以这里生成一份注入后的 manifest 副本再交给 aapt2。
VERSION_NAME_USED="${VERSION_NAME:-0.6.26}"
VERSION_CODE_USED="${VERSION_CODE:-42}"
sed -e "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$VERSION_CODE_USED\"/" \
    -e "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VERSION_NAME_USED\"/" \
    AndroidManifest.xml > build/AndroidManifest.xml
echo "版本 $VERSION_NAME_USED (code $VERSION_CODE_USED)"

echo "[1/7] aapt2 compile"
"$BT/aapt2.exe" compile --no-crunch -o build/obj/res.zip --dir res

# aapt2 link 必须排在 javac 之前：它会生成 build/gen/.../R.java，
# 而源码里引用 R.drawable.* 图标，顺序反了 javac 就报 "package R does not exist"。
echo "[2/7] aapt2 link（生成 R.java + 资源表）"
"$BT/aapt2.exe" link -o build/bin/unsigned.apk -I "$PLAT" \
  --manifest build/AndroidManifest.xml -R build/obj/res.zip --auto-add-overlay \
  --java build/gen --min-sdk-version 21 --target-sdk-version 34 \
  --version-code "$VERSION_CODE_USED" --version-name "$VERSION_NAME_USED"

echo "[3/7] javac"
find src build/gen -name '*.java' > build/sources.txt
javac --release 8 -encoding UTF-8 -nowarn -Xlint:none \
  -cp "$PLAT" -d build/classes @build/sources.txt

echo "[4/7] d8"
find build/classes -name '*.class' > build/classes.txt
"$BT/d8.bat" --min-api 21 --lib "$PLAT" --output build/dex @build/classes.txt

# 关键：classes.dex 必须落在 APK 根目录。
# 之前写成 ( cd build/bin && jar --update --file unsigned.apk ../dex/classes.dex )，
# jar 会保留传入路径的目录部分，产出 dex/classes.dex —— 能装上、但 ART 找不到类，一启动就崩。
echo "[5/7] 塞入 classes.dex"
( cd build/dex && jar --update --file ../bin/unsigned.apk classes.dex )
python - <<'PY'
import sys, zipfile
names = zipfile.ZipFile('build/bin/unsigned.apk').namelist()
if 'classes.dex' not in names:
    print('classes.dex 不在 APK 根目录：', names)
    sys.exit(1)
PY

echo "[6/7] zipalign"
"$BT/zipalign.exe" -f -p 4 build/bin/unsigned.apk build/bin/aligned.apk

echo "[7/7] 签名"
"$BT/apksigner.bat" sign --ks debug.keystore --ks-pass pass:android \
  --key-pass pass:android --ks-key-alias androiddebugkey \
  --out bin/dsh-phone.apk build/bin/aligned.apk
"$BT/apksigner.bat" verify --print-certs bin/dsh-phone.apk | head -3

# [8/8] 旁车元数据：插件面板要显示「随包 APK 是哪个版本」，但它不能去解包 APK。
# 所以构建时把版本号/大小/md5 写进同名 .json，插件（index.js 的 apkMeta）直接读它。
# 默认同时覆盖 ../plugin/assets/（发布时插件和 APK 必须同源），SYNC_ASSETS=0 可关。
echo "[8/8] 写旁车元数据"
python - "$VERSION_NAME_USED" "$VERSION_CODE_USED" <<'PY'
import hashlib, json, os, sys, time
name, code = sys.argv[1], int(sys.argv[2])
data = open('bin/dsh-phone.apk', 'rb').read()
meta = {
    'versionName': name,
    'versionCode': code,
    'size': len(data),
    'md5': hashlib.md5(data).hexdigest(),
    'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
}
open('bin/dsh-phone.apk.json', 'w', encoding='utf-8').write(json.dumps(meta, indent=2) + '\n')
print('versionName %s (code %s), %d bytes, md5 %s' % (name, code, len(data), meta['md5']))
PY
if [ "${SYNC_ASSETS:-1}" = "1" ] && [ -d ../plugin/assets ]; then
  cp bin/dsh-phone.apk ../plugin/assets/dsh-phone.apk
  cp bin/dsh-phone.apk.json ../plugin/assets/dsh-phone.apk.json
  echo "已同步到 ../plugin/assets/"
fi

ls -la bin/dsh-phone.apk
echo "OK -> $(pwd)/bin/dsh-phone.apk"