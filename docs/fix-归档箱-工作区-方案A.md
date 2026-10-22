# 修复记录：归档箱 × 工作区过滤冲突（方案 A）

- 项目：phone-harness / 安卓端 `com.lc.phoneharness`
- 版本：versionName **0.5.1**，versionCode **7**（`android/AndroidManifest.xml:4-5`）
- 产物：`android/bin/dsh-phone.apk`（806,783 B），已同步到 `plugin/assets/dsh-phone.apk`
- 设备：MuMu 模拟器 · Android 15 · 23113RKC6C · display 27 · 浅色主题
- 关联报告：`docs/bug-归档箱-工作区冲突-报告.md`

## 1. 选定的方案

**方案 A：归档箱强制忽略工作区**——归档视图不参与工作区过滤、不渲染工作区 chips、进出归档时挂起/恢复工作区选择，归档期间不写设备偏好。

理由：归档箱是"跨工作区的收件箱"，把它绑到某个 cwd 上去过滤在语义上就是错的；同时 chips 在归档视图里改不动结果，留着只会让用户误判"数据丢了"。

## 2. 代码变更（`android/src/com/lc/phoneharness/MainActivity.java`）

| # | 位置 | 变更 |
| --- | --- | --- |
| 1 | 状态字段 | 新增 `private String wsBeforeArchive = ""`，存放进归档前的选择 |
| 2 | `onCreate` | 外部以 `archive=true` 进入时：`wsBeforeArchive = wsSelected; wsSelected = ""` |
| 3 | 新增 `setArchive(boolean)` | 唯一进出归档的入口：挂起/恢复工作区、退出多选、`renderHead()`、`load(false)` |
| 4 | 顶栏 `archiveTag` 点击 | 由直接改 `archivedView` 改为 `setArchive(false)` |
| 5 | 抽屉 `⋯` 菜单「归档箱 / 回到对话列表」 | 改为 `closeDrawer(); setArchive(!archivedView)` |
| 6 | `renderHead()` | `if (!wsNames.isEmpty() && !archivedView) headBox.addView(workspaceChips());` |
| 7 | `workspaceChip()` 点击 | 首行加 `if (archivedView) return;`（双保险，归档期间不写 Prefs） |
| 8 | `render()` | 原来的 cwd 过滤整段替换为 `List<JSONObject> visible = visibleSessions();` |
| 9 | 新增 `visibleSessions()` | 归档视图返回全部；主视图按 `wsSelected` 过滤 —— 列表与搜索页共用 |
| 10 | `renderSearch()` | 遍历 `visibleSessions()` 而不是 `sessions`，与主列表口径一致 |
| 11 | catalog 回包 | 清空失效工作区的判断加 `!archivedView` 前置，归档期间不动偏好 |

核心片段：

```java
private List<JSONObject> visibleSessions() {
    if (archivedView || wsSelected.length() == 0) return sessions;
    List<JSONObject> out = new ArrayList<JSONObject>();
    for (int index = 0; index < sessions.size(); index++) {
        JSONObject row = sessions.get(index);
        if (wsSelected.equalsIgnoreCase(row.optString("cwd", ""))) out.add(row);
    }
    return out;
}

private void setArchive(boolean on) {
    if (on == archivedView) return;
    if (on) { wsBeforeArchive = wsSelected; wsSelected = ""; }
    else { wsSelected = wsBeforeArchive == null ? "" : wsBeforeArchive; wsBeforeArchive = ""; }
    archivedView = on;
    if (batchMode) endBatch();
    renderHead();
    load(false);
}
```

## 3. 验收（实机截图，`shots/ours/`）

| 验收项 | 截图 | 结果 |
| --- | --- | --- |
| 选中 <user>（cwd=`<HOME>`）后主列表只列该工作区 | fix7-admin | 通过 |
| 带着该工作区进归档箱：归档会话全部出现（旧版此处为「归档箱是空的」） | fix8-archive-admin | 通过 |
| 归档视图抽屉内**没有**工作区 chips 行 | fix3-archive / fix8-archive-admin | 通过 |
| 归档期间设备偏好未被改写/清空 | `run-as cat shared_prefs/phone-harness.xml`：仍是 <user> | 通过 |
| 退出归档后工作区选择原样恢复 | fix9-restored-admin | 通过 |
| 搜索页与主列表口径一致（主视图=<user> 集合） | fix10-search-admin | 通过 |
| 搜索页在归档视图=归档集合 | fix11-search-archive | 通过 |
| 顶栏「归档箱」pill 退出、回到主页 | fix4-archive-main → fix12-final-main | 通过 |

## 4. 未改变的行为

- 归档条目的点击菜单（打开 / 恢复 / 复制对话 ID）保持原样。
- 多选（置顶 / 删除）逻辑未动；进归档时若处于多选会先 `endBatch()`。
- 主视图的工作区过滤、chips 高亮、写偏好逻辑保持原样。
- 宿主侧接口未改动（仍只有 `/v1/sessions` 与 `/v1/sessions?archived=1`）。

## 5. 回滚

```bash
cd android && git checkout -- src/com/lc/phoneharness/MainActivity.java  # 若已入库
./build.sh && adb install -r bin/dsh-phone.apk
```
