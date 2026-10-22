# logo 素材与深浅两套机制 —— 设备端独立验收报告

- 验收人：verifier（shared task-10）
- 验收对象：Lead 生成的整套 logo 素材 + android-ui 接线的「按 Theme.dark 选资源」机制（Theme.brandLogo() / Theme.splashLogo()）
- 落盘时间：2026-10-21T22:40:12.960Z
- 设备：真机 **ZTE A2322**（`ro.product.model=ZTE A2322`，`ro.build.version.release=12`，`ro.build.version.sdk=31`，序列号 <DEVICE_SERIAL>，走 adb 隧道 `127.0.0.1:15037`）
- 被测构建：**APK 0.6.11 / versionCode 27**（`android/bin/dsh-phone.apk`，616056 B）
- 结论：**六项验收 5 PASS + 1 项部分未验证（见第 6 项局限）**；核心的「程序化选资源优先于 drawable-night」已用用例 C/D 双向上机证明。

## 0. 结论汇总

| # | 验收项 | 结论 | 关键证据 |
| --- | --- | --- | --- |
| 1 | 进包审计（0.6.11/27 含全套素材、无 drawable-night） | **PASS** | §1；`unzip -l` + `aapt2 dump resources` + `ls android/res` |
| 2 | 装机到真机 | **PASS** | §2；`adb install -r` Success + `dumpsys package` versionName 0.6.11 / versionCode 27 |
| 3 | 2×2 四种组合截图（每格 5 页 = 20 张） | **PASS** | §3；20 张图 md5 互不相同、focus 全命中、self-check 20/20/true |
| 4 | 像素断言（浅底黑鲸 / 深底白鲸） | **PASS** | §4；`TALLY 条目 22 / FAIL 0`，A/B 互斥闸门 PASS |
| 5 | 切深色无残留、无闪烁 | **PASS** | §5；`--residue` `TALLY 6 / FAIL 0` + UiModeManager logcat |
| 6 | 反向测试（系统浅色 + 应用深色 → 白鲸） | **PASS（用例 D）**；局限：系统深色下的「限定符 vs 程序化」冲突只在 C 用例正面验证 | §6；case-D 全五页深底白鲸 |

## 1. 第 1 项：进包审计（PASS）

命令：

```bash
cd android && VERSION_NAME=0.6.11 VERSION_CODE=27 bash build.sh
unzip -l bin/dsh-phone.apk | grep -E 'drawable|mipmap' | sort
ls android/res | grep -i night
cat android/bin/dsh-phone.apk.json
aapt2 dump badging bin/dsh-phone.apk   # sdk/build-tools/android-16/aapt2.exe
```

原始输出（关键片段）：

```text
[8/8] 写旁车元数据
  versionName 0.6.11 (code 27), 616056 bytes, md5 71b40c33ad1bc1538d763f9b369426e4
  已同步到 ../plugin/assets/
OK -> .../android/bin/dsh-phone.apk

$ ls android/res | grep -i night
values-night

$ cat android/bin/dsh-phone.apk.json
{"versionName":"0.6.11","versionCode":27,"size":616056,"md5":"71b40c33ad1bc1538d763f9b369426e4","builtAt":"2026-10-21T22:12:15Z"}

$ aapt2 dump badging
package: name='com.lc.phoneharness' versionCode='27' versionName='0.6.11'
minSdkVersion:'21'
targetSdkVersion:'34'
```

- **`res/drawable-night/` 已整体从 APK 消失**（这是缺陷修复的关键动作），`android/res` 下只剩 `values-night`。
- 20 个 whale png（5 密度 × 4：ic_brand_logo / ic_brand_logo_dark / ic_splash_logo / ic_splash_logo_dark）+ 5 密度 `ic_launcher_monochrome.png` + `mipmap-anydpi-v26/ic_launcher.xml`（548 B，含 `<monochrome android:drawable="@mipmap/ic_launcher_monochrome" />`）均在包内。

注意：APK md5 只用于标识本次构建；**一致性判定用 versionName/versionCode + 资源表 + 文件大小**（zip 内嵌构建时间戳，md5 每次构建都会变）。

### 1.1 素材清单（源文件字节 + md5 + sha256 前 32 位）

