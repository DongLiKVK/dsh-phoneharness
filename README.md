# phone-harness · 手机远程控制 DeepSeek Harness

用手机接管跑在自己电脑上的 [DeepSeek Harness](https://github.com/deepseek-ai) 会话：发指令、看流式回复、批准工具调用、回答模型反问。

本仓库包含两半，分别独立可构建：

| 目录 | 是什么 | 怎么用 |
| --- | --- | --- |
| `plugin/` | 宿主侧插件（cordis） —— 开 HTTP/SSE 端口、配对、审批桥、设置面板 | `dsh plugin add file:<tgz>` |
| `android/` | 手机客户端 APK（原生 Java，无 Gradle） | `bash build.sh` → `bin/dsh-phone.apk` |
| `brand/` | 应用图标与品牌素材（构建 APK 时用） | `python brand/make-whale-assets.py` |

```
手机 APK ──HTTP/SSE──▶ 宿主插件 ──▶ DSH 会话 / 工具 / 审批
```

## 下载

产物都挂在 [Releases](https://github.com/DongLiKVK/dsh-phoneharness/releases/latest) 页，仓库里不放二进制（只留 `release/` 的说明与校验和）。

| 文件 | 用途 |
| --- | --- |
| [`dsh-phone-0.6.29.apk`](https://github.com/DongLiKVK/dsh-phoneharness/releases/latest/download/dsh-phone-0.6.29.apk) | 手机客户端 APK `0.6.29`（versionCode 45，内置 Tailscale 引擎），直接安装 |
| [`dsh-phoneharness-0.5.21.tgz`](https://github.com/DongLiKVK/dsh-phoneharness/releases/latest/download/dsh-phoneharness-0.5.21.tgz) | 宿主插件包 `0.5.21`，`dsh plugin add file:<tgz>` |
| [`SHA256SUMS`](https://github.com/DongLiKVK/dsh-phoneharness/releases/latest/download/SHA256SUMS) | 两个产物的 SHA-256（先 `cd` 到下载目录再 `sha256sum -c`） |

> 上个 Release `v0.5.20` 里的 `dsh-phone-0.6.26.apk` 属于**另一条界面线**（聊天页操作条、抽屉检索等）。要那些功能就装那一版；两条线的差别见 [CHANGELOG.md](CHANGELOG.md) 里「两条版本线」一节。

变更历史见 [CHANGELOG.md](CHANGELOG.md)，本次发布说明见 [release/RELEASE-NOTES.md](release/RELEASE-NOTES.md)。

## 快速开始

```bash
# 1) 装插件（Release 里的 tgz，绝对路径）
dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness-0.4.1.tgz
# 2) 重启宿主；Web GUI → 设置 →「手机远程控制」里读配对码
# 3) 手机浏览器打开 http://<电脑地址>:8737/apk 装 APK，填地址 + 配对码
```

面板里的「手机里填这个地址」一行一种接入方式，各带用途、场景与监听状态。**不需要 Tailscale**：默认 `bind: loopback,lan,tailscale`，手机和电脑连同一个 WiFi 就能用；只有在外网 / 4G 下才建议装 Tailscale，用那条 100.x 地址。面板里内置了「外网接入（可选 · Tailscale）」引导卡：按当前机器状态显示**未安装 / 已安装·未生效 / 已就绪**，未装时直接给电脑版与手机版下载入口，并解释为什么需要它。

## 用户主机 harness（协议 v1.3）

手机端不再自己存一份 harness 配置，而是**直接读/写跑在电脑上的那份** —— 和桌面新会话页同一件事、同一套文案：

- 首页 composer 的座位分成两处（**与改动前的模型/权限位置一致**）：**工作区 → Agent 预设** 两枚在输入卡片**上方那一行**靠左、可横向滑动、窄屏不换行不挤压按钮；**模型 → 权限** 两枚仍在打字胶囊**内部**原来那一行（后面才是上传/语音两枚圆钮）。
- 点「工作区」：最近工作区列表 + 主机目录浏览（面包屑 / 上级目录 / 手动输入路径）+「使用此目录」。
- 点「Agent 预设」：**打开面板即向主机取最新名册**（不靠本地缓存），内置 / 自定义分组，每项显示中文名与说明（「标准模式」「PTC 模式」「极简模式」「创造模式」），当前项标「新任务默认」，主机侧不可用的项置灰并给出原因；取不到名册时显示**真实原因**（状态码 + 错误码 + 主机说明）并给一行「重新加载」，不再是一个空面板。主机侧名册按 `agentPresets.remoteExportList()` → `list()` → 内置四条 三级回退，**永不返回空数组**。
- 选中即写主机：`POST /v1/harness/config`；手机先乐观更新 chip，失败回滚并提示「无法切换到「X」：原因」。写成功但只在本进程生效时提示「已生效（本次运行）」。
- 新建会话页用同一套面板选工作区与预设；会话页只显示**只读**预设标签（会话一旦开始，组合就固定了）。（设置页里原先那行「用户主机的 Harness」入口已由另一条改动线从设置列表移除，代码仍在；harness 的读写入口以首页 chip 与新建会话页为准。）
- 主机不接受配置写入时（`capabilities.writeConfig=false`），设置页明确标注只读，不假装能改。

接口与冻结签名见 [docs/harness-contract.md](docs/harness-contract.md)，桌面端文案与结构依据见 [docs/harness-desktop-reference.md](docs/harness-desktop-reference.md)，验收过程与证据见 [docs/harness-verification.md](docs/harness-verification.md)（含真机截图与可复跑脚本 `tools/verify-harness.mjs`）。**装完新插件要重启宿主才会生效**：本机实测「只装不重启」时手机端拿到的仍是 `404 not_found「没有这个接口：GET /v1/harness」` —— 取证与升级/重启步骤见 [docs/harness-live-host-probe.md](docs/harness-live-host-probe.md) 与 [docs/harness-host-update.md](docs/harness-host-update.md)。

当前发布：**APK 0.6.29（versionCode 45）/ 插件 0.5.21**，产物在 [Releases](https://github.com/DongLiKVK/dsh-phoneharness/releases/latest)（`dsh-phone-0.6.29.apk`、`dsh-phoneharness-0.5.21.tgz`、`SHA256SUMS`）；仓库里只保留 `release/` 的说明、校验和与 `.apk.json` 元数据。两者版本号独立演进：APK 走 0.6.x，宿主插件走 0.5.x，Release tag 取插件版本。校验一致性请看 `versionName`/`versionCode` 与字节数；`md5` 会随 zip 内嵌时间戳变化，不作为判据。

## 文档

使用与开发文档都在 `plugin/docs/`：

| 文档 | 内容 |
| --- | --- |
| [install](plugin/docs/install.md) | 依赖环境、装插件 / 装 APK、首次配对、端口与防火墙 |
| [configure](plugin/docs/configure.md) | 全部配置项、`bind` 语法、安全建议 |
| [addresses](plugin/docs/addresses.md) | 面板里那几行地址分别是什么、为什么显示「未监听」 |
| [update](plugin/docs/update.md) | 版本策略、发布通道、升级与回滚、兼容性 |
| [architecture](plugin/docs/architecture.md) | 模块划分、消息全链路、**扩展点** |
| [api](plugin/docs/api.md) | `/v1` 与 `/dsh-phone/api` 端点、SSE 帧、错误码 |
| [design-notes](plugin/docs/design-notes.md) | 开发笔记：时间线投影、审批接入、标题投影的来龙去脉 |

## 构建 APK

不依赖 Gradle，五步手工链路（`aapt2 → javac → d8 → zipalign → apksigner`）：

```bash
cd android
bash build.sh                      # 版本号取 build.sh 里的 VERSION_NAME_USED / VERSION_CODE_USED 默认值
VERSION_CODE=11 VERSION_NAME=0.6.0 bash build.sh   # 发版：显式覆盖并递增 versionCode
# 产物：android/bin/dsh-phone.apk（+ .json 元数据，并同步到 plugin/assets/）
```

要点：

- **构建前置**：`build.sh` 从仓库同级的 `../sdk` 取 SDK（`build-tools/android-16`、`platform/android-35/android.jar`，即 command-line tools 里的 build-tools 36 与 platform 35）。不打算把 SDK 放进仓库时，改 `build.sh` 顶部的 `SDK=` 一行指向你本机的 SDK 即可。
- 必须用 `build-tools/android-16` 的 `d8`：`android-14` 的 d8 在 JDK 25 编译出的匿名类上会崩。
- `classes.dex` 必须落在 APK 根目录（用 `jar --update` 时要先 `cd build/dex`）。
- 仓库里是**公开的调试签名**（`android/debug.keystore`，口令 `android`），只为方便覆盖安装；正式分发请换成自己的 keystore。

## 选择文本

长按消息 →「选择文本」→ **底部选择面板**（旧实现走 `ACTION_PROCESS_TEXT`，本机没有处理器，点了等于空操作）：

- 面板全宽、18dp 顶部圆角、高度 84% 屏高（真机 730dp）；正文置顶不预选，长按选词、拖两端水滴手柄、或点「全选」。
- footer：`已选 N / 共 M 字` + 全选 + 复制 + 分享（图标）+ 完成。复制/分享只取**选区**；0 选区时复制是中性底灰字（不是半透明品牌色 —— 那样白字只有 2:1）。
- 关闭四条路（完成 / × / 返回键 / 点遮罩）；流式更新触发整页重绘前会先收掉面板。
- 结构、尺寸、配色与真机验收清单见 [docs/select-text.md](docs/select-text.md)，对照图见 `shots/select/`（`before-7-selecttext.png` → `final-9-disabled-light.png`）。

## Logo 与深浅色

应用内 logo 是**一份单色剪影的两套着色**：浅色模式黑鲸 `#131414`、深色模式白鲸 `#F8F8F8`（同源，只有颜色不同）。资源选择只发生在一个地方 —— `Theme.brandLogo()` / `Theme.splashLogo()` 按 `Theme.dark` 返回资源 id，启动页 / 首页 / 空会话页 / 配对页 / 设置页品牌位五处调用点统一走它。界面在 `build()` 时一次取定，所以**首帧就是正确颜色**；系统深浅色变化时 Activity 被系统重建（应用内改外观走 `setTheme + recreate()`，另有 `darkAtBuild` 兜底比对），重建后重新取资源，不会出现「深底压黑鲸」的残留帧。

- **刻意不放 `drawable-night/`**：资源限定符按**系统**配置解析，与应用内「外观」选择无关 —— 系统深色 + 应用显式浅色时，`drawable-night/` 会把浅色资源改写成白鲸，叠在浅色页面上就是不可见的 logo（真机实测到的缺陷）。所以 logo 的选择只由 `Theme.dark` 决定，验证要跑「系统 × 应用外观」的 2×2 矩阵，见 [docs/logo-theme-spec.md](docs/logo-theme-spec.md) §3.4 / §六。
- **桌面图标不随系统深浅色切换** —— 平台限制（启动器按自己的配置解析并缓存图标）。唯一的系统级适配途径是 Android 13+ 的 `<monochrome>` 主题图标层，本仓库已提供（`mipmap-*/ic_launcher_monochrome.png` + `mipmap-anydpi-v26/ic_launcher.xml`）。
- **重生成**：`python brand/make-whale-assets.py`（读 `brand/whale-source.png`，覆盖写五档密度 × 两套着色 + 图标三态；幂等）。
- **真机验证矩阵**（本轮实测，四格全过）：`bash tools/lead-theme-set.sh <auto|day|dark> <yes|no> ` 一条命令切一格（设系统深浅色 → force-stop → 以 app uid 写回 prefs 的 ` theme ` → 冷启动），随后截图并断言「logo 区」而不是「页面底色」：**A** 系统浅色+跟随系统 → 浅底黑鲸（1662 px）；**B** 系统深色+跟随系统 → 深底白鲸（1643 px）；**C** 系统深色+显式浅色 → 浅底黑鲸（**回归用例**）；**D** 系统浅色+显式深色 → 深底白鲸。像素统计、四格图与命令输出见 [docs/logo-verification.md](docs/logo-verification.md)。
- 完整规格（素材尺寸表、改动文件清单、验证步骤）见 [docs/logo-theme-spec.md](docs/logo-theme-spec.md)，对照图与规格图见 ` shots/logo/light-dark-compare.png `、` shots/logo/asset-spec.png `，验收证据见 [docs/logo-verification.md](docs/logo-verification.md) 与 ` shots/logo/ `。

## 设计取向

- **默认可用但不摊开**：`bind` 默认 `loopback,lan,tailscale`（同 WiFi 开箱能用，不占 `0.0.0.0`），要收窄就改成 `loopback,tailscale`。
- **一次配对，长期持令牌**：6 位码一次性 + 64 hex 设备令牌，撤销即时生效。
- **只加不改的协议**：手机在用户手里、升级不同步，`/v1` 只做加法。
- **审批不抢权**：只有手机真的连着时才接管 `approval/request`，超时立刻交回桌面。
- **配置只有一份真相**：harness 的工作区 / 预设 / 模型 / 权限都存在主机上，手机只做读写与展示（本地仅缓存上次的值，用于离线时 chip 先出字）。
- **logo 只有一份真相**：应用内 logo 由 `Theme.brandLogo()` / `Theme.splashLogo()` 按 `Theme.dark` 选资源，浅色黑鲸、深色白鲸，不缓存 bitmap、不运行时染色，切主题即重建取新图。
- **无构建的前端**：设置面板是手写 `React.createElement`，改完刷新就生效。
- **选中就是选中**：选择文本只把**选区**交给剪贴板 / 分享，面板里不预选整段、也不借外部 App 的文本处理器假装能选。

## 状态

可用、日常在用。已知限制与路线见 [plugin/README.md](plugin/README.md#已知限制)。

## 贡献 / 安全 / 许可

- 贡献流程与本地开发：[CONTRIBUTING.md](CONTRIBUTING.md)
- 漏洞与威胁模型：[SECURITY.md](SECURITY.md)
- 许可：MIT，见 [LICENSE](LICENSE)

---

## English

Phone-side remote control for DeepSeek Harness: a host plugin (HTTP/SSE + one-time pairing + approval bridge + settings panel) and a native Android client. Install the plugin with `dsh plugin --profile <profile> add file:<tgz>`, install the APK from `http://<host>:8737/apk`, then pair. Docs live in `plugin/docs/`. MIT licensed.
