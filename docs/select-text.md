# 选择文本（长按消息 → 选择文本）

> 状态：已实现并在真机（ZTE A2322 / Android 12 / 1080×2460 / 393dp 宽）验收通过。
> 交付构建：**APK 0.6.25（versionCode 41）**；主实现 `android/src/com/lc/phoneharness/ChatActivity.java` 的 `SelectSheet` 内部类（约 :2511 起）。
> 证据图：`shots/select/`（before / after 全套）。

## 1. 问题：旧实现是「点了没反应」

改造前的 `selectText(Item)` 把**整条消息正文**塞进 `Intent.ACTION_PROCESS_TEXT`（`EXTRA_PROCESS_TEXT` + `EXTRA_PROCESS_TEXT_READONLY=true`）再 `createChooser`。

- 意图上没错：这是系统「文本处理」入口，本意是把选中的文字交给其他 App 的 PROCESS_TEXT 处理器。
- 真机上错得离谱：本机没有注册任何 PROCESS_TEXT 处理器，`createChooser` 既没有目标也不报错，点击后**界面毫无变化**。
- 用户视角：长按消息 → 点「选择文本」→ 什么都没发生（`shots/select/before-7-selecttext.png`，与 `before-6-menu.png` 逐像素一致）。
- 附带问题：这条路径**根本不给用户选字的机会**——它是「把整条消息丢给外部 App」，不是「在 App 里选字复制」。

## 2. 现在的交互模型

**长按消息 → 浮层菜单 →「选择文本」→ 底部升起选择面板。**

| 动作 | 行为 |
| --- | --- |
| 打开 | 面板从底部升起，遮罩 0.35 变暗；正文置顶、光标停在 0 位（**不预选**：预选整段会压住正文，还会让 TextView 把视口滚到末尾） |
| 长按选词 | 走系统选择：长按选中一个词，两侧出现水滴手柄 |
| 拖手柄 | 系统原生拖拽，实时改选区；工具栏被 `setCustomSelectionActionModeCallback` 屏蔽（面板自带按钮，不弹系统浮动工具栏） |
| 全选 | `Selection.setSelection(span, 0, span.length())`，视图滚回第一行 |
| 复制 | 只复制**选区**；空选区提示「先选一段文字」；成功 toast「已复制 N 字」 |
| 分享 | `ACTION_SEND` + `EXTRA_TEXT`（只发选区）；无接收方时降级提示「没有可分享的应用」 |
| 完成 / × / 返回键 / 点遮罩 | 四种关闭路径，都不改动聊天页状态 |
| 期间收到流式更新 | `renderAll()` 整页重绘前先收掉面板（`ChatActivity.java:258`），否则工具条会指向已丢弃的视图 |

选区的读写都在 `Spannable` 上（`ensureSpannable()`），所以助手消息里的代码底色、加粗等 span 进面板不会掉样式。

## 3. 结构与尺寸（1080×2460 真机实测）

`Dialog`（不是 PopupWindow：要全宽、要 `FLAG_DIM_BEHIND`、要吃掉返回键）+ 底部对齐窗口，宽度 MATCH_PARENT、高度 `heightPixels * 0.84`。真机实测面板顶边 y=466px，高 1994px ≈ **730dp**，顶部两角 **18dp** 圆角。

```
┌──────────────────────────────────────── 面板 t.bg，顶部 18dp 圆角
│            ▁▁▁▁▁▁  grabber 36×4dp, alpha(text,0.16)
│  选择文本 15sp bold                      × 18dp（40dp 触摸位）
│  长按选词 · 拖动两端手柄调整范围 12sp muted
├──────────────────────────────────────── hairline t.line
│  正文 16sp × fontScale，行距 2dp
│  padding 18/14/18/34（底部 34dp 是给末端手柄留的画布）
│  ……可滚动，选区高亮 accent@22%（深色 34%）
├──────────────────────────────────────── hairline
│ 已选 0 / 共 1832 字   全选  复制    ⤴    完成
└──────────────────────────────────────── 贴屏幕底
```

| 元素 | 规格 |
| --- | --- |
| 正文 | 16sp × `fontScale`，`setIncludeFontPadding(false)`，lineSpacing 2dp，内衬 18/14/18/34dp |
| 字数 | `已选 %1$d / 共 %2$d 字`，12sp，`t.muted`，weight 1 单行 |
| 全选 / 完成 | 12sp 文字药丸：`完成` 用 `t.accent` 字色；`全选` 用 `t.text` + 水波纹 |
| 复制 | 12sp 白字**品牌色实底**药丸（radius 11dp，padding 12/7dp） |
| 分享 | 图标按钮：18dp 图标 + 34dp 触摸位（四个文字药丸在 393dp 宽机器上会挤到字数标签） |
| 手柄 | `ic_select_handle_start/end.xml`：viewport **22×26dp**，圆 r=8 圆心 (11,16) + 尖脚 `M11,1L16,12L6,12Z`，tint 走 `@color/select_handle`（values / values-night 各一份） |

