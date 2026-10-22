# 新 logo（黑鲸）替换与深浅色适配 · 规格与验证

> 适用：android 应用 com.lc.phoneharness（仓库 phone-harness）
> 源图：用户提供的「黑鲸鱼」原图（1536×1536，白底黑鲸剪影），转存为 brand/whale-source.png
> 生成脚本：brand/make-whale-assets.py（幂等，重跑即整批重生成）
> 结论：应用内所有 logo 由同一份单色剪影派生两套着色 —— 浅色模式黑鲸、深色模式白鲸；由 Theme.dark 在界面 build() 时一次选定，随系统深浅色自动切换，无延迟 / 无残留 / 无闪烁。桌面启动图标无法随系统深浅色切换（Android 平台限制），已提供 monochrome 主题图标层作为系统级适配途径。

## 一、替换范围（全部位置）

| # | 位置 | 代码 / 配置位置 | 资源 | 深浅色行为 |
| --- | --- | --- | --- | --- |
| 1 | 桌面启动图标（传统） | android/AndroidManifest.xml:26-27 的 android:icon / android:roundIcon | mipmap-*/ic_launcher.png（白底圆角瓦片 + 黑鲸） | 不随系统切换，见 §3.6 |
| 2 | 桌面启动图标（自适应） | android/res/mipmap-anydpi-v26/ic_launcher.xml | 背景 @color/ic_launcher_background（#FFFFFF）+ 前景 mipmap-*/ic_launcher_foreground.png | 同上 |
| 3 | 桌面主题图标层（Android 13+） | 同上 XML 的 <monochrome> 节点 | mipmap-*/ic_launcher_monochrome.png（单色剪影） | 用户开启「主题图标」后由启动器取色 |
| 4 | 启动页 | android/src/com/lc/phoneharness/SplashActivity.java:35 | drawable-*/ic_splash_logo.png / ic_splash_logo_dark.png（96dp） | 黑鲸 / 白鲸 |
| 5 | 首页 hero（正中鲸形） | MainActivity.java:364 | drawable-*/ic_brand_logo.png / ic_brand_logo_dark.png（64dp） | 黑鲸 / 白鲸 |
| 6 | 空会话页 | ChatActivity.java:2989 | 同上 | 黑鲸 / 白鲸 |
| 7 | 配对页标记 | PairActivity.java:48 | 同上 | 黑鲸 / 白鲸 |
| 8 | 设置页品牌位（关于区） | SettingsActivity.java:215 | 同上 | 黑鲸 / 白鲸 |
| 9 | 系统启动画面（Android 12+） | AppTheme 的 android:windowBackground（values-night 已给 #0F0F0F） | 系统用应用图标（见 #1） | 底色随系统，图标见 §3.6 |

未改动、也不含 logo 的位置：drawable/ic_wordmark.xml（仓库内无任何代码引用，只出现在生成的 R.java 里）、通知栏、分享面板。应用内没有任何 XML 布局直接引用 logo，全部是 Java 里 setImageResource，因此替换点就是上表 4~8 五处。

## 二、素材规格

### 2.1 源图要求
- 正方形、单色深墨（近黑）、纯白或近白背景，主体四周留白 ≥ 4%（防裁切）
- 本次源图：1536×1536、内容 bbox 1109×747（宽扁姿态）；暗部中位数 RGB(19,20,20) → 浅色版填充色 #131414
- 源图中的白色细节（眼睛圈、腹部三条须纹）在抠图后成为**镂空**（alpha=0），因此在浅底上显示为白色线条、在深底上显示为深色线条，两套都自然