| 文件 | 字节 | md5 | sha256(前32) |
| --- | --- | --- | --- |
| `android/res/drawable-mdpi/ic_brand_logo.png` | 3037 | 2dc4f3f6864b8e5117ea265459a70336 | 225c14019dc815a90b9e3fdc5f9bf5eb |
| `android/res/drawable-mdpi/ic_brand_logo_dark.png` | 3313 | d696a07a4ea901588ede0eafa69f1769 | 6cbee4bcd2c6f949a26fa9b50309ce67 |
| `android/res/drawable-mdpi/ic_splash_logo.png` | 5056 | 13d154c1f4a9c07473ac9c5745653058 | fde1479598e2247b728b1ffd625c1979 |
| `android/res/drawable-mdpi/ic_splash_logo_dark.png` | 5593 | 8eb19d05ea64238cbc50419b9a279e10 | a243c400f8000c4e4b42a5db042020a5 |
| `android/res/drawable-hdpi/ic_brand_logo.png` | 5056 | 13d154c1f4a9c07473ac9c5745653058 | fde1479598e2247b728b1ffd625c1979 |
| `android/res/drawable-hdpi/ic_brand_logo_dark.png` | 5593 | 8eb19d05ea64238cbc50419b9a279e10 | a243c400f8000c4e4b42a5db042020a5 |
| `android/res/drawable-hdpi/ic_splash_logo.png` | 8171 | a2e0d4506a878563064a44da662964f8 | 73513cdf752b8001a33999de9d4a997d |
| `android/res/drawable-hdpi/ic_splash_logo_dark.png` | 8988 | 7aa51d369dfa9ff93134c500163db808 | de84fa49993f7456b7f3530ff07e8512 |
| `android/res/drawable-xhdpi/ic_brand_logo.png` | 7112 | db59f709cb6369cd3ab55182d06b4af9 | 57efacbb00d6428d7f2640ec210f7bf5 |
| `android/res/drawable-xhdpi/ic_brand_logo_dark.png` | 7759 | dedb7bc9ad341d796a7b656726538ccb | 8f3945a1699f147e8b2f678e417851af |
| `android/res/drawable-xhdpi/ic_splash_logo.png` | 11755 | 5f7fc045198ca3a81b73eedab4c75b13 | 02e8e96d88a3123375ca29ac47bd50f9 |
| `android/res/drawable-xhdpi/ic_splash_logo_dark.png` | 13106 | de3433d43818bad133e407671fe4394c | 899d835dbc37a7b993c8177abbeb6f51 |
| `android/res/drawable-xxhdpi/ic_brand_logo.png` | 11755 | 5f7fc045198ca3a81b73eedab4c75b13 | 02e8e96d88a3123375ca29ac47bd50f9 |
| `android/res/drawable-xxhdpi/ic_brand_logo_dark.png` | 13106 | de3433d43818bad133e407671fe4394c | 899d835dbc37a7b993c8177abbeb6f51 |
| `android/res/drawable-xxhdpi/ic_splash_logo.png` | 18568 | cfe513cc14f7492520bbd912ce0b80f8 | 87ae62036d1b14ec92be42770d0df68a |
| `android/res/drawable-xxhdpi/ic_splash_logo_dark.png` | 22584 | c4cb06dfb99a72f133ca0d32f0d74170 | b47a58f7a693a5240da30c8500a1a86b |
| `android/res/drawable-xxxhdpi/ic_brand_logo.png` | 16277 | ff4f7b08865f5e2f9d71dfa27c48fd7f | a5de9bbaf1ecd95273430244762dad9a |
| `android/res/drawable-xxxhdpi/ic_brand_logo_dark.png` | 19394 | 645e803c76cff1c3462eb5171dc41569 | 0d1d95c7c859f3d22427fac6604ff978 |
| `android/res/drawable-xxxhdpi/ic_splash_logo.png` | 26373 | 0e6e89ec16370666ad48e68ccbc2341a | d5d55e2ca53fe401944a3c03773c9e4f |
| `android/res/drawable-xxxhdpi/ic_splash_logo_dark.png` | 33090 | e27c9f52a98e92725923815f669310c1 | e313a22a8ae7a862ea46a66c004c0f42 |
| `android/res/mipmap-mdpi/ic_launcher.png` | 1892 | 43e003513b9756b770e8ffbcea3ada69 | 84354a0a88d4c81b3795df4cc04aa191 |
| `android/res/mipmap-mdpi/ic_launcher_foreground.png` | 1985 | e0679b3fb713e4cc10864e81e480de23 | 06b92ad696347f9a6cda135b24833c29 |
| `android/res/mipmap-mdpi/ic_launcher_monochrome.png` | 1985 | e0679b3fb713e4cc10864e81e480de23 | 06b92ad696347f9a6cda135b24833c29 |
| `android/res/mipmap-hdpi/ic_launcher.png` | 3151 | 37a80397b15d365059c3c1616f2908f4 | e8f7d9744a9ddcaabe1ce2cb504715a7 |
| `android/res/mipmap-hdpi/ic_launcher_foreground.png` | 3422 | 10eafc5ae04e420576c3d79fd9a98cc2 | 85d5af1690b28a942892ed7b1d8837ec |
| `android/res/mipmap-hdpi/ic_launcher_monochrome.png` | 3422 | 10eafc5ae04e420576c3d79fd9a98cc2 | 85d5af1690b28a942892ed7b1d8837ec |
| `android/res/mipmap-xhdpi/ic_launcher.png` | 4408 | a69d2259c367b76e902f1f9174619772 | 5ffe6dd32d317b79e91a8db576e49dd4 |
| `android/res/mipmap-xhdpi/ic_launcher_foreground.png` | 4891 | 2c2c8e2f9821c7f769d991da2bb4e6f7 | 29d1a6d2216dd4aa242c07f8689a93c8 |
| `android/res/mipmap-xhdpi/ic_launcher_monochrome.png` | 4891 | 2c2c8e2f9821c7f769d991da2bb4e6f7 | 29d1a6d2216dd4aa242c07f8689a93c8 |
| `android/res/mipmap-xxhdpi/ic_launcher.png` | 7347 | aa5a4399a39754512bd236019d0dd206 | ab146b4479a941259cf8e68c47c49e4f |
| `android/res/mipmap-xxhdpi/ic_launcher_foreground.png` | 7946 | d9e80e91cc5aaec0427d6da6e3cc73a4 | ca6587d69d8166d3442348606aed68b8 |
| `android/res/mipmap-xxhdpi/ic_launcher_monochrome.png` | 7946 | d9e80e91cc5aaec0427d6da6e3cc73a4 | ca6587d69d8166d3442348606aed68b8 |
| `android/res/mipmap-xxxhdpi/ic_launcher.png` | 10380 | 2f907d5da7705d14b73325a911217cb4 | dfd6340651786568cff271f886bcaee0 |
| `android/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | 11488 | 7ff2ce0b31cf5c11ff5b87f952e75f84 | 75fcf9dbf89aa695e5080a313210bd94 |
| `android/res/mipmap-xxxhdpi/ic_launcher_monochrome.png` | 11488 | 7ff2ce0b31cf5c11ff5b87f952e75f84 | 75fcf9dbf89aa695e5080a313210bd94 |
| `android/res/mipmap-anydpi-v26/ic_launcher.xml` | 483 | 31bc259ebe5257922bdba798d7b5c98b | 88889c4d07ae0a0585e3fb5fc0f6310b |
| `android/res/values/colors.xml` | 405 | 929b1b87947729cf79e694d7b60477b3 | 9cbc9b00fff647771efbdeb7eff282ef |
| `android/res/values/strings.xml` | 17323 | 5458943012aa9b38b45f079f7dc7b70a | 7aac8f50de1916096de64796b047183a |

## 2. 第 2 项：装机（PASS）

```bash
export MSYS2_ARG_CONV_EXCL='*'
A=<HOME>/Documents/deepseek-harness/default-workspace/work/phone-adb/platform-tools/adb.exe
$A -H 127.0.0.1 -P 15037 -s <DEVICE_SERIAL> install -r $(cygpath -w android/bin/dsh-phone.apk)
$A -H 127.0.0.1 -P 15037 -s <DEVICE_SERIAL> shell dumpsys package com.lc.phoneharness | grep -E 'versionName|versionCode|lastUpdateTime'
```

原始输出：

```text
Performing Streamed Install
Success
    versionCode=27 minSdk=21 targetSdk=34
    versionName=0.6.11
    lastUpdateTime=2026-10-22 06:12:53
