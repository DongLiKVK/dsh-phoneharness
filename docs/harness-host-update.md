# 让手机端 harness 真正生效：宿主升级与重启指引

> 面向使用者（也是给最终汇报用的一页操作单）。取证见 `docs/harness-live-host-probe.md`。

## 1. 现在的状态（2026-10-22 05:36 实测）

| 项 | 实测值 | 结论 |
| --- | --- | --- |
| 正在跑的宿主进程 | `pid 37408`，启动于 `2026-10-21T19:57:36Z`（本地 03:57），监听 `8737` | 进程里加载的插件代码是 **03:57 那份** |
| 该进程自报版本 | `GET /v1/me` → `host.version = 0.5.1` | **没有** harness 路由 |
| harness 路由实测 | `GET /v1/harness`、`/v1/harness/dirs`、`POST /v1/harness/config` 全部 `404 not_found` | 手机端拿不到名册，面板只能空 |
| profile 依赖 | `<HOME>/.dsh/profiles/desktop/package.json:24` = `file:<PROJECT_ROOT>/plugin/dsh-phoneharness-0.5.6.tgz` | 已指向 0.5.6 包 |
| 已安装副本 | `profiles/desktop/node_modules/dsh-phoneharness/package.json` → `0.5.6`；其 `lib/harness.js` / `lib/server.js` 的 md5 与仓库源码**逐字节相同**（`9d0124dd7d2d8a491bd32b7791a7ab64` / `d76acd5e42e8f4a2a2632757ba4ad623`） | **磁盘上已是带 harness（含名册加固）的 0.5.6** |
| 打包产物 | `plugin/dsh-phoneharness-0.5.6.tgz`（1741092 B，05:32；内含 `lib/harness.js`，含 `hostPresetRoster`） | 包内容 = 仓库当前代码 |

**一句话**：代码与安装都已就位（已装 0.5.6，`harness.js` 与源码 md5 一致），**唯一缺的是「重启宿主」** —— 03:57 启动的进程不会自己换代码。

## 2. 重启（唯一必要动作）

1. 保存手上正在编辑的东西（重启会结束当前 DSH 里所有会话，包括正在和 Agent 对话的这个页面）。
2. 用 `dsh-plugin-restart` 提供的重启入口（该插件已装在 profile：`link:<HOME>/Documents/deepseek-harness/default-workspace/work/plugin-restart`），或者直接退出并重新打开 DeepSeek Harness。
3. 重启后自检：

```
cd <PROJECT_ROOT>
node tools/probe-live-host.mjs
```

   期望：末尾一行写「全部 2xx」；`GET /v1/harness` 回包 `presets` 非空（四条内置中文名册，当前项 `current:true`），`capabilities.writeConfig` 为 `true`。
4. 手机上：首页点「选择模式」→ 面板应立即出现 内置/自定义 两组候选；点一条即写回宿主（成功后面板关闭、chip 文字变化）。

## 3. 如果哪天需要重装（备用步骤）

1. 备份三份：`Copy-Item package.json,cordis.patch.yml,pnpm-workspace.yaml` → `*.bak-harness-<stamp>`（在 `<HOME>/.dsh/profiles/desktop/`）。
2. 重新打包：

```
cd <PROJECT_ROOT>/plugin
npm pack          # 产出 dsh-phoneharness-<version>.tgz
```

3. 安装（CLI 在 `<DSH_INSTALL>/resources/runtime/cli/bin/dsh.cmd`）：

```
& '<DSH_INSTALL>/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add 'file:<PROJECT_ROOT>/plugin/dsh-phoneharness-0.5.6.tgz'
```

4. 若被 pnpm 供应链策略拦住（`ERR_PNPM_RESOLUTION_POLICY_VIOLATIONS_UNHANDLED`）：在 `profiles/desktop/pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里加一行 `  - dsh-phoneharness@<version>`（注意**不要出现重复同名条目**，pnpm 只认第一条）。
5. 装完确认 `package.json` 的 `dependencies` 与 `dsh.profile.bundles` 双向一致（现在两处都有 `dsh-phoneharness`），然后**重启**（第 2 节）。
6. 回滚：从 `*.bak-harness-<stamp>` 恢复三个文件 → 重跑安装 → 重启。

## 4. 注意事项

- `cordis.yml` 是运行期生成物，**永远不要手改**；`cordis.patch.yml` 里若该插件有 `insert/disabled` 段落，装卸时同步处理。
- 诊断日志在 `profiles/desktop/.plugin-manager/logs/operation-<id>/pnpm.log`。
- 本机已实测：**只改依赖或只重装、不重启，手机端仍然是 404** —— 重启是必要条件，不是可选步骤。
