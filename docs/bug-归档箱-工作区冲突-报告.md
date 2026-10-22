# Bug 报告：归档箱 × 工作区过滤冲突

- 项目：phone-harness / 安卓端 `com.lc.phoneharness`（应用名「鲸域」）
- 版本：versionName **0.5.0**，versionCode **6**（`android/AndroidManifest.xml:4-5`）
- 构建：`android/build.sh` 手工 aapt2/d8 链路，产物 `android/bin/dsh-phone.apk`
- 报告日期：本轮实测（模拟器 MuMu / Android 15，设备 <DEVICE>，display 26）
- 严重度：**中高**（数据在、界面判为空；且状态串味污染主列表）
- 类型：界面异常 + 数据不一致 + 状态串味（非崩溃、非丢数据）

---

## 1. 一句话现象

抽屉里先选一个**工作区**，再进**归档箱**：归档列表被同一个工作区二次过滤 → 明明宿主有 5+ 条归档会话，界面却写「**归档箱是空的**」；点「全部」chip 归档会话立刻全出现。在归档箱里切换工作区还会把选择**写进全局偏好**，退出归档箱后主会话列表也被这个工作区过滤（用户并未在主列表里做过这个选择）。

## 2. 环境与前置数据

- 手机端连接：`address=<LAN_IP>:8737`，令牌已配对，工作区 chips 正常拉取。
- 设备偏好（`shared_prefs/phone-harness.xml`）实测：

```
workspaceName = <user>
workspaceCwd  = <HOME>
theme         = day
device        = <DEVICE> (Android 15)
```

- 宿主 `GET /v1/sessions?archived=1` 实际返回（节选，全部 `archived:true`，**cwd 均为 `<HOME>\Documents\test`**）：

| 会话 id | 标题 | cwd |
| --- | --- | --- |
| session-<redacted> | 现在正在运行的这个命令行窗 | <HOME>\Documents\test |
| session-<redacted> | 示例会话 | 同上 |
| session-<redacted> | 示例会话 | 同上 |
| session-<redacted> | 示例会话 | 同上 |
| session-<redacted> | 示例会话s | 同上 |

→ **归档集合非空**，全部归属 `Documents\test` 工作区；而当时选中的工作区是 `<HOME>`（`<user>` chip）。

## 3. 复现步骤（最短路径）

1. 打开 App，左下 ≡ 拉出抽屉（此时会话列表正常）。
2. 在 chips 行点选任意工作区，例如 **<user>**（chip 变蓝、列表只剩该 cwd 的会话）。
3. 点抽屉底部用户行右侧 **⋯** → 菜单里选 **归档箱**。
4. 观察抽屉列表区。

**实际结果**：列表区显示「**归档箱是空的** / 被归档的对话会出现在这里」，chips 行仍在，且当前工作区 chip 高亮 —— 而宿主明明有 5 条以上归档会话（见 §2）。

5. 点 chips 行的 **全部**：归档会话立刻按「昨天 / 7 天内」分组全部列出；条目长按菜单是归档专用三项「打开 / 恢复 / 复制对话 ID」。

**预期结果**：进入归档箱即应看到全部归档会话（归档箱是「跨工作区」的一个独立集合），或者至少明确提示「当前工作区没有归档对话，另有 N 条在其他工作区」并提供一键切换，而不是直接判「归档箱是空的」。

## 4. 冲突表现的三种形态

### 4.1 界面异常：空态语义与顶栏状态互相矛盾
- 主页面顶栏左侧挂出灰色 pill「**归档箱**」（表示当前处于归档视图），主区域却仍是新对话欢迎页「嗨！今天想聊些什么？」——归档视图没有独立页面，只是抽屉列表换了数据源，视觉上像「进了另一个页面」，实际主区没有任何归档内容。
- 截图：`shots/ours/bug3.png`

### 4.2 数据不一致：归档数据被工作区过滤掉
- 同一份归档数据，在「全部」下可见（`shots/ours/bug5-all.png`，分组 昨天 / 7 天内，条目齐），在「<user>」「task」等具体工作区下被判为空（`shots/ours/bug4-drawer-archive.png`、`shots/ours/bug6-task-archive.png`）。
- 空态文案「归档箱是空的」把「筛选后为空」误报成「集合为空」，用户在手机端无法判断是数据没了还是被筛掉了。

### 4.3 状态串味：归档箱里的工作区选择写进了全局偏好
- 在归档箱里点 chips 会把 `workspaceCwd/workspaceName` 写进 `Prefs`（全局单值），**不分视图**。
- 退出归档箱（点顶栏「归档箱」pill）后，主会话列表仍按上一次在归档箱里点的工作区过滤：`shots/ours/bug7-leak.png` 里 chips 仍是 **task** 高亮、列表只剩 task 的置顶/今天会话，而用户从未在主列表里做过这个选择。
- 该偏好是持久化的：杀进程重进仍是该工作区，容易让用户以为「会话丢了」。

### 4.4 附带的不一致：搜索页不受工作区/归档态约束
- 抽屉顶部搜索胶囊 → 全屏搜索页，列表口径是**全部会话**（含已归档、含其他工作区），与主列表/归档列表的口径都不一致。
- 截图：`shots/ours/bug1-drawer.png`、`shots/ours/bug2-state.png`

## 5. 根因（代码级）

文件：`android/src/com/lc/phoneharness/MainActivity.java`

1. 数据源只按 `archivedView` 区分，未把工作区纳入请求参数（第 1493 行）：

```java
api.get(archivedView ? "/v1/sessions?archived=1" : "/v1/sessions", new Api.Callback() { ... });
```

2. 渲染时对两种视图**无差别**做工作区过滤（第 1554-1562 行）——冲突的直接来源：