```

⇒ 设备上跑的就是含修复（无 drawable-night）的 0.6.11/27。

## 3. 第 3 项：2×2 四格 × 5 页截图（PASS）

命令（可复跑；每格由驱动先写 `theme` 到设备 prefs、再 force-stop 冷启动，避免进程内旧主题）：

```bash
node tools/logo-verify.mjs --steps case:A,case:B,case:C,case:D --out shots/logo
```

四格的「系统深浅色 + 应用外观」原始记录（来自账本 `shots/logo/logo-report.json` 的 steps）：

```text
theme-auto-A :: 写入 code=0; 读回=<string name="theme">auto</string>; err=<PROJECT_ROOT>/shots/logo/_pref_push.xm
case-env-case-A-light-auto :: 系统 cmd uimode night no -> Night mode: no / prefs <string name="theme">auto</string>
theme-auto-B :: 写入 code=0; 读回=<string name="theme">auto</string>; err=<PROJECT_ROOT>/shots/logo/_pref_push.xm
case-env-case-B-dark-auto :: 系统 cmd uimode night yes -> Night mode: yes / prefs <string name="theme">auto</string>
theme-day-C :: 写入 code=0; 读回=<string name="theme">day</string>; err=<PROJECT_ROOT>/shots/logo/_pref_push.xml
case-env-case-C-dark-day :: 系统 cmd uimode night yes -> Night mode: yes / prefs <string name="theme">day</string>
theme-dark-D :: 写入 code=0; 读回=<string name="theme">dark</string>; err=<PROJECT_ROOT>/shots/logo/_pref_push.xm
case-env-case-D-light-dark :: 系统 cmd uimode night no -> Night mode: no / prefs <string name="theme">dark</string>
```

20 张截图逐张指纹（`--out shots/logo`，文件名前缀 = 用例前缀；md5 由驱动写入账本，sha256 由 verifier 用本机 sha256sum 独立计算）：

| 用例 | 页面 | 字节 | md5 | sha256(前32) | focus（页面自证） |
| --- | --- | --- | --- | --- | --- |
| **A 系统浅色 + 应用 跟随系统(auto)** | | | | |
| `case-A-light-auto-splash.png` | splash | 58621 | c0ebc8266e50b8ff2bd647e8dcc9c4ec | 9206db02fc4b13fe75f5d10b4d917279 | **SplashActivity** 命中 |
| `case-A-light-auto-home.png` | home | 96293 | 2998a8e61f9b23634fba8cc6987bd5a9 | e3cf721266e37f35e7972a413773f3b7 | **MainActivity** 命中 |
| `case-A-light-auto-chat.png` | chat | 100002 | 74de1af9f19616e75695b9ed9fc475b7 | 4e0a351e20f5c2c0475729045cd19fdf | **ChatActivity** 命中 |
| `case-A-light-auto-pair.png` | pair | 151607 | b6052be79ebd4540c76cdce9ebd6b103 | 54c28723fb043fc6341c538d5b01a098 | **PairActivity** 命中 |
| `case-A-light-auto-settings.png` | settings | 150573 | ebcf3971fa8a3238ce6b1ddb320b77be | 3925c9ac70bba2c644c487d97d4a3e68 | **SettingsActivity** 命中 |
| **B 系统深色 + 应用 跟随系统(auto)** | | | | |
| `case-B-dark-auto-splash.png` | splash | 76588 | e99ebfc48717fcae5ef552b618277c5e | 221dc92335a7eb76fc675eec6ec4179f | **SplashActivity** 命中 |
| `case-B-dark-auto-home.png` | home | 96504 | 5117831bc27f7b29a7fcd0b6573bf704 | f70eed5499732ae3d5c88d515077790c | **MainActivity** 命中 |
| `case-B-dark-auto-chat.png` | chat | 100948 | 317e51452888525b91ac5bf9a6fcedb3 | 6cbe49b01a6436a2c93ae5ed336cf8c2 | **ChatActivity** 命中 |
| `case-B-dark-auto-pair.png` | pair | 154387 | 558b4c105fdd7c931d52b62c09b4005b | dd713a57c032186be699c042df19707d | **PairActivity** 命中 |
| `case-B-dark-auto-settings.png` | settings | 149958 | fcaee53cee9c9a63a0c3cfa78513dcc9 | fdd8ae3c696aba7410de4f80c6974553 | **SettingsActivity** 命中 |
| **C 系统深色 + 应用 显式浅色(day)【回归】** | | | | |
| `case-C-dark-day-splash.png` | splash | 60000 | 5ecf829194c7725ab7de20d06cf07c99 | 9693e8ce990dfba706eb78c17bd89cfc | **SplashActivity** 命中 |
| `case-C-dark-day-home.png` | home | 96089 | 643c5af1c7c5205fc4154f589bd7d7fe | 2e00a8ec23b3826f865c252b6fbe8155 | **MainActivity** 命中 |
| `case-C-dark-day-chat.png` | chat | 99627 | 9f4e3616224a4e49a9b66c933d893add | 5230e4da69c8448d01ab9dbe8a909c30 | **ChatActivity** 命中 |
| `case-C-dark-day-pair.png` | pair | 151953 | 3bab508d43ac312a994e22541654d85b | bdf489a83a1228ae18cf23b100054ba2 | **PairActivity** 命中 |
| `case-C-dark-day-settings.png` | settings | 150016 | 97ee0f82ee037aeaa1c3664df0063b9b | c8cd4666db10aba418ebf31ae04d8c68 | **SettingsActivity** 命中 |
| **D 系统浅色 + 应用 显式深色(dark)** | | | | |
| `case-D-light-dark-splash.png` | splash | 59473 | 6125b7c116666a13e4aee5169a4ee493 | dbc042530a1619ae3a29f1cc0794f97d | **SplashActivity** 命中 |
| `case-D-light-dark-home.png` | home | 96819 | f2fab98abc696540a54b761a19a6c39d | 6a90ee5ca9d1fd0f3114af84ec102bf6 | **MainActivity** 命中 |
| `case-D-light-dark-chat.png` | chat | 102004 | 4c5d81f1b501b1e0a9102ca0b20e3985 | f0c314532497466954b1ceb8942e38a4 | **ChatActivity** 命中 |
| `case-D-light-dark-pair.png` | pair | 154987 | cf07411986788ad003158d84e245dad4 | 8765eaa0040224be708b47cdb5a17425 | **PairActivity** 命中 |
| `case-D-light-dark-settings.png` | settings | 149167 | 1dbed7d48aaa2ad269c133f3eb3195d3 | 820f454ede1e6e846560b6e8203dd12d | **SettingsActivity** 命中 |

驱动自检（`self-check` 步骤原文）：

```text
[ OK ] self-check :: 模式截图 20 张 / 互不相同的 md5 20 / focus 全命中 true
步骤 FAIL = 0 / 66
EXIT=0
```

⇒ **20 张互不相同**（排除「没切过去、拍成同页」这类假证据）+ **每张的 `mCurrentFocus` 都等于该页应有的 Activity**（MainActivity / ChatActivity / PairActivity / SettingsActivity / SplashActivity）。启动页用「连拍取帧、只认 focus=SplashActivity 的那一帧」拿到（SplashActivity 只停约 620ms）：`case-A/B/C` 第 0 帧即命中，`case-D` 第 1 帧命中（账本 `splash` 段记录 attempts/frames/activities）。

## 4. 第 4 项：像素断言（PASS）

判据（`tools/logo-pixels.py`，固定 logo 盒，全分辨率 1080×2460 坐标：splash [552,1162,824,1318]、home [492,942,588,1008]、chat [492,764,588,830]、pair [476,254,602,338]、settings [86,390,200,466]）：

- 浅色格：页面底色亮度 ≥ 200，且 logo 盒内最暗 < 80（黑鲸），且暗墨像素占比 > 0.5%；
- 深色格：页面底色亮度 ≤ 30，且盒内有亮墨（白鲸，亮像素 > 20，占比 > 0.5%），且与底色对比度 > 60；
- 互斥闸门：同一页面的浅色格与深色格统计必须不同（否则「两格其实同状态」）。

命令与聚合结果：

```bash
PYTHONIOENCODING=utf-8 python tools/logo-pixels.py \
  --case case-A-light-auto:light:splash,home,chat,pair,settings \
  --case case-B-dark-auto:dark:splash,home,chat,pair,settings \
  --case case-C-dark-day:light:splash,home,chat,pair,settings \
  --case case-D-light-dark:dark:splash,home,chat,pair,settings \
  --ab-diff home:case-A-light-auto-home.png:case-B-dark-auto-home.png \
  --ab-diff chat:case-A-light-auto-chat.png:case-B-dark-auto-chat.png \
  --crops --out shots/logo/logo-pixels.json
