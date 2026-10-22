# 更新机制

三条版本线各自独立，升级时别混：

| 版本线 | 载体 | 谁在管 | 兼容规则 |
| --- | --- | --- | --- |
| 插件 `version` | `plugin/package.json`（semver） | 宿主侧 pnpm 安装的那个 tgz | 只加不改：新字段可缺省，老宿主读到未知字段应忽略 |
| APK `versionName` / `versionCode` | `android/AndroidManifest.xml` + `assets/dsh-phone.apk.json` | 手机 `pm install -r` | `versionCode` **必须递增**，否则覆盖安装失败 |
| 协议 `/v1` | `lib/server.js` | 手机 ↔ 插件 | 只做加法；破坏性改动要同时升协议号并保留旧路由 |

**0.4.2 的默认值变化只影响新装**：`bind` 默认从 `loopback,tailscale` 改成 `loopback,lan,tailscale`（让没装 Tailscale 的人开箱能用）。已经装过的 profile 里 `cordis.patch.yml` 是你自己的配置，升级插件**不会**覆盖它 —— 想让老机器也开局域网，按 [addresses.md](addresses.md) 手动改一行即可。

## 一、发布通道

**主通道：GitHub Release（推荐）**

每次发版，Release 附件放两个同名同版本的东西：

```
dsh-phoneharness-0.4.2.tgz     # 插件（内含 assets/dsh-phone.apk）
dsh-phone.apk                  # 单独一份 APK，方便直接丢给手机
```

**可选通道：npm**

`package.json` 的 `private` 为 `false` 时可直接 `npm publish`；`files` 已限定为运行必需文件。

**内网 / 离线通道：本地 tgz**

```bash
cd plugin && npm pack --silent        # 产出 dsh-phoneharness-<ver>.tgz
```

## 二、升级插件（宿主侧）

```bash
# 1) 备份（设备令牌、配对状态、当前配置）
cp -r ~/.dsh/phone-harness ~/.dsh/phone-harness.bak-$(date +%Y%m%d)
cp ~/.dsh/profiles/<profile>/package.json ~/.dsh/profiles/<profile>/package.json.bak-$(date +%Y%m%d)

# 2) 安装新包（file: 前缀，绝对路径）
dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness-0.4.2.tgz

# 3) 确认版本
dsh plugin --profile <profile> list | grep dsh-phoneharness

# 4) 重启宿主，让新 index.js / client.js 生效
```

- 安装时 pnpm 会把 `dsh-phoneharness` 自动追加进 `package.json` 的 `dsh.profile.bundles`，不用手改。
- **重启宿主是必要步骤**：`index.js` 是宿主进程里的模块，热加载只覆盖「配置变了」这一层，代码里的常量（如 `VERSION`）不会重读。
- 面板上的「插件版本」「随包 APK」来自 `/status`，宿主重启后才会显示新值。

## 三、升级 APK（手机侧）

1. 手机浏览器打开 `http://<电脑地址>:8737/apk`（免配对，插件自带的那一份）；
2. 下载后直接覆盖安装（同签名，数据保留）；
3. 也可以在电脑上 `adb install -r plugin/assets/dsh-phone.apk`。

约束：

- **同签名**才能覆盖：仓库里的 `android/debug.keystore` 是公开的调试签名，任何人 clone 都能覆盖安装；正式分发请换自己的 keystore 并改 `build.sh`。
- `versionCode` 必须递增；`build.sh` 用 `VERSION_CODE` / `VERSION_NAME` 环境变量控制。
- 构建后写 `bin/dsh-phone.apk.json` 旁车文件（versionName、versionCode、size、md5、builtAt）并同步到 `plugin/assets/`。插件读它显示「随包 APK 是哪个版本」——**插件不解包 APK**，旁车文件必须和 APK 一起发。

## 四、兼容性与降级

