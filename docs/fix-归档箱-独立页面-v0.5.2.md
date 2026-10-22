# 修复记录：归档箱独立页面（v0.5.2）

## 一句话
归档箱以前只是首页加了个开关——列表藏在抽屉里，抽屉一关就只剩「嗨！今天想聊些什么？」，看起来像「进入失败」。v0.5.2 把归档箱做成了独立页面：点进去就是列表。

## 现象（用户报告）
「刚归档了一个对话，然后尝试进入归档箱时无法正常访问，提示进入失败。」

真实表现（截图 shots/ours/s2–s5）：
1. 设置 → 归档箱：会新起一个 MainActivity，并**自动弹出抽屉**，抽屉里能看到归档会话；
2. 抽屉一关，主区是首页欢迎页（鲸形 logo + 输入框 + 三格），顶栏却挂着「归档箱」小胶囊——状态自相矛盾；
3. 返回键不回列表、也没有独立的「归档箱」页，用户判定「进错了 / 没进去」。

## 根因
归档模式复用了首页骨架，而不是一个真正的页面：

| 位置 | 问题 |
| --- | --- |
| `MainActivity.build()` | `content = header() + hero() + composer()` 恒为首页；会话列表 `list` 只存在于 `drawerBody()` 的抽屉里 |
| `onResume()` | `archivedView` 时 `ui.postDelayed(openDrawer, 120)` 把列表「塞」回抽屉，关掉即失联 |
| 顶栏 `archiveTag` | 用一枚胶囊表示「你在归档箱」，而不是一页 |
| 入口 | `SettingsActivity.archiveClick()` / 抽屉 ⋯ 菜单都只是给首页实例改个 flag，返回键回到设置而不是列表 |

宿主侧接口本身是好的：`GET /v1/sessions?archived=1` 返回 200 与完整的归档集合（实测 148 条），`POST /v1/sessions/{id}/archive|unarchive` 也正常。

## 修法（独立页面）
同一 `MainActivity`，`archivedView=true` 时走**另一套骨架**，不再渲染首页元素：

1. `build()` 里 `archivedView` 分支：`archiveHeader()` + 列表 body，`setContentView` 后直接 return——**跳过 hero / composer / 抽屉 / 搜索页 / 手势**。
2. 新增 `archiveHeader()`：‹ 返回（`ic_back`）＋ 居中标题「归档箱 · N」＋ ↻ 刷新（`ic_refresh` → `load(true)`）。
3. 抽出 `makeList()`（`listScroll` + `list`），抽屉与归档页共用同一套列表构建，避免两份滚动逻辑。
4. `onArchive` 入口统一为 `openArchive()`：`startActivity(new Intent(this, MainActivity.class).putExtra("archive", true))`，抽屉 ⋯ 菜单第一项「归档箱」走它。
5. 列表行交互：**点击 = 打开会话**，**长按 = 归档专用菜单**（打开 / 恢复 / 复制对话 ID）。
6. 返回：`onBackPressed()` 首行 `if (archivedView) { finish(); return; }`；标题栏 ‹ 也是 `finish()`。
7. 防串味：归档页不渲染工作区 chips、不渲染搜索页、组头不出「多选」；`closeDrawer()` 加 null 保护（归档实例没有抽屉）。
8. 标题实时显示条数：`归档箱 · 148`；空态为「归档箱」。

## 验收（MuMu / Android 15，1080×1920，versionCode 8 / v0.5.2）
| 用例 | 结果 | 截图 |
| --- | --- | --- |
| 首页不再有「归档箱」胶囊 | 通过 | a1-home |
| 抽屉 ⋯ → 归档箱：直接进列表（无抽屉、无 hero） | 通过 | a4-archive |
| 分组头 今天/昨天/7 天内，右上角 ↻ | 通过 | a4-archive |
| 长按行 → 打开 / 恢复 / 复制对话 ID | 通过 | a5-archlong |
| 点「恢复」：148 → 147，行消失，页面不退出 | 通过 | a6-restored |
| ↻ 刷新：回到 148，toast「已刷新 · 148 个对话」 | 通过 | a7-refresh |
| 点行：正常打开归档会话（气泡/思考行/操作条齐全） | 通过 | a8-open |
| 返回：回列表；再返回：退出归档页回首页 | 通过 | a9-back / a10-exit |
| 设置 → 归档箱 同一条路径 | 通过 | a11-settings / a12-arch-from-set |
| ‹ 返回箭头回到设置 | 通过 | a13-backarrow |
| 深色主题下归档页配色正常 | 通过 | a16-dark-archive |

## 变更文件
- `android/src/com/lc/phoneharness/MainActivity.java`：`archiveTag` → `archiveTitle`；新增 `archiveHeader()` / `makeList()` / `openArchive()` / `leaveArchive()`；删除 `setArchive()` 与 `onResume` 自动弹抽屉；`render()` 写入条数、组头多选排除归档页；行点击/长按分流；`onBackPressed` 与 `closeDrawer` 兜底。
- `android/AndroidManifest.xml`、`android/build.sh`、`android/src/com/lc/phoneharness/App.java`：版本 → 8 / 0.5.2。
- `plugin/assets/dsh-phone.apk`：同步为新包。

## 回滚
`git checkout -- android/src/com/lc/phoneharness/MainActivity.java` 后按旧版本号重跑 `bash build.sh`。
