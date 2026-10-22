# Release 插件 0.5.20 / APK 0.6.26

本轮改动集中在对话页的操作条（每条助手消息底部的 复制 / 赞 / 踩 / 朗读 / 分享 / 重新生成）。

## 修了什么

操作条原本只挂在「有正文的助手消息」上。而 agent 型会话一轮里绝大多数条目是工具调用与思考标记（实测样本 191 条：工具调用 132、思考标记 55、助手正文 2），这些轮次整轮没有正文，操作条不出现 —— 表现为「这几个按钮对我生成的内容没效果」。

- 新增 `BarTarget`：一条消息、或一整块「思考 + 工具调用」聚合区，都能包成同一个操作条作用对象。
- 纯工具轮次的聚合块在自己底部挂操作条；有正文时仍由正文带，保证一轮不出现两条。
- 「是不是本轮最后一块」的判定跳过 `role=system` 的收尾标记（「处理完成」小胶囊），否则 agent 轮次永远算不上尾块。
- `重新生成` 改为按操作条所在那一轮定位用户消息（不再固定取全局最后一条）；只加载了后半段时退回原行为。
- 长按消息菜单走同一套 `BarTarget`，与操作条行为一致。

## 文件名带版本

以前无论哪个版本，下载下来都叫 `dsh-phone.apk`，手机里存过两版就互相覆盖、分不清装的是哪一版。现在 APK 一律带版本号：

- Release 资产：`dsh-phone-0.6.26.apk`
- 手机浏览器直连 `http://<电脑>:8737/apk`：同样存成 `dsh-phone-0.6.26.apk`（`Content-Disposition` 由旁车文件里的 `versionName` 生成）
- 插件面板「下载 APK」：同上
- `/apk/meta` 的 `name` 字段也带版本，手机端检查更新时能直接看到文件名

## 产物

| 文件 | 说明 |
| --- | --- |
| `dsh-phone-0.6.26.apk` | Android 客户端，versionName `0.6.26` / versionCode `42`，752401 字节 |
| `dsh-phoneharness-0.5.20.tgz` | 宿主插件包 0.5.20（`dsh plugin add file:<tgz>`） |
| `SHA256SUMS` | 上面两个文件的校验和 |

APK 用仓库里的 `android/debug.keystore`（标准 androiddebugkey）签名，可直接覆盖安装；`plugin/assets/dsh-phone.apk` 仍是仓库内的固定路径（插件靠这个路径找包），只是**下载时**才改名成带版本的文件名。

## 验证

- 下载文件名实测：直接驱动 `PhoneServer.prototype.sendApk`（假 req + 可写流），响应头 `Content-Disposition: attachment; filename="dsh-phone-0.6.26.apk"`、`Content-Length: 752401`，实际流出字节数与源文件一致。
- 守门脚本 `node plugin/scripts/verify.mjs` → 4 项全过（14 文件语法 / cordis 字段含 version 0.5.20 / npm pack 26 文件 694 KB / 19 条文档链接）。
- 回归脚本：`node tools/verify-harness.mjs` → PASS=34 FAIL=0（未验证 6 项为需要真实设备的交互，见脚本输出）。
- 夹具复现：`tools/fixtures/round-tool-only.json` 描述一段纯工具轮次，推到设备缓存目录即可离线复现。
- 逐动作点击验证：复制出「已复制」、赞转主题蓝并出「已点赞」、朗读在无 TTS 引擎时出「本机没有可用的朗读引擎」、重新生成回填上一条提问、`force-stop` 重启后赞仍保持。
