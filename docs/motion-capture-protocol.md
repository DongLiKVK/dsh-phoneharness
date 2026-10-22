# 动效/视觉取证协议（Lead 拥有，re-motion 与 verify-harness 必须共同遵守）

目的：让「参考 APK」与「本项目 APK」在同一台模拟器、同一套交互脚本、同一套采集参数下产出**可逐帧对比**的证据。
任何时长数字必须写成：`scale=S 下测得 Y ms，折算真值 Z ms`。

## 0. 参考样本的确定性身份（已核实，不要再查）

- `com.deepseek.chat` versionName **2.6.1** / versionCode **279**，md5 `0c7efce025b1400c27a8c28dae17ff44`
- 解包产物 `official/apktool-out`、`official/jadx-out` 与该样本同版本，可直接引用。

### 参考样本的精确库版本（从 APK 的 META-INF/androidx.*.version 读出，权威）

| 库 | 版本 |
|---|---|
| androidx.compose.animation_animation | **1.11.4** |
| androidx.compose.animation_animation-core | **1.11.4** |
| androidx.compose.foundation_foundation | **1.11.4** |
| androidx.compose.material3_material3 | **1.4.0** |
| androidx.compose.material_material | **1.11.4** |
| androidx.compose.material_material-ripple | **1.11.4** |
| androidx.compose.material_material-icons-core / -extended | 1.7.8 |
| androidx.compose.ui_ui | **1.11.4** |
| androidx.compose.runtime_runtime | 1.11.4 |
| androidx.navigation_navigation-compose | 2.8.5 |
| androidx.activity_activity-compose | 1.13.0 |
| androidx.lifecycle_* | 2.10.0 |
| androidx.dynamicanimation_dynamicanimation | 1.0.0 |
| androidx.interpolator_interpolator | 1.0.0 |

**推论（重要）**：参考 APK 的动效由 **Compose 1.11.4 + Material3 1.4.0** 驱动。
所以「库默认动效」不是猜测，而是这两个版本的公开常量——必须按**这两个确切版本**取证并注明来源 URL。
本项目的自研动效要与它对齐时，等价物是「同一时长 + 同一 cubic-bezier 控制点」的 View 动画/插值器。

### 已判定不可行的路径（不要再试）

1. **Frida**：设备上无 frida-server，磁盘无二进制，python 无 frida 包。REA 的 `start_frida_session` 返回
   `{"code":"capability_unavailable","reason":"Unable to connect to remote frida-server: closed"}`。已放弃。
2. **jadx 全量反编译**：`official/jadx-out` 缺 `androidx.compose.material3` 与 `androidx.compose.animation.core`（ERROR 328），
   拿不到 TweenSpec/SpringSpec/MotionTokens 源码。
3. **按名字 grep 动效常量**：R8 已内联，`grep 'dampingRatio|visibilityThreshold'` 命中 0；
   `grep 'tween('` 全是英文单词 "between" 的假阳性——必须用词边界。
4. 需要静态查 dex 类/方法时用 `phone-harness/sdk/build-tools/android-16/dexdump.exe`，或 apktool 出 smali。

## 1. 设备与工具（已核实）

- 设备：`<DEVICE>`，**x86_64 / Android 15 (SDK 35)**，`adb root` 已是 uid=0，`/data/local/tmp` 可写。
- adb：`<PLATFORM_TOOLS>/adb.exe`
- **ffmpeg 9.0.2 + ffprobe 可用**：`<HOME>/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build-shared/bin/`
- **Python 3.14 + Pillow 12.3.0 + numpy 2.5.4 可用**（抽帧分析直接用）。
- jadx 1.5.6：`/c/tools/jadx/bin/jadx`；apktool 3.0.3：`/c/tools/apktool/apktool`

## 2. 动画缩放陷阱（每次采集必须先记录）

模拟器当前**不是**默认值：`window_animation_scale=5`、`transition_animation_scale=0.5`、`animator_duration_scale=5`。
Compose 通过 `MotionDurationScale` 读 `animator_duration_scale`，所以参考应用当前动效被放大 5 倍。

采集前固定做：