### 2.2 需要准备哪几套
| 套别 | 用途 | 填充色 | 背景 | 文件 |
| --- | --- | --- | --- | --- |
| 浅色版（黑鲸） | 浅色模式下的应用内 logo | #131414 | 全透明 | drawable-*/ic_brand_logo.png、ic_splash_logo.png |
| 深色版（白鲸） | 深色模式下的应用内 logo | #F8F8F8（= values-night 的 android:textColor） | 全透明 | drawable-*/ic_brand_logo_dark.png、ic_splash_logo_dark.png |
| 桌面图标（浅色中性） | 启动器图标，任何壁纸都可读 | #131414 鲸 + #FFFFFF 瓦片 | 瓦片不透明、自适应前景透明 | mipmap-*/ic_launcher.png、ic_launcher_foreground.png |
| 主题图标层（单色） | Android 13+ 主题图标，由系统取色 | 单色剪影（颜色被系统覆盖） | 全透明 | mipmap-*/ic_launcher_monochrome.png |

彩色版：本次不需要。源图本身是「黑墨 + 白底」双色，做成单色剪影即最忠实；若将来要彩色 logo，把 brand/whale-source.png 换成彩色源图后重跑脚本即可（脚本只做「按亮度取 alpha + 单色上色」两步，颜色在脚本顶部 LIGHT/DARK 两个常量里改）。

### 2.3 格式与尺寸规格
- 格式：PNG-32（带 alpha 通道）；不透明区域 alpha=255，仅轮廓一圈是抗锯齿过渡（实测中间值像素仅 1412 个 / 1176² 画布）
- Android 打包：build.sh 第 [1/7] 步 ` aapt2 compile --no-crunch ` 不做 PNG 压缩转码，进包字节与磁盘一致
- 密度倍数与像素尺寸（基准：应用内 64dp、启动页 96dp、传统图标 48dp、自适应画布 108dp）：

| 密度 | 倍数 | 应用内 logo | 启动页 logo | 传统图标 | 自适应前景 / 主题图标层 |
| --- | --- | --- | --- | --- | --- |
| mdpi | 1.0× | 64 | 96 | 48 | 108 |
| hdpi | 1.5× | 96 | 144 | 72 | 162 |
| xhdpi | 2.0× | 128 | 192 | 96 | 216 |
| xxhdpi | 3.0× | 192 | 288 | 144 | 324 |
| xxxhdpi | 4.0× | 256 | 384 | 192 | 432 |

- 版面规则（脚本内固定，改尺寸只需改常量）：应用内/启动页主图裁到内容后放进正方形画布并留 6% 边距（任何尺寸都不切边）；传统图标用 23.4% 圆角白瓦片、鲸身宽占 74.5%；自适应前景与主题层按「bbox 对角线 = 108dp 画布的 60.5%」缩放居中，保证落在自适应图标 66dp 安全圆内不出血。
- 为什么用位图不用矢量：源图是位图剪影，轮廓含须纹/尾鳍/喷水等细节，矢量描摹会失真；按 4× 出图（应用内 256px、启动页 384px）覆盖任何机型的实际显示尺寸（首页 34dp、启动页 96dp）都足够锐利。若要矢量化，把同一剪影描成 path 后用 android:tint 着色即可，替换点只有 Theme.brandLogo() 的返回值。

## 三、深浅色适配机制（为什么无延迟 / 无残留 / 无闪烁）