- **手机比插件新**：`GET /v1/ping` 返回 `{version}`；APK 发现宿主版本低于所需时应回落老接口（本项目 `Api.java` 在 `/v1/models` 返回 404 时回落到 `/v1/catalog`）。
- **插件比手机新**：只加接口不改语义；手机忽略未知 JSON 字段，SSE 里未知 `event:` 帧应忽略而不是断开。
- **老宿主没有 `kind` / `listening`**：面板按 `bind` 自行推断，不会白屏。
- **`devices.json` schema**：带 `version: 1`；字段只增不删，读取时缺省补默认值。
- **配置项**：新键一律有默认值（`readConfig()` 里缺省即默认），老配置文件无需改动。

## 五、回滚

```bash
# 插件：装回旧 tgz（bundles 会同步回旧版本）
dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness-0.3.5.tgz
# 数据：需要时把备份贴回去
rm -rf ~/.dsh/phone-harness && mv ~/.dsh/phone-harness.bak-YYYYMMDD ~/.dsh/phone-harness
```

APK 回滚：装旧包时 `versionCode` 会变小，必须先卸载（`adb uninstall com.lc.phoneharness`），会丢本地偏好（地址、令牌），需要重新配对。

## 六、自动更新检测（插件 0.4.8+）

面板（设置 → 手机远程）底部有一张「更新」卡片，不用记版本号，也不用去翻仓库：

| 元素 | 说明 |
| --- | --- |
| 当前版本 | 宿主进程里的 `VERSION` 常量（重启宿主后才会变） |
| 最新版本 | 三个来源里最高的那个版本号 |
| 上次检查 | 缓存里的时间；没查过显示「还没检查过」 |
| 来源徽标 | `npm · 未发布` / `github · 占位地址` / `feed · 正常` 之类，一眼看出是哪条路断了 |
| 立即检查 | `POST /dsh-phone/api/update/check`，绕过缓存直接联网 |
| 自动检查开关 | 落盘到 `~/.dsh/phone-harness/update.json`（0600），关掉后宿主不再联网 |

检查顺序（并发，取最高版本）：

1. **npm**：`https://registry.npmjs.org/dsh-phoneharness/latest` 的 `version`；
2. **GitHub**：`/repos/<owner>/<repo>/releases/latest` 的 `tag_name`，没有 Release 时退化到 `/tags` 的第一个；仓库还是 `OWNER` 占位就记为「占位地址」而不是报错；
3. **updateFeed**（可选）：配置项里的任意 http(s) 地址，返回 `{"version":"0.5.0"}` 即可参与比较 —— 内网、私有分发、CI 产物都能用。

节奏：宿主启动 **8 秒**后查首次（不跟启动抢网络），之后每 `updateIntervalMs`（默认 6 小时，最小 5 分钟）复查一次；面板每 5 秒读的是缓存快照，不会把 registry 打限流。

**当前两个公开源都还没就绪**：npm 上没发布这个包、GitHub 地址还是 `OWNER/dsh-phoneharness`，所以卡片会显示「无法检测」并列出每个源的状态。把仓库地址换成真的（`index.js` 顶部 `REPO_URL` + `package.json.repository`），或者 `npm publish`，或者配一个 `updateFeed`，卡片就会自己亮。

接口（回环，仅面板用）：

```bash
GET  /dsh-phone/api/update          # 读缓存快照
POST /dsh-phone/api/update/check    # 强制联网复查
POST /dsh-phone/api/update/auto     # {"auto":false} 关掉自动检查
```

## 七、自动化守门

```bash
cd plugin && npm run verify
```

`npm run verify` 做四件事：`node --check` 语法检查、解析 `cordis.patch.yml` 确认 `id`/`name`/`port`、`npm pack --dry-run` 检查打包清单、扫描文档里的失效相对链接。CI（`.github/workflows/verify.yml`）在每次 push / PR 跑同一套。

发版清单：

1. `android/build.sh` 出 APK（`VERSION_CODE` 递增）→ 自动同步 `plugin/assets/`；
2. 改 `plugin/package.json` 的 `version` + `CHANGELOG.md`；
3. `npm run verify` 通过；
4. `npm pack --silent` 出 tgz；
5. Release 上传 tgz + `dsh-phone.apk`，正文粘 CHANGELOG 片段。