```bash
ADB="<PLATFORM_TOOLS>/adb.exe"
# 记录当前值（必须写进证据 JSON）
for k in window_animation_scale transition_animation_scale animator_duration_scale; do
  echo "$k = $($ADB shell settings get global $k)"
done

# 测「时长真值」→ 三个都设 1
$ADB shell settings put global window_animation_scale 1
$ADB shell settings put global transition_animation_scale 1
$ADB shell settings put global animator_duration_scale 1

# 测「曲线形状」→ 慢放提高分辨率（animator_duration_scale 5 或 10），事后除以该倍数
$ADB shell settings put global animator_duration_scale 5

# 采集结束复位
for k in window_animation_scale transition_animation_scale animator_duration_scale; do
  $ADB shell settings put global $k 1
done
```

## 3. 采集原语

```bash
# 录像（60fps；--bugreport 叠加时间戳，便于校验 PTS 漂移）
$ADB shell screenrecord --time-limit 8 --bit-rate 20000000 /sdcard/cap.mp4
$ADB pull /sdcard/cap.mp4 shots/<side>/cap.mp4
$ADB shell rm /sdcard/cap.mp4

# 抽帧（保留全部帧，不做 vsync 抽稀）
ffmpeg -i cap.mp4 -vsync 0 shots/<side>/frames/%05d.png
ffprobe -v error -select_streams v:0 -show_entries frame=pkt_pts_time,pict_type -of csv cap.mp4 > frames.csv

# 逐帧时序（权威时长边界，纳秒）
$ADB shell dumpsys gfxinfo com.deepseek.chat framestats > gfxinfo.txt
```

**时序交叉校验规则**：screenrecord 的 PTS 与 `gfxinfo framestats` 推出的时长若相差 >1 帧（≈16.7ms），
以 `gfxinfo` 为准并在报告里注明分歧。

## 4. 标准交互脚本（两侧必须逐条一致执行）

每条都从**同一初始页面、同一坐标、同一手势参数**开始。
坐标基准：`wm size` 实测 physical 1080x1920 / **override 1080x2460**，density 480（= 360dp x 820dp）。**按 1080x2460 算**。

| # | 名称 | 操作 | 观察对象 |
|---|---|---|---|
| A1 | 冷启动首帧 | `am force-stop` 后 `am start -W` | 启动页/首屏进场动效、logo 动画 |
| A2 | 列表项按下反馈 | `input swipe x y x y 1200`（原地长按 1.2s 再抬手） | 涟漪/按压缩放、颜色变化、时长 |
| A3 | 页面 push 转场 | 点列表第一项 | 新旧页位移/缩放/透明度、缓动、顺序 |
| A4 | 页面 pop 转场 | 详情页按返回 | 同上 |
| A5 | 弹层/底部弹窗进入 | 打开任一模态面板 | 遮罩淡入、面板位移、圆角、缓动 |
| A6 | 弹层退出 | 关闭该面板 | 同上（退出是否对称） |
| A7 | 主按钮按压反馈 | 长按主 CTA | 缩放幅度、阴影、时长 |
| A8 | 加载/骨架屏 | 触发一次加载 | 骨架出现的淡入、shimmer 周期 |
| A9 | 输入框聚焦 + 发送态切换 | 点输入框输入文字 | 光标、按钮状态切换动效 |
| A10 | 列表惯性滚动 + 过滚 | `input swipe` 快速上滑 | overscroll 表现（拉伸/辉光/无） |
| A11 | 开关/勾选切换 | 点任一 Switch | 滑块位移、轨道色、时长 |
| A12 | Chip 选中/取消 | 点任一 chip | 描边/底色/缩放变化 |

**A3/A4/A5/A6 是验收重点**（转场与弹层是最容易被看出来的差异）。

## 5. 产物约定

- 参考侧证据：`shots/re/`（re-motion 拥有）
- 本项目侧证据：`shots/verify/`（verify-harness 拥有）
- 并排对照图：`shots/verify/pairs/<id>.png`（左参考右本项目，同一帧号）
- 机器可读结果：`shots/verify/motion-compare.json`

## 6. 硬性纪律

1. 不得为了让数字好看而改采集参数；参数变了要在证据里写清楚。
2. 采集完必须把三个 scale 复位为 1。
3. 参考 APK 只做「读」——不改它的任何设置项与数据。
4. 每条结论都要能指到具体帧文件或 `gfxinfo` 行号。


## 7. 采集坑（Lead 实测，全部踩过，别重复）

### 7.1 截图二进制会损坏 —— 两个独立原因

1. **多显示器警告写进 stdout**：`adb exec-out screencap -p` 在本机输出前会插入
   `[Warning] Multiple displays were found, but no display id was specified! ...`，
   直接污染 PNG 头（实测首字节是 `5b 57 61 72` = "[War"，不是 `89 50 4e 47`）。
   → 必须显式给 display id：`screencap -p -d 4619827820427265280`（本机主屏的 HWC display id，
   用 `adb shell dumpsys SurfaceFlinger --display-id` 可查；**不要**用 `-d 0`，会直接报 Failed）。