### 3.1 复制药丸的两态（本轮最后一次修正）

面板里没有系统工具栏，按钮状态就是唯一的可用性提示，所以「0 选区」必须一眼看出来。

| 状态 | 浅色 | 深色 | 对比度 |
| --- | --- | --- | --- |
| 0 选区（禁用） | `t.tile` #F5F5F5 底 + `t.muted` #7D7F85 字 | `t.tile` #1E1E1E 底 + `t.muted2` #8E9094 字 | 4.3:1 / 5.0:1 |
| 有选区（可用） | `t.accent` #426EFE 实底 + 白字 | `t.accent` #507BF2 实底 + 白字 | 4.1:1 / 3.6:1 |

**不要退回「整颗药丸 `setAlpha(0.5f)`」**：实测浅色下白字压 #A1B7FE 只有 **2.0:1**、深色下灰字压 #304580 只有 **1.6:1**，看着像按钮坏了。样式切换只在跨过 0 选区边界时发生（`copyActive` 布尔守卫），避免 120ms 的 tick 反复重建 drawable。

分享图标仍用 `alpha 0.5`（图标半透明是可读的，且 34dp 触摸位不变）。

## 4. 适配与边界

| 场景 | 结论 |
| --- | --- |
| 窄屏 393dp | 全选/复制/分享/完成 四件套不挤压字数，footer 实测 bounds：全选 [522,2346][666,2370]、复制 [684,2346][828,2370]、分享 [834,2361][888,2370]、完成 [906,2346][1050,2370] |
| 英文 | `1 of 1832 characters` / `Select all · Copy · ⤴ · Done`，不溢出（`shots/select/en-2-sheet.png`） |
| 深色 | 面板底 #0F0F0F、浅色 #FFFFFF；选区高亮深色 accent@34% |
| 超长消息 | 正文可滚动、手柄跟随文字；面板高度封顶 84% 屏高 |
| 无文字的纯图消息 | 不进面板，toast「这条消息没有可选择的文字」 |
| 大字体 | 正文按 `fontScale` 缩放，药丸字号固定 12sp（footer 高度不随字体涨，避免遮住正文） |

## 5. 两个踩过的坑

1. **uiautomator 拿不到 idle**：`updateCount()` 原来每 120ms 无条件 `count.setText(...)`，界面永远「有变化」，`uiautomator dump` 直接报 `ERROR: could not get idle state.`。改成值比较后再写（`label.contentEquals(count.getText())`），dump 立刻恢复，footer 的真实坐标才拿到。
2. **手柄只剩一个圆点**：最早的手柄 viewport 是 20×28，圆画在 y17.5~32.5 **超出 viewport 被裁**，三角又在 y2.6~13.4 与圆不相连 —— 屏幕上只剩一个孤零零的圆。现在两个 drawable 都是 22×26、圆完整落在画布内、尖脚底边扎进圆里融合成水滴。

## 6. 验证清单（0.6.25 真机复跑）

```bash
# 前置：adb 走 127.0.0.1:15037（见 docs/ZTE-手机安装与调试.md）
cd android && VERSION_NAME=0.6.25 VERSION_CODE=41 bash build.sh
adb install -r bin/dsh-phone.apk
```

| # | 检查 | 判据 | 截图 |
| --- | --- | --- | --- |
| 1 | 长按消息 | 浮层菜单 8 项，含「选择文本」 | `final-1-menu.png` |
| 2 | 打开面板 | 面板升起、计数「已选 0 / 共 N 字」、复制为中性底灰字 | `final-9-disabled-light.png`、`final-7-disabled-dark.png` |
| 3 | 长按选词 | 选区高亮 + 两颗水滴手柄，计数「已选 1」 | `final-10-active-light.png`、`final-8-active-dark.png` |
| 4 | 全选 | 计数等于总字数，视图停第一行 | `handle-2-dark-all.png` |
| 5 | 拖手柄 | 计数随选区变化（1 → 10） | `handle-3-dark-drag.png` |
| 6 | 复制 | toast「已复制 N 字」，**剪贴板内容级**：关面板 → 点输入框 → `input keyevent 279` → EditText 恰好是那 1 个字（实测「从」） | `final-11-copied-light.png`、`final-12-pasted-light.png` |
| 7 | 分享 | 系统 chooser 起来（`mCurrentFocus=…ChooserActivityZTE`，`getCount()=13`） | `share-1-chooser.png` |
| 8 | 关闭 | 返回键 / 点遮罩 / 完成 三条都收面板，聊天页无损 | — |
| 9 | 回归 | 关面板后长按菜单 8 项照常 | — |
| 10 | 英文 | 不溢出 | `en-2-sheet.png` |

before / after 对照：`before-7-selecttext.png`（点完毫无反应）→ `final-9-disabled-light.png`（底部面板）。