TALLY 条目 22 / FAIL 0
```

关键行（完整表见 `shots/logo/logo-pixels.json`）：

```text
[PASS] case-A-light-auto-splash.png | splash | (254, 254, 254) | 最暗 19.7 | 暗墨 12938 | 浅底黑鲸
[PASS] case-A-light-auto-home.png   | home   | (254, 254, 254) | 最暗 19.7 | 暗墨 2505  | 浅底黑鲸
[PASS] case-B-dark-auto-splash.png  | splash | (14, 14, 14)   | 最亮 255 | 亮像素 13029 | 对比度 241.0 | 深底白鲸
[PASS] case-B-dark-auto-home.png    | home   | (14, 14, 14)   | 亮像素 2357 | 对比度 240.0 | 深底白鲸
[PASS] case-C-dark-day-home.png     | home   | (254, 254, 254) | 最暗 19.7 | 暗墨 2505  | 浅底黑鲸（回归）
[PASS] case-D-light-dark-splash.png | splash | (14, 14, 14)   | 亮像素 9435 | 对比度 241.0 | 深底白鲸（反向用例）
[PASS] A/B home :: A/B 统计不同（底色 254.0 vs 14.0，暗墨 2505 vs 3797）
[PASS] A/B chat :: A/B 统计不同（底色 254.0 vs 14.0，暗墨 2505 vs 3797）
```

⇒ logo **在每页该出现的位置都真实存在**（像素级），不是只看整页均值：pair/settings 页的 logo 墨量小（浅色 65 / 3476 暗墨像素），仍被固定盒捕获判定。

## 5. 第 5 项：切深浅色无残留、无闪烁（PASS）

操作：停在首页 → `cmd uimode night yes`（系统切深色会让 Activity recreate）→ 连拍 4 帧 → 再取 1 帧稳定帧；同时抓 UiModeManager 日志。

```bash
node tools/logo-verify.mjs --steps theme:auto,flicker --out shots/logo
PYTHONIOENCODING=utf-8 python tools/logo-pixels.py --residue home:switch-1-before-light.png,switch-2-during-switch.png,switch-3-during-switch.png,switch-4-during-switch.png,switch-5-during-switch.png,switch-6-after-switch.png --out shots/logo/_residue.json
```

```text
[cap] switch-1-before-light.png 96212B md5 cbe2b9513a38997b8f018d76df36edff focus=MainActivity
[cap] switch-2-during-switch.png 96212B md5 cbe2b9513a38997b8f018d76df36edff focus=MainActivity
[cap] switch-3-during-switch.png 96389B md5 38b9c4215a09de62698edd193b8ce497 focus=MainActivity
[cap] switch-4/5/6 ... 均 md5 38b9c4215a09de62698edd193b8ce497 focus=MainActivity
logcat 10-22 06:26:03.783 1711 D UiModeManager: updateConfigurationLocked: mDockState=0; mCarMode=false; mNightMode=2; uiMode=33
logcat 10-22 06:26:03.783 1711 D UiModeManager: applyConfigurationExternallyLocked: mSetUiMode=33; mConfiguration.uiMode=33
[PASS] 残影 switch-1-before-light.png :: 无错帧（bg_lum=254.0 亮像素=3652 min=19.7）
[PASS] 残影 switch-2-during-switch.png :: 无错帧（bg_lum=254.0 亮像素=3652 min=19.7）
[PASS] 残影 switch-3/4/5/6-during/after :: 无错帧（bg_lum=14.0 亮像素=2357 min=15.0）
TALLY 条目 6 / FAIL 0
```

- 错帧定义 = **深底（bg_lum ≤ 30）且亮像素 < 20**，即「切到深色底却还压着黑鲸」的中间帧；六帧全部不满足 ⇒ 无残留、无闪烁（浅底帧→深底帧两段内完成，且深底段内 4 帧指纹完全一致）。
- 判据修正记录：最初把错帧写成「深底且盒内最暗 < 80」，但深色页面本身 `min=15` ⇒ 恒 FAIL，属脚本缺陷，已改为上述口径。

## 6. 第 6 项：反向测试 —— 程序化选资源优先于 drawable-night（PASS）

| 用例 | 系统 | 应用外观 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **C（回归核心）** | `cmd uimode night yes` | `theme=day`（显式浅色） | 浅底 + 黑鲸 | 五页全部 `底色 (254,254,254)`、`最暗 19.7`、暗墨 1200~16089 | **PASS** |
| **D（反向）** | `cmd uimode night no` | `theme=dark`（显式深色） | 深底 + 白鲸 | 五页全部 `底色 (14,14,14)/(19,19,19)`、亮像素 58~9435 | **PASS** |

⇒ 系统深浅色与 `drawable-night` 限定符都不再能覆盖程序化选择：**C 证明「系统深色 + 应用浅色」时仍是黑鲸**（修复前这里会拿 `drawable-night` 的白鲸压白底），**D 证明「系统浅色 + 应用深色」时能拿到白鲸**。

### 6.1 缺陷链条（发现 → 成因 → 修复 → 回归）

1. **发现**（verifier 拍摄 + Lead 复核）：修复前的 0.6.6/22 在「系统深色 + 应用 `theme=day`」下，`mode-dark-home.png` 的 hero 区 `min=246 / 墨色像素 0`、`mode-dark-splash.png` logo 区 `min=242 / 墨色像素 0`；而 `mode-dark-settings.png` 与 `mode-light-settings.png` 统计**完全相同**（8360 墨色像素、同 bbox）⇒ 白鲸压白底，logo 不可见。
2. **成因**（代码事实，只读核对）：`Prefs.darkMode()`（`android/src/com/lc/phoneharness/Prefs.java:108-114`）与 `Theme.of()`（`Theme.java:113-115`）按 pref/系统决定 `dark`；`Theme.brandLogo()`（`Theme.java:130-132`）= `dark ? R.drawable.ic_brand_logo_dark : R.drawable.ic_brand_logo`。但资源限定符 `night` 由**系统 uiMode**决定：系统深色时 `R.drawable.ic_brand_logo` 被解析到 `drawable-night/ic_brand_logo.png`（其内容与 `drawable-xxxhdpi/ic_brand_logo_dark.png` 同哈希 = 白鲸副本）⇒ 程序化选择被限定符覆盖。
3. **修复**（Lead 写域 `android/res` + `brand/` + `docs/`）：删除 `android/res/drawable-night/ic_brand_logo.png` 与 `ic_splash_logo.png`（目录整体移除），`brand/make-whale-assets.py` 不再生成该目录（重跑幂等：`drawable-xxxhdpi/ic_brand_logo.png` md5 `ff4f7b08865f5e2f9d71dfa27c48fd7f`、`ic_brand_logo_dark.png` md5 `645e803c76cff1c3462eb5171dc41569` 未变），文档/CHANGELOG 同步（`## APK 0.6.11`）。
4. **回归验证**：重建 0.6.11/27 → 装机 → 2×2 四格 20 张 + 像素断言 22 项全绿，其中 **C 用例（系统深色 + 应用浅色 = 修复前必然失败的组合）现在拿到浅底黑鲸**。