2. **git-bash 路径转换**：`adb pull /sdcard/x.png` 会被 MSYS 改写成
   `C:/Users/.../sdcard/x.png` → `failed to stat remote object`。
   → 每条命令前 `export MSYS_NO_PATHCONV=1`，或用 `//sdcard/x.png`。

**唯一可靠配方**：
```bash
export MSYS_NO_PATHCONV=1
ADB="<PLATFORM_TOOLS>/adb.exe"
DISP=4619827820427265280
$ADB shell screencap -p -d $DISP /sdcard/_s.png
$ADB pull /sdcard/_s.png shots/<side>/x.png
$ADB shell rm -f /sdcard/_s.png
python -c "from PIL import Image; im=Image.open('shots/<side>/x.png'); print('OK', im.size)"  # 必须打印 OK (1080, 2460)
```
**每张图都要过这道 PIL 校验**，否则后面所有像素分析都是垃圾。

### 7.2 采集前必须校验前台，否则录到的是桌面

实测：`am start` 报 `Status: ok / COLD` 之后，截图拿到的却是**模拟器桌面**，甚至还带着一个
长按上下文菜单（别的 agent 的 `input swipe` 落在桌面上打出来的）。
`dumpsys window | grep mCurrentFocus` 在本机返回 `null`，**不可靠**，改用：
```bash
$ADB shell dumpsys activity activities | grep -E 'topResumedActivity|ResumedActivity' | head -2
```
**每次 input 之前和录像开始之前都要校验一次**，确认前台就是目标包名。
包名不对就 `am force-stop` + `am start` 重来，不要把错帧当证据。

### 7.3 一切设备写操作都要进锁

`input` / `screenrecord` / `am start` / `am force-stop` / `install` / `screencap` 都算。
只读的 `dumpsys` / `getprop` 不必。
```bash
tools/device-lock.sh run <owner> -- <command...>
```

### 7.4 screenrecord 的后台作业返回值早于文件 finalize —— pull 抢跑拿到 0 字节

实测（ui-audit task-5 第 5 轮）：把 `adb shell screenrecord ... /sdcard/x.mp4` 以 **host background job**
方式启动时，作业状态会在 mp4 还没写完时就先报 `completed`；此时立刻 `adb pull` 会打印
`1 file pulled`，但 `ls -l` 是 **0 字节**（静默失败，后面 ffmpeg 只会报 `Invalid data found when processing input`，
看起来像「录到了但解析不了」，容易误判成编码问题）。

另一条同样踩过的路：在一个 ops_bash 调用里用 shell `&` + `wait` 把 screenrecord 丢到后台，会**截断**录制
（`--time-limit 6` 只得到 2.97 s / 96 帧；而前台同步录制的同一命令得到完整 8.03 s / 176 帧）。

→ 可靠做法：**前台录完整段**（在一次 ops_bash 调用里同步跑 screenrecord），命令返回后再 `sleep 3`
让 mp4 落盘，然后 pull，并**立刻校验字节数与帧数**：

```bash
$ADB shell screenrecord --display-id $PHYS --size 1080x1920 --bit-rate 12000000 --time-limit 8 /sdcard/x.mp4
sleep 3
$ADB pull /sdcard/x.mp4 shots/<side>/x.mp4
ls -l shots/<side>/x.mp4     # 必须 > 0；0 字节就是抢跑，等 3 秒重试，不要直接喂给 ffmpeg
ffprobe -v error -show_entries stream=nb_frames,duration -of default=nw=1 shots/<side>/x.mp4
```

同时记住两条量化事实，出结论时要带上：

1. screenrecord 在本机的有效帧率只有 **~22–36 fps**（一帧 ≈ 27–45 ms），**不要声称亚帧精度**；
   结论只能给到「帧跨度的秒数」，且优先用 7.x 的「逐帧时序（纳秒）」原语交叉校验。
2. `--time-limit 8` 实际常只产出 30 帧左右就结束（本次 0.85 s / 30 帧）。**帧数不足时先怀疑录制被截断**
   （或前台被抢），不要先解释成「动画只有这么短」。反过来，0.29 s 的多帧连续变化 = 真动画；
   单帧尖峰 = 硬切；0.000–0.08 交替 = 编码器/静止噪声。

