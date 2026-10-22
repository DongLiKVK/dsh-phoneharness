# 贡献指南

## 环境

- Node.js ≥ 20（宿主与插件都跑在它上面）
- 改 APK 才需要：JDK（`javac --release 8`）+ Android SDK（`aapt2 / d8 / zipalign / apksigner`，见 `android/build.sh` 顶部路径约定）
- 平台：Windows / macOS / Linux 都可（APK 构建脚本是 bash）

## 本地开发

```bash
# 插件：装进你自己的 profile（file: 指向本地目录即可）
dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness/plugin
# 改完 index.js / lib/*.js 要重启宿主；只改 client.js 刷新 GUI 即可
npm run verify            # 语法 + 配置 + 打包清单 + 文档链接

# APK
cd android && bash build.sh
```

## 改代码前

1. **`client.js` 没有构建步骤**：手写 `React.createElement`，样式在 `S`，文案进 `zh`/`en` 两套字典。别引第三方库。
2. **`/v1` 只加不改**：手机在用户手里，升级不同步。新增字段要能被老客户端忽略。
3. **审批 / 反问桥必须「手机在线才接管」**（`hasPhone: () => server.clients.size > 0`），否则桌面端会失去审批能力。
4. **Java 8 语法**：`javac --release 8`，别用 var / record / switch 表达式。
5. **不引入运行时依赖**：插件 `dependencies` 保持为空，APK 不引第三方库——这是能一行 `npm pack` 就发版的前提。

## 不要提交

- 真实 IP（局域网、公网、Tailscale 100.x）、令牌、主机名、用户名、工作区名、截图里的会话内容
- `~/.dsh/phone-harness/` 的备份、`devices.json`
- 构建产物（`android/build/`、`android/bin/`、`*.tgz`）
- 本地开发资料（`shots/`、`backup/`、`official/`、`dsh-src/`、根 `docs/`、`tools/`）——已在 `.gitignore` 里

提交前自查：`git diff --cached | grep -nE "([0-9]{1,3}\\.){3}[0-9]{1,3}|Bearer [0-9a-f]{64}"` 应无输出。

## 提 PR

- 一个 PR 一件事；标题用中文或英文都行，正文写「改了什么 / 为什么 / 怎么验证」。
- 涉及协议、配置默认值、安全边界的改动，请同时更新对应文档（`plugin/docs/`）。
- CI 会跑 `npm run verify`；本地先跑一遍。
- 发版由维护者做：`android/build.sh` → 改 `plugin/package.json` → `CHANGELOG.md` → `npm pack` → Release 上传 tgz + APK。