修复前证据归档（保留在 `shots/logo/`，0.6.6/22 构建，**不作为本轮结论**，只作对照）：

| 文件 | 字节 | md5 | 修复前观感 |
| --- | --- | --- | --- |
| `mode-light-splash.png` | 72342 | a1842f1c27732f08ded33ce97198a868 | 白底黑鲸（正常） |
| `mode-light-home.png` | 95793 | 79a98f91a4dcaeeb1bf6d30df9352bd9 | 白底黑鲸（正常） |
| `mode-light-chat.png` | 98916 | f11b1bfc5ae72e7ccab2949b71a7b904 | 白底黑鲸（正常） |
| `mode-light-pair.png` | 145565 | 0f585c96638c5b720197ee2cc82d9fc6 | 白底黑鲸（正常） |
| `mode-light-settings.png` | 148616 | 8ef0a84f289cb08fc52af1c30efc5b51 | 白底黑鲸（正常） |
| `mode-dark-splash.png` | 45463 | 713748138d4245c9a27cb3c0912ecb2a | **白鲸压白底（缺陷）** |
| `mode-dark-home.png` | 92488 | 7bfb2df8491690cb416b5745053f5d69 | **白鲸压白底（缺陷）** |
| `mode-dark-chat.png` | 95696 | 5fb42a569a968c5349129ba7ad4d7e5c | **白鲸压白底（缺陷）** |
| `mode-dark-pair.png` | 141802 | cc71ef0f1c60f05bc1cc20efcc75b552 | **白鲸压白底（缺陷）** |
| `mode-dark-settings.png` | 145187 | 594ce1e71f4c21000391a21c54dee7c2 | **白鲸压白底（缺陷）** |

