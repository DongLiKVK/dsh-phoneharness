# Release 插件 0.5.22 / APK 0.6.92

本版主角是 APK：手机端从 `0.6.29` 换到 `0.6.92`（同一条「内置 Tailscale」线，`0.6.30`–`0.6.92` 连续迭代）。插件代码没有改动，只因包内随附的 APK 换了，版本从 `0.5.21` 走到 `0.5.22`。

## 产物（Release 资产）

| 文件 | 说明 |
| --- | --- |
| `dsh-phone-0.6.92.apk` | Android 客户端，versionName `0.6.92` / versionCode `114`，46,058,367 字节，内置 tsnet |
| `dsh-phoneharness-0.5.22.tgz` | 宿主插件包 0.5.22（17,065,263 字节，内含同一份 APK），`dsh plugin add file:<tgz>` |
| `SHA256SUMS` | 上面两个文件的校验和 |

校验：先 `cd` 到下载目录，再 `sha256sum -c SHA256SUMS`。

## 装 / 升

1. **APK**：手机直接装 `dsh-phone-0.6.92.apk`（覆盖安装即可，同一个调试签名），或在手机浏览器打开 `http://<电脑>:8737/apk` 由插件面板下发。
2. **插件**：`dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness-0.5.22.tgz`，然后**重启宿主**——只装不重启时手机端拿到的还是旧路由与旧包。

## APK 0.6.29 → 0.6.92 做了什么

- **会话管理**：`0.6.47` 对话页抽屉也有多选（抽出 `BatchSelect.java` 供两处宿主共用）；`0.6.88` 当前会话那一行加 ⋯ 菜单（重命名 / 置顶 / 多选 / 删除，走 `POST /v1/sessions/{id}/pin` 与 `/archive`）。
- **顶栏与状态**：`0.6.30` 去掉顶栏最右侧 ⋯；`0.6.49` 预设标签改读**这条会话自己的**预设（原先读主机全局默认，哪条会话都写死「PTC 模式」）；`0.6.80` 移除橙色中断方块、停止能力搬到输入框动作键；`0.6.81` 「正在回复…」文字换成标题左侧的转圈（`StateRing`，槽位常驻避免标题左右跳）。
- **列表与抽屉**：`0.6.31` 绿点语义改成「未读」（`ReadMarks.unread` 本地账本，点开即消）；`0.6.37` 账号行去掉「主机 · 设备」副标题、点输入框外面收键盘；`0.6.50` 长内容统一细滚动条（3dp、贴右缘、不淡出）；`0.6.53` 抽屉打开时把列表与子视图位移归零。
- **文件夹拖动**（这一段修得最多）：`0.6.55` 长按拖动前先自动折叠；`0.6.66` 不能拖到「工作区」标题以上；`0.6.74` 修「越过标题区整片白板」——真因是 `FolderDrag` 往列表 `LinearLayout` **自己**身上滚，`getScrollY()` 掉到 −8856，改为一律只滚外层 `ScrollView`；`0.6.76` 去掉拖动时的蓝色描边并加半格死区（解决「手一抖就换位」）；`0.6.77` 新对话落点跟着「刚打开的那条会话」的文件夹走。
- **其它**：`0.6.46` 设置页「工作区」换文件夹线稿图标；`0.6.82` 修上传面板三格「图标与文字错位」（竖直 `LinearLayout` 的默认 LP 宽度是 MATCH_PARENT）。
- `0.6.89`–`0.6.92` 开发树 CHANGELOG 未记（最后一次文档更新早于构建时间 `2026-10-25T09:03:34Z`），本版以 `versionName` / `versionCode` / 字节数 / sha256 为身份判据。

> **两条版本线**：`0.6.92` 的界面基线是 `0.6.18`，**没有** `0.6.19`–`0.6.26` 的聊天页改动（操作条 `BarTarget`、抽屉检索等）。
> 想要那些功能，请装上个 Release `v0.5.20` 里的 `dsh-phone-0.6.26.apk`。

## 仓库约定：二进制不进 git

- `plugin/assets/dsh-phone.apk` 与 `.apk.json` 由发版流程在 `npm pack` 前注入（见 `plugin/assets/README.md`）。仓库里没有它们时 `GET /apk` 返回 `404 no_apk`，`npm run verify` 跳过 APK 两项打包检查并打一行 `warn`。
- `release/` 只留本说明、`SHA256SUMS` 与 APK 的 `.apk.json` 元数据；`release/dsh-phone-0.6.29.apk.json` 随本版删除。
- 43.92 MB 里 43.1 MB 是两份 `libgojni.so`（`arm64-v8a` 20.79 MB + `x86_64` 22.35 MB），`classes.dex` 只有 0.21 MB —— 这种体积只适合当 Release 资产。

## 验证

- 版本核对：APK 内 `AndroidManifest.xml` 解析出 `versionName 0.6.92` / `versionCode 114`，与旁车 `.apk.json`（`{"versionName":"0.6.92","versionCode":114,"size":46058367}`）一致；145 个 zip 条目里 13 个大条目 CRC32 全过、0 失败。
- 包内一致性：`tar -xzOf dsh-phoneharness-0.5.22.tgz package/assets/dsh-phone.apk | md5sum` = `0aca941cd056e7c4dc4717959db52f19`，与 `dsh-phone-0.6.92.apk` 完全相同。
- `node --check`：`index.js`、`client.js`、`lib/*.js`、`scripts/*.mjs` 14 个文件全过。
- `node plugin/scripts/verify.mjs` → 4 项全过（npm pack 27 文件 / 16,665 KB / 19 条文档链接全在 / cordis 字段 version 0.5.22）。
- `SHA256SUMS`：`93b827e8f8adc3c487c4995a89b8a9042591b91ea1f33242b949de4a723a8eba  dsh-phone-0.6.92.apk`、`4b25b391aab30b93e4fb6bc393bb1f12e2f4192b8c9e85af1fceb16ebd9fc5c7  dsh-phoneharness-0.5.22.tgz`。