1. **唯一真相是 Theme.dark**（Theme.java）：Prefs.darkMode() 决定 —— 外观选「跟随系统」时读 Configuration.uiMode（UI_MODE_NIGHT_YES），选「浅色 / 深色」时按用户选择。
2. **首帧即正确**：每个界面在 build() 里用 t.brandLogo() / t.splashLogo() 一次取到资源 id 再 setImageResource，不存在「先画旧图再替换」的中间帧 —— 这是「无延迟、无闪烁」的实现口径。
3. **主题变化即重建**：应用没有声明 android:configChanges，系统深浅色变化时 Activity 会被系统重建；应用内改外观走 prefs.setTheme + recreate()（SettingsActivity 约 :820-822）；MainActivity（onResume，约 :196-201）与 ChatActivity（约 :169-172）另有 darkAtBuild 比对兜底重建。重建后 build() 重取资源 → 无残留。
4. **不用 drawable-night（实测后撤除）**：最初放过一份 `drawable-night/` 深色版当「资源级兜底」，真机验证证明它**有害** —— 资源限定符按**系统**配置解析，与应用内「外观」选择无关：**系统深色 + 应用显式浅色**时，`brandLogo()` 选中的浅色资源被 night 限定符改写成白鲸，叠在浅色页面上就是「白鲸压白底」的不可见 logo。所以 logo 的选择**只由 `Theme.dark` 决定**，`drawable-night/` 已删除（复现与回归见 §六）。
5. **不做运行时缓存**：不缓存 Bitmap、不自己按 dark 拼图，避免「切了主题还拿旧 bitmap」这类残留来源。
6. **桌面图标的例外（如实说明）**：Android 的启动器图标由启动器进程按自己的配置解析并缓存，平台没有「图标随系统深浅色切换」的机制。可用的系统级途径只有 Android 13+ 的 <monochrome> 主题图标层（用户在启动器里开启「主题图标」后由系统取色，本次已提供）。传统图标保持「白底圆角 + 黑鲸」，在深色壁纸上也可读。

## 四、改动文件清单

| 类别 | 文件 | 说明 |
| --- | --- | --- |
| 素材脚本 | brand/make-whale-assets.py（新） | 一条命令整批重生成，见 §六 |
| 素材中间件 | brand/whale-source.png（新，附件转存）、brand/whale-light-master.png、brand/whale-dark-master.png（新，方形主图） | 主图用于任何后续尺寸派生 |
| 应用内 logo | android/res/drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_brand_logo.png（替换）、ic_brand_logo_dark.png（新） | 64dp 基准 |
| 启动页 logo | android/res/drawable-*/ic_splash_logo.png（替换）、ic_splash_logo_dark.png（新） | 96dp 基准 |
| 夜间兜底 | android/res/drawable-night/ —— **不提供**（曾提供，实测有害已删除） | night 限定符按系统解析，会覆盖应用内显式外观选择，见 §3.4 |
| 桌面图标 | android/res/mipmap-*/ic_launcher.png（替换）、ic_launcher_foreground.png（替换）、ic_launcher_monochrome.png（新） | 传统 + 自适应 + 主题层 |
| 图标配置 | android/res/mipmap-anydpi-v26/ic_launcher.xml | 新增 <monochrome> 层 |
| 代码 | android/src/com/lc/phoneharness/Theme.java | 新增 brandLogo() / splashLogo() |
| 代码 | MainActivity.java:364、ChatActivity.java:2989、PairActivity.java:48、SettingsActivity.java:215、SplashActivity.java:35 | 五处调用点改按主题取资源 |

## 五、如何验证主题切换后 logo 是否正确生效