另有 21 个第一次拍摄的无效件（用例 B/D 的 `theme` 未真正写入导致格间重复）已归档到 `shots/logo/invalid/`，作为「先判环境未就绪、不硬写报告」的方法学记录。

## 7. 方法学记录与踩坑

- 工具：`tools/logo-verify.mjs`（设备驱动：装机/切系统深浅色/写应用外观 prefs/冷启动/UI 导航/连拍取启动页/逐张 md5 与 focus 断言/自检 + 账本 `shots/logo/logo-report.json`）；`tools/logo-pixels.py`（固定 logo 盒像素断言 + `--ab-diff` 互斥闸门 + `--residue` 错帧检查 + `--crops` 出裁剪图）。
- 页面寻址：应用只有一个导出入口 `com.lc.phoneharness/.SplashActivity`；其余页面必须真实 UI 点击 —— 首页汉堡 ≡(80,190) → 抽屉 `PhoneHarness`(461,2327) → 设置页；设置页 `账号管理`(558,739) → **PairActivity**；抽屉会话行 `截图会话`(443,597) → **ChatActivity**。
- 踩坑 1：`run-as PKG am start` 被 AMS 拒（`SecurityException: package=com.android.shell does not belong to uid=10401`）⇒ 不能借 run-as 起内部 Activity。
- 踩坑 2：`run-as PKG sh -c 'cat > …'` 的重定向由外层 shell uid 执行（MSYS 还会吃掉引号）⇒ `Permission denied`；正确写法是本地写文件 → `adb push` 到 `/data/local/tmp/` → `run-as PKG cp` 到 `shared_prefs/`，且路径必须绝对。
- 踩坑 3：改完应用外观必须 `am force-stop` 再冷启动，否则进程内主题还是旧的（会拍出「环境未就绪」的假结论）。
- 踩坑 4：启动页只显示约 620ms，定时截图会拍到首页 ⇒ 用「连拍 + 只认 focus=SplashActivity 的帧」。
- 踩坑 5：像素定位不能用连通块自动搜索（会漂到文字上造成假 FAIL）⇒ 用固定 logo 盒。
- 踩坑 6：md5 会随状态栏时钟变化，**跨构建/跨时刻不要拿 md5 当等值判据**；本报告用 md5+sha256 只作「同一批文件」的指纹。