```java
List<JSONObject> visible = sessions;
if (wsSelected.length() > 0) {
    visible = new ArrayList<JSONObject>();
    for (int index = 0; index < sessions.size(); index++) {
        JSONObject row = sessions.get(index);
        if (wsSelected.equalsIgnoreCase(row.optString("cwd", ""))) visible.add(row);
    }
}
```

3. 空态分支把「筛选空」写成了「归档箱空」（第 1564-1577 行）：

```java
if (visible.isEmpty()) {
    String emptyText;
    if (archivedView) emptyText = "归档箱是空的";
    else if (wsSelected.length() > 0) emptyText = "这个工作区还没有对话";
    ...
    TextView hint = t.text(archivedView ? "被归档的对话会出现在这里" : ..., 12f, t.muted);
}
```

4. 归档视图里 chips 行照旧渲染（第 969 行），所以「切工作区」这个动作在归档箱里依然可用、且作用于归档集合：

```java
if (!wsNames.isEmpty()) headBox.addView(workspaceChips());
```

5. chip 点击直接写全局偏好（第 1031-1037 行），不区分当前视图，也不在退出归档箱时回滚：

```java
wsSelected = dir;
prefs.setWorkspace(dir, label);
```

6. 顶栏归档 pill 只切视图标志、不重置工作区（第 271-286 行 → `archivedView=false; load(false);`），于是串味被保留。

7. catalog 回包补偿逻辑反而会「悄悄改偏好」：若 `wsSelected` 不在 `wsCwds` 里会被清空并写回 `Prefs`（第 1975-1980 行）。

## 6. 复现矩阵（变量）

| 变量 | 取值 | 结果 |
| --- | --- | --- |
| 是否选了工作区 | 「全部」 | 归档会话全部可见（正常） |
| 是否选了工作区 | 任一带 cwd 的 chip | 归档列表被该 cwd 过滤 |
| 该工作区是否有归档会话 | 有 | 只看到该工作区的归档（数量被静默截断，无提示） |
| 该工作区是否有归档会话 | 无（如 <user> / task） | 显示「归档箱是空的」，与宿主数据矛盾 |
| 归档集合是否为空 | 空 | 文案正确 |
| 进入顺序 | 先选工作区→归档箱 | 冲突 |
| 进入顺序 | 先归档箱→再选工作区 | 冲突 + 立即写入全局偏好 |
| 退出归档箱后 | 回主列表 | 仍被归档箱里选的工作区过滤（串味） |
| 搜索页 | 任意 | 不受工作区/归档态约束，口径不一致 |
| 重启 App | 杀进程 | 串味保留（偏好持久化） |

## 7. 影响面

- 归档是「恢复/找回旧对话」的唯一入口，判空会让用户误以为归档数据丢失（实际未丢，属误报，但对用户等价于丢失）。
- 串味会连带污染**主列表**，造成「我的会话不见了」的二次误判，且持久化到下次启动。
- 归档箱里的「多选 → 置顶 / 删除」在同一条被过滤的列表上操作，误删风险上升（用户看不到真正的全集，容易按「列表只有这几条」推断）。

## 8. 修复建议（推荐方案 A）

**方案 A（推荐，改动最小）**：归档箱是跨工作区集合，进入时强制 `wsSelected = ""`（渲染层忽略工作区过滤），并**隐藏 chips 行**；退出归档箱时恢复进入前的 `wsSelected`（用一个 `wsBeforeArchive` 字段暂存，不写 `Prefs`）。

- 渲染层：`List<JSONObject> visible = (archivedView || wsSelected.isEmpty()) ? sessions : filterByWorkspace(sessions);`
- 抽屉头：`if (!wsNames.isEmpty() && !archivedView) headBox.addView(workspaceChips());`
- 进入/退出归档：`enterArchive(){ wsBeforeArchive = wsSelected; wsSelected = ""; archivedView = true; load(false); }` / `exitArchive(){ wsSelected = wsBeforeArchive; wsBeforeArchive = ""; archivedView = false; load(false); }`
- chip 点击：仅当 `!archivedView` 时写 `Prefs`。

**方案 B**：保留归档箱内的按工作区分组（分节标题），但不做过滤；chips 只作用于主列表。

**方案 C**：把工作区选择改成两个独立状态（`mainWs` / `archiveWs`），彻底隔离口径 —— 灵活但改动面大。

### 验收标准（对应上面矩阵）
1. 归档箱内不再出现「归档箱是空的」误报：只要宿主归档集合非空，进入即见条目。
2. 归档箱内不显示工作区 chips（方案 A），或 chips 不影响归档列表（方案 B）。
3. 归档箱里任何操作都不写 `workspaceCwd/workspaceName`；退出归档箱后主列表的工作区与进入前一致。
4. 搜索页口径与当前视图一致（或明确标注「搜索全部工作区/含归档」）。
5. 空态文案区分「集合为空」与「筛选为空」。

## 9. 证据清单（截图，均在 `<PROJECT_ROOT>/shots/ours/`）

| 文件 | 内容 |
| --- | --- |
| `bug3.png` | 归档视图下顶栏「归档箱」pill 与主区欢迎页并存 |
| `bug4-drawer-archive.png` | 归档箱 + <user> 选中 → 「归档箱是空的」（宿主有 5+ 条） |
| `bug5-all.png` | 点「全部」后归档会话全部出现 + 归档专用菜单「打开/恢复/复制对话 ID」 |
| `bug6-task-archive.png` | 归档箱内切到 task 工作区 → 依旧判空 |
| `bug7-leak.png` | 退出归档箱后主列表仍被 task 工作区过滤（串味） |
| `bug1-drawer.png`、`bug2-state.png` | 搜索页无视工作区/归档态的全量列表 |