1. 构建：` cd android && VERSION_NAME=<版本> VERSION_CODE=<号> bash build.sh `
2. 进包审计：` unzip -l android/bin/dsh-phone.apk | grep -E 'drawable-night|ic_brand_logo_dark|ic_splash_logo_dark|ic_launcher_monochrome' `，再用 ` aapt2 dump resources android/bin/dsh-phone.apk | grep -E 'ic_brand_logo|ic_launcher_monochrome' ` 确认进资源表
3. **真机 2×2 矩阵**（只测「系统深浅色」是不够的 —— 应用自己还有一份「外观」选择，两者会打架）：

   | 用例 | 系统 uiMode | 应用内「外观」 | 期望 |
   | --- | --- | --- | --- |
   | A | 浅色 | 跟随系统 | 浅色页面 + **黑鲸** |
   | B | 深色 | 跟随系统 | 深色页面 + **白鲸** |
   | C | 深色 | **显式浅色** | 浅色页面 + **黑鲸**（回归用例：曾因 drawable-night 变成白鲸压白底） |
   | D | 浅色 | **显式深色** | 深色页面 + **白鲸** |

   每轮都要 ` adb shell cmd uimode night no|yes ` + 改应用外观 + ` am force-stop com.lc.phoneharness ` 后冷启动，逐界面截图（启动页 / 首页 / 空会话页 / 配对页 / 设置页品牌位）。

   **一条命令切一格**（已实测，含两个坑的绕法）：`bash tools/lead-theme-set.sh <auto|day|dark> <yes|no> ` —— 设系统深浅色 → force-stop → 以 app uid 写回 prefs 的 ` theme ` → 冷启动 → 打印 ` mCurrentFocus `；它会打印写回后的 ` <string name="theme">…</string> ` 行，这就是「应用外观」的原始证据。两个坑：① ` adb shell run-as … sh -c 'cat > prefs' ` 会 Permission denied（重定向被外层 shell uid 执行）⇒ 写操作必须放进设备端脚本 ` tools/device-put-prefs.sh `；② 本地临时文件要用 ` pwd -W ` 的 Windows 路径，adb.exe 认不得 ` /tmp ` 与 ` /c/… `。
4. 像素断言：在**整幅截图**上取该页 logo 区域（不要只看页面背景）—— 黑鲸要求该区域存在**墨色像素**（最暗 < 80 且占比 > 0.5%），白鲸要求该区域**不存在墨色像素**且主体明显亮于底色（差值 > 60）。只断言「底色深浅」会漏掉「白鲸压白底」这类隐形缺陷。
5. 交叉判据：把 logo 区域的实测颜色与页面背景色一起记下来（例：背景 (255,255,255) + logo 最暗 248 → FAIL）。
6. 无残留：停在首页时切 ` cmd uimode night yes `，切后立刻截图，断言不存在「深色底 + 黑鲸」的错帧
7. 幂等复跑：` python brand/make-whale-assets.py ` 后重跑 2~6，产物字节应稳定

证据与产物：docs/logo-verification.md（逐条命令 + 原始输出 + 截图 + 结论）、shots/logo/（真机截图与对照图）、shots/logo/asset-spec.png（素材规格总览图）。

## 六、实测缺陷与回归（drawable-night 事件）

**症状**：真机 0.6.8/24（含 drawable-night）上，**系统深色 + 应用内「外观」= 浅色**时，首页/空会话页/启动页的 logo 变成**白鲸压白底**，肉眼几乎不可见（首页 hero 区域实测：背景 (255,255,255)、logo 区域最暗像素 248、墨色像素 0 个）。

**成因**：`Theme.brandLogo()` 按应用自己的 `Theme.dark`（= 应用内「外观」）选了浅色资源 `ic_brand_logo`，但资源限定符 `night` 是按**系统** uiMode 解析的 —— 系统处于深色时 `ic_brand_logo` 被改写指向 `drawable-night/` 里的白鲸。**程序化选择被资源限定符覆盖**。

**修复**：删除 `android/res/drawable-night/`（并让 `brand/make-whale-assets.py` 不再生成它）。logo 的选择只由 `Theme.dark` 决定；应用内没有任何 XML 布局引用 logo，所以撤掉资源级兜底没有副作用。

**回归**：上表用例 C（系统深色 + 应用显式浅色）必须回到「浅色页面 + 黑鲸」。

## 七、重生成与改版

```bash
python brand/make-whale-assets.py     # 读 brand/whale-source.png，覆盖写 android/res 下全部 logo 素材
```

要换图：把新图另存为 brand/whale-source.png（正方形、白底深墨）后重跑；要改色：改脚本顶部 LIGHT / DARK 两个常量；要改尺寸/版式：改 BRAND_DP / SPLASH_DP / LAUNCHER_DP / ADAPTIVE_DP 与 fit_circle(..., 0.60) 里的安全区比例。