## 8. 局限与未验证项

- 每格只抓 5 个页面各 1 张；页面内的**局部动画中间帧**（例如面板开合）不在覆盖范围，残留检查只做了「首页停住时切系统深色」这一条路径。
- 本报告不覆盖图标着色链的其余入口（通知栏/桌面启动器 shortcut 等），只看 APK 内的应用内品牌位与启动页。
- 设备 `ro.build.version.release` 实测为 **12（sdk 31）**（此前口头口径的 Android 15 是编译 SDK 35，不是设备系统版本）—— 已按实测更正。
- 并发写入者：本轮期间仓库存在另一条改动线（CHANGELOG/版本号/设置页），本报告只覆盖 `harness`/`logo` 相关文件，撞号不计入本队缺陷。

## 9. 复跑清单（一条命令一条结论）

```bash
# 1 构建 + 旁车指纹
cd android && VERSION_NAME=0.6.11 VERSION_CODE=27 bash build.sh && cat bin/dsh-phone.apk.json
# 2 装机
export MSYS2_ARG_CONV_EXCL='*'; A=.../platform-tools/adb.exe; $A -H 127.0.0.1 -P 15037 -s <DEVICE_SERIAL> install -r $(cygpath -w android/bin/dsh-phone.apk)
# 3 四格截图（含启动页连拍与自检）
node tools/logo-verify.mjs --steps case:A,case:B,case:C,case:D --out shots/logo
# 4 像素断言 + 互斥闸门
PYTHONIOENCODING=utf-8 python tools/logo-pixels.py --case case-A-light-auto:light:splash,home,chat,pair,settings [其余三格] --ab-diff home:... --crops --out shots/logo/logo-pixels.json
# 5 切模式残留检查
node tools/logo-verify.mjs --steps theme:auto,flicker --out shots/logo && PYTHONIOENCODING=utf-8 python tools/logo-pixels.py --residue home:switch-1-...,switch-6-... --out shots/logo/_residue.json
# 6 复位到 A 基线（系统浅色 + 应用跟随系统）
bash tools/lead-theme-set.sh auto no
```

验收范围口径：以上全部在**真机 ZTE A2322（Android 12 / sdk 31）+ 真 APK 0.6.11/27 + 真实系统深浅色切换**上完成；`adb` 走本机 15037 隧道，截图由 verifier 驱动直接产出（无第三方转手），像素与哈希由 verifier 本机独立计算。
